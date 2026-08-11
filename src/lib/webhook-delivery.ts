// src/lib/webhook-delivery.ts
// Motor de entrega DURABLE de webhooks salientes (outbox pattern). Antes,
// dispatchQuoteEvent() entregaba en línea con 2 intentos y 300ms fijos — si la
// invocación serverless moría a media entrega, el evento se perdía sin dejar
// rastro. Ahora cada evento se ENCOLA primero en `webhook_events` (una fila por
// evento lógico × endpoint suscrito) y solo DESPUÉS se intenta entregar:
//
//   1. enqueueForSubscribers()/enqueueSingle() — escribe la(s) fila(s), commit.
//   2. flushNow() — intento INLINE inmediato (fire-and-forget vía after()), para
//      no perder la latencia p50 de hoy: el outbox es red de seguridad, no un
//      impuesto de latencia.
//   3. runSweep() (cron /api/cron/webhooks, 1 vez al día — ver vercel.json,
//      el plan actual de Vercel no permite crons sub-diarios) — reclama lo
//      que quedó 'pending'/'delivering' con lease vencido (invocaciones
//      muertas, fallos) y sigue el calendario de reintentos hasta agotarlo.
//
// El `payload` que se firma y se guarda es INMUTABLE: nunca se re-serializa en
// un reintento, así que la firma siempre cuadra y el event_id es estable.

import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { sql, withOrgTx, withSystemTx, assertCronContext, logAudit } from './db';
import { safeFetch, type SafeFetchResult } from './ssrf';
import { sendEmail, siteOrigin } from './email';
import { rateLimit } from './ratelimit';
import { after } from './after';
import { decryptSecret, encryptRequiredSecret } from './crypto-secret';

const TIMEOUT_MS = 5000;
const MAX_BODY_BYTES = 8192;
const LEASE_SEC = 90; // > peor caso de un intento (conexión + timeout + lectura)
// Techo de entregas SALIENTES por endpoint — Cord no debe convertirse en
// reflector de un ataque volumétrico contra un tercero (org maliciosa/con
// bug que re-encola sin parar hacia la misma URL). No es contra abuso normal:
// un negocio real dispara eventos de negocio, no un loop apretado.
const OUTBOUND_LIMIT_PER_MIN = 120;

// Salud del endpoint: la racha cuenta MENSAJES en estado TERMINAL 'failed' (ya
// sea porque agotó los 11 intentos, o porque un oneShot falló en su único
// intento) — NUNCA intentos individuales, para que un mal minuto no desactive
// un endpoint sano. Un 'succeeded' resetea la racha a 0.
// Exportados: la pestaña "Salud" del Workbench los muestra para explicar por qué
// un endpoint está en riesgo o desactivado, en vez de duplicar los números.
export const FAIL_WARN_THRESHOLD = 3;
export const FAIL_DISABLE_THRESHOLD = 5;
const WARN_THROTTLE_MS = 24 * 60 * 60 * 1000; // 1 aviso por endpoint cada 24h

// Calendario de reintentos tipo Stripe: 11 intentos en total (1 inmediato + 10
// reintentos) repartidos en ~3.6 días. Jitter ±20% para que muchos endpoints
// caídos a la misma hora no vuelvan todos en el mismo segundo (thundering herd).
const RETRY_SCHEDULE_SEC = [10, 60, 300, 1800, 7200, 18000, 36000, 86400, 86400, 86400];
export const MAX_ATTEMPTS = RETRY_SCHEDULE_SEC.length + 1;

/** ms hasta el siguiente intento tras `attemptsDone` fallidos, o null si se agotó el calendario. */
export function nextRetryDelayMs(attemptsDone: number): number | null {
    const base = RETRY_SCHEDULE_SEC[attemptsDone - 1];
    if (base === undefined) return null;
    const jitter = 0.8 + Math.random() * 0.4;
    return Math.round(base * 1000 * jitter);
}

const sign = (secret: string, body: string) => createHmac('sha256', secret).update(body).digest('hex');
const truncate = (s: string, max = 4000) => (s.length > max ? s.slice(0, max) + '…' : s);
const esc = (s: string) => String(s ?? '').replace(/</g, '&lt;');

/**
 * Genera un event_id público (evt_…). El CALLER lo genera ANTES de armar el
 * JSON del payload (para poder incluirlo como campo `id` en el body que se
 * firma) y lo pasa explícito a enqueueForSubscribers()/enqueueSingle() — así
 * la columna `webhook_events.event_id` y el `id` dentro del JSON SIEMPRE
 * coinciden, nunca se generan por separado.
 */
export const newEventId = () => `evt_${randomBytes(16).toString('hex')}`;
function chunk<T>(arr: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
}

// ── Producción (encolar) ─────────────────────────────────────────────────────

/**
 * Encola un evento para VARIOS endpoints suscritos con el MISMO event_id (así
 * un consumidor con varios webhooks registrados puede correlacionar el mismo
 * evento lógico si le llega por más de uno, y el `id` embebido en el JSON de
 * CADA fila es idéntico). Todo en UNA sola transacción HTTP.
 */
export async function enqueueForSubscribers(
    orgId: string, webhookIds: string[], evento: string, payload: string, eventId: string, dedupeKey?: string,
): Promise<string[]> {
    if (!webhookIds.length) return [];
    const inserts = webhookIds.map((webhookId) => sql`
        insert into webhook_events (org_id, webhook_id, event_id, evento, payload, dedupe_key)
        values (${orgId}, ${webhookId}, ${eventId}, ${evento}, ${payload}, ${dedupeKey ?? null})
        on conflict (webhook_id, dedupe_key) where dedupe_key is not null do nothing
        returning id`);
    try {
        const results = await withOrgTx(orgId, ...inserts);
        return results.flat().map((r: any) => r.id as string);
    } catch {
        return []; // tabla no migrada u otro fallo — dispatchQuoteEvent nunca debe tronar por esto
    }
}

/** Encola un evento para UN solo endpoint (usado por sendTestEvent/redeliver). */
export async function enqueueSingle(
    orgId: string, webhookId: string, evento: string, payload: string, eventId: string, dedupeKey?: string,
): Promise<{ id: string } | null> {
    try {
        const [rows] = await withOrgTx(orgId, sql`
            insert into webhook_events (org_id, webhook_id, event_id, evento, payload, dedupe_key)
            values (${orgId}, ${webhookId}, ${eventId}, ${evento}, ${payload}, ${dedupeKey ?? null})
            on conflict (webhook_id, dedupe_key) where dedupe_key is not null do nothing
            returning id`);
        return (rows[0] as { id: string } | undefined) ?? null;
    } catch {
        return null;
    }
}

// ── Reclamo (claim) ──────────────────────────────────────────────────────────

interface ClaimedRow {
    id: string; orgId: string; webhookId: string; eventId: string; evento: string; payload: string; intentos: number;
}

function toClaimedRow(r: any): ClaimedRow {
    return {
        id: r.id as string, orgId: r.org_id as string, webhookId: r.webhook_id as string,
        eventId: r.event_id as string, evento: r.evento as string, payload: r.payload as string,
        intentos: r.intentos as number,
    };
}

/**
 * Reclama hasta `batch` filas VENCIDAS de CUALQUIER org (carril de sistema —
 * solo el cron puede llamarlo, ver withSystemTx). La corrección NO depende de
 * SKIP LOCKED (que es solo rendimiento): depende del lease — el predicado
 * `lease_until is null or lease_until < now()` hace que dos crons concurrentes
 * jamás reclamen la misma fila bajo READ COMMITTED. `for update of e` (no un
 * `for update` pelado) para no bloquear también la fila de `webhooks` — así un
 * endpoint que solo se está editando en Ajustes no le roba budget al sweeper.
 */
async function claimDue(batch: number): Promise<{ rows: ClaimedRow[]; leaseId: string }> {
    const leaseId = randomUUID();
    let rows: any[] = [];
    try {
        [rows] = await withSystemTx(sql`
            with due as (
                select e.id
                from webhook_events e
                join webhooks w on w.id = e.webhook_id and w.activo
                where e.estado in ('pending', 'delivering')
                  and e.next_retry_at <= now()
                  and (e.lease_until is null or e.lease_until < now())
                order by e.next_retry_at
                limit ${batch}
                for update of e skip locked
            )
            update webhook_events e
               set estado = 'delivering', lease_id = ${leaseId}::uuid,
                   lease_until = now() + make_interval(secs => ${LEASE_SEC}), updated_at = now()
              from due
             where e.id = due.id
            returning e.id, e.org_id, e.webhook_id, e.event_id, e.evento, e.payload, e.intentos`);
    } catch {
        rows = [];
    }
    return { rows: rows.map(toClaimedRow), leaseId };
}

/**
 * Igual que claimDue pero acotado a una org y a IDs específicos (flushNow tras
 * encolar). Lleva el MISMO filtro `next_retry_at <= now()` que claimDue — sin
 * él, un segundo flushNow sobre el mismo id (ej. un doble-clic en "Reintentar"
 * o dos requests concurrentes) podría re-disparar un intento ANTES de que su
 * backoff programado cumpliera, saltándose el calendario de reintentos.
 */
async function claimByIdsOrg(orgId: string, ids: string[]): Promise<{ rows: ClaimedRow[]; leaseId: string }> {
    if (!ids.length) return { rows: [], leaseId: '' };
    const leaseId = randomUUID();
    let rows: any[] = [];
    try {
        [rows] = await withOrgTx(orgId, sql`
            with due as (
                select e.id
                from webhook_events e
                join webhooks w on w.id = e.webhook_id and w.activo
                where e.org_id = ${orgId}
                  and e.id = any(${ids})
                  and e.estado in ('pending', 'delivering')
                  and e.next_retry_at <= now()
                  and (e.lease_until is null or e.lease_until < now())
                for update of e skip locked
            )
            update webhook_events e
               set estado = 'delivering', lease_id = ${leaseId}::uuid,
                   lease_until = now() + make_interval(secs => ${LEASE_SEC}), updated_at = now()
              from due
             where e.id = due.id
            returning e.id, e.org_id, e.webhook_id, e.event_id, e.evento, e.payload, e.intentos`);
    } catch {
        rows = [];
    }
    return { rows: rows.map(toClaimedRow), leaseId };
}

// ── Entrega de un intento ────────────────────────────────────────────────────

interface HookSecrets {
    id: string;
    url: string;
    secret: string;
    // Rotación con ventana de solape (ver rotateSecret): secretPrev es el
    // secreto ANTERIOR, válido hasta secretPrevExpira. Fuera de una rotación
    // en curso, ambos son null.
    secretPrev: string | null;
    secretPrevExpira: string | Date | null;
}

function buildHeaders(hook: HookSecrets, evento: string, body: string, eventId: string, deliveryId: string, attempt: number): Record<string, string> {
    const ts = Math.floor(Date.now() / 1000);
    const overlapActive = !!hook.secretPrev && !!hook.secretPrevExpira && new Date(hook.secretPrevExpira).getTime() > Date.now();
    const oldSecret = overlapActive ? hook.secretPrev! : null;

    // V1: el NUEVO secreto firma primero, el VIEJO al final si hay una rotación
    // en curso. El ORDEN es load-bearing: `parseV1Header` del SDK arma un
    // Record con `parts['v1'] = valor` en un loop, así que el ÚLTIMO `v1=` es
    // el que gana en un SDK SIN actualizar — que solo conoce el secreto viejo.
    // Poniéndolo al final, un consumidor sin tocar una línea de código sigue
    // verificando correctamente durante TODA la ventana de solape. El SDK
    // parcheado (ver packages/elements/src/server.ts) recolecta TODOS los
    // `v1=` y acepta si cualquiera cuadra — así que ambos extremos funcionan
    // al mismo tiempo. NUNCA reordenar esto sin releer este comentario.
    let v1Header = `t=${ts},v1=${sign(hook.secret, `${ts}.${body}`)}`;
    if (oldSecret) v1Header += `,v1=${sign(oldSecret, `${ts}.${body}`)}`;

    // Legacy (un solo valor posible, no se puede doble-firmar): durante la
    // ventana firma con el secreto VIEJO — es el que un verificador legacy
    // todavía tiene guardado. Al cerrarse la ventana pasa a firmar con el nuevo.
    const legacySecret = oldSecret ?? hook.secret;

    return {
        'Content-Type': 'application/json',
        'User-Agent': 'Cord-Webhooks/1.0',
        'X-Cord-Event': evento,
        // Identidad del evento: mismo valor que el campo `id` del JSON (nunca
        // se generan por separado — ver newEventId). Un consumidor deduplica
        // por esto sin tener que parsear el body. X-Cord-Delivery-Id es el id
        // de la FILA (cambia en cada replay manual); Idempotency-Key repite el
        // event_id porque varios frameworks lo leen de ahí gratis.
        'X-Cord-Event-Id': eventId,
        'X-Cord-Delivery-Id': deliveryId,
        'X-Cord-Attempt': String(attempt),
        'Idempotency-Key': eventId,
        'X-Cord-Signature': `sha256=${sign(legacySecret, body)}`,
        'X-Cord-Timestamp': String(ts),
        'X-Cord-Signature-V1': v1Header,
    };
}

async function attemptOnce(hook: HookSecrets, row: ClaimedRow, attempt: number): Promise<SafeFetchResult> {
    const headers = buildHeaders(hook, row.evento, row.payload, row.eventId, row.id, attempt);
    return safeFetch(hook.url, { method: 'POST', headers, body: row.payload }, { timeoutMs: TIMEOUT_MS, maxBodyBytes: MAX_BODY_BYTES });
}

async function recordDeliveryLog(orgId: string, p: {
    webhookId: string; messageId: string | null; eventId: string | null; evento: string;
    intento: number; prueba: boolean; result: SafeFetchResult;
}): Promise<void> {
    try {
        // `request_body` YA NO se duplica en cada intento (era idéntico en los
        // hasta 11 intentos de un mismo mensaje y ya vive en
        // webhook_events.payload, ligado por message_id) — es el ahorro grande
        // de espacio de la retención. redeliver() lee el payload desde ahí,
        // con fallback a esta columna solo para filas de antes de este cambio.
        await withOrgTx(orgId, sql`
            insert into webhook_deliveries
                (org_id, webhook_id, message_id, event_id, evento, status, ok, error, intento, es_prueba, duracion_ms, response_body)
            values
                (${orgId}, ${p.webhookId}, ${p.messageId}, ${p.eventId}, ${p.evento},
                 ${p.result.status || null}, ${p.result.ok}, ${p.result.error},
                 ${p.intento}, ${p.prueba}, ${p.result.ms}, ${truncate(p.result.body, 2000)})`);
    } catch { /* tabla no migrada → no-op, best-effort */ }
}

async function updateWebhookSummary(orgId: string, webhookId: string, result: SafeFetchResult): Promise<void> {
    try {
        await withOrgTx(orgId, sql`
            update webhooks set last_status = ${result.status || null}, last_error = ${result.error}, last_delivery_at = now()
            where id = ${webhookId} and org_id = ${orgId}`);
    } catch { /* best-effort */ }
}

// ── Salud del endpoint: racha de fallos → aviso → auto-desactivación ────────

// Correo genérico al dueño de la org (branding igual al resto de correos
// transaccionales del proyecto: logo + CTA color de marca). Best-effort: un
// fallo de correo NUNCA debe romper el settle de una entrega.
async function notifyOwner(orgId: string, opts: { subject: string; heading: string; bodyHtml: string }): Promise<void> {
    try {
        const [org] = await sql`
            select o.nombre, coalesce(o.color_marca, '#0a192f') as color, o.email_contacto,
                   (select email from org_members where org_id = o.id and rol = 'owner' limit 1) as owner_email
            from orgs o where o.id = ${orgId}`;
        const to = (org?.email_contacto as string) || (org?.owner_email as string) || null;
        if (!to) return;
        const color = /^#[0-9a-fA-F]{6}$/.test(org?.color as string) ? (org.color as string) : '#0a192f';
        const link = `${siteOrigin()}/app?wb=webhooks`;
        const html = `<div style="background-color:#ffffff;padding:40px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
            <div style="max-width:540px;margin:0 auto;">
                <div style="margin-bottom:32px;">
                    <img src="https://cordhq.app/imgs/logo-cord-navy.png" width="90" height="auto" alt="Cord Logo" style="display:block;">
                </div>
                <p style="font-size:16px;color:#111827;margin-top:0;font-weight:500;">${esc(opts.heading)}</p>
                <p style="font-size:16px;line-height:1.6;color:#374151;margin-bottom:32px;font-weight:400;">${opts.bodyHtml}</p>
                <div style="margin:40px 0;">
                    <a href="${link}" style="display:inline-block;background-color:${color};color:#ffffff;text-decoration:none;font-weight:500;font-size:15px;padding:12px 24px;border-radius:8px;">Ver webhooks en Ajustes</a>
                </div>
                <div style="margin-top:48px;padding-top:24px;border-top:1px solid #E5E7EB;">
                    <p style="font-size:12px;color:#9CA3AF;margin:0;line-height:1.5;">${esc((org?.nombre as string) || 'Cord')}</p>
                </div>
            </div>
        </div>`;
        await sendEmail({ to, subject: opts.subject, html, fromName: (org?.nombre as string) || undefined, orgId, operation: 'webhook_health_alert' });
    } catch { /* nunca romper el settle por un fallo de correo */ }
}

/**
 * Desactiva el endpoint tras FAIL_DISABLE_THRESHOLD fallos seguidos, cancela
 * su trabajo pendiente (que ya no se va a entregar solo — un endpoint muerto
 * no debe seguir consumiendo budget del sweeper por días) y avisa al dueño.
 * Guardado por `activo = true` en el UPDATE: si dos entregas concurrentes
 * cruzan el umbral a la vez, solo la PRIMERA dispara el aviso/audit — la
 * segunda ve 0 filas afectadas y no duplica nada.
 */
async function disableWebhook(orgId: string, webhookId: string, url: string, streak: number): Promise<void> {
    const motivo = `${streak} eventos consecutivos sin poder entregarse`;
    let rows: any[] = [];
    try {
        [rows] = await withOrgTx(orgId, sql`
            update webhooks set activo = false, deshabilitado_at = now(), deshabilitado_motivo = ${motivo}
            where id = ${webhookId} and org_id = ${orgId} and activo = true
            returning id`);
    } catch { return; }
    if (!rows.length) return; // ya estaba desactivado — no duplicar aviso/audit

    try {
        await withOrgTx(orgId, sql`
            update webhook_events set estado = 'canceled', updated_at = now()
            where webhook_id = ${webhookId} and org_id = ${orgId} and estado in ('pending', 'delivering')`);
    } catch { /* best-effort */ }

    await logAudit(orgId, { accion: 'webhook.deshabilitado', entidad: 'webhook', entidad_id: webhookId, detalle: motivo });
    await notifyOwner(orgId, {
        subject: `Cord desactivó tu webhook — ${streak} fallos seguidos`,
        heading: 'Desactivamos un endpoint de webhook',
        bodyHtml: `El endpoint <b>${esc(url)}</b> falló ${streak} veces seguidas y lo desactivamos automáticamente para no seguir intentando contra un destino caído. No borramos nada — reactívalo desde Ajustes › Developers cuando esté listo.`,
    });
}

// Aviso temprano (racha 3, antes de llegar al umbral de desactivar en 5).
// Throttle de 24h vía aviso_fallos_at para no saturar al dueño con un correo
// por cada fallo mientras la racha sigue subiendo.
async function maybeWarnWebhook(orgId: string, webhookId: string, url: string, streak: number, lastWarnedAt: unknown): Promise<void> {
    if (lastWarnedAt && Date.now() - new Date(lastWarnedAt as string).getTime() < WARN_THROTTLE_MS) return;
    try {
        await withOrgTx(orgId, sql`update webhooks set aviso_fallos_at = now() where id = ${webhookId} and org_id = ${orgId}`);
    } catch { return; }
    await notifyOwner(orgId, {
        subject: `Tu webhook está fallando — ${streak} intentos seguidos`,
        heading: 'Un endpoint de webhook está fallando',
        bodyHtml: `El endpoint <b>${esc(url)}</b> lleva ${streak} eventos seguidos sin poder entregarse. Si llega a ${FAIL_DISABLE_THRESHOLD} lo desactivaremos automáticamente. Revísalo desde Ajustes › Developers.`,
    });
}

/**
 * Se llama SOLO cuando un mensaje llega a un estado TERMINAL (succeeded o
 * failed — nunca en 'pending', que aún tiene reintentos por delante). Un
 * éxito resetea la racha a 0; un fallo terminal la incrementa y dispara
 * aviso/desactivación según el umbral.
 */
async function applyHealthOutcome(orgId: string, webhookId: string, succeeded: boolean): Promise<void> {
    if (succeeded) {
        try { await withOrgTx(orgId, sql`update webhooks set fallos_consecutivos = 0 where id = ${webhookId} and org_id = ${orgId}`); }
        catch { /* best-effort */ }
        return;
    }
    let rows: any[] = [];
    try {
        [rows] = await withOrgTx(orgId, sql`
            update webhooks set fallos_consecutivos = fallos_consecutivos + 1
            where id = ${webhookId} and org_id = ${orgId}
            returning url, fallos_consecutivos, aviso_fallos_at`);
    } catch { return; }
    const hook = rows[0];
    if (!hook) return;
    const streak = hook.fallos_consecutivos as number;

    if (streak >= FAIL_DISABLE_THRESHOLD) {
        await disableWebhook(orgId, webhookId, hook.url as string, streak);
    } else if (streak >= FAIL_WARN_THRESHOLD) {
        await maybeWarnWebhook(orgId, webhookId, hook.url as string, streak, hook.aviso_fallos_at);
    }
}

type SettleOutcome = 'succeeded' | 'pending' | 'failed';

/**
 * Marca el desenlace del intento con un UPDATE de una sola sentencia guardado
 * por `lease_id = ${leaseId}` — es el CAS que hace inofensivo un lease robado
 * o vencido: si otro worker ya reclamó la fila, este UPDATE no toca nada.
 * `oneShot` (pruebas/replay manual) fuerza 'failed' tras UN intento en vez de
 * entrar al calendario de reintentos de varios días.
 */
async function settle(
    orgId: string, messageId: string, leaseId: string, attemptsBefore: number,
    result: SafeFetchResult, oneShot: boolean,
): Promise<SettleOutcome> {
    const attemptsAfter = attemptsBefore + 1;
    if (result.ok) {
        await withOrgTx(orgId, sql`
            update webhook_events
               set estado = 'succeeded', delivered_at = now(), last_status = ${result.status}, last_error = null,
                   intentos = ${attemptsAfter}, lease_id = null, lease_until = null, updated_at = now()
             where id = ${messageId} and org_id = ${orgId} and lease_id = ${leaseId}::uuid`);
        return 'succeeded';
    }
    const delayMs = oneShot ? null : nextRetryDelayMs(attemptsAfter);
    if (delayMs === null) {
        await withOrgTx(orgId, sql`
            update webhook_events
               set estado = 'failed', intentos = ${attemptsAfter}, last_status = ${result.status || null}, last_error = ${result.error},
                   lease_id = null, lease_until = null, updated_at = now()
             where id = ${messageId} and org_id = ${orgId} and lease_id = ${leaseId}::uuid`);
        return 'failed';
    }
    await withOrgTx(orgId, sql`
        update webhook_events
           set estado = 'pending', intentos = ${attemptsAfter}, last_status = ${result.status || null}, last_error = ${result.error},
               next_retry_at = now() + make_interval(secs => ${Math.max(1, Math.round(delayMs / 1000))}),
               lease_id = null, lease_until = null, updated_at = now()
         where id = ${messageId} and org_id = ${orgId} and lease_id = ${leaseId}::uuid`);
    return 'pending';
}

/**
 * Repone la fila a 'pending' sin haber intentado nada — usado cuando el techo
 * de OUTBOUND_LIMIT_PER_MIN corta la entrega ANTES de tocar la red. No cuenta
 * como intento (no es culpa del endpoint) ni toca la racha de salud; solo
 * empuja next_retry_at unos segundos para reintentar en cuanto haya cupo.
 */
async function rescheduleThrottled(orgId: string, messageId: string, leaseId: string, delaySec: number): Promise<void> {
    try {
        await withOrgTx(orgId, sql`
            update webhook_events
               set estado = 'pending', next_retry_at = now() + make_interval(secs => ${Math.max(1, delaySec)}),
                   lease_id = null, lease_until = null, updated_at = now()
             where id = ${messageId} and org_id = ${orgId} and lease_id = ${leaseId}::uuid`);
    } catch { /* best-effort */ }
}

interface DeliveryOutcome { ok: boolean; status: number; error: string | null; settled: SettleOutcome }

async function runDelivery(
    row: ClaimedRow, hook: HookSecrets | null, leaseId: string,
    opts: { oneShot?: boolean; prueba?: boolean } = {},
): Promise<DeliveryOutcome> {
    if (!hook) {
        // El endpoint desapareció entre el claim y ahora (ventana muy angosta —
        // si se borra, el FK cascade ya se habría llevado esta fila). Se
        // asienta como fallo definitivo para no dejar un lease colgado.
        const result: SafeFetchResult = { status: 0, ok: false, body: '', error: 'Endpoint no encontrado', ms: 0 };
        const settled = await settle(row.orgId, row.id, leaseId, row.intentos, result, true);
        return { ok: false, status: 0, error: result.error, settled };
    }
    // Techo de salidas por endpoint ANTES de tocar la red — protege contra
    // convertir a Cord en reflector de un ataque volumétrico hacia un tercero.
    // No consume intento ni toca la racha de salud: no es culpa del endpoint,
    // es nuestro propio freno.
    const rl = await rateLimit(`wh:${hook.id}`, OUTBOUND_LIMIT_PER_MIN, 60);
    if (!rl.ok) {
        await rescheduleThrottled(row.orgId, row.id, leaseId, rl.retryAfter);
        return { ok: false, status: 0, error: 'rate_limited', settled: 'pending' };
    }

    const attemptNumber = row.intentos + 1;
    const result = await attemptOnce(hook, row, attemptNumber);
    await recordDeliveryLog(row.orgId, {
        webhookId: hook.id, messageId: row.id, eventId: row.eventId, evento: row.evento,
        intento: attemptNumber, prueba: !!opts.prueba, result,
    });
    await updateWebhookSummary(row.orgId, hook.id, result);
    const settled = await settle(row.orgId, row.id, leaseId, row.intentos, result, !!opts.oneShot);
    // Solo actualiza la racha de salud en desenlaces TERMINALES — 'pending'
    // significa que al mensaje le quedan reintentos, no es su palabra final.
    if (settled !== 'pending') await applyHealthOutcome(row.orgId, hook.id, settled === 'succeeded');
    return { ok: result.ok, status: result.status, error: result.error, settled };
}

async function fetchHooks(orgId: string, webhookIds: string[]): Promise<Map<string, HookSecrets>> {
    if (!webhookIds.length) return new Map();
    let rows: any[] = [];
    try {
        [rows] = await withOrgTx(orgId, sql`
            select id, url, secret, secret_enc, secret_prev, secret_prev_enc, secret_prev_expira
            from webhooks where org_id = ${orgId} and id = any(${webhookIds})`);
    } catch { rows = []; }
    const hooks: Array<[string, HookSecrets]> = [];
    for (const h of rows) {
        const secret = decryptSecret(h.secret_enc as string | null) || (h.secret as string | null);
        if (!secret) continue;
        hooks.push([h.id as string, {
            id: h.id as string,
            url: h.url as string,
            secret,
            secretPrev: decryptSecret(h.secret_prev_enc as string | null) || (h.secret_prev as string | null),
            secretPrevExpira: (h.secret_prev_expira as string) ?? null,
        }]);
    }
    return new Map(hooks);
}

// ── Entrega inmediata (latencia p50 — llamar con after() tras encolar) ──────

/**
 * Reclama e intenta entregar AHORA MISMO las filas indicadas (de UNA org). Es
 * la ruta de baja latencia: el outbox es red de seguridad, no impuesto de
 * latencia — esto corre inline justo después de encolar, y si falla o la
 * invocación muere a media entrega, el cron (runSweep) recoge el resto.
 */
export async function flushNow(
    orgId: string, messageIds: string[], opts: { oneShot?: boolean; prueba?: boolean } = {},
): Promise<DeliveryOutcome[]> {
    if (!messageIds.length) return [];
    const { rows, leaseId } = await claimByIdsOrg(orgId, messageIds);
    if (!rows.length) return [];
    const hooks = await fetchHooks(orgId, [...new Set(rows.map((r) => r.webhookId))]);
    return Promise.all(rows.map((row) => runDelivery(row, hooks.get(row.webhookId) ?? null, leaseId, opts)));
}

// ── Sweeper (cron /api/cron/webhooks, 1 vez al día — límite de plan de Vercel) ──

const SWEEP_BATCH = 200;
const SWEEP_CONCURRENCY = 12;
const SWEEP_BUDGET_MS = 40_000;

/**
 * Barre TODAS las orgs por trabajo vencido (invocaciones perdidas + fallos
 * programados para reintento) hasta agotar el presupuesto de tiempo o quedarse
 * sin trabajo. Solo se puede llamar desde el carril de cron (assertCronContext,
 * exigido también dentro de claimDue vía withSystemTx).
 */
export async function runSweep(): Promise<{ claimed: number; succeeded: number; failed: number; pending: number }> {
    assertCronContext();
    const t0 = Date.now();
    let claimed = 0, succeeded = 0, failed = 0, pending = 0;

    while (Date.now() - t0 < SWEEP_BUDGET_MS) {
        const { rows, leaseId } = await claimDue(SWEEP_BATCH);
        if (!rows.length) break;
        claimed += rows.length;

        const byOrg = new Map<string, ClaimedRow[]>();
        for (const r of rows) {
            const list = byOrg.get(r.orgId) ?? [];
            list.push(r);
            byOrg.set(r.orgId, list);
        }

        // Concurrencia acotada dentro de cada org, orgs en secuencia — simple y
        // a prueba de agotar el pool del driver HTTP de Neon bajo carga.
        for (const [orgId, orgRows] of byOrg) {
            const hooks = await fetchHooks(orgId, [...new Set(orgRows.map((r) => r.webhookId))]);
            for (const batch of chunk(orgRows, SWEEP_CONCURRENCY)) {
                const outcomes = await Promise.all(
                    batch.map((row) => runDelivery(row, hooks.get(row.webhookId) ?? null, leaseId)),
                );
                for (const o of outcomes) {
                    if (o.settled === 'succeeded') succeeded++;
                    else if (o.settled === 'failed') failed++;
                    else pending++;
                }
            }
        }

        if (rows.length < SWEEP_BATCH) break; // se vació la cola antes del presupuesto
    }

    return { claimed, succeeded, failed, pending };
}

// ── Prueba manual / replay (UI de Ajustes › Developers) ─────────────────────

/**
 * Envía un evento de PRUEBA a un endpoint (ping con datos de ejemplo). Se
 * encola y se entrega inline (oneShot: un fallo NO entra al calendario de
 * reintentos de días — el usuario está esperando el resultado en pantalla).
 */
export async function sendTestEvent(orgId: string, webhookId: string): Promise<{ ok: boolean; status: number; error: string | null }> {
    let rows: any[];
    try { [rows] = await withOrgTx(orgId, sql`select id from webhooks where id = ${webhookId} and org_id = ${orgId}`); }
    catch { return { ok: false, status: 0, error: 'No se pudo consultar el endpoint' }; }
    if (!rows.length) return { ok: false, status: 0, error: 'Endpoint no encontrado' };

    const base = import.meta.env.PUBLIC_SITE_URL || process.env.PUBLIC_SITE_URL || 'https://cordhq.app';
    const eventId = newEventId();
    const body = JSON.stringify({
        id: eventId,
        event: 'ping',
        created_at: new Date().toISOString(),
        data: {
            id: '00000000-0000-0000-0000-000000000000',
            folio: 'COT-PRUEBA',
            status: 'sent',
            total: 12500,
            cliente: 'Cliente de prueba S.A. de C.V.',
            link_publico: `${base}/q/demo`,
            mensaje: 'Esta es una entrega de prueba enviada desde Ajustes › Developers.',
        },
    });

    const enqueued = await enqueueSingle(orgId, webhookId, 'ping', body, eventId);
    if (!enqueued) return { ok: false, status: 0, error: 'No se pudo encolar la prueba' };
    const [outcome] = await flushNow(orgId, [enqueued.id], { oneShot: true, prueba: true });
    return outcome ?? { ok: false, status: 0, error: 'No se pudo entregar' };
}

/**
 * Re-entrega (replay) una entrega pasada: re-firma y re-envía EXACTAMENTE el
 * mismo payload guardado a la misma URL. oneShot: es una acción manual del
 * usuario, no debe quedar reintentándose sola por días si vuelve a fallar.
 */
export async function redeliver(orgId: string, deliveryId: string): Promise<{ ok: boolean; status: number; error: string | null }> {
    let dRows: any[];
    try { [dRows] = await withOrgTx(orgId, sql`select * from webhook_deliveries where id = ${deliveryId} and org_id = ${orgId}`); }
    catch { return { ok: false, status: 0, error: 'No se pudo consultar la entrega' }; }
    const d = dRows[0];
    if (!d) return { ok: false, status: 0, error: 'Entrega no encontrada' };

    let hRows: any[];
    try { [hRows] = await withOrgTx(orgId, sql`select id from webhooks where id = ${d.webhook_id} and org_id = ${orgId}`); }
    catch { return { ok: false, status: 0, error: 'No se pudo consultar el endpoint' }; }
    if (!hRows.length) return { ok: false, status: 0, error: 'Endpoint no encontrado' };

    // El payload YA NO se duplica en cada intento (ver recordDeliveryLog) —
    // vive en webhook_events.payload, ligado por message_id. request_body
    // queda de respaldo solo para filas de ANTES de ese cambio.
    let body = (d.request_body as string) || '';
    if (!body && d.message_id) {
        try {
            const [msgRows] = await withOrgTx(orgId, sql`select payload from webhook_events where id = ${d.message_id} and org_id = ${orgId}`);
            body = (msgRows[0]?.payload as string) || '';
        } catch { /* best-effort */ }
    }
    if (!body) return { ok: false, status: 0, error: 'El payload original ya no está disponible (venció la retención)' };
    // Reusar el `id` YA EMBEBIDO en el payload guardado (mismo evento lógico,
    // mismo event_id que el receptor ya vio) — nunca generar uno nuevo si el
    // body lo trae, o la columna event_id divergiría del contenido del JSON
    // que de hecho se reenvía verbatim. Fallback solo para filas de ANTES de
    // esta fecha (payload legacy sin `id`): se genera uno fresco sin tocar el
    // body guardado (el replay debe seguir siendo byte-idéntico al original).
    let eventId: string;
    try {
        const parsed = JSON.parse(body);
        eventId = typeof parsed?.id === 'string' && parsed.id.startsWith('evt_') ? parsed.id : newEventId();
    } catch {
        eventId = newEventId();
    }
    const enqueued = await enqueueSingle(orgId, d.webhook_id as string, d.evento as string, body, eventId);
    if (!enqueued) return { ok: false, status: 0, error: 'No se pudo encolar el reintento' };
    const [outcome] = await flushNow(orgId, [enqueued.id], { oneShot: true, prueba: !!d.es_prueba });
    return outcome ?? { ok: false, status: 0, error: 'No se pudo entregar' };
}

/**
 * Botón "Reactivar y reintentar" (UI de un endpoint auto-desactivado): repone
 * a 'pending' los mensajes que quedaron 'failed' en las últimas 24h de ESTE
 * endpoint — nunca el backlog completo (un endpoint caído una semana no debe
 * despertar con miles de eventos viejos disparándose de golpe). El caller es
 * responsable de reactivar `webhooks.activo` por separado; esto solo repone
 * trabajo. Dispara la entrega inline en segundo plano (after) para que el
 * usuario vea resultados casi de inmediato, sin bloquear la respuesta.
 */
export async function reenableAndRetryRecent(orgId: string, webhookId: string): Promise<{ requeued: number }> {
    let ids: string[] = [];
    try {
        const [rows] = await withOrgTx(orgId, sql`
            update webhook_events
               set estado = 'pending', intentos = 0, next_retry_at = now(),
                   lease_id = null, lease_until = null, updated_at = now()
             where webhook_id = ${webhookId} and org_id = ${orgId}
               and estado = 'failed' and created_at > now() - interval '24 hours'
            returning id`);
        ids = rows.map((r: any) => r.id as string);
    } catch {
        return { requeued: 0 };
    }
    if (ids.length) after(flushNow(orgId, ids));
    return { requeued: ids.length };
}

// Ventana de solape permitida: 1h, 24h o 72h (la UI ofrece exactamente estas
// 3 opciones). Clamp defensivo por si algo manda un valor fuera de rango.
const ROTATE_OVERLAP_HOURS = [1, 24, 72];

/**
 * Rota el secreto de un endpoint SIN romper a los consumidores que aún no
 * actualizaron su verificador: el secreto viejo sigue firmando (doble-firma
 * en X-Cord-Signature-V1, legacy X-Cord-Signature con el viejo) durante
 * `overlapHours`. El nuevo secreto se devuelve en claro UNA sola vez — igual
 * que al crear el endpoint — y no se puede volver a leer después.
 */
export async function rotateSecret(orgId: string, webhookId: string, overlapHours: number): Promise<{ secret: string } | null> {
    const hours = ROTATE_OVERLAP_HOURS.includes(overlapHours) ? overlapHours : 24;
    const newSecret = `whsec_${randomBytes(24).toString('hex')}`;
    try {
        const [[current]] = await withOrgTx(orgId, sql`
            select secret, secret_enc from webhooks
            where id = ${webhookId} and org_id = ${orgId} limit 1`);
        if (!current) return null;
        const oldSecret = decryptSecret(current.secret_enc as string | null) || (current.secret as string | null);
        if (!oldSecret) return null;
        const oldSecretEnc = encryptRequiredSecret(oldSecret);
        const newSecretEnc = encryptRequiredSecret(newSecret);
        const [rows] = await withOrgTx(orgId, sql`
            update webhooks
               set secret_prev = null, secret_prev_enc = ${oldSecretEnc},
                   secret_prev_expira = now() + make_interval(hours => ${hours}),
                   secret = null, secret_enc = ${newSecretEnc}, secret_rotado_at = now()
             where id = ${webhookId} and org_id = ${orgId}
            returning id`);
        if (!rows.length) return null;
    } catch {
        return null;
    }
    return { secret: newSecret };
}

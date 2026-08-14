// Motor ÚNICO de la cobranza autónoma. Antes esta lógica vivía duplicada en dos
// sitios que habían divergido: `api/cron/cobranza.ts` (la buena) y
// `runCobranzaForOrg` de `api/agentes.ts` (la que ejecutaba el botón "Forzar
// ejecución"), esta última con seis bugs que el cron ya había corregido —
// vencimiento por `c.vigencia` en vez del canónico, solo `status='invoiced'`,
// monto = total crudo en vez del saldo real, sin días de gracia, sin `payUrl`
// (el correo salía sin link de pago) y el historial mapeado con
// `rol: h.autor_tipo === 'agente_ia' ? 'user' : 'user'`, que además rompe la API
// de Anthropic con turnos consecutivos del mismo rol.
//
// Ahora el cron itera orgs llamando aquí, y el botón manual llama aquí. Una sola
// implementación: no pueden volver a divergir.

import { sql, withOrgTx } from '../db';
import { runARAgent } from './ar-agent';
import { sendEmail, siteOrigin } from '../email';
import { moneyFull } from '../fmt';
import { checkEntitlement } from '../org-entitlements';

export interface CobranzaConfig {
    activa: boolean;
    modo: 'aprobacion' | 'automatico';
    graciaDias: number;
    cadenciaDias: number;
    planDias: number;
    maxCuotas: number;
    tono: 'cercano' | 'profesional' | 'firme';
    idioma: 'es' | 'en';
    firma: string | null;
    montoMin: number;
    maxCorrida: number;
}

export type OmitMotivo = 'cadencia' | 'exclusion' | 'monto_min' | 'plan_al_corriente' | 'saldado' | 'tope_corrida';

export interface RunResult {
    orgId: string;
    procesadas: number;
    borradores: number;
    enviados: number;
    fallidos: number;
    omitidas: { cotizacionId: string; folio: string; empresa: string; motivo: OmitMotivo }[];
}

const DEFAULTS: CobranzaConfig = {
    activa: false, modo: 'aprobacion', graciaDias: 3, cadenciaDias: 7, planDias: 15,
    maxCuotas: 3, tono: 'profesional', idioma: 'es', firma: null, montoMin: 0, maxCorrida: 25,
};

function rowToConfig(row: any): CobranzaConfig {
    if (!row) return { ...DEFAULTS };
    const modo = row.ai_cobranza_modo === 'automatico' ? 'automatico' : 'aprobacion';
    const idioma = row.ai_cobranza_idioma === 'en' ? 'en' : 'es';
    const tono = ['cercano', 'profesional', 'firme'].includes(row.ai_cobranza_tono) ? row.ai_cobranza_tono : 'profesional';
    return {
        activa: !!row.ai_cobranza_activa,
        modo,
        // Los `clamp` no son decorativos: la config viaja por PATCH /api/org y un
        // valor absurdo (gracia 0, cadencia 0) convertiría al agente en spam diario.
        graciaDias: clamp(row.ai_cobranza_gracia_dias, 0, 90, DEFAULTS.graciaDias),
        cadenciaDias: clamp(row.ai_cobranza_cadencia_dias, 1, 90, DEFAULTS.cadenciaDias),
        planDias: clamp(row.ai_cobranza_plan_dias, 1, 365, DEFAULTS.planDias),
        maxCuotas: clamp(row.ai_cobranza_max_cuotas, 2, 6, DEFAULTS.maxCuotas),
        tono, idioma,
        firma: row.ai_cobranza_firma ? String(row.ai_cobranza_firma).slice(0, 400) : null,
        montoMin: Math.max(0, Number(row.ai_cobranza_monto_min) || 0),
        maxCorrida: clamp(row.ai_cobranza_max_corrida, 1, 200, DEFAULTS.maxCorrida),
    };
}

function clamp(v: any, min: number, max: number, fallback: number): number {
    const n = Math.round(Number(v));
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
}

export const CONFIG_COLUMNS = `ai_cobranza_activa, ai_cobranza_modo, ai_cobranza_gracia_dias,
    ai_cobranza_cadencia_dias, ai_cobranza_plan_dias, ai_cobranza_max_cuotas, ai_cobranza_tono,
    ai_cobranza_idioma, ai_cobranza_firma, ai_cobranza_monto_min, ai_cobranza_max_corrida`;

export async function getCobranzaConfig(orgId: string): Promise<CobranzaConfig> {
    const [[row]] = await withOrgTx(orgId, sql`
        select ai_cobranza_activa, ai_cobranza_modo, ai_cobranza_gracia_dias,
               ai_cobranza_cadencia_dias, ai_cobranza_plan_dias, ai_cobranza_max_cuotas,
               ai_cobranza_tono, ai_cobranza_idioma, ai_cobranza_firma,
               ai_cobranza_monto_min, ai_cobranza_max_corrida
        from orgs where id = ${orgId}`);
    return rowToConfig(row);
}

const escapeHtml = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Convierte el link de pago del texto del agente en ancla clickeable. */
const linkify = (escaped: string, url: string) => {
    const escUrl = escapeHtml(url);
    return escaped.split(escUrl).join(`<a href="${escUrl}" style="color:#0a192f;font-weight:600;">${escUrl}</a>`);
};

/** Plantilla del correo de cobranza (la buena del cron; el clon la tenía sin botón). */
export function renderCollectionEmail(opts: {
    cuerpo: string; payUrl: string; cobraOnline: boolean; montoBoton: number; idioma: 'es' | 'en';
}): string {
    const { cuerpo, payUrl, cobraOnline, montoBoton, idioma } = opts;
    const en = idioma === 'en';
    const cta = cobraOnline
        ? (en ? `Pay ${moneyFull(montoBoton, 'en')} online` : `Pagar ${moneyFull(montoBoton, 'es')} en línea`)
        : (en ? 'View quote and payment options' : 'Ver cotización y opciones de pago');
    const seguro = en ? 'Secure payment processed by Stripe.' : 'Pago seguro procesado por Stripe.';
    const pie = en ? 'Automated collections · Cord' : 'Cobranza automatizada · Cord';
    return `<div style="background-color:#ffffff;padding:40px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:540px;margin:0 auto;">
    <div style="margin-bottom:32px;">
      <img src="https://cordhq.app/imgs/logo-cord-navy.png" width="90" height="auto" alt="Cord" style="display:block;">
    </div>
    <p style="font-size:16px;line-height:1.6;color:#374151;margin:0;font-weight:400;white-space:pre-wrap;">${linkify(escapeHtml(cuerpo), payUrl)}</p>
    <div style="margin:32px 0 0;">
      <a href="${escapeHtml(payUrl)}" style="display:inline-block;background:#0a192f;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:13px 28px;border-radius:999px;">${cta}</a>
      ${cobraOnline ? `<p style="font-size:12px;color:#9CA3AF;margin:10px 0 0;">${seguro}</p>` : ''}
    </div>
    <div style="margin-top:48px;padding-top:24px;border-top:1px solid #E5E7EB;">
      <p style="font-size:12px;color:#9CA3AF;margin:0;line-height:1.5;">${pie}</p>
    </div>
  </div>
</div>`;
}

/** Digest al owner cuando el modo es `aprobacion`: UN correo por corrida, no N. */
function renderDigestEmail(n: number, idioma: 'es' | 'en', origin: string): string {
    const en = idioma === 'en';
    const titulo = en ? `${n} collection email${n === 1 ? '' : 's'} awaiting your approval`
        : `${n} correo${n === 1 ? '' : 's'} de cobranza ${n === 1 ? 'espera' : 'esperan'} tu aprobación`;
    const cuerpo = en
        ? 'Your collections agent drafted them. Review, edit or discard before anything reaches your customers.'
        : 'Tu agente de cobranza los redactó. Revísalos, edítalos o descártalos antes de que lleguen a tus clientes.';
    const cta = en ? 'Review drafts' : 'Revisar borradores';
    return `<div style="background-color:#ffffff;padding:40px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:540px;margin:0 auto;">
    <div style="margin-bottom:32px;"><img src="https://cordhq.app/imgs/logo-cord-navy.png" width="90" height="auto" alt="Cord" style="display:block;"></div>
    <h1 style="font-size:20px;font-weight:600;color:#111827;margin:0 0 12px;letter-spacing:-0.02em;">${escapeHtml(titulo)}</h1>
    <p style="font-size:15px;line-height:1.6;color:#374151;margin:0;">${escapeHtml(cuerpo)}</p>
    <div style="margin:32px 0 0;">
      <a href="${origin}/app/cobranza/agente" style="display:inline-block;background:#0a192f;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:13px 28px;border-radius:999px;">${cta}</a>
    </div>
  </div>
</div>`;
}

/**
 * Corre el agente sobre la cartera vencida de UNA org.
 *
 * `dryRun` lista a quién le tocaría escribir sin llamar al modelo ni enviar nada
 * — es lo que alimenta el widget "En la mira": el usuario ve qué va a pasar
 * ANTES de que pase.
 */
export async function runCobranzaOrg(
    orgId: string,
    opts: { dryRun?: boolean; limit?: number } = {},
): Promise<RunResult> {
    const entitlement = await checkEntitlement(orgId, 'collections_ai');
    if (!entitlement.ok) throw new Error('La suscripción no incluye cobranza autónoma con IA.');
    const cfg = await getCobranzaConfig(orgId);
    const out: RunResult = { orgId, procesadas: 0, borradores: 0, enviados: 0, fallidos: 0, omitidas: [] };
    if (!cfg.activa && !opts.dryRun) return out;

    const origin = siteOrigin();

    // Candidatas: mismo cálculo canónico de vencimiento que getCobranza(), el cron
    // de intereses y el de recordatorios — coalesce(approved_at, created_at) + los
    // días del término. `es_recurrente` se excluye: una iguala al corriente no es
    // cartera vencida (bug ya documentado en historial-billing-cobros.md).
    const [candidatas] = await withOrgTx(orgId, sql`
        select
          c.id as cotizacion_id, c.folio, c.total, c.public_token, c.cliente_id,
          cl.empresa as cliente_nombre, cl.email as cliente_email,
          (o.stripe_charges_enabled and o.stripe_account_id is not null
           and (o.acepta_tarjeta or o.cobro_spei_auto)) as cobra_online,
          floor(date_part('day', now() - (
            coalesce(c.approved_at, c.created_at)
            + make_interval(days => case coalesce(c.terminos, cl.terminos_default, 'contado')
                when 'net30' then 30 when 'net60' then 60 else 0 end)
          )))::int as dias_vencido,
          coalesce((select sum(monto) from cotizacion_cobros
                    where cotizacion_id = c.id and status = 'pagado'), 0) as pagado,
          exists(select 1 from cobranza_exclusiones x
                 where x.org_id = c.org_id
                   and (x.cotizacion_id = c.id or x.cliente_id = c.cliente_id)) as excluida,
          (select max(coalesce(cc.enviado_at, cc.created_at)) from cobranza_conversaciones cc
           where cc.cotizacion_id = c.id and cc.estado = 'enviado') as ultimo_envio,
          exists(select 1 from cobranza_conversaciones cc
                 where cc.cotizacion_id = c.id and cc.estado = 'borrador') as tiene_borrador
        from cotizaciones c
        join clientes cl on c.cliente_id = cl.id
        join orgs o on o.id = c.org_id
        where c.org_id = ${orgId}
          and c.status in ('approved', 'invoiced')
          and c.es_recurrente is not true
          and c.paid_at is null
          and coalesce(c.approved_at, c.created_at)
              + make_interval(days => case coalesce(c.terminos, cl.terminos_default, 'contado')
                  when 'net30' then 30 when 'net60' then 60 else 0 end)
              < now() - make_interval(days => ${cfg.graciaDias})
        order by dias_vencido desc`);

    const limite = Math.min(opts.limit ?? cfg.maxCorrida, cfg.maxCorrida);
    const cadenciaMs = cfg.cadenciaDias * 24 * 60 * 60 * 1000;
    const ahora = Date.now();
    const omitir = (q: any, motivo: OmitMotivo) =>
        out.omitidas.push({ cotizacionId: q.cotizacion_id, folio: q.folio, empresa: q.cliente_nombre, motivo });

    const elegibles: any[] = [];
    for (const q of candidatas) {
        const saldo = Math.max(0, Number(q.total) - Number(q.pagado ?? 0));
        // Saldado por cobros parciales: el flip del webhook a 'paid' va en camino.
        if (saldo <= 0) { omitir(q, 'saldado'); continue; }
        if (q.excluida) { omitir(q, 'exclusion'); continue; }
        if (saldo < cfg.montoMin) { omitir(q, 'monto_min'); continue; }
        // Cadencia — el bug que el cron diario tenía en producción: sin esta
        // comprobación le escribía a la MISMA cotización todos los días. Un
        // borrador sin resolver también frena: no se acumulan borradores del
        // mismo hilo esperando aprobación.
        if (q.tiene_borrador) { omitir(q, 'cadencia'); continue; }
        if (q.ultimo_envio && ahora - new Date(q.ultimo_envio).getTime() < cadenciaMs) {
            omitir(q, 'cadencia'); continue;
        }
        elegibles.push({ ...q, saldo });
    }

    for (const q of elegibles.slice(limite)) omitir(q, 'tope_corrida');
    const aProcesar = elegibles.slice(0, limite);

    for (const q of aProcesar) {
        const [[planVigente]] = await withOrgTx(orgId, sql`
            select id from planes_pago_negociados
            where cotizacion_id = ${q.cotizacion_id} and estado in ('propuesto', 'activo') limit 1`);

        // Lo COBRABLE hoy en un clic: el siguiente cobro pendiente ya vencido. Con
        // plan de cuotas es la cuota exigible, no el saldo completo.
        const [[proxCobro]] = await withOrgTx(orgId, sql`
            select monto from cotizacion_cobros
            where cotizacion_id = ${q.cotizacion_id} and status = 'pendiente'
              and (vence is null or vence <= current_date)
            order by vence asc nulls first, created_at asc limit 1`);

        // Cliente AL CORRIENTE de su plan: el plan sustituye a los términos
        // originales, así que no se le cobra.
        if (planVigente && !proxCobro) { omitir(q, 'plan_al_corriente'); continue; }

        if (opts.dryRun) { out.procesadas++; continue; }

        const diasVencido = Math.max(0, Number(q.dias_vencido) || 0);
        const cobraOnline = !!q.cobra_online;
        const payUrl = cobraOnline
            ? `${origin}/q/${q.public_token}/pay`
            : `${origin}/q/${q.public_token}`;
        const montoBoton = proxCobro ? Number(proxCobro.monto) : q.saldo;

        const [historial] = await withOrgTx(orgId, sql`
            select autor_tipo, mensaje from cobranza_conversaciones
            where cotizacion_id = ${q.cotizacion_id}
              and estado in ('enviado', 'aprobado')
            order by created_at asc`);

        // El agente habla; el cliente y el vendedor son el "otro turno". Mapear
        // ambos a 'user' es correcto aquí porque Anthropic exige alternancia y
        // un mensaje del vendedor en el hilo es contexto de entrada, no salida
        // del modelo. Turnos consecutivos del mismo rol se colapsan abajo.
        const mapped: { rol: 'user' | 'assistant'; contenido: string }[] = [];
        for (const h of historial as any[]) {
            const rol: 'user' | 'assistant' = h.autor_tipo === 'agente_ia' ? 'assistant' : 'user';
            const prev = mapped[mapped.length - 1];
            if (prev && prev.rol === rol) prev.contenido += `\n\n${h.mensaje}`;
            else mapped.push({ rol, contenido: h.mensaje });
        }

        const res = await runARAgent({
            cotizacionId: q.cotizacion_id,
            orgId,
            clienteNombre: q.cliente_nombre,
            clienteEmail: q.cliente_email,
            montoAdeudado: q.saldo,
            diasVencido,
            payUrl,
            allowPlan: diasVencido >= cfg.planDias && !planVigente,
            // En modo aprobación el plan se PROPONE, no se materializa: un correo
            // que queda en borrador y nunca se aprueba no puede haber cancelado ya
            // los PaymentIntents del cliente ni reescrito sus cobros pendientes.
            dryRunPlan: cfg.modo === 'aprobacion',
            tono: cfg.tono,
            idioma: cfg.idioma,
            firma: cfg.firma,
            maxCuotas: cfg.maxCuotas,
            historialConversacion: mapped,
        });

        out.procesadas++;

        if (!res.ok) {
            await withOrgTx(orgId, sql`
                insert into cobranza_conversaciones (org_id, cotizacion_id, autor_tipo, mensaje, estado, error)
                values (${orgId}, ${q.cotizacion_id}, 'agente_ia', ${res.mensaje}, 'fallido', ${res.error ?? 'error'})`);
            out.fallidos++;
            continue;
        }

        if (cfg.modo === 'aprobacion') {
            await withOrgTx(orgId, sql`
                insert into cobranza_conversaciones (org_id, cotizacion_id, autor_tipo, mensaje, estado)
                values (${orgId}, ${q.cotizacion_id}, 'agente_ia', ${res.mensaje}, 'borrador')`);
            out.borradores++;
            continue;
        }

        const envio = q.cliente_email
            ? await sendEmail({
                orgId,
                operation: 'collection_reminder',
                to: q.cliente_email,
                subject: cfg.idioma === 'en'
                    ? `Payment reminder — overdue balance (${diasVencido} days)`
                    : `Recordatorio de pago — saldo vencido (${diasVencido} días)`,
                fromName: null,
                html: renderCollectionEmail({ cuerpo: res.mensaje, payUrl, cobraOnline, montoBoton, idioma: cfg.idioma }),
            })
            : { sent: false, skipped: 'sin email' as string, messageId: undefined };

        await withOrgTx(orgId, sql`
            insert into cobranza_conversaciones
              (org_id, cotizacion_id, autor_tipo, mensaje, estado, enviado_at, message_id, error)
            values (${orgId}, ${q.cotizacion_id}, 'agente_ia', ${res.mensaje},
                    ${envio.sent ? 'enviado' : 'fallido'},
                    ${envio.sent ? new Date().toISOString() : null},
                    ${(envio as any).messageId ?? null},
                    ${envio.sent ? null : ((envio as any).error ?? (envio as any).skipped ?? 'no enviado')})`);

        if (envio.sent) out.enviados++; else out.fallidos++;
    }

    // Un solo digest por corrida, no N correos al owner.
    if (!opts.dryRun && cfg.modo === 'aprobacion' && out.borradores > 0) {
        const [[owner]] = await withOrgTx(orgId, sql`
            select coalesce(u.email, (select email from org_members where org_id = ${orgId} and rol = 'owner' limit 1)) as email
            from orgs o left join users u on u.id = o.owner_id where o.id = ${orgId}`);
        if (owner?.email) {
            await sendEmail({
                orgId,
                operation: 'collection_digest',
                to: owner.email,
                subject: cfg.idioma === 'en'
                    ? `${out.borradores} collection email${out.borradores === 1 ? '' : 's'} awaiting approval`
                    : `${out.borradores} correo${out.borradores === 1 ? '' : 's'} de cobranza esperan tu aprobación`,
                html: renderDigestEmail(out.borradores, cfg.idioma, origin),
            });
        }
    }

    return out;
}

/** Orgs con la cobranza autónoma encendida (nunca sandboxes ni la org demo). */
export async function orgsConCobranzaActiva(): Promise<string[]> {
    const rows = await sql`
        select id from orgs
        where ai_cobranza_activa = true
          and cord_effective_plan(id) in ('scale', 'developer')
          and sandbox_of is null
          and is_demo is not true
          and owner_id::text <> '00000000-0000-0000-0000-000000000000'`;
    return rows.map((r: any) => r.id as string);
}

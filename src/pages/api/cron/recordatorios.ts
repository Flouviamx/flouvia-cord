// GET /api/cron/recordatorios — recordatorios de cobro automáticos.
// Dos carteras: cotizaciones aprobadas con saldo (aviso 3 días antes y el día
// que vencen) y facturas abiertas (la escalera de etapas que cada negocio elige
// en Ajustes › Recordatorios, `orgs.recordatorio_etapas`). Protegido con
// CRON_SECRET; lo disparan vercel.json y cord-crons.yml.
//
// ⚠️ Fix jul 2026: antes usaba getActiveOrgId() — que sin sesión (contexto cron)
// SIEMPRE resolvía la org demo, así que ningún negocio real recibía recordatorios.
// Ahora itera TODAS las orgs con cartera viva (excluyendo sandboxes de prueba).
//
// ⚠️ Fix jul 2026 (bis): el link del correo se armaba con `new URL(request.url)
// .origin`, que en un request del cron es la URL interna del deployment. Ahora
// usa `publicDocumentUrl()` con la organización de cada documento.
//
// Oct 2026 — por organización, no por corrida:
//   · El trabajo de cada cuenta corre dentro de SU presentación (idioma,
//     formato, divisa y zona horaria; src/lib/org-presentation.ts). Antes el
//     cron no tenía idioma y una cuenta en inglés mandaba sus recordatorios de
//     factura en español.
//   · "Hoy" es el día civil del negocio, no el del servidor: una etapa no sale
//     un día antes en Tokio ni un día tarde en Ciudad de México.
//   · El calendario de etapas, el interruptor y la pausa por cliente (la lista
//     "No escribir a" de la cobranza, `cobranza_exclusiones`) son del negocio.
//   · El barrido cross-org es lo único que va en el carril de sistema; las
//     pausas, la dedup y cada envío vuelven a withOrgTx (regla 30).
export const prerender = false;

import type { APIRoute } from 'astro';
import { assertCronAuth } from '../../../lib/cron-auth';
import { sql, logAudit, withOrgTx, withSystemTx } from '../../../lib/db';
import { reqContext } from '../../../lib/context';
import { notifyInvoiceReminder, notifyQuoteReminder, siteOrigin } from '../../../lib/email';
import { dispatchInvoiceEvent } from '../../../lib/webhooks';
import { notify } from '../../../lib/notify';
import { normalizeCurrency } from '../../../lib/currency';
import { getCountryProfile } from '../../../lib/countries';
import { log } from '../../../lib/log';
import { termDays } from '../../../lib/payment-terms';
import { addDays, dayDiff } from '../../../lib/tasks';
import { localClock } from '../../../lib/task-reminders';
import { withPresentation, type OrgPresentation } from '../../../lib/org-presentation';
import { detalleEventoEtapa, etapaQueToca, etapasGuardadas, momentoDelAviso, VENTANA } from '../../../lib/recordatorios';

export const GET: APIRoute = async ({ request }) => {
    const authError = assertCronAuth(request);
    if (authError) return authError;
    return reqContext.run({ userId: null, cronScope: true }, () => run(new Date()));
};

interface OrgWork {
    pres: OrgPresentation;
    activos: boolean;
    cotizaciones: Record<string, any>[];
    facturas: Record<string, any>[];
}

interface Totales {
    enviados: number; candidatos: number; vencidasHoy: number; fallidos: number;
    apagados: number; pausados: number;
    facturas: { enviados: number; candidatas: number; vencidasHoy: number };
}

async function run(now: Date): Promise<Response> {
    // ── Barrido cross-org (carril de SISTEMA) ───────────────────────────────
    // Solo cotizaciones que siguen siendo la deuda: sin `paid_at` y sin una
    // factura viva que ya lleve ese saldo (la escalera de facturas la recuerda).
    // Las orgs sandbox y la demo quedan fuera.
    const [cotizaciones] = await withSystemTx(sql`
        select c.id, c.folio, c.terminos, c.cliente_id, c.base_currency,
               c.total - coalesce((select sum(cc.monto) from cotizacion_cobros cc
                                    where cc.cotizacion_id = c.id and cc.org_id = c.org_id and cc.status = 'pagado'), 0) as saldo,
               coalesce(c.approved_at, c.created_at) as base,
               cl.empresa,
               o.id as org_id, o.idioma, o.moneda, o.zona_horaria, o.country_code,
               o.recordatorios_activos
        from cotizaciones c
        join clientes cl on cl.id = c.cliente_id
        join orgs o on o.id = c.org_id
        where c.status in ('approved', 'invoiced')
          and c.es_recurrente is not true
          and c.paid_at is null
          and not exists (
              select 1 from documentos_fiscales d
               where d.cotizacion_id = c.id and d.org_id = c.org_id
                 and d.lifecycle in ('open', 'paid', 'uncollectible'))
          and cl.email is not null and cl.email <> ''
          and o.sandbox_of is null
          and o.owner_id::text <> '00000000-0000-0000-0000-000000000000'`);

    // Facturas: la ventana va un día más ancha que la que se evalúa porque el
    // día civil de cada negocio puede ir un día adelante o atrás del servidor.
    const [facturas] = await withSystemTx(sql`
        select d.id, d.org_id, to_char(d.due_date, 'YYYY-MM-DD') as due, d.cotizacion_id,
               coalesce(d.cliente_id, (select c.cliente_id from cotizaciones c where c.id = d.cotizacion_id)) as cliente_id,
               o.recordatorio_etapas as etapas, o.recordatorios_activos,
               o.idioma, o.moneda, o.zona_horaria, o.country_code,
               (select array_agg(r.etapa) from documento_recordatorios r where r.documento_id = d.id) as enviadas
          from documentos_fiscales d
          join orgs o on o.id = d.org_id
         where d.lifecycle = 'open'
           and d.due_date is not null
           and d.amount_remaining > 0
           and o.sandbox_of is null
           and d.due_date between current_date - ${VENTANA.max + 1}::int and current_date + ${-VENTANA.min + 1}::int`);

    const porOrg = new Map<string, OrgWork>();
    const de = (row: Record<string, any>): OrgWork => {
        const orgId = String(row.org_id);
        let w = porOrg.get(orgId);
        if (!w) {
            w = {
                pres: { idioma: row.idioma, moneda: row.moneda, zona_horaria: row.zona_horaria, country_code: row.country_code },
                // Columna nueva: una fila sin ella (null) se trata como encendida,
                // que es como estuvo siempre.
                activos: row.recordatorios_activos !== false,
                cotizaciones: [], facturas: [],
            };
            porOrg.set(orgId, w);
        }
        return w;
    };
    for (const c of cotizaciones) de(c).cotizaciones.push(c);
    for (const f of facturas) de(f).facturas.push(f);

    const t: Totales = {
        enviados: 0, candidatos: 0, vencidasHoy: 0, fallidos: 0, apagados: 0, pausados: 0,
        facturas: { enviados: 0, candidatas: facturas.length, vencidasHoy: 0 },
    };
    // Una cuenta que truena no deja sin recordatorios a las demás.
    for (const [orgId, w] of porOrg) {
        try {
            await withPresentation(w.pres, () => procesarOrg(orgId, w, now, t));
        } catch (err) {
            t.fallidos++;
            log.error('recordatorios de una organización fallaron', { route: 'cron/recordatorios', orgId, err });
        }
    }
    return json(t);
}

/** Día civil de hoy en la zona del negocio (la de su país si no eligió una). */
function hoyDe(p: OrgPresentation, now: Date): string {
    const zona = p.zona_horaria || getCountryProfile(String(p.country_code || 'MX')).timeZone;
    return localClock(zona, now).day;
}

/**
 * ¿Ya se hizo hoy? El endpoint lo disparan dos relojes y estos avisos no tienen
 * tabla de dedup propia: la fila de auditoría que se escribe al hacerlo es la
 * marca. 36 horas cubren el día sin tocar el aviso siguiente de la misma
 * cotización, que llega tres días después.
 */
async function yaHecho(orgId: string, accion: string, entidadId: string): Promise<boolean> {
    const [r] = await withOrgTx(orgId, sql`
        select 1 from audit_log
         where org_id = ${orgId} and accion = ${accion} and entidad_id = ${entidadId}
           and created_at > now() - interval '36 hours'
         limit 1`);
    return r.length > 0;
}

/**
 * Pausas del negocio: la lista "No escribir a" de la cobranza
 * (`cobranza_exclusiones`) — un cliente que pidió que no le escriban no recibe
 * ni al agente ni los recordatorios. Una sola lista, no dos que se contradigan.
 * Su RLS es por organización: se lee aquí, no en el barrido de sistema.
 */
async function leerPausas(orgId: string) {
    const [rows] = await withOrgTx(orgId, sql`
        select cliente_id, cotizacion_id, documento_id from cobranza_exclusiones where org_id = ${orgId}`);
    const set = (k: string) => new Set(rows.map((r) => r[k]).filter(Boolean).map(String));
    return { clientes: set('cliente_id'), cotizaciones: set('cotizacion_id'), documentos: set('documento_id') };
}

async function procesarOrg(orgId: string, w: OrgWork, now: Date, t: Totales): Promise<void> {
    const hoy = hoyDe(w.pres, now);
    const pausas = w.activos ? await leerPausas(orgId) : null;

    // ── Cotizaciones ────────────────────────────────────────────────────────
    // Vencimiento = día civil de la aprobación + días del término de pago.
    const avisadasHoy = new Set<string>();
    for (const q of w.cotizaciones) {
        const aprobada = localClock(w.pres.zona_horaria || getCountryProfile(String(w.pres.country_code || 'MX')).timeZone, new Date(q.base)).day;
        const vence = addDays(aprobada, termDays(q.terminos));
        const dias = dayDiff(hoy, vence);
        const saldo = Number(q.saldo ?? 0);
        const id = String(q.id);

        // Al dueño: "pago vencido" el primer día tras el vencimiento. No es un
        // recordatorio al cliente: no lo apaga el interruptor ni la pausa.
        if (dias === -1 && saldo > 0) {
            try {
                if (!(await yaHecho(orgId, 'cobranza.vencida_avisada', id))) {
                    t.vencidasHoy++;
                    await notify(orgId, 'payment_overdue', {
                        folio: q.folio, cliente: q.empresa, total: saldo,
                        moneda: normalizeCurrency(q.base_currency ?? w.pres.moneda),
                        link: `${siteOrigin()}/app/cobranza`,
                    });
                    await logAudit(orgId, { accion: 'cobranza.vencida_avisada', entidad: 'cotizacion', entidad_id: id, detalle: q.folio });
                }
            } catch (err) {
                t.fallidos++;
                log.error('no se pudo avisar de una cotización vencida', { route: 'cron/recordatorios', orgId, err });
            }
            continue;
        }

        // Al cliente: dos avisos, 3 días antes y el día del vencimiento.
        if (!(saldo > 0 && (dias === 3 || dias === 0))) continue;
        t.candidatos++;
        if (!w.activos) { t.apagados++; continue; }
        if (pausas && (pausas.clientes.has(String(q.cliente_id)) || pausas.cotizaciones.has(id))) { t.pausados++; continue; }
        try {
            if (await yaHecho(orgId, 'recordatorio.enviado', id)) { avisadasHoy.add(id); continue; }
            const res = await notifyQuoteReminder(orgId, id, { saldo, vence });
            if (res.sent) {
                t.enviados++;
                avisadasHoy.add(id);
                await logAudit(orgId, { accion: 'recordatorio.enviado', entidad: 'cotizacion', entidad_id: id, detalle: `${q.folio} → ${res.to ?? ''}` });
            }
        } catch (err) {
            t.fallidos++;
            log.error('no se pudo mandar un recordatorio de cotización', { route: 'cron/recordatorios', orgId, err });
        }
    }

    // ── Facturas ────────────────────────────────────────────────────────────
    // La etapa alcanzada se calcula del vencimiento y se registra en
    // `documento_recordatorios`: la dedup es un hecho de la base, corra el cron
    // las veces que corra, y una corrida perdida se recupera sola.
    for (const f of w.facturas) {
        const docId = String(f.id);
        const diasVencida = dayDiff(String(f.due), hoy);   // >0 = ya venció

        if (diasVencida === 1) {
            // Cruzó el vencimiento ayer: el webhook sale una sola vez. Es un
            // evento para las integraciones del negocio, no un correo al
            // cliente: no lo apaga el interruptor.
            try {
                if (!(await yaHecho(orgId, 'factura.vencida_avisada', docId))) {
                    t.facturas.vencidasHoy++;
                    await dispatchInvoiceEvent(orgId, docId, 'invoice.overdue');
                    await logAudit(orgId, { accion: 'factura.vencida_avisada', entidad: 'factura', entidad_id: docId, detalle: 'invoice.overdue' });
                }
            } catch (err) {
                t.fallidos++;
                log.error('no se pudo despachar invoice.overdue', { route: 'cron/recordatorios', orgId, err });
            }
        }

        if (diasVencida < VENTANA.min || diasVencida > VENTANA.max) continue;
        const etapa = etapaQueToca(etapasGuardadas(f.etapas), diasVencida, Array.isArray(f.enviadas) ? f.enviadas : []);
        if (etapa === null) continue;
        if (!w.activos) { t.apagados++; continue; }
        if (pausas && (pausas.documentos.has(docId) || (f.cliente_id && pausas.clientes.has(String(f.cliente_id))))) { t.pausados++; continue; }
        // Si la factura viene de una cotización que hoy ya recibió su aviso, no
        // se escribe dos veces por el mismo dinero.
        if (f.cotizacion_id && avisadasHoy.has(String(f.cotizacion_id))) continue;

        // Se REGISTRA antes de mandar. Al revés, un fallo entre el envío y la
        // escritura repetiría el correo en la siguiente corrida (regla 25).
        const [marcaRows] = await withOrgTx(orgId, sql`
            insert into documento_recordatorios (org_id, documento_id, etapa)
            values (${orgId}, ${docId}, ${etapa})
            on conflict (documento_id, etapa) do nothing
            returning id`);
        if (!marcaRows[0]) continue;   // otra corrida ganó la carrera

        let sent = false;
        try {
            sent = await notifyInvoiceReminder(orgId, docId, momentoDelAviso(diasVencida));
        } catch (err) {
            // Lanzar se trata igual que "no salió": la etapa se libera abajo para
            // reintentarse mañana en vez de quedar marcada sin que el correo saliera.
            t.fallidos++;
            log.error('no se pudo mandar el recordatorio de una factura', { route: 'cron/recordatorios', orgId, err });
        }
        if (sent) {
            t.facturas.enviados++;
            await logAudit(orgId, {
                accion: 'factura.recordatorio_enviado', entidad: 'factura',
                entidad_id: docId, detalle: `etapa ${etapa > 0 ? `+${etapa}` : etapa} · vence ${f.due}`,
            });
            await withOrgTx(orgId, sql`insert into eventos (org_id, documento_id, tipo, detalle)
                      values (${orgId}, ${docId}, 'reminder', ${detalleEventoEtapa(etapa)})`);
        } else {
            await withOrgTx(orgId, sql`delete from documento_recordatorios where documento_id = ${docId} and etapa = ${etapa}`);
        }
    }
}

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

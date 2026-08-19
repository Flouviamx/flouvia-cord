// GET /api/cron/recordatorios — recordatorios de cobro automáticos.
// Busca cuentas por cobrar cuyo vencimiento cae en los próximos 3 días y, si hay
// RESEND_API_KEY, envía un correo con la marca de Cord vía Resend (mismo helper y
// plantilla que notifyQuoteSent/cron de cobranza). Pensado para correr como cron
// de Vercel (ver vercel.json). Protegido con CRON_SECRET: Vercel manda
// Authorization: Bearer ${CRON_SECRET}.
//
// ⚠️ Fix jul 2026: antes usaba getActiveOrgId() — que sin sesión (contexto cron)
// SIEMPRE resolvía la org demo, así que ningún negocio real recibía recordatorios.
// Ahora itera TODAS las orgs con cartera viva (excluyendo sandboxes de prueba),
// igual que el cron de intereses.
//
// ⚠️ Fix jul 2026 (bis): el link del correo se armaba con `new URL(request.url)
// .origin` — en un request disparado por el cron de Vercel (no por un navegador)
// eso resuelve a la URL interna del deployment (tipo https://flouvia-cord-xxxx
// .vercel.app), no a cordhq.app. El correo salía con un link roto/feo. Ahora usa
// `siteOrigin()` (mismo helper que ya usa dispatchQuoteEvent para webhooks), y el
// HTML se armó igual al resto de correos transaccionales (logo, color de marca,
// botón pill) en vez de texto plano sin estilo.
export const prerender = false;

import type { APIRoute } from 'astro';
import { assertCronAuth } from '../../../lib/cron-auth';
import { sql, logAudit } from '../../../lib/db';
import { sendEmail, siteOrigin, notifyInvoiceReminder } from '../../../lib/email';
import { dispatchInvoiceEvent } from '../../../lib/webhooks';
import { notify } from '../../../lib/notify';
import { currencyDecimals, normalizeCurrency } from '../../../lib/currency';

const DAYS: Record<string, number> = { contado: 0, net30: 30, net60: 60 };
// Cada recordatorio se formatea con la divisa de SU cotización: este cron
// barre la cartera de TODAS las orgs, así que un formateador fijo mezclaba
// pesos, dólares y euros bajo el mismo "$".
const money = (n: number, currency?: string) => {
    const code = normalizeCurrency(currency);
    const decimals = currencyDecimals(code);
    return new Intl.NumberFormat('es-MX', {
        style: 'currency', currency: code,
        minimumFractionDigits: decimals, maximumFractionDigits: decimals,
    }).format(n);
};

export const GET: APIRoute = async ({ request }) => {
    // Auth del cron (si está configurado el secreto).
    const authError = assertCronAuth(request);
    if (authError) return authError;

    // Cartera viva de TODAS las orgs reales (una sola query; el volumen es bajo:
    // solo approved/invoiced con email y vencimiento próximo). Las orgs sandbox
    // (entorno de prueba) y la demo quedan fuera.
    const rows = await sql`
        select c.id, c.folio, c.total, c.terminos, c.public_token, c.base_currency, o.moneda,
               coalesce(c.approved_at, c.created_at) as base,
               cl.empresa, cl.email,
               o.id as org_id, o.nombre as org_nombre, coalesce(o.color_marca, '#0a192f') as color,
               (o.portal_powered = false and cord_effective_plan(o.id) <> 'free') as powered_off
        from cotizaciones c
        join clientes cl on cl.id = c.cliente_id
        join orgs o on o.id = c.org_id
        where c.status in ('approved', 'invoiced')
          and c.es_recurrente is not true
          and cl.email is not null and cl.email <> ''
          and o.sandbox_of is null
          and o.owner_id::text <> '00000000-0000-0000-0000-000000000000'`;

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const MS = 86400000;
    const todas = rows.map((r) => {
        const due = new Date(r.base as string); due.setDate(due.getDate() + (DAYS[r.terminos as string] ?? 0));
        const dias = Math.round((due.getTime() - today.getTime()) / MS);
        return {
            id: r.id as string, folio: r.folio as string, total: num(r.total),
            token: r.public_token as string, empresa: r.empresa as string, email: r.email as string,
            orgId: r.org_id as string, orgNombre: (r.org_nombre as string) || 'Cord',
            color: /^#[0-9a-fA-F]{6}$/.test(r.color as string) ? (r.color as string) : '#0a192f',
            poweredOff: r.powered_off === true,
            // La query trae base_currency y moneda, pero este map los TIRABA: río
            // abajo `c.base_currency` era undefined, normalizeCurrency caía a MXN
            // y TODO recordatorio se formateaba en pesos — a un cliente que cotizó
            // en euros le llegaba su importe rotulado como MXN (regla 21).
            moneda: normalizeCurrency(r.base_currency ?? r.moneda),
            vence: due, dias,
        };
    });
    const candidatos = todas.filter((c) => c.dias >= 0 && c.dias <= 3); // vence en los próximos 3 días
    // Owner: aviso de "pago vencido" (evento payment_overdue) exactamente el
    // primer día tras el vencimiento — coincidencia exacta de fecha, el cron
    // corre una vez al día, así se dispara una sola vez por cotización sin
    // necesitar una tabla de dedup.
    const vencidasHoy = todas.filter((c) => c.dias === -1);

    const origin = siteOrigin();
    let enviados = 0;
    for (const c of candidatos) {
        const link = `${origin}/q/${c.token}`;
        const venceTxt = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'long' }).format(c.vence);
        const poweredLine = c.poweredOff ? esc(c.orgNombre) : `${esc(c.orgNombre)} · enviado con Cord`;
        const html = `<div style="background-color:#ffffff;padding:40px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
            <div style="max-width:540px;margin:0 auto;">
                <div style="margin-bottom:32px;">
                    <img src="https://cordhq.app/imgs/logo-cord-navy.png" width="90" height="auto" alt="Cord Logo" style="display:block;">
                </div>

                <p style="font-size:16px;color:#111827;margin-top:0;font-weight:500;">Hola, equipo de ${esc(c.empresa)}</p>
                <p style="font-size:16px;line-height:1.6;color:#374151;margin-bottom:32px;font-weight:400;">Les recordamos que la cotización <b>${esc(c.folio)}</b> por <b>${money(c.total, c.moneda)}</b> vence el <b>${venceTxt}</b>.</p>

                <div style="margin:40px 0;">
                    <a href="${link}" style="display:inline-block;background-color:${c.color};color:#ffffff;text-decoration:none;font-weight:500;font-size:15px;padding:12px 24px;border-radius:8px;">Ver y pagar ${esc(c.folio)}</a>
                </div>

                <p style="font-size:14px;color:#6B7280;line-height:1.5;word-break:break-all;">O copia y pega este enlace en tu navegador:<br><a href="${link}" style="color:#2563EB;text-decoration:none;">${link}</a></p>

                <div style="margin-top:48px;padding-top:24px;border-top:1px solid #E5E7EB;">
                    <p style="font-size:12px;color:#9CA3AF;margin:0;line-height:1.5;">${poweredLine}</p>
                </div>
            </div>
        </div>`;
        const res = await sendEmail({
            orgId: c.orgId,
            operation: 'payment_reminder',
            to: c.email,
            subject: `Recordatorio de pago — ${c.folio}`,
            html,
            fromName: c.orgNombre,
        });
        if (res.sent) { enviados++; await logAudit(c.orgId, { accion: 'recordatorio.enviado', entidad: 'cotizacion', entidad_id: c.id, detalle: `${c.folio} → ${c.email}` }); }
    }

    for (const c of vencidasHoy) {
        await notify(c.orgId, 'payment_overdue', {
            folio: c.folio, cliente: c.empresa, total: c.total,
            moneda: c.moneda,
            link: `${origin}/app/cobranza`,
        });
    }

    // ── Facturas ────────────────────────────────────────────────────────────
    // La cartera de arriba es de COTIZACIONES y deriva el vencimiento de los
    // términos. Una factura tiene `due_date` propio, y desde ago 2026 puede no
    // tener cotización detrás (standalone) — así que necesita su propio barrido
    // o esas facturas nunca recibirían recordatorio.
    // Escalera completa, no una ventana de 5 días.
    //
    // Antes: un solo correo cuando `due_date - current_date` caía entre -1 y 3,
    // y la no-duplicación dependía de que el cron corriera EXACTAMENTE una vez
    // al día (su propio comentario lo admitía). Dos corridas el mismo día
    // mandaban dos correos por el mismo dinero; una corrida perdida se saltaba
    // el aviso para siempre, porque la ventana ya había pasado.
    //
    // Ahora la etapa alcanzada se calcula del vencimiento y se registra en
    // `documento_recordatorios`. La dedup es un hecho de la base: cada etapa se
    // manda una vez por documento, corra el cron las veces que corra. Y una
    // corrida perdida se recupera sola — la etapa sigue pendiente mañana.
    const facturas = await sql`
        select d.id, d.org_id, d.due_date, d.cotizacion_id,
               (current_date - d.due_date) as dias_vencida,
               coalesce(o.recordatorio_etapas, '{-7,-1,3,7,14,30}'::int[]) as etapas,
               (select array_agg(r.etapa) from documento_recordatorios r where r.documento_id = d.id) as enviadas
          from documentos_fiscales d
          join orgs o on o.id = d.org_id
         where d.lifecycle = 'open'
           and d.due_date is not null
           and d.amount_remaining > 0
           and o.sandbox_of is null
           and (current_date - d.due_date) between -30 and 120`;

    // Dedup contra la cartera de cotizaciones: si la factura viene de una que ya
    // recibió recordatorio arriba, no se manda dos veces por el mismo dinero.
    const yaAvisadas = new Set(candidatos.map((c) => c.id));
    let facturasEnviadas = 0;
    let vencidasFactura = 0;
    for (const f of facturas) {
        const diasVencida = Number(f.dias_vencida);   // >0 = ya venció
        const docId = f.id as string;
        const orgId = f.org_id as string;

        if (diasVencida === 1) {
            // Cruzó el vencimiento ayer: el webhook se dispara una sola vez.
            vencidasFactura++;
            await dispatchInvoiceEvent(orgId, docId, 'invoice.overdue');
        }

        // La etapa que TOCA hoy: la mayor de la cadencia que ya se alcanzó y
        // todavía no se ha mandado. Tomar la mayor (y no la primera pendiente)
        // evita que una factura recuperada después de semanas dispare toda la
        // escalera de golpe en un solo día.
        const etapas: number[] = Array.isArray(f.etapas) ? f.etapas.map(Number) : [];
        const enviadas = new Set<number>(Array.isArray(f.enviadas) ? f.enviadas.map(Number) : []);
        const alcanzadas = etapas
            .filter((e) => diasVencida >= e && !enviadas.has(e))
            .sort((a, b) => b - a);
        const etapa = alcanzadas[0];
        if (etapa === undefined) continue;

        if (f.cotizacion_id && yaAvisadas.has(f.cotizacion_id as string)) continue;

        // Se REGISTRA antes de mandar. Al revés, un fallo entre el envío y la
        // escritura repetiría el correo en la siguiente corrida — y repetir un
        // cobro es la queja más cara que puede generar esta función.
        const [marca] = await sql`
            insert into documento_recordatorios (org_id, documento_id, etapa)
            values (${orgId}, ${docId}, ${etapa})
            on conflict (documento_id, etapa) do nothing
            returning id`;
        if (!marca) continue;   // otra corrida ganó la carrera

        const sent = await notifyInvoiceReminder(orgId, docId, diasVencida > 0);
        if (sent) {
            facturasEnviadas++;
            await logAudit(orgId, {
                accion: 'factura.recordatorio_enviado', entidad: 'factura',
                entidad_id: docId, detalle: `etapa ${etapa > 0 ? `+${etapa}` : etapa} · vence ${f.due_date}`,
            });
            await sql`insert into eventos (org_id, documento_id, tipo, detalle)
                      values (${orgId}, ${docId}, 'reminder', ${etapa > 0
                          ? `Recordatorio de cobro (${etapa} días vencida)`
                          : `Aviso de vencimiento (${Math.abs(etapa)} días antes)`})`;
        } else {
            // No salió: se libera la etapa para reintentar mañana en vez de
            // darla por consumida.
            await sql`delete from documento_recordatorios where documento_id = ${docId} and etapa = ${etapa}`;
        }
    }

    return json({
        enviados, candidatos: candidatos.length, vencidasHoy: vencidasHoy.length,
        facturas: { enviados: facturasEnviadas, candidatas: facturas.length, vencidasHoy: vencidasFactura },
    });
};

const num = (v: unknown) => Number(v ?? 0);
const esc = (s: string) => String(s).replace(/</g, '&lt;');
function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

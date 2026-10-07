// Envío programado de informes guardados (fase 5): cada lunes (semanal) o cada
// día 1 (mensual), en la zona horaria del negocio, quien guardó el informe recibe
// el periodo que terminó con sus KPIs y el CSV adjunto.
//
// Contratos:
// - Regla 30: el barrido cross-org solo DESCUBRE candidatos (withSystemTx); el
//   trabajo de cada uno vuelve a withOrgTx con su org_id.
// - El destinatario es quien lo guardó, y solo mientras siga activo y conserve
//   `analitica`: alguien que dejó el equipo no sigue recibiendo los números.
// - `ultimo_envio_at` avanza ANTES de enviar con compare-and-set (dos corridas a la
//   vez no mandan dos correos) y se libera si el envío falla, para reintentar en la
//   siguiente corrida sin saltarse el periodo (mismo patrón que la regla 25).
import { sql, withOrgTx, withSystemTx, resolvePresentationContext } from './db';
import { reqContext, currentLocale } from './context';
import { t } from '../i18n/app';
import { escapeHtml } from './escape';
import { sendEmail, siteOrigin } from './email';
import { money, fmtNumber, intlLocale } from './fmt-server';
import { memberCan } from './permissions';
import { todayInZone } from './report-scope';
import { addDaysISO } from './rango';
import { getExplorer, parseExplorerConfig } from './informes-explorar';
import { tablaLabel, tablaToCsv } from './informes-csv';
import type { TablaKpi } from './informes-tabla';

type Frecuencia = 'semanal' | 'mensual';

/** Inicio del periodo en curso: el lunes de esta semana o el día 1 de este mes. */
export function periodStart(frecuencia: Frecuencia, hoyISO: string): string {
    if (frecuencia === 'mensual') return `${hoyISO.slice(0, 7)}-01`;
    const dow = new Date(`${hoyISO}T12:00:00Z`).getUTCDay(); // 0 = domingo
    return addDaysISO(hoyISO, -((dow + 6) % 7));
}

/** El periodo COMPLETO anterior al que está en curso. */
export function previousPeriod(frecuencia: Frecuencia, hoyISO: string): { desde: string; hasta: string } {
    const start = periodStart(frecuencia, hoyISO);
    const hasta = addDaysISO(start, -1);
    return { desde: frecuencia === 'mensual' ? `${hasta.slice(0, 7)}-01` : addDaysISO(start, -7), hasta };
}

/**
 * Toca enviar si el último envío (en la zona del negocio) es anterior al inicio del
 * periodo en curso. Así una corrida perdida no se salta la semana: la siguiente la
 * manda. `ultimoLocalISO` null = nunca se programó un reloj (no debería pasar:
 * guardar con frecuencia arranca el reloj).
 */
export function isDue(frecuencia: Frecuencia, hoyISO: string, ultimoLocalISO: string | null): boolean {
    return !ultimoLocalISO || ultimoLocalISO < periodStart(frecuencia, hoyISO);
}

type RunResult = { candidatos: number; enviados: number; omitidos: number; errores: number };

export async function runInformesProgramados(opts: { limit?: number } = {}): Promise<RunResult> {
    const result: RunResult = { candidatos: 0, enviados: 0, omitidos: 0, errores: 0 };
    const [candidatos] = await withSystemTx(sql`
        select id, org_id from informes_guardados
         where frecuencia <> 'ninguna' and creado_por is not null
           and (ultimo_envio_at is null or ultimo_envio_at < now() - interval '20 hours')
         order by ultimo_envio_at asc nulls first
         limit ${opts.limit ?? 200}`);
    result.candidatos = candidatos.length;
    for (const row of candidatos) {
        const orgId = String(row.org_id);
        try {
            const out = await reqContext.run({ userId: null, sessionId: null, orgId }, () => sendOne(orgId, String(row.id)));
            if (out === 'enviado') result.enviados++; else result.omitidos++;
        } catch {
            result.errores++;
        }
    }
    return result;
}

async function sendOne(orgId: string, id: string): Promise<'enviado' | 'omitido'> {
    await resolvePresentationContext();
    const [[g]] = await withOrgTx(orgId, sql`
        select g.id, g.nombre, g.config, g.frecuencia, g.ultimo_envio_at,
               o.zona_horaria, o.nombre as negocio,
               u.email, m.rol, m.permisos
          from informes_guardados g
          join orgs o on o.id = g.org_id
          left join org_members m on m.org_id = g.org_id and m.user_id = g.creado_por and m.estado = 'activo'
          left join users u on u.id = g.creado_por
         where g.id = ${id} and g.org_id = ${orgId} limit 1`);
    if (!g || (g.frecuencia !== 'semanal' && g.frecuencia !== 'mensual')) return 'omitido';
    const frecuencia = g.frecuencia as Frecuencia;
    const tz = String(g.zona_horaria || 'America/Mexico_City');
    const hoy = todayInZone(tz);
    const ultimoLocal = g.ultimo_envio_at ? civilDateIn(tz, new Date(g.ultimo_envio_at as string)) : null;
    if (!isDue(frecuencia, hoy, ultimoLocal)) return 'omitido';
    // Sin destinatario válido el informe no se manda; tampoco se avanza el reloj, así
    // que vuelve a salir si la persona recupera el permiso.
    const member = g.rol ? { rol: String(g.rol), permisos: (g.permisos ?? {}) as Record<string, boolean>, esOwner: g.rol === 'owner', widgetPrefs: {} } : null;
    if (!g.email || !member || !memberCan(member, 'analitica')) return 'omitido';

    const [claimed] = await withOrgTx(orgId, sql`
        update informes_guardados set ultimo_envio_at = now()
         where id = ${id} and org_id = ${orgId}
           and ultimo_envio_at is not distinct from ${g.ultimo_envio_at}
        returning id`);
    if (!claimed.length) return 'omitido';

    try {
        const periodo = previousPeriod(frecuencia, hoy);
        const config = parseExplorerConfig(g.config as any);
        const report = await getExplorer({ key: 'custom', ...periodo }, config);
        const L = currentLocale();
        const rango = formatRange(periodo.desde, periodo.hasta);
        const nombre = String(g.nombre);
        const href = `${siteOrigin()}/app/informes?r=explorar&guardado=${id}&desde=${periodo.desde}&hasta=${periodo.hasta}`;
        const sent = await sendEmail({
            to: String(g.email),
            subject: t(L, 'inf.mail.asunto').replace('{nombre}', nombre).replace('{periodo}', rango),
            html: emailHtml({ nombre, negocio: String(g.negocio || ''), rango, kpis: report.kpis, href, L }),
            orgId,
            operation: 'scheduled_report',
            attachments: [{ filename: `cord-informe-${periodo.desde}_${periodo.hasta}.csv`, content: new TextEncoder().encode(tablaToCsv(report, L)) }],
        });
        if (!sent.sent) throw new Error('no enviado');
        return 'enviado';
    } catch (error) {
        await withOrgTx(orgId, sql`
            update informes_guardados set ultimo_envio_at = ${g.ultimo_envio_at}
             where id = ${id} and org_id = ${orgId}`);
        throw error;
    }
}

/** Día civil 'YYYY-MM-DD' de un instante en la zona del negocio. */
function civilDateIn(tz: string, at: Date): string {
    try { return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at); }
    catch { return at.toISOString().slice(0, 10); }
}

function formatRange(desde: string, hasta: string): string {
    // Fechas civiles: se formatean en UTC para que ninguna zona las corra un día.
    const f = new Intl.DateTimeFormat(intlLocale(), { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
    return `${f.format(new Date(`${desde}T12:00:00Z`))} – ${f.format(new Date(`${hasta}T12:00:00Z`))}`.replace(/\./g, '');
}

function kpiValue(k: TablaKpi, value: number | null): string {
    if (value === null) return '—';
    if (k.format === 'money') return money(value, 0);
    if (k.format === 'pct') return `${value}%`;
    if (k.format === 'days') return t(currentLocale(), 'inf.t.n_dias').replace('{n}', fmtNumber(value, 1));
    return fmtNumber(value, 1);
}

function emailHtml(o: { nombre: string; negocio: string; rango: string; kpis: TablaKpi[]; href: string; L: 'es' | 'en' }): string {
    const rows = o.kpis.map((k) => `
        <tr>
            <td style="padding:14px 0;border-bottom:1px solid #EEF0F3;font-size:14px;color:#4B5563;">${escapeHtml(tablaLabel(o.L, k.label))}</td>
            <td style="padding:14px 0;border-bottom:1px solid #EEF0F3;text-align:right;">
                <div style="font-size:17px;font-weight:600;color:#0a192f;letter-spacing:-0.02em;font-variant-numeric:tabular-nums;">${escapeHtml(kpiValue(k, k.value))}</div>
                ${k.prev === null ? '' : `<div style="font-size:12px;color:#9CA3AF;margin-top:2px;">${escapeHtml(t(o.L, 'inf.t.vs_prev').replace('{v}', kpiValue(k, k.prev)))}</div>`}
            </td>
        </tr>`).join('');
    return `<div style="background-color:#ffffff;padding:40px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
        <div style="max-width:540px;margin:0 auto;">
            <div style="margin-bottom:32px;"><img src="https://cordhq.app/imgs/logo-cord-navy.png" width="90" height="auto" alt="Cord" style="display:block;"></div>
            <p style="font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#9CA3AF;margin:0 0 8px;">${escapeHtml(o.negocio)}</p>
            <h1 style="font-size:20px;font-weight:600;color:#111827;margin:0 0 6px;letter-spacing:-0.02em;">${escapeHtml(o.nombre)}</h1>
            <p style="font-size:14px;color:#6B7280;margin:0 0 24px;">${escapeHtml(o.rango)}</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 28px;">${rows}</table>
            <p style="font-size:14px;line-height:1.6;color:#374151;margin:0 0 24px;">${escapeHtml(t(o.L, 'inf.mail.adjunto'))}</p>
            <a href="${escapeHtml(o.href)}" style="display:inline-block;background-color:#0a192f;color:#ffffff;text-decoration:none;font-weight:500;font-size:15px;padding:12px 24px;border-radius:8px;">${escapeHtml(t(o.L, 'inf.mail.boton'))}</a>
            <div style="margin-top:40px;padding-top:24px;border-top:1px solid #E5E7EB;"><p style="font-size:13px;color:#6B7280;line-height:1.5;margin:0;">${escapeHtml(t(o.L, 'inf.mail.pie'))}</p></div>
        </div>
    </div>`;
}

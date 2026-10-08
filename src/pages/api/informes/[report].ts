import type { APIRoute } from 'astro';
import { REPORT_BY_ID, REPORT_IDS, parseGranularity, type ReportId } from '../../../lib/informes';
import { tablaToCsv } from '../../../lib/informes-csv';
import { loadReport } from '../../../lib/informes-data';
import { configFromSearch } from '../../../lib/informes-explorar';
import { requirePerm } from '../../../lib/queries';
import { addDaysISO, parseRangoParams } from '../../../lib/rango';
import { todayInZone } from '../../../lib/report-scope';
import { currentLocale, currentTimeZone } from '../../../lib/context';
import { getActiveOrgId } from '../../../lib/db';
import { requireEntitlement } from '../../../lib/org-entitlements';

export const prerender = false;

export const GET: APIRoute = async ({ params, url }) => {
    const id = params.report as ReportId;
    if (!REPORT_IDS.includes(id)) {
        return new Response(JSON.stringify({ error: 'Informe inválido.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    // Gate global primero: una request denegada no alcanza ninguna consulta de informe.
    const analyticsDenied = await requirePerm('analitica');
    if (analyticsDenied) return analyticsDenied;
    const report = REPORT_BY_ID[id];
    if (report.perm !== 'analitica') {
        const reportDenied = await requirePerm(report.perm);
        if (reportDenied) return reportDenied;
    }
    const premiumFeature = id === 'finanzas' ? 'cfo_dashboard' : id === 'flujo' ? 'cashflow_90' : id === 'cobranza' ? 'collections' : null;
    if (premiumFeature) {
        const orgId = await getActiveOrgId();
        const subscriptionDenied = await requireEntitlement(orgId, premiumFeature);
        if (subscriptionDenied) return subscriptionDenied;
    }
    // "Hoy" del negocio (orgs.zona_horaria), no el del servidor: regla 24.
    const todayISO = todayInZone(currentTimeZone());
    const range = parseRangoParams(url.searchParams, {
        minISO: addDaysISO(todayISO, -364), maxISO: todayISO, anchorISO: todayISO, fallback: '30',
    });
    // Explorador: dimensión y métricas por URL; configFromSearch solo deja pasar claves
    // de la lista blanca.
    const data = await loadReport(id, range, { g: parseGranularity(url.searchParams.get('g')), x: id === 'explorar' ? configFromSearch(url.searchParams) : undefined });
    // Exportación (informes tabla): importes como número y la divisa en su columna.
    if (url.searchParams.get('format') === 'csv' && data && 'tabla' in data && data.tabla) {
        const name = `cord-${id}-${report.scope === 'snapshot' ? todayISO : `${range.desde}_${range.hasta}`}.csv`;
        return new Response(tablaToCsv(data.tabla, currentLocale()), {
            headers: {
                'Content-Type': 'text/csv; charset=utf-8',
                'Content-Disposition': `attachment; filename="${name}"`,
                'Cache-Control': 'private, no-store',
            },
        });
    }
    return new Response(JSON.stringify({ report: id, range, data }), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
    });
};

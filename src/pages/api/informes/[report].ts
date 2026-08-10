import type { APIRoute } from 'astro';
import { REPORT_BY_ID, REPORT_IDS, type ReportId } from '../../../lib/informes';
import { loadReport } from '../../../lib/informes-data';
import { requirePerm } from '../../../lib/queries';
import { addDaysISO, parseRangoParams } from '../../../lib/rango';

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
    const todayISO = new Date().toISOString().slice(0, 10);
    const range = parseRangoParams(url.searchParams, {
        minISO: addDaysISO(todayISO, -364), maxISO: todayISO, anchorISO: todayISO, fallback: '30',
    });
    const data = await loadReport(id, range);
    return new Response(JSON.stringify({ report: id, range, data }), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
    });
};

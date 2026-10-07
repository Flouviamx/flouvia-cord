import type { Rango } from './rango';
import type { ReportId } from './informes';
import {
    getAnalyticsDiagnosis, getAnalyticsRango, getCFO, getCobranza,
    getClientReportInsights, getCommercialStageTiming, getFinanceLevelInsights, getPricingSuggestion, getProductReportInsights,
} from './queries';
import { getImpuestos, getPagosRecibidos, getRecompra, getVentasCliente, getVentasProducto, getVentasTiempo, getVentasVendedor } from './informes-tabla';

export async function loadReport(id: ReportId, rango: Rango, opts: { g?: 'day' | 'week' | 'month' } = {}) {
    switch (id) {
        case 'resumen':
            return { kind: id, diagnosis: await getAnalyticsDiagnosis(rango.desde, rango.hasta) } as const;
        case 'comercial': {
            const [diagnosis, stageTiming] = await Promise.all([
                getAnalyticsDiagnosis(rango.desde, rango.hasta), getCommercialStageTiming(rango.desde, rango.hasta),
            ]);
            return { kind: id, diagnosis: { ...diagnosis, stageTiming } } as const;
        }
        case 'finanzas': {
            const [cfo, niveles] = await Promise.all([getCFO(), getFinanceLevelInsights()]);
            return { kind: id, cfo: { ...cfo, niveles } } as const;
        }
        case 'flujo':
            return { kind: id, cfo: await getCFO() } as const;
        case 'cobranza':
            return { kind: id, cobranza: await getCobranza() } as const;
        case 'clientes': {
            const [analytics, insights] = await Promise.all([
                getAnalyticsRango(rango.desde, rango.hasta), getClientReportInsights(rango.desde, rango.hasta),
            ]);
            return { kind: id, analytics: { ...analytics, ...insights } } as const;
        }
        case 'ventas': return { kind: id, tabla: await getVentasTiempo(rango, opts.g) } as const;
        case 'ventas-cliente': return { kind: id, tabla: await getVentasCliente(rango) } as const;
        case 'ventas-producto': return { kind: id, tabla: await getVentasProducto(rango) } as const;
        case 'pagos': return { kind: id, tabla: await getPagosRecibidos(rango) } as const;
        case 'impuestos': return { kind: id, tabla: await getImpuestos(rango) } as const;
        case 'recompra': return { kind: id, tabla: await getRecompra() } as const;
        case 'vendedores': return { kind: id, tabla: await getVentasVendedor(rango) } as const;
        case 'productos': {
            const [analytics, cierre, pricing] = await Promise.all([
                getAnalyticsRango(rango.desde, rango.hasta), getProductReportInsights(rango.desde, rango.hasta),
                getPricingSuggestion({ precioLista: 1 }),
            ]);
            return { kind: id, analytics: { ...analytics, cierre, pricingBands: pricing.bands } } as const;
        }
    }
}

export type ReportData = Awaited<ReturnType<typeof loadReport>>;

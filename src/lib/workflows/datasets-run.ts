// SQL de las consultas de workflow. Vive aparte de `datasets.ts` porque ese
// archivo lo carga también el editor en el navegador: si el catálogo importara
// la base de datos, el bundle del cliente se llevaría el driver entero.
//
// Cada consulta corre en el carril de la organización (regla 30) y solo LEE.

import { sql, withOrgTx } from '../db';
import { findDataset } from './datasets';

export interface DatasetContext {
    /** Días del parámetro, ya acotado por el catálogo. */
    dias: number;
    /** Cliente del evento, cuando la consulta lo necesita. */
    clienteId: string | null;
}

const num = (v: unknown) => Number(v ?? 0);

type Runner = (orgId: string, ctx: DatasetContext) => Promise<Record<string, unknown>>;

const RUNNERS: Record<string, Runner> = {
    cartera_vencida: async (orgId, _ctx) => {
        const [[row]] = await withOrgTx(orgId, sql`
            select coalesce(sum(saldo), 0) as total, count(*)::int as n,
                   coalesce(max(dias_vencido), 0)::int as dias
              from cuentas_por_cobrar
             where org_id = ${orgId} and dias_vencido > 0`);
        return {
            vencido_total: num(row?.total),
            vencido_cantidad: num(row?.n),
            vencido_dias_max: num(row?.dias),
        };
    },
    pipeline_abierto: async (orgId, _ctx) => {
        const [[row]] = await withOrgTx(orgId, sql`
            select coalesce(sum(total), 0) as total, count(*)::int as n
              from cotizaciones
             where org_id = ${orgId} and status in ('sent', 'viewed')`);
        return { pipeline_total: num(row?.total), pipeline_cantidad: num(row?.n) };
    },
    cobrado_periodo: async (orgId, ctx) => {
        const [[row]] = await withOrgTx(orgId, sql`
            select coalesce(sum(total), 0) as total, count(*)::int as n
              from cotizaciones
             where org_id = ${orgId} and status = 'paid'
               and paid_at >= now() - (${ctx.dias} * interval '1 day')`);
        return { cobrado_total: num(row?.total), cobrado_cantidad: num(row?.n) };
    },
    por_vencer: async (orgId, ctx) => {
        const [[row]] = await withOrgTx(orgId, sql`
            select coalesce(sum(saldo), 0) as total, count(*)::int as n
              from cuentas_por_cobrar
             where org_id = ${orgId}
               and dias_vencido <= 0
               and vence <= current_date + ${ctx.dias}`);
        return { por_vencer_total: num(row?.total), por_vencer_cantidad: num(row?.n) };
    },
    saldo_cliente: async (orgId, ctx) => {
        if (!ctx.clienteId) return { cliente_saldo: 0, cliente_vencido: 0, cliente_documentos: 0 };
        const [[row]] = await withOrgTx(orgId, sql`
            select coalesce(sum(saldo), 0) as saldo,
                   coalesce(sum(saldo) filter (where dias_vencido > 0), 0) as vencido,
                   count(*)::int as n
              from cuentas_por_cobrar
             where org_id = ${orgId} and cliente_id = ${ctx.clienteId}`);
        return {
            cliente_saldo: num(row?.saldo),
            cliente_vencido: num(row?.vencido),
            cliente_documentos: num(row?.n),
        };
    },
};

/** Ejecuta una consulta del catálogo. Una clave desconocida devuelve null, no un objeto vacío. */
export async function runDataset(key: string, orgId: string, ctx: DatasetContext): Promise<Record<string, unknown> | null> {
    const def = findDataset(key);
    const runner = RUNNERS[key];
    if (!def || !runner) return null;
    return runner(orgId, ctx);
}

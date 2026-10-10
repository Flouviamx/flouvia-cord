// Lectura y escritura de los recordatorios automáticos de UNA organización:
// el interruptor y el calendario (`orgs.recordatorios_activos`,
// `orgs.recordatorio_etapas`) y la pausa por cliente. Las reglas puras viven en
// src/lib/recordatorios.ts; el consumidor de todo esto es el cron
// src/pages/api/cron/recordatorios.ts (regla 15).
//
// La pausa por cliente NO es una lista nueva: es la fila del cliente en
// `cobranza_exclusiones`, la lista "No escribir a" de la cobranza con IA. Un
// cliente que pidió que no le escriban no debe recibir ni al agente ni los
// recordatorios, y dos listas para lo mismo terminan contradiciéndose.

import { sql, withOrgTx } from './db';
import { etapasGuardadas } from './recordatorios';

export interface ClientePausado { clienteId: string; empresa: string; desde: string | null }

export interface AjustesRecordatorios {
    activos: boolean;
    etapas: number[];
    pausados: ClientePausado[];
}

export async function leerAjustesRecordatorios(orgId: string): Promise<AjustesRecordatorios> {
    const [[org], pausados] = await withOrgTx(orgId,
        sql`select recordatorios_activos, recordatorio_etapas from orgs where id = ${orgId}`,
        sql`select x.cliente_id, cl.empresa, x.created_at
              from cobranza_exclusiones x
              join clientes cl on cl.id = x.cliente_id and cl.org_id = x.org_id
             where x.org_id = ${orgId} and x.cliente_id is not null
             order by cl.empresa asc
             limit 200`);
    return {
        activos: org?.recordatorios_activos !== false,
        etapas: etapasGuardadas(org?.recordatorio_etapas),
        pausados: pausados.map((r) => ({
            clienteId: String(r.cliente_id),
            empresa: String(r.empresa ?? ''),
            desde: r.created_at ? new Date(r.created_at as string).toISOString() : null,
        })),
    };
}

/** ¿El cliente está en pausa? Y si la cuenta tiene los recordatorios apagados. */
export async function estadoRecordatoriosCliente(orgId: string, clienteId: string): Promise<{ pausado: boolean; cuentaActiva: boolean }> {
    const [[x], [org]] = await withOrgTx(orgId,
        sql`select 1 as si from cobranza_exclusiones where org_id = ${orgId} and cliente_id = ${clienteId} limit 1`,
        sql`select recordatorios_activos from orgs where id = ${orgId}`);
    return { pausado: !!x, cuentaActiva: org?.recordatorios_activos !== false };
}

/** Solo toca lo que viene; las etapas llegan ya validadas (validarEtapas). */
export async function guardarAjustesRecordatorios(orgId: string, cambios: { activos?: boolean; etapas?: number[] }): Promise<void> {
    await withOrgTx(orgId, sql`
        update orgs
           set recordatorios_activos = coalesce(${cambios.activos ?? null}::boolean, recordatorios_activos),
               recordatorio_etapas = coalesce(${cambios.etapas ?? null}::int[], recordatorio_etapas)
         where id = ${orgId}`);
}

/** Pausa o reanuda al cliente. Devuelve false si el cliente no es de la organización. */
export async function pausarCliente(orgId: string, clienteId: string, pausado: boolean, userId: string | null): Promise<boolean> {
    // Pertenencia explícita: la FK apunta a la tabla global de clientes, no a
    // "los de esta organización".
    const [[c]] = await withOrgTx(orgId, sql`select id from clientes where id = ${clienteId} and org_id = ${orgId}`);
    if (!c) return false;
    if (pausado) {
        await withOrgTx(orgId, sql`
            insert into cobranza_exclusiones (org_id, cliente_id, created_by)
            values (${orgId}, ${clienteId}, ${userId})
            on conflict do nothing`);
    } else {
        await withOrgTx(orgId, sql`
            delete from cobranza_exclusiones where org_id = ${orgId} and cliente_id = ${clienteId}`);
    }
    return true;
}

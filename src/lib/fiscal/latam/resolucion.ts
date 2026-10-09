// Outbox de los rieles fiscales de LatAm: resuelve los intentos que quedaron
// `pendiente` o `incierto` (se cayó la red con el pedido en vuelo, el proceso
// murió entre reclamar el número y enviarlo, la autoridad respondió 500).
//
// Nunca reenvía: CONSULTA a la autoridad qué pasó con ese número y lo resuelve
// (autorizado → la factura se termina de emitir; no existe → se descarta y el
// documento vuelve a poder emitirse o anularse, ver liberarDocumento en
// comprobantes.ts). Mismo patrón que el envío de Verifactu: la emisión es
// síncrona y este barrido recoge lo que quedó.
//
// Carriles (regla 30): el barrido cross-org es una función security definer
// que solo responde con app.scope = 'system' (withSystemTx, cron validado);
// el trabajo de cada organización vuelve a withOrgTx con su propio org_id.

import { sql, withOrgTx, withSystemTx } from '../../db';
import { log } from '../../log';
import { railConfig } from './config';
import { esErrorSeguro } from './errores';
import { conSecuencia, sinResolverDeOrg } from './comprobantes';
import type { RailId } from './rieles';

/** Antigüedad mínima para que el cron toque un intento: el proveedor resuelve los recientes en línea. */
export const ANTIGUEDAD_CRON_S = 120;

export interface ResultadoOrg {
    orgId: string;
    revisados: number;
    autorizados: number;
    descartados: number;
    sinResolver: number;
    error?: string;
}

/** Organizaciones con intentos por resolver en el riel (carril de sistema). */
export async function orgsConPendientes(rail: RailId, antiguedadS = ANTIGUEDAD_CRON_S): Promise<string[]> {
    const [rows] = await withSystemTx(sql`select cord_fiscal_rail_orgs_por_resolver(${rail}, ${antiguedadS}) as org_id`);
    return rows.map((r) => String(r.org_id)).filter(Boolean);
}

/** Resuelve los intentos colgados de una organización. */
export async function resolverPendientesDeOrg(orgId: string, rail: RailId, deadline = Date.now() + 60_000): Promise<ResultadoOrg> {
    const r: ResultadoOrg = { orgId, revisados: 0, autorizados: 0, descartados: 0, sinResolver: 0 };
    const config = railConfig(rail);
    if (!config.habilitado) return r;
    const intentos = (await sinResolverDeOrg(orgId, rail, ANTIGUEDAD_CRON_S)).filter((i) => i.entorno === config.entorno);
    if (!intentos.length) return r;

    switch (rail) {
        case 'arca': {
            const { contextoArca, resolverPorConsulta } = await import('./arca/autorizacion');
            const [[org]] = await withOrgTx(orgId, sql`select fiscal_metadata->>'tax_id' as tax_id, rfc from orgs where id = ${orgId}`);
            let ctx;
            try {
                ctx = await contextoArca(orgId, config.entorno, org?.tax_id || org?.rfc);
            } catch (error) {
                // Sin certificado o ajustes no se puede consultar: el intento
                // queda incierto (bloqueando la anulación) hasta que vuelvan.
                r.sinResolver = intentos.length;
                r.error = esErrorSeguro(error) ? error.message : 'contexto no disponible';
                return r;
            }
            for (const intento of intentos) {
                if (Date.now() >= deadline) break;
                r.revisados++;
                try {
                    const resultado = await conSecuencia(orgId, { rail, entorno: intento.entorno, serie: intento.serie, tipo: intento.tipo },
                        () => resolverPorConsulta(ctx, intento), { esperaMaxMs: 2_000 });
                    if (resultado === 'autorizado') {
                        r.autorizados++;
                        // Termina la emisión: el proveedor encuentra el intento
                        // autorizado y lo reproduce (no vuelve a pedir nada).
                        const { finalizeInvoice } = await import('../invoices');
                        await finalizeInvoice(orgId, intento.documentoId);
                    } else if (resultado === 'descartado') {
                        // resolverPorConsulta ya liberó el documento (liberarDocumento).
                        r.descartados++;
                    } else {
                        r.sinResolver++;
                    }
                } catch (error) {
                    r.sinResolver++;
                    if (!esErrorSeguro(error)) {
                        log.error('rieles-latam: no se pudo resolver un intento', { route: 'fiscal/latam', orgId, intento: intento.id, err: error });
                    }
                }
            }
            return r;
        }
        case 'sunat': {
            const { contextoSunat, resolverPorConsulta } = await import('./sunat/autorizacion');
            const { emisorSunat } = await import('./sunat/estado');
            let ctx;
            try {
                ctx = await contextoSunat(orgId, config.entorno, await emisorSunat(orgId));
            } catch (error) {
                // Sin certificado, usuario SOL o ajustes no se puede consultar: el
                // intento queda incierto (bloqueando la anulación) hasta que vuelvan.
                r.sinResolver = intentos.length;
                r.error = esErrorSeguro(error) ? error.message : 'contexto no disponible';
                return r;
            }
            for (const intento of intentos) {
                if (Date.now() >= deadline) break;
                r.revisados++;
                try {
                    const resultado = await conSecuencia(orgId, { rail, entorno: intento.entorno, serie: intento.serie, tipo: intento.tipo },
                        () => resolverPorConsulta(ctx, intento), { esperaMaxMs: 2_000 });
                    if (resultado === 'autorizado') {
                        r.autorizados++;
                        const { finalizeInvoice } = await import('../invoices');
                        await finalizeInvoice(orgId, intento.documentoId);
                    } else if (resultado === 'descartado') {
                        r.descartados++;
                    } else {
                        r.sinResolver++;
                    }
                } catch (error) {
                    r.sinResolver++;
                    if (!esErrorSeguro(error)) {
                        log.error('rieles-latam: no se pudo resolver un intento', { route: 'fiscal/latam', orgId, intento: intento.id, err: error });
                    }
                }
            }
            return r;
        }
        default:
            return r;
    }
}

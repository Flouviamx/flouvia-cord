// Caché del ticket de acceso de una autoridad (ARCA: token + sign del WSAA,
// vigente 12 horas), compartida entre instancias por `fiscal_rail_accesos`.
//
// Por qué no basta un Map en memoria: en Vercel cada emisión puede caer en
// una instancia distinta, y la autoridad castiga pedir un ticket mientras otro
// sigue vigente ("El CEE ya posee un TA valido…", con una espera de 2 minutos
// en producción y 10 en homologación). El ticket se guarda cifrado; solo UNA
// instancia lo renueva a la vez (lease por fila, como verifactu_envio_estado:
// el driver HTTP de Neon no sostiene un advisory lock entre llamadas), y las
// demás esperan a que aparezca en la tabla.

import { randomUUID } from 'node:crypto';
import { sql, withOrgTx } from '../../db';
import { decryptSecret, encryptRequiredSecret } from '../../crypto-secret';
import { RailTransitorioError } from './errores';
import type { EntornoRail, RailId } from './rieles';

export interface Ticket {
    token: string;
    sign: string;
    expira: Date;
}

export interface ClaveAcceso {
    orgId: string;
    rail: RailId;
    entorno: EntornoRail;
    servicio: string;
}

/** Resultado de pedir un ticket a la autoridad. `bloquearSegundos`: la autoridad pidió esperar. */
export type ResultadoLogin = { ok: true; ticket: Ticket } | { ok: false; bloquearSegundos?: number; error: Error };

export interface OpcionesTicket {
    /** Un ticket que vence antes de este margen se considera vencido. */
    margenMs?: number;
    /** Cuánto esperar a que otra instancia termine de renovarlo. */
    esperaMaxMs?: number;
    /** Ignorar el ticket guardado (la autoridad lo rechazó). */
    forzar?: boolean;
}

const MSG_RENOVANDO = 'Estamos renovando el acceso a la autoridad fiscal. Reintenta en unos segundos.';
const MSG_BLOQUEADO = 'La autoridad fiscal todavía no permite renovar el acceso de tu certificado. Reintenta en unos minutos.';
const dormir = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function leerTicket(k: ClaveAcceso): Promise<{ ticket: Ticket | null; bloqueadoHasta: Date | null }> {
    const [rows] = await withOrgTx(k.orgId, sql`
        select token_enc, firma_enc, expira_at, bloqueado_hasta from fiscal_rail_accesos
         where org_id = ${k.orgId} and rail = ${k.rail} and entorno = ${k.entorno} and servicio = ${k.servicio}
         limit 1`);
    const r = rows[0];
    if (!r) return { ticket: null, bloqueadoHasta: null };
    const bloqueadoHasta = r.bloqueado_hasta ? new Date(r.bloqueado_hasta as string) : null;
    const token = r.token_enc ? decryptSecret(r.token_enc as string) : null;
    const sign = r.firma_enc ? decryptSecret(r.firma_enc as string) : null;
    const expira = r.expira_at ? new Date(r.expira_at as string) : null;
    return { ticket: token && sign && expira ? { token, sign, expira } : null, bloqueadoHasta };
}

/**
 * Ticket vigente para la clave; si no hay, lo pide con `login` (una sola
 * instancia a la vez). Lanza RailTransitorioError —apto para el usuario— si
 * otra instancia lo está renovando más de `esperaMaxMs` o si la autoridad
 * pidió esperar.
 */
export async function obtenerTicket(k: ClaveAcceso, login: () => Promise<ResultadoLogin>, opts: OpcionesTicket = {}): Promise<Ticket> {
    const margen = opts.margenMs ?? 10 * 60_000;
    const vigente = (t: Ticket | null): t is Ticket => !!t && t.expira.getTime() - margen > Date.now();
    const limite = Date.now() + (opts.esperaMaxMs ?? 8_000);
    let forzar = !!opts.forzar;

    for (let intento = 0; ; intento++) {
        const { ticket, bloqueadoHasta } = await leerTicket(k);
        if (!forzar && vigente(ticket)) return ticket;
        if (bloqueadoHasta && bloqueadoHasta.getTime() > Date.now()) throw new RailTransitorioError(MSG_BLOQUEADO);

        const leaseToken = randomUUID();
        const [, tomado] = await withOrgTx(k.orgId,
            sql`insert into fiscal_rail_accesos (org_id, rail, entorno, servicio)
                values (${k.orgId}, ${k.rail}, ${k.entorno}, ${k.servicio})
                on conflict (org_id, rail, entorno, servicio) do nothing`,
            sql`update fiscal_rail_accesos
                   set lease_hasta = now() + interval '45 seconds', lease_token = ${leaseToken}, updated_at = now()
                 where org_id = ${k.orgId} and rail = ${k.rail} and entorno = ${k.entorno} and servicio = ${k.servicio}
                   and (lease_hasta is null or lease_hasta < now())
                returning lease_token`,
        );
        if (!tomado[0]) {
            // Otra instancia lo está renovando: esperar a que lo deje escrito.
            if (Date.now() > limite) throw new RailTransitorioError(MSG_RENOVANDO);
            await dormir(Math.min(1_000, 150 * 2 ** Math.min(intento, 3)));
            forzar = false;
            continue;
        }
        try {
            // Releer DENTRO del lease: otra instancia pudo renovarlo justo antes.
            const despues = await leerTicket(k);
            if (!forzar && vigente(despues.ticket)) return despues.ticket;
            const r = await login();
            if (!r.ok) {
                if (r.bloquearSegundos) {
                    await withOrgTx(k.orgId, sql`
                        update fiscal_rail_accesos
                           set bloqueado_hasta = now() + make_interval(secs => ${r.bloquearSegundos}::int), updated_at = now()
                         where org_id = ${k.orgId} and rail = ${k.rail} and entorno = ${k.entorno} and servicio = ${k.servicio}`);
                }
                throw r.error;
            }
            await withOrgTx(k.orgId, sql`
                update fiscal_rail_accesos
                   set token_enc = ${encryptRequiredSecret(r.ticket.token)}, firma_enc = ${encryptRequiredSecret(r.ticket.sign)},
                       expira_at = ${r.ticket.expira}, obtenido_at = now(), bloqueado_hasta = null, updated_at = now()
                 where org_id = ${k.orgId} and rail = ${k.rail} and entorno = ${k.entorno} and servicio = ${k.servicio}`);
            return r.ticket;
        } finally {
            await withOrgTx(k.orgId, sql`
                update fiscal_rail_accesos set lease_hasta = null, lease_token = null
                 where org_id = ${k.orgId} and rail = ${k.rail} and entorno = ${k.entorno} and servicio = ${k.servicio}
                   and lease_token = ${leaseToken}`).catch(() => {});
        }
    }
}

/** Olvida el ticket guardado (la autoridad lo rechazó o cambió el certificado). */
export async function invalidarTicket(k: ClaveAcceso): Promise<void> {
    await withOrgTx(k.orgId, sql`
        update fiscal_rail_accesos set token_enc = null, firma_enc = null, expira_at = null, updated_at = now()
         where org_id = ${k.orgId} and rail = ${k.rail} and entorno = ${k.entorno} and servicio = ${k.servicio}`);
}

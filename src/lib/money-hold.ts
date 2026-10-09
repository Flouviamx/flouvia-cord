// src/lib/money-hold.ts
// Un cambio de a dónde llega el dinero no entra en vigor al momento: espera 72
// horas (7 días si en los 3 días anteriores cambió la seguridad de algún dueño
// o de quien lo hizo). Decisión de oct 2026, regla 38.
//
// Así lo hacen Amazon y Upwork (3 días), Shopify (3 a 5 días hábiles) y Etsy (5):
// quien roba una sesión y pasa la reautenticación no cobra el siguiente depósito,
// porque los dueños reciben el aviso y tienen tiempo de decir "No fui yo".
//
// Qué espera y qué hace mientras tanto:
//   - **banco**: la cuenta de depósito de Stripe. La nueva se agrega SIN ser la
//     predeterminada: los depósitos siguen llegando a la anterior (ya probada)
//     y la nueva pasa a predeterminada cuando entra en vigor. Así el negocio no
//     se queda tres días sin depósitos por un cambio legítimo, y funciona igual
//     en Brasil, donde Stripe no permite depósitos manuales.
//   - **mercadopago**: la cuenta de Mercado Pago que cobra. El riel se apaga
//     (Cord no puede retener dinero que vive en Mercado Pago).
//   - **clabe**: la CLABE que el link público le da al cliente para transferir.
//     Se sigue mostrando la anterior.
//
// Sin espera: el primer destino de una cuenta que todavía no cobra (el alta).
// Nadie la salta solo: la libera Ops después de llamar al dueño a un teléfono
// que ya estaba registrado, o la revierte un dueño con el enlace de su correo.

import { createHash, randomBytes } from 'node:crypto';
import { sql, withOrgTx } from './db';
import { siteOrigin } from './email';
import { log } from './log';

export const ESPERA_HORAS = 72;
export const ESPERA_REFORZADA_HORAS = 7 * 24;
/** Días en que el enlace "No fui yo" sigue sirviendo después del cambio. */
export const REVERTIR_DIAS = 30;
export type TipoCambio = 'banco' | 'mercadopago' | 'clabe';

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/** El enlace "No fui yo" que viaja en el correo de los dueños. */
export const urlRevertir = (token: string) => `${siteOrigin()}/dinero/revertir/${encodeURIComponent(token)}`;

const parse = (v: unknown): Record<string, any> => {
    if (typeof v === 'string') { try { return JSON.parse(v) || {}; } catch { return {}; } }
    return (v as Record<string, any>) || {};
};

/**
 * Pone en vigor un cambio: la CLABE pendiente pasa a ser la que se muestra y la
 * proyección de espera se recalcula. Idempotente: solo actúa sobre `en_espera`.
 *
 * La CLABE de un cambio de cuenta de depósito se promueve solo si la que se
 * muestra sigue siendo la de antes: si alguien la cambió por la otra vía
 * (Ajustes › Transferencia) mientras esperaba, gana el cambio más reciente.
 */
export async function ponerEnVigor(orgId: string, cambioId: string, via: { porOps?: { operador: string; nota: string } } = {}): Promise<boolean> {
    const [[c]] = await withOrgTx(orgId, sql`
        select id, tipo, antes, despues from destino_dinero_cambios
         where id = ${cambioId} and org_id = ${orgId} and estado = 'en_espera'`);
    if (!c) return false;
    const tipo = c.tipo as TipoCambio;
    const antes = parse(c.antes);
    const despues = parse(c.despues);
    const promueveClabe = (tipo === 'clabe' || tipo === 'banco') && 'clabe_enc' in despues;
    const marca = via.porOps ? 'liberado' : 'vigente';
    const operador = via.porOps?.operador ?? null;
    const nota = via.porOps?.nota ?? null;
    // Un solo statement: la CLABE se promueve solo si ESTA llamada movió el
    // cambio de `en_espera` (dos corridas del cron no la promueven dos veces).
    const [cambiado] = await withOrgTx(orgId,
        promueveClabe
            ? sql`with paso as (
                    update destino_dinero_cambios
                       set estado = ${marca}, efectivo_desde = least(efectivo_desde, now()),
                           liberado_por = ${operador}, liberado_nota = ${nota},
                           liberado_at = case when ${operador}::text is null then null else now() end,
                           aplicado_at = case when ${tipo} = 'banco' then null else now() end
                     where id = ${cambioId} and org_id = ${orgId} and estado = 'en_espera'
                    returning id),
                  promo as (
                    update orgs set banco_clabe = null, banco_clabe_enc = ${despues.clabe_enc ?? null},
                           banco_clabe_last4 = ${despues.clabe_last4 ?? null},
                           banco_beneficiario = coalesce(${despues.beneficiario ?? null}, banco_beneficiario),
                           banco_clabe_actualizada_at = now()
                     where id = ${orgId} and exists (select 1 from paso)
                       and (${tipo} = 'clabe' or banco_clabe_last4 is not distinct from ${antes.clabe_last4 ?? null})
                    returning id)
                  select id from paso`
            : sql`update destino_dinero_cambios
                     set estado = ${marca}, efectivo_desde = least(efectivo_desde, now()),
                         liberado_por = ${operador}, liberado_nota = ${nota},
                         liberado_at = case when ${operador}::text is null then null else now() end,
                         aplicado_at = case when ${tipo} = 'banco' then null else now() end
                   where id = ${cambioId} and org_id = ${orgId} and estado = 'en_espera'
                  returning id`,
        recalcularProyeccion(orgId, tipo),
    );
    return cambiado.length > 0;
}

/**
 * ¿Cuántas horas espera este cambio? 0 si es el primer destino de una cuenta
 * que todavía no mueve dinero.
 */
export async function horasDeEspera(
    orgId: string,
    opts: { tipo: TipoCambio; primerDestino: boolean; actorUserId: string | null },
): Promise<number> {
    const [[o]] = await withOrgTx(orgId, sql`
        select
          -- ¿La cuenta ya mueve dinero? Un cobro o un pago de factura cuenta.
          exists (select 1 from cotizacion_cobros where org_id = ${orgId} and status = 'pagado')
            or exists (select 1 from documento_pagos where org_id = ${orgId}) as mueve_dinero,
          -- ¿Cambió la seguridad de algún dueño o de quien hace el cambio?
          exists (
            select 1 from users u
             where (u.id = ${opts.actorUserId}::uuid
                    or u.id in (select o.owner_id from orgs o where o.id = ${orgId})
                    or u.id in (select m.user_id from org_members m
                                 where m.org_id = ${orgId} and m.rol = 'owner' and m.estado = 'activo'))
               and u.seguridad_cambiada_at > now() - interval '72 hours'
          ) as seguridad_reciente`);
    if (opts.primerDestino && !o?.mueve_dinero) return 0;
    return o?.seguridad_reciente ? ESPERA_REFORZADA_HORAS : ESPERA_HORAS;
}

/**
 * La proyección en `orgs` que leen los rieles y el control de depósitos se
 * DERIVA de los cambios en espera, nunca se escribe a mano: así un cambio
 * reemplazado, revertido o liberado no deja una espera huérfana, y uno que
 * sigue en espera no se borra porque otro terminó.
 */
function recalcularProyeccion(orgId: string, tipo: TipoCambio) {
    if (tipo === 'banco') {
        return sql`update orgs set deposito_espera_hasta = (
                     select max(efectivo_desde) from destino_dinero_cambios
                      where org_id = ${orgId} and tipo = 'banco' and estado = 'en_espera')
                   where id = ${orgId}`;
    }
    if (tipo === 'mercadopago') {
        return sql`update orgs set mp_espera_hasta = (
                     select max(efectivo_desde) from destino_dinero_cambios
                      where org_id = ${orgId} and tipo = 'mercadopago' and estado = 'en_espera')
                   where id = ${orgId}`;
    }
    return sql`update orgs set clabe_espera_hasta = (
                 select max(efectivo_desde) from destino_dinero_cambios
                  where org_id = ${orgId} and tipo = 'clabe' and estado = 'en_espera')
               where id = ${orgId}`;
}

export interface CambioProgramado {
    id: string;
    efectivoDesde: Date;
    /** Solo existe en memoria: viaja en el correo de los dueños, se guarda su hash. */
    revertirToken: string;
    /** Lo que traían los cambios en espera que este reemplazó (para limpiar el proveedor). */
    reemplazados: Array<Record<string, any>>;
}

/**
 * Registra el cambio y, si espera, la proyección en `orgs`. Un cambio nuevo del
 * mismo tipo reemplaza al que seguía en espera. `antes`/`despues` nunca llevan
 * un número de cuenta completo en claro: últimos 4, ids del proveedor o el
 * valor cifrado.
 */
export async function programarCambio(orgId: string, input: {
    tipo: TipoCambio;
    horas: number;
    antes: Record<string, unknown>;
    despues: Record<string, unknown>;
    actorUserId: string | null;
    /**
     * false cuando el cambio se registra ANTES de crearse en el proveedor: los
     * que seguían en espera se reemplazan en `completarCambio`, cuando el nuevo
     * ya existe (si el proveedor falla, siguen como estaban).
     */
    reemplazar?: boolean;
}): Promise<CambioProgramado> {
    const token = randomBytes(32).toString('base64url');
    const efectivo = new Date(Date.now() + input.horas * 3_600_000);
    const estado = input.horas > 0 ? 'en_espera' : 'vigente';
    const reemplazar = input.reemplazar !== false;
    const [reemplazados, [fila]] = await withOrgTx(orgId,
        reemplazar
            ? sql`update destino_dinero_cambios set estado = 'reemplazado'
                   where org_id = ${orgId} and tipo = ${input.tipo} and estado = 'en_espera'
                  returning despues`
            : sql`select 1 where false`,
        // Un cambio inmediato ya está aplicado en el proveedor: el llamador lo
        // hizo antes de registrarlo.
        sql`insert into destino_dinero_cambios
              (org_id, tipo, estado, efectivo_desde, antes, despues, creado_por, revertir_token_hash, aplicado_at)
            values (${orgId}, ${input.tipo}, ${estado}, ${efectivo.toISOString()},
                    ${JSON.stringify(input.antes)}::jsonb, ${JSON.stringify(input.despues)}::jsonb,
                    ${input.actorUserId}::uuid, ${hashToken(token)},
                    case when ${estado} = 'vigente' then now() else null end)
            returning id`,
        recalcularProyeccion(orgId, input.tipo),
    );
    return {
        id: String(fila.id), efectivoDesde: efectivo, revertirToken: token,
        reemplazados: (reemplazados as any[]).map((r) => parse(r.despues)),
    };
}

/**
 * El destino nuevo ya existe en el proveedor: se guardan sus ids y se
 * reemplazan los cambios del mismo tipo que seguían en espera. Devuelve lo que
 * traían, para que el llamador limpie sus cuentas en el proveedor.
 */
export async function completarCambio(orgId: string, cambioId: string, extra: Record<string, unknown>): Promise<Array<Record<string, any>>> {
    const [, reemplazados] = await withOrgTx(orgId,
        sql`update destino_dinero_cambios set despues = despues || ${JSON.stringify(extra)}::jsonb
             where id = ${cambioId} and org_id = ${orgId}`,
        sql`update destino_dinero_cambios set estado = 'reemplazado'
             where org_id = ${orgId} and estado = 'en_espera' and id <> ${cambioId}
               and tipo = (select tipo from destino_dinero_cambios where id = ${cambioId} and org_id = ${orgId})
            returning tipo, despues`,
    );
    const filas = reemplazados as any[];
    if (filas.length) await withOrgTx(orgId, recalcularProyeccion(orgId, filas[0].tipo as TipoCambio));
    return filas.map((r) => parse(r.despues));
}

/** El proveedor rechazó el destino nuevo: el cambio no ocurrió. */
export async function cancelarCambio(orgId: string, cambioId: string): Promise<void> {
    const [[c]] = await withOrgTx(orgId, sql`
        update destino_dinero_cambios set estado = 'cancelado', revertir_token_hash = null
         where id = ${cambioId} and org_id = ${orgId} and estado in ('en_espera', 'vigente')
        returning tipo`);
    if (c) await withOrgTx(orgId, recalcularProyeccion(orgId, c.tipo as TipoCambio));
}

/**
 * El negocio deshizo el cambio antes de que entrara en vigor (quitó la CLABE o
 * volvió a capturar la de siempre): lo que seguía en espera ya no se promueve.
 */
export async function cancelarEspera(orgId: string, tipo: TipoCambio): Promise<void> {
    await withOrgTx(orgId,
        sql`update destino_dinero_cambios set estado = 'reemplazado'
             where org_id = ${orgId} and tipo = ${tipo} and estado = 'en_espera'`,
        recalcularProyeccion(orgId, tipo));
}

export interface CambioPendiente {
    tipo: TipoCambio;
    efectivoDesde: string;
    despues: Record<string, any>;
    /** Primera cuenta bancaria: no hay anterior que siga recibiendo. */
    primeraCuenta: boolean;
}

/** Lo que está en espera, para mostrarlo en Ajustes. */
export async function cambiosEnEspera(orgId: string): Promise<CambioPendiente[]> {
    const [rows] = await withOrgTx(orgId, sql`
        select tipo, efectivo_desde, antes, despues from destino_dinero_cambios
         where org_id = ${orgId} and estado = 'en_espera' order by efectivo_desde`);
    return (rows as any[]).map((r) => {
        // El valor cifrado nunca sale hacia la página.
        const { clabe_enc: _c, ...visible } = parse(r.despues);
        return {
            tipo: r.tipo, efectivoDesde: new Date(r.efectivo_desde).toISOString(), despues: visible,
            primeraCuenta: r.tipo === 'banco' && !parse(r.antes).external_account_id,
        };
    });
}

/** Cambios que ya entraron en vigor y siguen marcados en espera (los toma el cron). */
export async function cambiosVencidos(limite = 200): Promise<Array<{ org_id: string; id: string; tipo: TipoCambio }>> {
    const rows = await sql`select * from cord_destino_cambios_vencidos(${limite})`;
    return rows as any;
}


/** El proveedor ya refleja el cambio: el cron deja de reintentarlo. */
export async function marcarAplicado(orgId: string, cambioId: string): Promise<void> {
    await withOrgTx(orgId, sql`
        update destino_dinero_cambios set aplicado_at = coalesce(aplicado_at, now())
         where id = ${cambioId} and org_id = ${orgId}`);
}

export interface CambioRevertible {
    orgId: string;
    id: string;
    tipo: TipoCambio;
    estado: string;
    antes: Record<string, any>;
    despues: Record<string, any>;
    creadoPor: string | null;
    creadoAt: string;
    efectivoDesde: string;
}

/** Resuelve un enlace "No fui yo" sin consumirlo (para mostrar qué se va a revertir). */
export async function cambioPorToken(token: string): Promise<CambioRevertible | null> {
    if (!/^[A-Za-z0-9_-]{30,64}$/.test(token)) return null;
    const rows = await sql`select * from cord_destino_cambio_por_token(${hashToken(token)}, ${REVERTIR_DIAS})`;
    const r = (rows as any[])[0];
    if (!r) return null;
    return {
        orgId: String(r.org_id), id: String(r.id), tipo: r.tipo, estado: String(r.estado),
        antes: parse(r.antes), despues: parse(r.despues), creadoPor: r.creado_por ? String(r.creado_por) : null,
        creadoAt: new Date(r.creado_at).toISOString(), efectivoDesde: new Date(r.efectivo_desde).toISOString(),
    };
}

/**
 * Marca el cambio como revertido y congela los depósitos de la cuenta, en una
 * sola transacción. El efecto en cada proveedor (regresar la cuenta anterior,
 * desconectar Mercado Pago) lo aplica el llamador después; esto solo asegura
 * que el enlace se use UNA vez y que, pase lo que pase con el proveedor, no
 * salga ningún depósito.
 */
export async function marcarRevertido(c: CambioRevertible): Promise<boolean> {
    const [marcado] = await withOrgTx(c.orgId,
        sql`update destino_dinero_cambios set estado = 'revertido', revertido_at = now(), revertir_token_hash = null
             where id = ${c.id} and org_id = ${c.orgId} and estado in ('en_espera', 'vigente', 'liberado')
            returning id`,
        sql`update orgs set depositos_congelados_at = coalesce(depositos_congelados_at, now())
             where id = ${c.orgId}
               and exists (select 1 from destino_dinero_cambios where id = ${c.id} and estado = 'revertido')`,
        recalcularProyeccion(c.orgId, c.tipo),
    );
    return marcado.length > 0;
}

export function registrarFalla(orgId: string, err: unknown, paso: string): void {
    log.error('cambio de destino del dinero', { route: 'money-hold', orgId, paso, err });
}

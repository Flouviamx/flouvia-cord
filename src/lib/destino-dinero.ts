// src/lib/destino-dinero.ts
// Lo que pasa en el PROVEEDOR cuando un cambio de a dónde llega el dinero entra
// en vigor o se revierte. El registro y la espera viven en src/lib/money-hold.ts;
// aquí se habla con Stripe y Mercado Pago, se congela y se avisa.
//
// Orden en los dos sentidos: primero el registro (que decide UNA vez), después
// el proveedor. Si el proveedor falla, el registro queda sin `aplicado_at` y el
// cron reintenta; nunca al revés, donde un proveedor ya cambiado y un registro
// que no se escribió dejarían el dinero yendo a un destino que Cord no muestra.

import { sql, withOrgTx } from './db';
import { stripe } from './billing';
import {
    marcarAplicado, marcarRevertido, ponerEnVigor, registrarFalla,
    type CambioRevertible, type TipoCambio,
} from './money-hold';
import { sincronizarControl } from './deposit-control';
import { disconnectMp } from './mercadopago';
import { notifyMoneyDestinationChange, notifyPayoutControl } from './auth-email';
import { sendOpsAlert } from './ops-alert';
import { revokeAllSessions } from './auth';

const AVISO_VIGENTE: Record<TipoCambio, 'banco_vigente' | 'mp_vigente' | 'clabe_vigente'> = {
    banco: 'banco_vigente', mercadopago: 'mp_vigente', clabe: 'clabe_vigente',
};

const cuentaExterna = (acct: string, ba: string) =>
    `/v1/accounts/${encodeURIComponent(acct)}/external_accounts/${encodeURIComponent(ba)}`;

const parse = (v: unknown): Record<string, any> => {
    if (typeof v === 'string') { try { return JSON.parse(v) || {}; } catch { return {}; } }
    return (v as Record<string, any>) || {};
};

export type ResultadoVigor = 'vigente' | 'reintento_aplicado' | 'no_aplica' | 'cuenta_borrada';

/**
 * Pone en vigor un cambio cuya espera terminó (cron) o que Ops liberó después
 * de hablar con el dueño. Para la cuenta bancaria, la nueva pasa a ser la
 * predeterminada en Stripe; hasta ese momento los depósitos seguían llegando a
 * la anterior.
 *
 * También reintenta un cambio que el registro ya da por vigente y Stripe
 * todavía no (una caída entre los dos pasos).
 */
export async function entrarEnVigor(
    orgId: string, cambioId: string, via: { porOps?: { operador: string; nota: string } } = {},
): Promise<ResultadoVigor> {
    const [[c]] = await withOrgTx(orgId, sql`
        select c.id, c.tipo, c.estado, c.despues, c.aplicado_at, o.stripe_account_id,
               -- ¿Ya hay un cambio de cuenta bancaria MÁS reciente vigente? Entonces
               -- este quedó atrás y no se vuelve a hacer predeterminado.
               exists (select 1 from destino_dinero_cambios n
                        where n.org_id = c.org_id and n.tipo = c.tipo and n.creado_at > c.creado_at
                          and n.estado in ('vigente', 'liberado')) as superado
          from destino_dinero_cambios c join orgs o on o.id = c.org_id
         where c.id = ${cambioId} and c.org_id = ${orgId}`);
    if (!c) return 'no_aplica';
    const tipo = c.tipo as TipoCambio;
    const despues = parse(c.despues);

    let recienVigente = false;
    if (c.estado === 'en_espera') {
        recienVigente = await ponerEnVigor(orgId, cambioId, via);
        if (!recienVigente) return 'no_aplica';
    } else if (!['vigente', 'liberado'].includes(String(c.estado)) || c.aplicado_at) {
        return 'no_aplica';
    }

    if (tipo === 'banco' && despues.external_account_id && c.stripe_account_id && !c.superado) {
        try {
            await stripe(cuentaExterna(String(c.stripe_account_id), String(despues.external_account_id)),
                { default_for_currency: 'true' }, 'POST');
        } catch (err: any) {
            if (Number(err?.stripeStatus) === 404) {
                // La cuenta nueva ya no existe en Stripe: los depósitos siguen en la
                // anterior. No hay nada que reintentar, pero alguien lo tiene que ver.
                await marcarAplicado(orgId, cambioId);
                await sendOpsAlert('Cuenta bancaria nueva desaparecida',
                    `Organización ${orgId}: el cambio ${cambioId} entró en vigor y su cuenta ya no existe en Stripe. Los depósitos siguen en la cuenta anterior.`);
                return 'cuenta_borrada';
            }
            throw err; // temporal: el cron reintenta en la siguiente corrida
        }
    }
    await marcarAplicado(orgId, cambioId);
    if (recienVigente) {
        await notifyMoneyDestinationChange(orgId, AVISO_VIGENTE[tipo], {
            detalle: despues.last4 || despues.clabe_last4 ? `termina en ${String(despues.last4 || despues.clabe_last4)}`
                : despues.mp_user_id ? `cuenta ${String(despues.mp_user_id)}` : null,
        });
        return 'vigente';
    }
    return 'reintento_aplicado';
}

/** Lo que se pudo deshacer en el proveedor; lo que no, lo ve Ops. */
export interface ResultadoReversa {
    revertido: boolean;
    pendientes: string[];
}

/**
 * "No fui yo". En este orden:
 *   1. el registro (un solo uso) y el congelamiento de depósitos, juntos;
 *   2. la cuenta queda en depósitos manuales: aunque el paso 3 falle, nada sale;
 *   3. el proveedor vuelve a como estaba;
 *   4. se cierran las sesiones del equipo y se avisa a dueños y a Ops.
 * Descongelar es de Ops, después de llamar al dueño.
 */
export async function revertirCambio(c: CambioRevertible, meta: { ip: string | null }): Promise<ResultadoReversa> {
    if (!(await marcarRevertido(c))) return { revertido: false, pendientes: [] };
    const pendientes: string[] = [];
    const [[o]] = await withOrgTx(c.orgId, sql`
        select stripe_account_id, upper(coalesce(country_code, 'MX')) as country, mp_user_id, banco_clabe_last4
          from orgs where id = ${c.orgId}`);
    const acct = o?.stripe_account_id ? String(o.stripe_account_id) : null;

    if (acct) {
        try { await sincronizarControl(c.orgId, acct, String(o.country)); }
        catch (err) { registrarFalla(c.orgId, err, 'congelar'); pendientes.push('congelar_depositos'); }
    }

    if (c.tipo === 'banco' && acct) {
        const nueva = c.despues.external_account_id ? String(c.despues.external_account_id) : null;
        const anterior = c.antes.external_account_id ? String(c.antes.external_account_id) : null;
        // Si ya era la predeterminada, la anterior vuelve a serlo ANTES de borrar
        // la nueva: Stripe no deja borrar la cuenta predeterminada.
        if (anterior && c.estado !== 'en_espera') {
            try { await stripe(cuentaExterna(acct, anterior), { default_for_currency: 'true' }, 'POST'); }
            catch (err) { registrarFalla(c.orgId, err, 'restaurar_cuenta'); pendientes.push('restaurar_cuenta_anterior'); }
        }
        if (nueva && (anterior || c.estado === 'en_espera')) {
            try { await stripe(cuentaExterna(acct, nueva), undefined, 'DELETE'); }
            catch (err: any) {
                if (Number(err?.stripeStatus) !== 404) { registrarFalla(c.orgId, err, 'borrar_cuenta'); pendientes.push('borrar_cuenta_nueva'); }
            }
        } else if (nueva) {
            // Era la primera cuenta: no hay a cuál regresar. Los depósitos quedan
            // congelados hasta que Ops lo resuelva con el dueño.
            pendientes.push('primera_cuenta_sin_reemplazo');
        }
    }

    // La CLABE que ve el cliente vuelve a la anterior si la nueva ya se mostraba.
    if ((c.tipo === 'clabe' || c.tipo === 'banco') && c.estado !== 'en_espera' && 'clabe_enc' in c.despues) {
        try {
            await withOrgTx(c.orgId, sql`
                update orgs set banco_clabe = null, banco_clabe_enc = ${c.antes.clabe_enc ?? null},
                       banco_clabe_last4 = ${c.antes.clabe_last4 ?? null},
                       banco_beneficiario = coalesce(${c.antes.beneficiario ?? null}, banco_beneficiario),
                       banco_clabe_actualizada_at = now()
                 where id = ${c.orgId} and banco_clabe_last4 is not distinct from ${c.despues.clabe_last4 ?? null}`);
        } catch (err) { registrarFalla(c.orgId, err, 'restaurar_clabe'); pendientes.push('restaurar_clabe'); }
    }

    if (c.tipo === 'mercadopago' && o?.mp_user_id && String(o.mp_user_id) === String(c.despues.mp_user_id ?? '')) {
        try { await disconnectMp(c.orgId); }
        catch (err) { registrarFalla(c.orgId, err, 'desconectar_mp'); pendientes.push('desconectar_mercado_pago'); }
    }

    // Quien hizo el cambio pasó la reautenticación: tiene la contraseña o el
    // factor. Cerrar sesiones lo saca hoy; que no vuelva a entrar es del dueño
    // (cambiar su contraseña) y de Ops (la llamada).
    try {
        const [miembros] = await withOrgTx(c.orgId, sql`
            select distinct user_id from org_members where org_id = ${c.orgId} and user_id is not null
            union select owner_id from orgs where id = ${c.orgId} and owner_id is not null`);
        for (const m of miembros as any[]) await revokeAllSessions(String(m.user_id));
    } catch (err) { registrarFalla(c.orgId, err, 'cerrar_sesiones'); pendientes.push('cerrar_sesiones'); }

    // Los avisos no fallan hacia afuera (cada uno se traga su error): el enlace
    // ya se consumió y el congelamiento ya ocurrió, así que la persona tiene que
    // ver "listo", no un error que la invite a reintentar algo que ya pasó.
    await notifyMoneyDestinationChange(c.orgId, 'revertido', { detalle: c.tipo, ip: meta.ip });
    await notifyPayoutControl(c.orgId, 'congelado');
    await sendOpsAlert('Un dueño desconoció un cambio de destino del dinero',
        `Organización ${c.orgId}, cambio ${c.id} (${c.tipo}, estaba ${c.estado}). Depósitos congelados. `
        + `Llamar al dueño a un teléfono registrado ANTES del cambio antes de descongelar.`
        + (pendientes.length ? ` Pendiente en el proveedor: ${pendientes.join(', ')}.` : ''));
    return { revertido: true, pendientes };
}

/** Ops descongela después de hablar con el dueño. */
export async function descongelarDepositos(orgId: string): Promise<boolean> {
    const [[o]] = await withOrgTx(orgId, sql`
        update orgs set depositos_congelados_at = null
         where id = ${orgId} and depositos_congelados_at is not null
        returning stripe_account_id, upper(coalesce(country_code, 'MX')) as country`);
    if (!o) return false;
    if (o.stripe_account_id) await sincronizarControl(orgId, String(o.stripe_account_id), String(o.country));
    return true;
}

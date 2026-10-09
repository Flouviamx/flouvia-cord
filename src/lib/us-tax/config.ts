// Sales tax de EE. UU.: la configuración del negocio (Ajustes › Impuestos).
//
// Lo que el negocio captura en Cord —su domicilio, qué vende y en qué estados
// recauda— se sincroniza con su cuenta de cobros, que es donde se calcula. La
// copia de Cord (`orgs.us_tax_*`, `us_tax_registros`) existe para decir qué
// falta sin preguntarle al proveedor en cada pantalla, y para que un registro
// creado allá y no anotado aquí (una caída a mitad del guardado) se ADOPTE en
// el siguiente intento en vez de duplicarse.
//
// La preferencia solo queda encendida si todo está listo: plan, cuenta de
// cobros, domicilio completo, al menos un estado y la configuración activa en
// la cuenta. Encenderla a medias sería una preferencia que aparenta funcionar
// (regla 15) y unos documentos que fallan sin que el negocio sepa por qué.

import { createHash } from 'node:crypto';
import { sql, withOrgTx } from '../db';
import { currentLocale } from '../context';
import { isUsState } from '../countries';
import {
    US_TAX_DEFAULT_CODE, UsTaxError, isUsTaxCode, normalizeUsAddress, usAddressFaltante,
    type UsAddress, type UsAddressFaltante,
} from './core';
import { loadUsTaxConfig, usTaxConfigProblem, usTaxEntitled, type UsTaxConfig } from './calculo';
import {
    createUsRegistration, expireUsRegistration, listActiveUsRegistrations, syncUsTaxSettings,
} from './stripe';

export interface UsTaxConfigInput {
    auto: boolean;
    origen: unknown;
    taxCode: unknown;
    estados: unknown;
}

export type UsTaxConfigResult =
    | { ok: true; config: UsTaxConfig; auto: boolean; problema: string | null }
    | { ok: false; status: number; code: string; error: string; campo?: UsAddressFaltante };

const sha = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 32);

export function parseEstados(raw: unknown): string[] | null {
    if (!Array.isArray(raw)) return null;
    const out = new Set<string>();
    for (const v of raw) {
        const code = String(v || '').trim().toUpperCase();
        if (!isUsState(code)) return null;
        out.add(code);
    }
    return [...out].sort();
}

/**
 * Guarda y sincroniza. Nunca devuelve un mensaje del proveedor: solo el motivo
 * de Cord (`UsTaxError`).
 */
export async function saveUsTaxConfig(orgId: string, input: UsTaxConfigInput): Promise<UsTaxConfigResult> {
    const locale = currentLocale();
    const actual = await loadUsTaxConfig(orgId);
    if (actual.country !== 'US') {
        return { ok: false, status: 409, code: 'not_us', error: locale === 'en' ? 'Sales tax by address is only for businesses in the United States.' : 'El sales tax por dirección es solo para negocios en Estados Unidos.' };
    }
    const origen = normalizeUsAddress(input.origen);
    const faltante = usAddressFaltante(origen, true);
    if (faltante) {
        return { ok: false, status: 422, code: 'us_tax_origen_incompleto', error: new UsTaxError('origen_incompleto', locale).message, campo: faltante };
    }
    const taxCode = input.taxCode === undefined || input.taxCode === null || input.taxCode === '' ? US_TAX_DEFAULT_CODE : input.taxCode;
    if (!isUsTaxCode(taxCode)) {
        return { ok: false, status: 400, code: 'invalid_tax_code', error: locale === 'en' ? 'Choose what your business sells from the list.' : 'Elige de la lista qué vende tu negocio.' };
    }
    const estados = parseEstados(input.estados);
    if (!estados) {
        return { ok: false, status: 400, code: 'invalid_states', error: locale === 'en' ? 'One of the states is not valid.' : 'Uno de los estados no es válido.' };
    }
    if (input.auto && !(await usTaxEntitled(orgId))) {
        const e = new UsTaxError('plan', locale);
        return { ok: false, status: e.status, code: 'subscription_required', error: e.message };
    }

    // Lo capturado se guarda siempre: aunque falte la cuenta de cobros, el
    // negocio no vuelve a escribir su domicilio.
    await withOrgTx(orgId, sql`
        update orgs set us_tax_origen = ${JSON.stringify(origen)}::jsonb, us_tax_codigo = ${taxCode}
         where id = ${orgId}`);
    await sincronizarRegistrosLocales(orgId, actual, estados);

    let estado: { status: 'active' | 'pending'; faltantes: string[] } | null = null;
    if (actual.account) {
        try {
            estado = await syncUsTaxSettings(actual.account, {
                origen: origen!, taxCode,
                idempotencyKey: `us-tax-settings:${orgId}:${sha(JSON.stringify([origen, taxCode]))}`,
            }, locale);
            await sincronizarRegistrosProveedor(orgId, actual.account, locale);
        } catch (error) {
            if (!(error instanceof UsTaxError)) throw error;
            await withOrgTx(orgId, sql`update orgs set us_tax_auto = false where id = ${orgId}`);
            return { ok: false, status: error.status, code: `us_tax_${error.code}`, error: error.message };
        }
        await withOrgTx(orgId, sql`
            update orgs set us_tax_estado = ${JSON.stringify({ ...estado, sincronizado_at: new Date().toISOString() })}::jsonb
             where id = ${orgId}`);
    }

    const config = await loadUsTaxConfig(orgId);
    const problema = usTaxConfigProblem(config);
    if (input.auto && problema) {
        await withOrgTx(orgId, sql`update orgs set us_tax_auto = false where id = ${orgId}`);
        const e = new UsTaxError(problema, locale);
        return { ok: false, status: e.status, code: `us_tax_${problema}`, error: e.message };
    }
    await withOrgTx(orgId, sql`update orgs set us_tax_auto = ${input.auto && !problema} where id = ${orgId}`);
    return { ok: true, config: { ...config, auto: input.auto && !problema }, auto: input.auto && !problema, problema };
}

/** Altas y bajas en la copia de Cord: un estado nuevo nace sin id del proveedor. */
async function sincronizarRegistrosLocales(orgId: string, actual: UsTaxConfig, estados: string[]) {
    const vivos = new Set(actual.registros.map((r) => r.estado));
    const altas = estados.filter((e) => !vivos.has(e));
    const bajas = actual.registros.filter((r) => !estados.includes(r.estado));
    for (const e of altas) {
        await withOrgTx(orgId, sql`
            insert into us_tax_registros (org_id, estado) values (${orgId}, ${e})
            on conflict (org_id, estado) where baja_at is null do nothing`);
    }
    for (const r of bajas) {
        // `baja_pendiente` en la copia local: el proveedor la vence en la
        // sincronización; si no hay cuenta todavía, no hay nada que vencer.
        await withOrgTx(orgId, sql`
            update us_tax_registros set baja_at = now()
             where org_id = ${orgId} and id = ${r.id}::uuid and baja_at is null`);
    }
}

/**
 * Lleva la copia de Cord a la cuenta: adopta registros que ya existen allá,
 * crea los que faltan (clave por fila local: un estado dado de baja y vuelto a
 * dar de alta es otra fila y otro registro) y vence los dados de baja.
 */
async function sincronizarRegistrosProveedor(orgId: string, account: string, locale: string) {
    const [locales, bajas] = await withOrgTx(orgId,
        sql`select id, estado, stripe_registration_id from us_tax_registros where org_id = ${orgId} and baja_at is null`,
        sql`select id, stripe_registration_id from us_tax_registros
             where org_id = ${orgId} and baja_at is not null and stripe_registration_id is not null
               and baja_at > now() - interval '30 days'`,
    );
    const remotos = await listActiveUsRegistrations(account, locale);
    const remotoPorEstado = new Map(remotos.map((r) => [r.state, r.id]));
    for (const l of locales) {
        if (l.stripe_registration_id) continue;
        const existente = remotoPorEstado.get(String(l.estado));
        const regId = existente ?? await createUsRegistration(account, {
            state: String(l.estado), idempotencyKey: `us-tax-reg:${l.id}`,
        }, locale);
        await withOrgTx(orgId, sql`
            update us_tax_registros set stripe_registration_id = ${regId}
             where org_id = ${orgId} and id = ${l.id}::uuid`);
    }
    const vivosRemotos = new Set(remotos.map((r) => r.id));
    const vigentesLocales = new Set(locales.map((l: any) => String(l.stripe_registration_id || '')));
    for (const b of bajas) {
        const id = String(b.stripe_registration_id);
        // Solo se vence lo que sigue vivo allá y ya no respalda un estado vivo aquí.
        if (vivosRemotos.has(id) && !vigentesLocales.has(id)) await expireUsRegistration(account, id, locale);
    }
}

/** Estado para Ajustes y los editores: preferencia, si corre hoy y qué falta. */
export async function usTaxStatus(orgId: string): Promise<{
    config: UsTaxConfig; entitled: boolean; activo: boolean; problema: string | null;
}> {
    const config = await loadUsTaxConfig(orgId);
    const entitled = config.country === 'US' ? await usTaxEntitled(orgId) : false;
    const problema = config.country === 'US' ? usTaxConfigProblem(config) : null;
    return { config, entitled, activo: config.auto && entitled && !problema, problema };
}

export type { UsAddress };

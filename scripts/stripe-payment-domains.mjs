#!/usr/bin/env node
// scripts/stripe-payment-domains.mjs
//
// Registra los dominios donde se muestra el formulario de pago (Apple Pay y
// Google Pay) en las cuentas conectadas que YA existían. Las nuevas los
// registran solas: el webhook `account.updated` lo hace cuando la cuenta puede
// cobrar, y la verificación del dominio propio cuando éste queda activo
// (src/lib/cobros/billeteras-org.ts). Esto cubre las de antes.
//
// Cord cobra con cargos directos, así que el dominio se registra EN CADA
// cuenta conectada con `Stripe-Account`; el registro en el Dashboard de la
// plataforma no le sirve a ninguna. Contrato y fuentes en
// src/lib/cobros/billeteras.ts.
//
// Dominios por cuenta:
//   - cordhq.app, siempre (/q/[token]/pay, /i/[token], /portal/[token]);
//   - el dominio propio activo del negocio, si hay DATABASE_URL (lectura
//     operativa de solo lectura, fuera de los carriles HTTP, igual que
//     scripts/audit-legacy-checkout.mjs);
//   - los que se pasen con `--domain` (p. ej. el alias de un despliegue de
//     prueba con llaves de test).
//
// Seguro por defecto:
//   - DRY-RUN por defecto: solo lee y dice qué registraría. Para escribir: `--apply`.
//   - Una llave LIVE se rechaza salvo `--live` explícito.
//   - Idempotente: busca cada dominio por `domain_name` antes de crearlo y el
//     alta lleva `Idempotency-Key` determinística (cuenta + dominio). Nunca
//     reactiva un dominio deshabilitado ni borra nada.
//   - `--validate` (con `--apply`) pide revisar los dominios con una billetera
//     `inactive`, después de corregir lo que diga su motivo.
//   - Solo cuentas que ya pueden cobrar, salvo `--all`.
//
//   npm run stripe:payment-domains                                   # test, solo lectura
//   npm run stripe:payment-domains -- --apply                        # test, registra
//   npm run stripe:payment-domains -- --account acct_123 --domain cord-git-x.vercel.app --apply
//   npm run stripe:payment-domains -- --apply --live                 # LIVE (solo con aprobación)
import { pathToFileURL } from 'node:url';
import {
    asegurarDominiosDeCobro, dominiosDeCobro, normalizarDominioDeCobro, requiereAtencion,
} from '../src/lib/cobros/billeteras.ts';

export const DOMINIO_CANONICO = 'cordhq.app';

export class StripeScriptError extends Error {}

/** Valida la llave: test siempre; live solo con `allowLive`. */
export function modoDeLlave(key, allowLive) {
    if (!/^(sk|rk)_(live|test)_/.test(key || '')) throw new StripeScriptError('Falta una STRIPE_SECRET_KEY válida (sk_test_… o sk_live_…).');
    const live = /^(sk|rk)_live_/.test(key);
    if (live && !allowLive) throw new StripeScriptError('La llave es LIVE. Este script corre en modo test por defecto; para live agrega --live (solo con aprobación).');
    return live ? 'live' : 'test';
}

/** Cliente mínimo con `Stripe-Account`. Los errores llevan ruta y código, nunca la llave. */
export function clienteStripe(key, fetchImpl = fetch) {
    return async function llamar(ruta, { metodo = 'GET', params, cuenta, idempotencia } = {}) {
        const url = new URL(`https://api.stripe.com${ruta}`);
        const body = params ? new URLSearchParams(params) : null;
        if (metodo === 'GET' && body) for (const [k, v] of body) url.searchParams.append(k, v);
        const response = await fetchImpl(url, {
            method: metodo,
            headers: {
                Authorization: `Bearer ${key}`,
                ...(cuenta ? { 'Stripe-Account': cuenta } : {}),
                ...(metodo !== 'GET' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
                ...(idempotencia && metodo !== 'GET' ? { 'Idempotency-Key': idempotencia } : {}),
            },
            ...(metodo !== 'GET' && body ? { body: body.toString() } : {}),
        });
        const data = await response.json();
        if (!response.ok) {
            const error = new StripeScriptError(`${metodo} ${ruta}: ${data?.error?.code || data?.error?.message || response.status}`);
            error.status = response.status;
            error.code = data?.error?.code;
            throw error;
        }
        return data;
    };
}

async function cuentasConectadas(llamar, { soloCuentas, todas }) {
    if (soloCuentas.length) {
        const out = [];
        for (const id of soloCuentas) out.push(await llamar(`/v1/accounts/${encodeURIComponent(id)}`));
        return out.filter((a) => todas || a.charges_enabled);
    }
    const out = [];
    let starting_after;
    for (;;) {
        const page = await llamar('/v1/accounts', { params: { limit: '100', ...(starting_after ? { starting_after } : {}) } });
        out.push(...(page.data ?? []));
        if (!page.has_more || !page.data?.length) break;
        starting_after = page.data[page.data.length - 1].id;
    }
    return out.filter((a) => todas || a.charges_enabled);
}

/**
 * @param {{ key: string, apply?: boolean, allowLive?: boolean, validate?: boolean, all?: boolean,
 *   accounts?: string[], extraDomains?: string[], customDomains?: Map<string, string>, fetchImpl?: typeof fetch }} opciones
 * @returns {Promise<{ modo: string, aplicado: boolean, cuentas: Array<{ cuenta: string, dominios: any[] }>, atencion: number }>}
 */
export async function registrarDominiosDeCobro({
    key, apply = false, allowLive = false, validate = false, all = false,
    accounts = [], extraDomains = [], customDomains = new Map(), fetchImpl = fetch,
}) {
    const modo = modoDeLlave(key, allowLive);
    const invalidos = extraDomains.filter((d) => !normalizarDominioDeCobro(d));
    if (invalidos.length) throw new StripeScriptError(`Dominio inválido: ${invalidos.join(', ')}. Solo hostnames públicos con HTTPS, sin esquema ni ruta.`);
    if (accounts.some((a) => !/^acct_[A-Za-z0-9]+$/.test(a))) throw new StripeScriptError('--account espera un id acct_….');

    const llamar = clienteStripe(key, fetchImpl);
    const lista = await cuentasConectadas(llamar, { soloCuentas: accounts, todas: all });
    const cuentas = [];
    let atencion = 0;
    for (const cuenta of lista) {
        const dominios = dominiosDeCobro({ canonico: DOMINIO_CANONICO, propio: customDomains.get(cuenta.id) ?? null, extra: extraDomains });
        const resultado = await asegurarDominiosDeCobro({ cuenta: cuenta.id, dominios, llamar, aplicar: apply, validar: validate });
        atencion += resultado.filter(requiereAtencion).length;
        cuentas.push({ cuenta: cuenta.id, dominios: resultado });
    }
    return { modo, aplicado: apply, cuentas, atencion };
}

/** Dominio propio activo por cuenta conectada, leído de la base (solo lectura). */
async function dominiosPropiosDeLaBase() {
    if (!process.env.DATABASE_URL) return null;
    const { neon } = await import('@neondatabase/serverless');
    const sql = neon(process.env.DATABASE_URL);
    // Lectura operativa cross-org fuera de los carriles HTTP: no escribe nada.
    const rows = await sql`select o.stripe_account_id, d.hostname
        from orgs o join org_domains d on d.org_id = o.id
        where o.sandbox_of is null and o.stripe_account_id is not null
          and d.status = 'active' and not d.removing`;
    return new Map(rows.map((r) => [String(r.stripe_account_id), String(r.hostname)]));
}

function argumentos(argv) {
    const flags = new Set();
    const accounts = [];
    const extraDomains = [];
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--account') accounts.push(String(argv[++i] || ''));
        else if (a === '--domain') extraDomains.push(String(argv[++i] || ''));
        else flags.add(a);
    }
    return { flags, accounts, extraDomains };
}

const ICONO = { creado: '+', crearia: '+', existente: '·', validado: '~', deshabilitado: '!', error: 'x' };

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
    const { flags, accounts, extraDomains } = argumentos(process.argv.slice(2));
    const apply = flags.has('--apply');
    try {
        // La llave se valida antes de tocar la base: una llave live sin --live no lee nada.
        modoDeLlave(process.env.STRIPE_SECRET_KEY || '', flags.has('--live'));
        let customDomains = new Map();
        try {
            const propios = await dominiosPropiosDeLaBase();
            if (propios) customDomains = propios;
            else console.log('Sin DATABASE_URL: no se incluyen los dominios propios de los negocios (solo cordhq.app y --domain).');
        } catch (error) {
            console.log(`No se pudieron leer los dominios propios de la base (${error?.code || 'sin código'}); se continúa sin ellos.`);
        }
        const r = await registrarDominiosDeCobro({
            key: process.env.STRIPE_SECRET_KEY || '', apply, allowLive: flags.has('--live'),
            validate: flags.has('--validate'), all: flags.has('--all'), accounts, extraDomains, customDomains,
        });
        console.log(`Modo Stripe: ${r.modo.toUpperCase()} — ${apply ? 'ESCRITURA (--apply)' : 'DRY-RUN: nada se escribió; usa --apply para registrar.'}`);
        console.log(`Cuentas conectadas revisadas: ${r.cuentas.length}`);
        for (const c of r.cuentas) {
            for (const d of c.dominios) {
                const billeteras = d.applePay || d.googlePay ? ` Apple Pay: ${d.applePay ?? '—'} · Google Pay: ${d.googlePay ?? '—'}` : '';
                const accion = d.accion === 'crearia' ? 'registraría' : d.accion;
                console.log(`${ICONO[d.accion] ?? '?'} ${c.cuenta} ${d.dominio} ${accion}${billeteras}${d.motivo ? ` — ${d.motivo}` : ''}`);
            }
        }
        if (r.atencion) {
            console.log(`\n${r.atencion} dominio(s) requieren atención. Corrige el motivo y repite con --apply --validate.`);
            process.exitCode = 1;
        }
    } catch (error) {
        // Los mensajes nunca incluyen la llave: solo ruta y código del error.
        console.error(error instanceof StripeScriptError ? error.message : `Fallo inesperado: ${error?.message || error}`);
        process.exitCode = 1;
    }
}

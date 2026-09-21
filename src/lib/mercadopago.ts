// src/lib/mercadopago.ts
// Mercado Pago como SEGUNDO riel de cobro en línea de Cord Payments.
//
// Por qué existe: Stripe no abre cuentas conectadas en Colombia, Argentina,
// Chile ni Perú. Esas cuentas cotizaban, facturaban y llevaban cobranza, pero
// el cobro con tarjeta dentro del link no existía y se decía antes del alta
// (regla 28). Mercado Pago cubre ese hueco con el mismo principio: el dinero
// llega a la cuenta del NEGOCIO, no a una cuenta de Cord.
//
// Contratos que sostienen este archivo:
//
//  - **El token del vendedor va cifrado** y se renueva con su refresh token.
//    Un token vencido no se "intenta igual": se renueva o la operación falla
//    cerrada, porque cobrar con una credencial inválida deja al cliente
//    mirando un error del proveedor.
//  - **El importe viaja con su divisa** y en unidades mayores: Mercado Pago
//    cobra en decimales, no en centavos como Stripe. Usar `toMinorUnits` aquí
//    cobraría cien veces de más (regla 21).
//  - **Ningún mensaje del proveedor sale hacia el pagador** (regla 14): esta
//    capa devuelve resultados tipados y el llamador los traduce.
//
// ⚠️ Antes de habilitarlo en producción, reconfirma contra la documentación
// VIGENTE de Mercado Pago la forma de `/oauth/token`, de `/checkout/preferences`
// y del encabezado `x-signature`: son de un tercero y cambian sin avisarnos.

import { sql, withOrgTx } from './db';
import { decryptSecret, encryptRequiredSecret } from './crypto-secret';
import { log } from './log';
import { createHmac, timingSafeEqual } from 'node:crypto';

const API = 'https://api.mercadopago.com';
const AUTH_URL = 'https://auth.mercadopago.com/authorization';
const TIMEOUT_MS = 12_000;
/** Se renueva antes de que expire: un token que vence a mitad del cobro es un cobro perdido. */
const RENEW_MARGIN_MS = 10 * 60 * 1000;

export const mpCredentials = () => {
    const clientId = import.meta.env.MP_CLIENT_ID || process.env.MP_CLIENT_ID;
    const clientSecret = import.meta.env.MP_CLIENT_SECRET || process.env.MP_CLIENT_SECRET;
    return clientId && clientSecret ? { clientId, clientSecret } : null;
};

export const mpWebhookSecret = () => import.meta.env.MP_WEBHOOK_SECRET || process.env.MP_WEBHOOK_SECRET || '';

export function mpAuthorizeUrl(redirectUri: string, state: string): string | null {
    const creds = mpCredentials();
    if (!creds) return null;
    const url = new URL(AUTH_URL);
    url.searchParams.set('client_id', creds.clientId);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('platform_id', 'mp');
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('state', state);
    return url.toString();
}

interface TokenResponse {
    access_token: string;
    refresh_token: string;
    user_id: number | string;
    expires_in: number;
}

async function mpFetch(path: string, init: RequestInit): Promise<{ status: number; data: any }> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
        const res = await fetch(`${API}${path}`, { ...init, signal: ctrl.signal, redirect: 'error' });
        const data = await res.json().catch(() => ({}));
        return { status: res.status, data };
    } finally {
        clearTimeout(timer);
    }
}

/** Canjea el código de OAuth por las credenciales del vendedor. */
export async function exchangeMpCode(code: string, redirectUri: string): Promise<TokenResponse | null> {
    const creds = mpCredentials();
    if (!creds) return null;
    const { status, data } = await mpFetch('/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
            grant_type: 'authorization_code',
            client_id: creds.clientId,
            client_secret: creds.clientSecret,
            code,
            redirect_uri: redirectUri,
        }),
    });
    if (status !== 200 || !data?.access_token) {
        log.error('Mercado Pago no aceptó la autorización', { route: 'mercadopago', status });
        return null;
    }
    return data as TokenResponse;
}

export async function saveMpAccount(orgId: string, tokens: TokenResponse): Promise<void> {
    const expira = new Date(Date.now() + Number(tokens.expires_in || 0) * 1000).toISOString();
    await withOrgTx(orgId, sql`
        update orgs
           set mp_user_id = ${String(tokens.user_id)},
               mp_access_token_enc = ${encryptRequiredSecret(tokens.access_token)},
               mp_refresh_token_enc = ${encryptRequiredSecret(tokens.refresh_token)},
               mp_token_expira = ${expira},
               mp_charges_enabled = true
         where id = ${orgId}`);
}

export async function disconnectMp(orgId: string): Promise<void> {
    await withOrgTx(orgId, sql`
        update orgs set mp_user_id = null, mp_access_token_enc = null, mp_refresh_token_enc = null,
               mp_token_expira = null, mp_charges_enabled = false
         where id = ${orgId}`);
}

/**
 * Token vigente del vendedor. Renueva si está por vencer; si la renovación
 * falla, devuelve null y el llamador falla CERRADO — nunca se intenta cobrar
 * con una credencial que ya sabemos inválida.
 */
export async function mpAccessToken(orgId: string): Promise<string | null> {
    const [[org]] = await withOrgTx(orgId, sql`
        select mp_access_token_enc, mp_refresh_token_enc, mp_token_expira, mp_charges_enabled
          from orgs where id = ${orgId}`);
    if (!org?.mp_charges_enabled) return null;
    const token = decryptSecret(org.mp_access_token_enc as string);
    const refresh = decryptSecret(org.mp_refresh_token_enc as string);
    if (!token) return null;

    const expira = org.mp_token_expira ? new Date(org.mp_token_expira as string).getTime() : 0;
    if (expira && expira - Date.now() > RENEW_MARGIN_MS) return token;
    if (!refresh) return token; // sin refresh: se usa el que hay hasta que falle

    const creds = mpCredentials();
    if (!creds) return null;
    const { status, data } = await mpFetch('/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
            grant_type: 'refresh_token',
            client_id: creds.clientId,
            client_secret: creds.clientSecret,
            refresh_token: refresh,
        }),
    });
    if (status !== 200 || !data?.access_token) {
        log.error('no se pudo renovar el token de Mercado Pago', { route: 'mercadopago', orgId, status });
        // La conexión queda marcada como no operativa: el vendedor lo ve en
        // Ajustes en vez de descubrirlo por un cobro que nunca se abrió.
        await withOrgTx(orgId, sql`update orgs set mp_charges_enabled = false where id = ${orgId}`);
        return null;
    }
    await saveMpAccount(orgId, data as TokenResponse);
    return data.access_token as string;
}

export interface PreferenceInput {
    /** Idempotencia determinística: el mismo cobro no acuña dos preferencias. */
    idempotencyKey: string;
    titulo: string;
    monto: number;
    moneda: string;
    /** Id del cobro; vuelve en el pago y es lo que permite conciliarlo. */
    referencia: string;
    emailPagador?: string | null;
    notificationUrl: string;
    backUrl: string;
}

export type PreferenceResult =
    | { ok: true; id: string; initPoint: string }
    | { ok: false; reason: 'sin_credenciales' | 'rechazo' | 'red' };

export async function createMpPreference(orgId: string, input: PreferenceInput): Promise<PreferenceResult> {
    const token = await mpAccessToken(orgId);
    if (!token) return { ok: false, reason: 'sin_credenciales' };
    try {
        const { status, data } = await mpFetch('/checkout/preferences', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
                // Mercado Pago repite la misma preferencia ante un reintento con
                // esta llave, en vez de acuñar una segunda (regla 33).
                'X-Idempotency-Key': input.idempotencyKey,
            },
            body: JSON.stringify({
                items: [{
                    title: input.titulo.slice(0, 250),
                    quantity: 1,
                    // Unidades MAYORES: Mercado Pago cobra en decimales, no en
                    // centavos. Mandar centavos aquí cobra cien veces de más.
                    unit_price: Number(input.monto),
                    currency_id: input.moneda,
                }],
                external_reference: input.referencia,
                notification_url: input.notificationUrl,
                back_urls: { success: input.backUrl, pending: input.backUrl, failure: input.backUrl },
                auto_return: 'approved',
                ...(input.emailPagador ? { payer: { email: input.emailPagador } } : {}),
            }),
        });
        if (status >= 400 || !data?.id || !data?.init_point) {
            log.error('Mercado Pago rechazó la preferencia', { route: 'mercadopago', orgId, status });
            return { ok: false, reason: 'rechazo' };
        }
        return { ok: true, id: String(data.id), initPoint: String(data.init_point) };
    } catch (err) {
        log.error('Mercado Pago no respondió al crear la preferencia', { route: 'mercadopago', orgId, err });
        return { ok: false, reason: 'red' };
    }
}

export interface MpPayment {
    id: string;
    status: string;
    monto: number;
    moneda: string;
    referencia: string | null;
    metodo: string | null;
}

/** Lee el pago en el proveedor. El webhook NUNCA confía en el cuerpo que recibe. */
export async function fetchMpPayment(orgId: string, paymentId: string): Promise<MpPayment | null> {
    const token = await mpAccessToken(orgId);
    if (!token) return null;
    try {
        const { status, data } = await mpFetch(`/v1/payments/${encodeURIComponent(paymentId)}`, {
            method: 'GET',
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        });
        if (status !== 200 || !data?.id) return null;
        return {
            id: String(data.id),
            status: String(data.status ?? ''),
            monto: Number(data.transaction_amount ?? 0),
            moneda: String(data.currency_id ?? ''),
            referencia: data.external_reference ? String(data.external_reference) : null,
            metodo: data.payment_type_id ? String(data.payment_type_id) : null,
        };
    } catch (err) {
        log.error('Mercado Pago no respondió al leer el pago', { route: 'mercadopago', orgId, err });
        return null;
    }
}

/**
 * Firma del webhook: HMAC-SHA256 sobre `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`.
 * Sin secreto configurado devuelve false: un webhook de dinero sin verificar es
 * una puerta abierta a que cualquiera declare un pago (falla cerrada).
 */
export function mpSignatureValid(header: string | null, requestId: string | null, dataId: string, secret: string): boolean {
    if (!header || !secret || !dataId) return false;
    let ts = '', v1 = '';
    for (const parte of header.split(',')) {
        const eq = parte.indexOf('=');
        if (eq === -1) continue;
        const clave = parte.slice(0, eq).trim();
        const valor = parte.slice(eq + 1).trim();
        if (clave === 'ts') ts = valor;
        else if (clave === 'v1') v1 = valor;
    }
    if (!ts || !v1) return false;
    // Fuera de tolerancia = reenvío viejo. Cinco minutos, igual que el resto de
    // las firmas que verifica Cord.
    const edad = Math.abs(Date.now() - Number(ts) * (String(ts).length > 10 ? 1 : 1000));
    if (!Number.isFinite(edad) || edad > 5 * 60 * 1000) return false;

    const manifest = `id:${dataId};request-id:${requestId ?? ''};ts:${ts};`;
    const esperado = createHmac('sha256', secret).update(manifest).digest('hex');
    const a = Buffer.from(esperado, 'utf8');
    const b = Buffer.from(v1, 'utf8');
    return a.length === b.length && timingSafeEqual(a, b);
}

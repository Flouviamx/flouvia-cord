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
// Verificado el 2026-09-21 contra el SDK oficial `mercadopago` 3.6.1: URL de
// autorización, `/oauth/token` (canje y renovación), campos de
// `/checkout/preferences` y la firma `x-signature` (`WebhookSignatureValidator`).

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

/**
 * ¿La URL es un checkout de Mercado Pago? Es lo que se le entrega al pagador
 * para que salga de Cord con su dinero, así que se verifica en vez de darla por
 * buena: https y un dominio de Mercado Pago (incluido su sandbox), nunca un
 * host arbitrario que el proveedor —o algo entre nosotros y él— devolviera.
 */
export function isMpCheckoutUrl(value: string): boolean {
    let url: URL;
    try { url = new URL(value); } catch { return false; }
    if (url.protocol !== 'https:') return false;
    return /(^|\.)mercadopago\.(com(\.[a-z]{2})?|[a-z]{2})$/i.test(url.hostname)
        || /(^|\.)mercadolibre\.com(\.[a-z]{2})?$/i.test(url.hostname);
}

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

export interface MpCuenta { nickname: string | null; siteId: string | null }

/** Sitio de Mercado Pago → país de la organización que puede cobrar con él. */
export const MP_SITE_COUNTRY: Record<string, string> = {
    MLM: 'MX', MLB: 'BR', MLA: 'AR', MLC: 'CL', MCO: 'CO', MPE: 'PE', MLU: 'UY',
};

/**
 * Quién es la cuenta que acaba de autorizar a Cord: su apodo (para que el
 * dueño VEA a dónde llega su dinero) y su sitio (en qué divisa puede cobrar).
 * `null` si el proveedor no responde: la conexión no se acepta a ciegas.
 */
export async function fetchMpCuenta(accessToken: string): Promise<MpCuenta | null> {
    try {
        const { status, data } = await mpFetch('/users/me', {
            method: 'GET',
            headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
        });
        if (status !== 200 || !data?.id) return null;
        return {
            nickname: data.nickname ? String(data.nickname).slice(0, 120) : null,
            siteId: data.site_id ? String(data.site_id).toUpperCase().slice(0, 8) : null,
        };
    } catch {
        return null;
    }
}

export async function saveMpAccount(orgId: string, tokens: TokenResponse, cuenta?: MpCuenta | null): Promise<void> {
    if (!tokens.access_token || !tokens.refresh_token) throw new Error('Mercado Pago no entregó credenciales completas.');
    const expira = new Date(Date.now() + Number(tokens.expires_in || 0) * 1000).toISOString();
    await withOrgTx(orgId, sql`
        update orgs
           set mp_user_id = coalesce(${tokens.user_id !== undefined && tokens.user_id !== null && String(tokens.user_id) !== '' ? String(tokens.user_id) : null}, mp_user_id),
               mp_access_token_enc = ${encryptRequiredSecret(tokens.access_token)},
               mp_refresh_token_enc = ${encryptRequiredSecret(tokens.refresh_token)},
               mp_token_expira = ${expira},
               mp_charges_enabled = true,
               mp_nickname = case when ${cuenta ? 1 : 0} = 1 then ${cuenta?.nickname ?? null} else mp_nickname end,
               mp_site_id = case when ${cuenta ? 1 : 0} = 1 then ${cuenta?.siteId ?? null} else mp_site_id end
         where id = ${orgId}`);
}

export async function disconnectMp(orgId: string): Promise<void> {
    await withOrgTx(orgId, sql`
        update orgs set mp_user_id = null, mp_access_token_enc = null, mp_refresh_token_enc = null,
               mp_token_expira = null, mp_charges_enabled = false, mp_nickname = null, mp_site_id = null
         where id = ${orgId}`);
}

/** El proveedor no respondió o respondió con un error temporal: reintentar, no concluir. */
export class MpTransientError extends Error {}

/**
 * Token vigente del vendedor.
 *
 * Dos propósitos con reglas distintas:
 *   - `cobrar` (crear una preferencia): exige `mp_charges_enabled`. Una
 *     conexión apagada no abre cobros nuevos.
 *   - `leer` (webhook y conciliación): NO lo exige. Un pago que ya ocurrió se
 *     tiene que poder leer aunque la conexión se haya marcado como no operativa
 *     después; si no, ese dinero se quedaba sin registrar para siempre.
 *
 * Renueva si está por vencer. Solo un rechazo DEFINITIVO del proveedor
 * (`invalid_grant` y compañía: la autorización ya no existe) apaga la conexión;
 * un 429, un 5xx o la red caída no, porque eso es el proveedor teniendo un mal
 * minuto, no el vendedor revocando a Cord. Antes cualquier respuesta distinta de
 * 200 apagaba Mercado Pago para siempre.
 *
 * Dos renovaciones simultáneas compiten con el mismo refresh token, que el
 * proveedor rota en cada renovación: la que pierde recibe `invalid_grant`. Antes
 * de apagar nada se relee la fila; si otra renovación ya guardó credenciales
 * nuevas, se usan esas.
 */
export async function mpAccessToken(orgId: string, proposito: 'cobrar' | 'leer' = 'cobrar'): Promise<string | null> {
    const [[org]] = await withOrgTx(orgId, sql`
        select mp_access_token_enc, mp_refresh_token_enc, mp_token_expira, mp_charges_enabled
          from orgs where id = ${orgId}`);
    if (!org) return null;
    if (proposito === 'cobrar' && !org.mp_charges_enabled) return null;
    const token = decryptSecret(org.mp_access_token_enc as string);
    const refresh = decryptSecret(org.mp_refresh_token_enc as string);
    if (!token) {
        // Hay credencial guardada pero no se pudo descifrar: es Cord (la llave de
        // cifrado), no el vendedor. Para leer un pago eso es temporal: el
        // proveedor reintenta en vez de que el aviso se dé por atendido.
        if (org.mp_access_token_enc && proposito === 'leer') throw new MpTransientError('No se pudo descifrar la credencial de Mercado Pago.');
        return null;
    }

    const expira = org.mp_token_expira ? new Date(org.mp_token_expira as string).getTime() : 0;
    if (expira && expira - Date.now() > RENEW_MARGIN_MS) return token;
    // Sin refresh token no hay renovación posible. Un token ya vencido no se
    // "intenta igual" para cobrar: se apaga y el vendedor lo ve en Ajustes.
    if (!refresh) {
        if (expira && expira <= Date.now()) {
            if (proposito === 'cobrar') await disableMpCharges(orgId);
            return proposito === 'leer' ? token : null;
        }
        return token;
    }

    const creds = mpCredentials();
    if (!creds) {
        // Cord sin su propia configuración: tampoco es culpa del vendedor.
        if (proposito === 'leer') {
            if (!expira || expira > Date.now()) return token;
            throw new MpTransientError('Mercado Pago no está configurado en este entorno.');
        }
        return null;
    }
    let res: { status: number; data: any };
    try {
        res = await mpFetch('/oauth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({
                grant_type: 'refresh_token',
                client_id: creds.clientId,
                client_secret: creds.clientSecret,
                refresh_token: refresh,
            }),
        });
    } catch (err) {
        res = { status: 0, data: { error: 'network', detail: err instanceof Error ? err.name : 'error' } };
    }
    if (res.status === 200 && res.data?.access_token) {
        // Si el proveedor no rota el refresh token en esta respuesta, se conserva el vigente.
        await saveMpAccount(orgId, { ...(res.data as TokenResponse), refresh_token: res.data.refresh_token || refresh });
        return res.data.access_token as string;
    }

    const definitivo = res.status === 400 || res.status === 401 || res.status === 403;
    log.error('no se pudo renovar el token de Mercado Pago', { route: 'mercadopago', orgId, status: res.status, definitivo });
    if (!definitivo) {
        // Temporal: mientras el token actual no haya vencido, sigue sirviendo.
        if (!expira || expira > Date.now()) return token;
        throw new MpTransientError('Mercado Pago no respondió al renovar la autorización.');
    }

    // Definitivo... salvo que otra renovación concurrente ya haya ganado. Se
    // apaga con compare-and-set sobre el refresh token que ESTA renovación usó:
    // si otra ya guardó credenciales nuevas, el UPDATE no encuentra la fila y se
    // usan las nuevas. Leer y luego apagar dejaba una ventana en la que se
    // apagaba una conexión recién renovada.
    const [apagada] = await withOrgTx(orgId, sql`
        update orgs set mp_charges_enabled = false
         where id = ${orgId} and mp_refresh_token_enc = ${org.mp_refresh_token_enc as string}
        returning id`);
    if (apagada.length) return null;
    const [[actual]] = await withOrgTx(orgId, sql`
        select mp_access_token_enc from orgs where id = ${orgId}`);
    return decryptSecret(actual?.mp_access_token_enc as string) || null;
}

async function disableMpCharges(orgId: string): Promise<void> {
    await withOrgTx(orgId, sql`update orgs set mp_charges_enabled = false where id = ${orgId}`);
}

/**
 * URL a la que Mercado Pago avisa de los pagos de una preferencia. La que se
 * fija al crear la preferencia tiene prioridad sobre la configurada en el panel,
 * así que lleva la organización: el webhook sabe con qué credencial leer el
 * pago sin barrer organizaciones. No es una credencial —la firma lo es— y el
 * webhook igual verifica que el pago sea de la cuenta de esa organización.
 * `source_news=webhooks` pide solo Webhooks firmados, no IPN sin firma.
 */
export function mpNotificationUrl(origin: string, orgId: string): string {
    const url = new URL('/api/mercadopago/webhook', origin);
    url.searchParams.set('source_news', 'webhooks');
    url.searchParams.set('cord_org', orgId);
    return url.toString();
}

/** Vigencia de una preferencia: después se abre otra con el saldo vigente. */
const PREFERENCIA_VIGENCIA_MS = 72 * 60 * 60 * 1000;

/**
 * Vencimiento anclado al DÍA (UTC) y no al instante: la llave de idempotencia de
 * la preferencia es por día, así que dos clics del mismo día mandan exactamente
 * el mismo cuerpo. Vence entre 72 y 96 horas después de crearse.
 */
export function vigenciaHasta(ahoraMs: number): number {
    const dia = new Date(ahoraMs);
    return Date.UTC(dia.getUTCFullYear(), dia.getUTCMonth(), dia.getUTCDate()) + 24 * 60 * 60 * 1000 + PREFERENCIA_VIGENCIA_MS;
}

/** Fecha en el formato que documenta Mercado Pago (`yyyy-MM-ddTHH:mm:ss.SSS±hh:mm`). */
function mpDate(ms: number): string {
    return new Date(ms).toISOString().replace('Z', '+00:00');
}

/**
 * Vence ya una preferencia que dejó de ser cobrable (cobro saldado por otro
 * camino, factura anulada). Best-effort: si no se puede, un pago que llegue de
 * todos modos se registra y se avisa — nunca se pierde.
 */
export async function expireMpPreference(orgId: string, preferenceId: string): Promise<boolean> {
    try {
        const token = await mpAccessToken(orgId, 'leer');
        if (!token || !preferenceId) return false;
        const { status } = await mpFetch(`/checkout/preferences/${encodeURIComponent(preferenceId)}`, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ expires: true, expiration_date_to: mpDate(Date.now()) }),
        });
        if (status >= 400) log.warn('Mercado Pago no venció la preferencia', { route: 'mercadopago', orgId, status });
        return status < 400;
    } catch (err) {
        log.warn('no se pudo vencer la preferencia de Mercado Pago', { route: 'mercadopago', orgId, err });
        return false;
    }
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
    let token: string | null;
    try { token = await mpAccessToken(orgId, 'cobrar'); }
    catch { return { ok: false, reason: 'red' }; }
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
                // Una preferencia vieja con un importe viejo no puede quedar
                // cobrable para siempre: vence, y el siguiente clic abre otra
                // con el saldo vigente.
                expires: true,
                expiration_date_to: mpDate(vigenciaHasta(Date.now())),
                ...(input.emailPagador ? { payer: { email: input.emailPagador } } : {}),
            }),
        });
        if (status >= 400 || !data?.id || !data?.init_point) {
            log.error('Mercado Pago rechazó la preferencia', { route: 'mercadopago', orgId, status });
            return { ok: false, reason: 'rechazo' };
        }
        if (!isMpCheckoutUrl(String(data.init_point))) {
            log.error('Mercado Pago devolvió un enlace que no es de Mercado Pago', { route: 'mercadopago', orgId });
            return { ok: false, reason: 'rechazo' };
        }
        return { ok: true, id: String(data.id), initPoint: String(data.init_point) };
    } catch (err) {
        log.error('Mercado Pago no respondió al crear la preferencia', { route: 'mercadopago', orgId, err });
        return { ok: false, reason: 'red' };
    }
}

/**
 * Prefijo de `external_reference` cuando quien cobra es una FACTURA. Sin él, el
 * webhook no puede distinguir el id de un cobro de cotización del de un
 * documento fiscal: son dos ledgers distintos y aplicar el dinero al equivocado
 * deja una factura cobrada dos veces y otra sin cobrar.
 */
export const MP_INVOICE_REF = 'fac:';

export interface MpRefund {
    id: string;
    monto: number;
    /** Estado del proveedor traducido al vocabulario del ledger de Cord. */
    status: 'succeeded' | 'pending' | 'failed';
}

export interface MpPayment {
    id: string;
    status: string;
    monto: number;
    moneda: string;
    referencia: string | null;
    metodo: string | null;
    /** Cuenta de Mercado Pago que recibió el dinero (`collector_id`). */
    collectorId: string | null;
    /** `false` = pago de prueba. `null` = el proveedor no lo dijo. */
    liveMode: boolean | null;
    /** Reembolsos que Mercado Pago ya tiene registrados sobre este pago. */
    reembolsos: MpRefund[];
}

/**
 * Resultado de leer un pago. Distinguir por qué NO se pudo leer es lo que
 * decide si el webhook pide reintento o lo da por atendido:
 *   - `ajeno`: el proveedor dice que ese pago no existe para esta cuenta;
 *   - `sin_credenciales`: la organización ya no tiene una autorización válida;
 *   - `temporal`: 429, 5xx, red o timeout. Nunca se concluye nada con esto.
 */
export type MpPaymentRead =
    | { ok: true; payment: MpPayment }
    | { ok: false; reason: 'ajeno' | 'sin_credenciales' | 'temporal' };

export function parseMpPayment(data: any): MpPayment | null {
    if (!data?.id) return null;
    return {
        id: String(data.id),
        status: String(data.status ?? ''),
        monto: Number(data.transaction_amount ?? 0),
        moneda: String(data.currency_id ?? '').toUpperCase(),
        referencia: data.external_reference ? String(data.external_reference) : null,
        metodo: data.payment_type_id ? String(data.payment_type_id) : null,
        collectorId: data.collector_id !== undefined && data.collector_id !== null
            ? String(data.collector_id)
            : (data.collector?.id !== undefined && data.collector?.id !== null ? String(data.collector.id) : null),
        liveMode: typeof data.live_mode === 'boolean' ? data.live_mode : null,
        reembolsos: parseMpRefunds(data),
    };
}

/** `approved` es el único estado que sacó dinero; el resto todavía puede caerse. */
const refundStatus = (raw: unknown): MpRefund['status'] => {
    const v = String(raw ?? '').toLowerCase();
    if (v === 'approved') return 'succeeded';
    if (v === 'rejected' || v === 'cancelled' || v === 'canceled') return 'failed';
    return 'pending';
};

export function parseMpRefunds(data: any): MpRefund[] {
    const raw = Array.isArray(data?.refunds) ? data.refunds : [];
    return raw
        .filter((r: any) => r?.id !== undefined && r?.id !== null && Number(r?.amount) > 0)
        .map((r: any) => ({ id: String(r.id), monto: Number(r.amount), status: refundStatus(r.status) }));
}

/** Lee el pago en el proveedor. El webhook NUNCA confía en el cuerpo que recibe. */
export async function readMpPayment(orgId: string, paymentId: string): Promise<MpPaymentRead> {
    if (!/^[0-9]{1,30}$/.test(paymentId)) return { ok: false, reason: 'ajeno' };
    let token: string | null;
    try { token = await mpAccessToken(orgId, 'leer'); }
    catch { return { ok: false, reason: 'temporal' }; }
    if (!token) return { ok: false, reason: 'sin_credenciales' };
    try {
        const { status, data } = await mpFetch(`/v1/payments/${encodeURIComponent(paymentId)}`, {
            method: 'GET',
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        });
        if (status === 200) {
            const payment = parseMpPayment(data);
            return payment ? { ok: true, payment } : { ok: false, reason: 'temporal' };
        }
        if (status === 404 || status === 403) return { ok: false, reason: 'ajeno' };
        if (status === 401) return { ok: false, reason: 'sin_credenciales' };
        return { ok: false, reason: 'temporal' };
    } catch (err) {
        log.error('Mercado Pago no respondió al leer el pago', { route: 'mercadopago', orgId, err });
        return { ok: false, reason: 'temporal' };
    }
}

/**
 * Pagos de una referencia de Cord, para la conciliación diaria: lo que el
 * webhook no alcanzó a registrar se encuentra aquí. Mismo contrato de errores.
 */
export async function searchMpPayments(orgId: string, referencia: string): Promise<{ ok: true; payments: MpPayment[] } | { ok: false; reason: 'sin_credenciales' | 'temporal' }> {
    let token: string | null;
    try { token = await mpAccessToken(orgId, 'leer'); }
    catch { return { ok: false, reason: 'temporal' }; }
    if (!token) return { ok: false, reason: 'sin_credenciales' };
    try {
        const qs = new URLSearchParams({ external_reference: referencia, sort: 'date_created', criteria: 'desc', limit: '30' });
        const { status, data } = await mpFetch(`/v1/payments/search?${qs}`, {
            method: 'GET',
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        });
        if (status === 401) return { ok: false, reason: 'sin_credenciales' };
        if (status !== 200 || !Array.isArray(data?.results)) return { ok: false, reason: 'temporal' };
        return { ok: true, payments: data.results.map(parseMpPayment).filter((p: MpPayment | null): p is MpPayment => !!p) };
    } catch {
        return { ok: false, reason: 'temporal' };
    }
}

/**
 * Firma del webhook, igual que `WebhookSignatureValidator` del SDK oficial:
 * HMAC-SHA256 sobre `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`, omitiendo
 * el tramo que no llegue. Sin secreto devuelve false (falla cerrada). No hay
 * ventana de tiempo: Mercado Pago reintenta con la firma original y el webhook
 * ya es idempotente y lee el pago en el proveedor.
 */
export function mpSignatureValid(header: string | null, requestId: string | null, dataId: string, secret: string): boolean {
    if (!header || !secret || !dataId) return false;
    let ts = '', v1 = '';
    for (const parte of header.split(',')) {
        const eq = parte.indexOf('=');
        if (eq === -1) continue;
        const clave = parte.slice(0, eq).trim().toLowerCase();
        const valor = parte.slice(eq + 1).trim();
        if (clave === 'ts') ts = valor;
        else if (clave === 'v1') v1 = valor;
    }
    if (!/^\d+$/.test(ts) || !v1) return false;

    const partes = [`id:${dataId}`];
    if (requestId?.trim()) partes.push(`request-id:${requestId.trim()}`);
    partes.push(`ts:${ts}`);
    const manifest = partes.join(';') + ';';
    const esperado = createHmac('sha256', secret).update(manifest).digest('hex');
    const a = Buffer.from(esperado, 'utf8');
    const b = Buffer.from(v1, 'utf8');
    return a.length === b.length && timingSafeEqual(a, b);
}

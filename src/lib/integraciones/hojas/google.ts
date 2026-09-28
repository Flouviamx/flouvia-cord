// Google Sheets. La app solo puede tocar los archivos que ELLA creó, porque el
// único permiso que pide es `drive.file`; por eso Cord crea la hoja en vez de
// pedirte que elijas una existente.

import { CABECERAS, rangoFila, type Celda } from './columnas';
import { apiJson, HojaError, type ClienteHoja, type HojaRef, type LibroCreado, type TokensHoja } from './cliente';
import { credencialesHoja, GOOGLE_SCOPES, GOOGLE_TOKEN } from './config';

const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';

/** Un título con comillas o espacios necesita comillas simples en un rango A1. */
const rango = (titulo: string, resto: string) => `'${titulo.replace(/'/g, "''")}'!${resto}`;
const enc = (v: string) => encodeURIComponent(v);

export function googleAuthorizeUrl(redirectUri: string, state: string): string | null {
    const creds = credencialesHoja('google_sheets');
    if (!creds) return null;
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('client_id', creds.clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', GOOGLE_SCOPES);
    url.searchParams.set('state', state);
    // Sin `offline` + `consent` Google NO entrega refresh token en una segunda
    // autorización, y la conexión moriría en una hora sin poder renovarse.
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('prompt', 'consent');
    url.searchParams.set('include_granted_scopes', 'true');
    return url.toString();
}

async function tokenRequest(params: Record<string, string>): Promise<TokensHoja> {
    const creds = credencialesHoja('google_sheets');
    if (!creds) throw new HojaError('auth', 'sin credenciales');
    const body = new URLSearchParams({ client_id: creds.clientId, client_secret: creds.clientSecret, ...params });
    const data = await apiJson(GOOGLE_TOKEN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
    });
    if (!data?.access_token) throw new HojaError('auth');
    return {
        accessToken: String(data.access_token),
        refreshToken: data.refresh_token ? String(data.refresh_token) : null,
        expiresIn: Number(data.expires_in) || 3600,
        cuenta: correoDelIdToken(data.id_token),
        scopes: String(data.scope || GOOGLE_SCOPES).split(' ').filter(Boolean),
    };
}

export const googleExchange = (code: string, redirectUri: string) =>
    tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri });

export const googleRefresh = (refreshToken: string) =>
    tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken });

/**
 * El correo sale del `id_token` que Google devuelve junto al access token, no de
 * una llamada extra: `drive.file` no incluye perfil, y por eso los permisos
 * piden también `openid email`, que no es sensible. El token viene del endpoint
 * de Google por TLS en esta misma respuesta, así que leer su carga sin verificar
 * la firma es correcto aquí; NO lo sería si llegara del navegador.
 */
export function correoDelIdToken(idToken: unknown): string | null {
    if (typeof idToken !== 'string') return null;
    const partes = idToken.split('.');
    if (partes.length !== 3) return null;
    try {
        const carga = JSON.parse(Buffer.from(partes[1], 'base64url').toString('utf8'));
        const email = carga?.email;
        return typeof email === 'string' && email.includes('@') ? email.slice(0, 254) : null;
    } catch {
        return null;
    }
}

export const googleSheets: ClienteHoja = {
    urlDelLibro: (libroId) => `https://docs.google.com/spreadsheets/d/${libroId}/edit`,

    async crearLibro(token, nombre, hojas): Promise<LibroCreado> {
        const data = await apiJson(SHEETS, {
            token,
            method: 'POST',
            body: JSON.stringify({
                properties: { title: nombre },
                sheets: hojas.map((h) => ({ properties: { title: h.titulo } })),
            }),
        });
        const id = data?.spreadsheetId;
        if (!id) throw new HojaError('proveedor', 'sin id');
        return { id: String(id), url: String(data.spreadsheetUrl || this.urlDelLibro(String(id))) };
    },

    async prepararPestanas(token, libroId, hojas) {
        const meta = await apiJson(`${SHEETS}/${enc(libroId)}?fields=sheets.properties.title`, { token });
        const existentes = new Set<string>(
            (meta?.sheets ?? []).map((s: any) => String(s?.properties?.title ?? '')),
        );
        const faltan = hojas.filter((h) => !existentes.has(h.titulo));
        if (faltan.length) {
            await apiJson(`${SHEETS}/${enc(libroId)}:batchUpdate`, {
                token,
                method: 'POST',
                body: JSON.stringify({
                    requests: faltan.map((h) => ({ addSheet: { properties: { title: h.titulo } } })),
                }),
            });
        }
        // La cabecera se reescribe siempre: es barata y repara un archivo al que
        // le borraron la primera fila, que si no dejaría los datos sin nombre.
        for (const h of hojas) {
            await apiJson(
                `${SHEETS}/${enc(libroId)}/values/${enc(rango(h.titulo, 'A1'))}?valueInputOption=RAW`,
                { token, method: 'PUT', body: JSON.stringify({ values: [CABECERAS[h.clave]] }) },
            );
        }
    },

    async leerFolios(token, libroId, hoja) {
        const data = await apiJson(
            `${SHEETS}/${enc(libroId)}/values/${enc(rango(hoja.titulo, 'A2:A'))}?majorDimension=COLUMNS`,
            { token },
        );
        const col = data?.values?.[0];
        return Array.isArray(col) ? col.map((v: unknown) => String(v ?? '')) : [];
    },

    async escribirFila(token, libroId, hoja, fila, celdas: Celda[]) {
        const r = rangoFila(hoja.titulo, hoja.clave, fila).replace(`${hoja.titulo}!`, '');
        await apiJson(
            `${SHEETS}/${enc(libroId)}/values/${enc(rango(hoja.titulo, r))}?valueInputOption=USER_ENTERED`,
            { token, method: 'PUT', body: JSON.stringify({ values: [celdas] }) },
        );
    },

    async agregarFila(token, libroId, hoja, celdas: Celda[]) {
        await apiJson(
            `${SHEETS}/${enc(libroId)}/values/${enc(rango(hoja.titulo, 'A1'))}:append`
            + '?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS',
            { token, method: 'POST', body: JSON.stringify({ values: [celdas] }) },
        );
    },
};

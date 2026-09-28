// Excel en OneDrive, por la API de libros de Microsoft Graph.
//
// Graph NO tiene "crear libro": `POST /children` deja un archivo de cero bytes
// que la API de libros rechaza, porque un .xlsx es un paquete zip con su XML
// dentro. Por eso Cord sube una plantilla mínima —un libro válido y vacío de
// 1.9 KB— y a partir de ahí ya trabaja con la API normal. Se genera una sola
// vez y se verifica abriéndola; no es un blob traído de internet.

import { CABECERAS, type Celda } from './columnas';
import { apiJson, HojaError, type ClienteHoja, type HojaRef, type LibroCreado, type TokensHoja } from './cliente';
import { credencialesHoja, EXCEL_SCOPES, MS_GRAPH, MS_LOGIN } from './config';

const LIBRO_VACIO_B64 =
    + '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'
    + 'ZXMueG1sUEsFBgAAAAAGAAYAgAEAANYFAAAAAA==';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
/** La hoja que trae la plantilla; se borra en cuanto existen las de Cord. */
const HOJA_PLANTILLA = 'Cord';

const enc = (v: string) => encodeURIComponent(v);
const hojaUrl = (libroId: string, titulo: string) =>
    `${MS_GRAPH}/me/drive/items/${enc(libroId)}/workbook/worksheets/${enc(titulo)}`;

export function excelAuthorizeUrl(redirectUri: string, state: string): string | null {
    const creds = credencialesHoja('excel');
    if (!creds) return null;
    const url = new URL(`${MS_LOGIN}/authorize`);
    url.searchParams.set('client_id', creds.clientId);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_mode', 'query');
    url.searchParams.set('scope', EXCEL_SCOPES);
    url.searchParams.set('state', state);
    return url.toString();
}

async function tokenRequest(params: Record<string, string>): Promise<TokensHoja> {
    const creds = credencialesHoja('excel');
    if (!creds) throw new HojaError('auth', 'sin credenciales');
    const data = await apiJson(`${MS_LOGIN}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: creds.clientId, client_secret: creds.clientSecret, scope: EXCEL_SCOPES, ...params,
        }).toString(),
    });
    if (!data?.access_token) throw new HojaError('auth');
    return {
        accessToken: String(data.access_token),
        refreshToken: data.refresh_token ? String(data.refresh_token) : null,
        expiresIn: Number(data.expires_in) || 3600,
        cuenta: null,
        scopes: String(data.scope || EXCEL_SCOPES).split(' ').filter(Boolean),
    };
}

export const excelExchange = (code: string, redirectUri: string) =>
    tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri });

export const excelRefresh = (refreshToken: string) =>
    tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken });

export async function excelCuenta(token: string): Promise<string | null> {
    try {
        const yo = await apiJson(`${MS_GRAPH}/me?$select=mail,userPrincipalName`, { token });
        const correo = yo?.mail || yo?.userPrincipalName;
        return typeof correo === 'string' && correo.includes('@') ? correo.slice(0, 254) : null;
    } catch {
        return null;
    }
}

/** Fila y columna finales que ya tienen algo, para saber dónde va la siguiente. */
async function filasUsadas(token: string, libroId: string, titulo: string): Promise<number> {
    try {
        const r = await apiJson(`${hojaUrl(libroId, titulo)}/usedRange(valuesOnly=true)?$select=rowIndex,rowCount`, { token });
        const inicio = Number(r?.rowIndex) || 0;
        const cuantas = Number(r?.rowCount) || 0;
        return inicio + cuantas;
    } catch (err) {
        // Una hoja completamente vacía no tiene rango usado y el proveedor
        // responde error: eso es cero filas, no una falla.
        if (err instanceof HojaError && err.motivo === 'proveedor') return 0;
        throw err;
    }
}

const direccion = (clave: keyof typeof CABECERAS, fila: number) => {
    const ultima = CABECERAS[clave].length;
    let n = ultima;
    let letra = '';
    while (n > 0) {
        letra = String.fromCharCode(65 + ((n - 1) % 26)) + letra;
        n = Math.floor((n - 1) / 26);
    }
    return `A${fila}:${letra}${fila}`;
};

export const excel: ClienteHoja = {
    urlDelLibro: (libroId) => `https://onedrive.live.com/edit?id=${encodeURIComponent(libroId)}`,

    async crearLibro(token, nombre, hojas): Promise<LibroCreado> {
        const ruta = `${MS_GRAPH}/me/drive/root:/${enc(`${nombre}.xlsx`)}:/content`
            + '?%40microsoft.graph.conflictBehavior=rename';
        let res: Response;
        try {
            res = await fetch(ruta, {
                method: 'PUT',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': XLSX_MIME },
                body: Buffer.from(LIBRO_VACIO_B64, 'base64'),
            });
        } catch {
            throw new HojaError('red');
        }
        if (res.status === 401) throw new HojaError('auth');
        if (res.status === 403) throw new HojaError('permiso');
        if (!res.ok) throw new HojaError('proveedor', String(res.status));
        const item = await res.json().catch(() => null);
        const id = item?.id;
        if (!id) throw new HojaError('proveedor', 'sin id');
        await this.prepararPestanas(token, String(id), hojas);
        return { id: String(id), url: String(item.webUrl || this.urlDelLibro(String(id))) };
    },

    async prepararPestanas(token, libroId, hojas) {
        const lista = await apiJson(`${MS_GRAPH}/me/drive/items/${enc(libroId)}/workbook/worksheets?$select=name`, { token });
        const existentes = new Set<string>((lista?.value ?? []).map((h: any) => String(h?.name ?? '')));
        for (const h of hojas) {
            if (!existentes.has(h.titulo)) {
                await apiJson(`${MS_GRAPH}/me/drive/items/${enc(libroId)}/workbook/worksheets/add`, {
                    token, method: 'POST', body: JSON.stringify({ name: h.titulo }),
                });
            }
            await apiJson(`${hojaUrl(libroId, h.titulo)}/range(address='${direccion(h.clave, 1)}')`, {
                token, method: 'PATCH', body: JSON.stringify({ values: [CABECERAS[h.clave]] }),
            });
        }
        // La hoja de la plantilla sobra en cuanto existen las de Cord, y un libro
        // no puede quedarse sin ninguna: por eso se borra al final.
        if (existentes.has(HOJA_PLANTILLA) && !hojas.some((h) => h.titulo === HOJA_PLANTILLA)) {
            await apiJson(hojaUrl(libroId, HOJA_PLANTILLA), { token, method: 'DELETE' }).catch(() => null);
        }
    },

    async leerFolios(token, libroId, hoja) {
        try {
            const r = await apiJson(`${hojaUrl(libroId, hoja.titulo)}/usedRange(valuesOnly=true)?$select=values`, { token });
            const filas = Array.isArray(r?.values) ? r.values : [];
            return filas.slice(1).map((f: unknown[]) => String(f?.[0] ?? ''));
        } catch (err) {
            if (err instanceof HojaError && err.motivo === 'proveedor') return [];
            throw err;
        }
    },

    async escribirFila(token, libroId, hoja, fila, celdas: Celda[]) {
        await apiJson(`${hojaUrl(libroId, hoja.titulo)}/range(address='${direccion(hoja.clave, fila)}')`, {
            token, method: 'PATCH', body: JSON.stringify({ values: [celdas] }),
        });
    },

    async agregarFila(token, libroId, hoja, celdas: Celda[]) {
        const usadas = await filasUsadas(token, libroId, hoja.titulo);
        await this.escribirFila(token, libroId, hoja, Math.max(2, usadas + 1), celdas);
    },
};

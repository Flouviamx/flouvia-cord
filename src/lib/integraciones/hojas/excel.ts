// Excel en OneDrive, por la API de libros de Microsoft Graph.
//
// Graph NO tiene "crear libro": `POST /children` deja un archivo de cero bytes
// que la API de libros rechaza, porque un .xlsx es un paquete zip con su XML
// dentro. Por eso Cord sube una plantilla —un libro válido y vacío de 4.7 KB— y
// a partir de ahí trabaja con la API normal.
//
// La plantilla la genera una librería de hojas de cálculo, NO está armada a
// mano. Un paquete mínimo escrito a mano abre en lectores tolerantes y Excel lo
// rechaza con "el formato no coincide con la extensión": le faltan `docProps`,
// el tema al que apunta `styles.xml` y un `styles.xml` completo. Ahorrar tres
// kilobytes no vale un archivo que el dueño no puede abrir.

import { CABECERAS, columnasMonto, type Celda } from './columnas';
import { apiJson, HojaError, type ClienteHoja, type HojaRef, type LibroCreado, type TokensHoja } from './cliente';
import { credencialesHoja, EXCEL_SCOPES, MS_GRAPH, MS_LOGIN } from './config';

// El '' inicial NO es decorativo: sin él, el primer `+` es un más UNARIO que
// convierte la primera línea en NaN y se pierde entera, y el decodificador de
// base64 se traga lo inválido sin quejarse. El archivo subía corrupto.
export const LIBRO_VACIO_B64 = ''
    + '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';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
/** La hoja que trae la plantilla; se borra en cuanto existen las de Cord. */
const HOJA_PLANTILLA = 'Cord';

const enc = (v: string) => encodeURIComponent(v);

/**
 * Un `.xlsx` recién subido NO acepta la API de libros de inmediato: Graph
 * responde 5xx mientras termina de procesarlo, y también limita por ritmo. Los
 * dos casos llegan aquí como `limite` y los dos se arreglan esperando, así que
 * se reintenta con espera creciente en vez de dar la conexión por rota.
 *
 * Solo envuelve llamadas repetibles sin consecuencia: listar hojas, reescribir
 * la misma cabecera, dar formato. Nada que cree algo nuevo.
 */
async function conReintento<T>(fn: () => Promise<T>, intentos = 4): Promise<T> {
    let ultimo: unknown;
    for (let i = 0; i < intentos; i += 1) {
        try {
            return await fn();
        } catch (err) {
            ultimo = err;
            if (!(err instanceof HojaError) || err.motivo !== 'limite') throw err;
            await new Promise((r) => setTimeout(r, 1000 * 2 ** i));
        }
    }
    throw ultimo;
}
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
        const r = await apiJson(`${hojaUrl(libroId, titulo)}/usedRange(valuesOnly=true)`, { token });
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

function letraDe(numero: number): string {
    let n = numero;
    let letra = '';
    while (n > 0) {
        letra = String.fromCharCode(65 + ((n - 1) % 26)) + letra;
        n = Math.floor((n - 1) / 26);
    }
    return letra;
}

const direccion = (clave: keyof typeof CABECERAS, fila: number) =>
    `A${fila}:${letraDe(CABECERAS[clave].length)}${fila}`;

/**
 * El nombre de la tabla sale de la CLAVE, no del título traducido: Excel no
 * admite espacios ni acentos en el nombre de una tabla, y además el título
 * cambia con el idioma de la organización.
 */
const nombreTabla = (clave: keyof typeof CABECERAS) =>
    clave === 'cotizaciones' ? 'CordCotizaciones' : 'CordFacturas';

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
        // Las pestañas NO se preparan aquí. El relleno que corre después ya lo
        // hace, y hacerlo también en este punto obligaba a la persona a esperar
        // frente al proveedor a que el libro estuviera listo — y si no lo
        // estaba, tiraba la conexión entera por algo que se resuelve solo.
        void hojas;
        return { id: String(id), url: String(item.webUrl || this.urlDelLibro(String(id))) };
    },

    async prepararPestanas(token, libroId, hojas) {
        const lista = await conReintento(() => apiJson(
            `${MS_GRAPH}/me/drive/items/${enc(libroId)}/workbook/worksheets`, { token },
        ));
        const existentes = new Set<string>((lista?.value ?? []).map((h: any) => String(h?.name ?? '')));
        for (const h of hojas) {
            if (!existentes.has(h.titulo)) {
                await apiJson(`${MS_GRAPH}/me/drive/items/${enc(libroId)}/workbook/worksheets/add`, {
                    token, method: 'POST', body: JSON.stringify({ name: h.titulo }),
                });
            }
            await conReintento(() => apiJson(`${hojaUrl(libroId, h.titulo)}/range(address='${direccion(h.clave, 1)}')`, {
                token, method: 'PATCH', body: JSON.stringify({ values: [h.cabeceras] }),
            }));

            // Lo idiomático de Excel no es un rango con datos: es una TABLA.
            // Da filtros, bandas, encabezado fijo al desplazar y fórmulas por
            // nombre de columna (`=SUMA(CordCotizaciones[total])`), que es como
            // de verdad se trabaja ahí. Si ya existe, no se toca.
            const tabla = nombreTabla(h.clave);
            const tablas = await apiJson(
                `${MS_GRAPH}/me/drive/items/${enc(libroId)}/workbook/tables`, { token },
            ).catch(() => null);
            const existeTabla = (tablas?.value ?? []).some((t: any) => String(t?.name ?? '') === tabla);
            if (!existeTabla) {
                const creada = await apiJson(`${hojaUrl(libroId, h.titulo)}/tables/add`, {
                    token, method: 'POST',
                    body: JSON.stringify({ address: direccion(h.clave, 1), hasHeaders: true }),
                }).catch(() => null);
                if (creada?.id) {
                    await apiJson(`${MS_GRAPH}/me/drive/items/${enc(libroId)}/workbook/tables/${enc(String(creada.id))}`, {
                        token, method: 'PATCH', body: JSON.stringify({ name: tabla }),
                    }).catch(() => null);
                }
            }

            // Los importes con formato de número: una columna de dinero que se
            // ve como texto plano no se lee, y es lo primero que nota quien abre.
            for (const col of columnasMonto(h.clave)) {
                const letra = letraDe(col + 1);
                await apiJson(`${hojaUrl(libroId, h.titulo)}/range(address='${letra}2:${letra}1000')/format`, {
                    token, method: 'PATCH', body: JSON.stringify({ numberFormat: '#,##0.00' }),
                }).catch(() => null);
            }
            await apiJson(`${hojaUrl(libroId, h.titulo)}/usedRange/format/autofitColumns`, {
                token, method: 'POST', body: '{}',
            }).catch(() => null);
        }
        // La hoja de la plantilla sobra en cuanto existen las de Cord, y un libro
        // no puede quedarse sin ninguna: por eso se borra al final.
        if (existentes.has(HOJA_PLANTILLA) && !hojas.some((h) => h.titulo === HOJA_PLANTILLA)) {
            await apiJson(hojaUrl(libroId, HOJA_PLANTILLA), { token, method: 'DELETE' }).catch(() => null);
        }
    },

    async leerFolios(token, libroId, hoja) {
        try {
            const r = await apiJson(`${hojaUrl(libroId, hoja.titulo)}/usedRange(valuesOnly=true)`, { token });
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
        // Se agrega POR la tabla: escribir en el rango de abajo dejaría la fila
        // fuera de ella, sin filtro ni banda, y las fórmulas por nombre de
        // columna no la contarían. Si la tabla no existe, se cae al rango.
        const porTabla = await apiJson(
            `${MS_GRAPH}/me/drive/items/${enc(libroId)}/workbook/tables/${enc(nombreTabla(hoja.clave))}/rows/add`,
            { token, method: 'POST', body: JSON.stringify({ values: [celdas] }) },
        ).catch(() => null);
        if (porTabla) return;
        const usadas = await filasUsadas(token, libroId, hoja.titulo);
        await this.escribirFila(token, libroId, hoja, Math.max(2, usadas + 1), celdas);
    },
};

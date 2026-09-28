// Lo que Cord necesita saber hacer sobre una hoja, sin importar de quién sea.
// Google y Microsoft exponen APIs muy distintas; todo lo de arriba habla contra
// esta interfaz para que el motor de sincronización se escriba una sola vez.

import type { Celda, Pestana } from './columnas';

export interface TokensHoja {
    accessToken: string;
    refreshToken: string | null;
    /** Segundos de vida del access token, tal como los reporta el proveedor. */
    expiresIn: number;
    /** Correo con el que se autorizó: identifica al dueño del archivo. */
    cuenta: string | null;
    scopes: string[];
}

export interface LibroCreado {
    id: string;
    url: string;
}

/**
 * Una pestaña del archivo: su clave interna decide las columnas y su título es
 * el que ve la persona. Van juntos porque el título se traduce al idioma de la
 * organización y se guarda en la conexión — renombrarlo a mano del lado del
 * proveedor rompería la búsqueda del folio, y por eso el título es un dato, no
 * una constante del código.
 */
export interface HojaRef {
    clave: Pestana;
    titulo: string;
}

export interface ClienteHoja {
    crearLibro(token: string, nombre: string, hojas: HojaRef[]): Promise<LibroCreado>;
    /** Crea las pestañas que falten y escribe la cabecera. Idempotente. */
    prepararPestanas(token: string, libroId: string, hojas: HojaRef[]): Promise<void>;
    /** Los folios de la columna A, en orden, sin la cabecera. */
    leerFolios(token: string, libroId: string, hoja: HojaRef): Promise<string[]>;
    /** `fila` es el número de fila real de la hoja (la cabecera es la 1). */
    escribirFila(token: string, libroId: string, hoja: HojaRef, fila: number, celdas: Celda[]): Promise<void>;
    agregarFila(token: string, libroId: string, hoja: HojaRef, celdas: Celda[]): Promise<void>;
    urlDelLibro(libroId: string): string;
}

/** Un fallo del proveedor nunca viaja con su texto crudo hacia el usuario (regla 14). */
export class HojaError extends Error {
    constructor(readonly motivo: 'auth' | 'permiso' | 'limite' | 'red' | 'proveedor', readonly detalle?: string) {
        super(motivo);
        this.name = 'HojaError';
    }
}

const TIMEOUT_MS = 15_000;

export async function apiJson(
    url: string,
    init: RequestInit & { token?: string } = {},
): Promise<any> {
    const { token, headers, ...resto } = init;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    let res: Response;
    try {
        res = await fetch(url, {
            ...resto,
            signal: ctrl.signal,
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                ...(headers as Record<string, string> | undefined),
            },
        });
    } catch {
        throw new HojaError('red');
    } finally {
        clearTimeout(t);
    }

    if (res.status === 401) throw new HojaError('auth');
    if (res.status === 403) throw new HojaError('permiso');
    if (res.status === 429 || res.status >= 500) throw new HojaError('limite');
    if (!res.ok) throw new HojaError('proveedor', `${res.status}`);

    if (res.status === 204) return null;
    const texto = await res.text();
    if (!texto) return null;
    try {
        return JSON.parse(texto);
    } catch {
        throw new HojaError('proveedor', 'respuesta ilegible');
    }
}

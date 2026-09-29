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
    cabeceras: readonly string[];
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

/**
 * Un fallo del proveedor nunca viaja con su texto crudo hacia el usuario
 * (regla 14). Es el error compartido de las integraciones, con el nombre que ya
 * usaba este módulo.
 */
export { ProveedorError as HojaError, apiJson } from '../proveedor-http';

import type { DbRow } from './db';

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const str = (v: unknown) => (v === null || v === undefined || v === '' ? null : String(v));
const day = (v: unknown) => (v ? new Date(v as string).toISOString().slice(0, 10) : null);

export function clientEventData(c: DbRow) {
    return {
        id: c.id as string,
        object: 'client',
        empresa: c.empresa as string,
        contacto: str(c.contacto),
        email: str(c.email),
        telefono: str(c.telefono),
        rfc: str(c.rfc),
        terminos: str(c.terminos_default),
        country_code: str(c.country_code),
    };
}

export function productEventData(p: DbRow) {
    return {
        id: p.id as string,
        object: 'product',
        sku: str(p.sku),
        nombre: p.nombre as string,
        unidad: str(p.unidad),
        precio_lista: num(p.precio_lista),
        activo: p.activo !== false,
    };
}

/**
 * Valores ANTERIORES que viajan con un evento de actualización. Solo los campos
 * sobre los que una automatización decide algo: el payload de un evento no es
 * un diff completo de la fila, y un "antes" de cada columna sería ruido que
 * además queda guardado para siempre en `domain_events`.
 */
export function clientPrevData(c: DbRow | undefined) {
    if (!c) return {};
    return {
        empresa_anterior: str(c.empresa),
        email_anterior: str(c.email),
        terminos_anterior: str(c.terminos_default),
    };
}

export function productPrevData(p: DbRow | undefined) {
    if (!p) return {};
    return {
        precio_lista_anterior: num(p.precio_lista),
        activo_anterior: p.activo !== false,
    };
}

export function taskEventData(t: DbRow) {
    return {
        id: t.id as string,
        object: 'task',
        titulo: t.titulo as string,
        due_date: day(t.due_date),
        done: t.done === true,
        cotizacion_id: str(t.cotizacion_id),
    };
}

export function promiseEventData(p: DbRow) {
    return {
        id: p.id as string,
        object: 'promise',
        cotizacion_id: p.cotizacion_id as string,
        fecha_promesa: day(p.fecha_promesa),
        monto: num(p.monto),
        estado: str(p.estado),
    };
}

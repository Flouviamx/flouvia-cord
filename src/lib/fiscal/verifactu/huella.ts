// Huella (hash) de un registro Verifactu — algoritmo del artículo 13 de la
// Orden que desarrolla el Reglamento VERI*FACTU (RD 1007/2023).
//
// Puro y sin acceso a base de datos a propósito, mismo patrón que impuestos.ts
// vs impuestos-db.ts: esto lo tiene que poder ejecutar `security:verifactu`
// contra los vectores OFICIALES de la AEAT sin tocar la red ni Neon.
//
// Verificado el 23-ago-2026 contra el documento oficial "Detalle de las
// especificaciones técnicas para la generación de la huella o hash de los
// registros de facturación" (Departamento de Informática Tributaria, AEAT,
// v0.1.2) — los tres ejemplos de ese documento (§6.1, §6.2, §6.3) se
// reproducen como vectores de prueba en verifactu-check.mjs y ya se
// verificaron a mano con Node antes de escribir este archivo: los tres
// SHA-256 coinciden byte por byte con los publicados por la AEAT.
//
// Antes de activar el envío real a producción, re-confirma este documento
// contra la versión VIGENTE en sede.agenciatributaria.gob.es — la AEAT
// versiona el documento (esta implementación se basa en la v0.1.2) y un
// campo añadido o reordenado invalidaría toda la cadena ya generada.

import { createHash } from 'node:crypto';

/**
 * Serializa pares campo=valor con el formato EXACTO que exige la AEAT:
 * `nombreCampo1=valorCampo1&nombreCampo2=valorCampo2&...`. Un campo sin
 * valor (el caso del primer registro, sin huella anterior) se serializa como
 * `nombreCampo=` — el nombre y el `=`, sin nada después. Nunca se omite el
 * campo completo: el número de `&` en la cadena es siempre el mismo.
 */
function serialize(pairs: [string, string | null | undefined][]): string {
    return pairs.map(([key, value]) => `${key}=${value ?? ''}`).join('&');
}

/** SHA-256 de la cadena en UTF-8, hex, MAYÚSCULAS, 64 caracteres. */
function sha256Hex(input: string): string {
    return createHash('sha256').update(input, 'utf8').digest('hex').toUpperCase();
}

export interface HuellaAltaInput {
    idEmisorFactura: string;
    numSerieFactura: string;
    /** dd-mm-aaaa — el formato exacto que exige la AEAT, no ISO. */
    fechaExpedicionFactura: string;
    /** F1, F2, F3, R1..R5 — códigos de tipo de factura del Reglamento. */
    tipoFactura: string;
    /** Como aparecería en el XML: string numérico, 2 decimales recomendado. */
    cuotaTotal: string;
    importeTotal: string;
    /** Huella del registro anterior de ESTA org. `null`/`''` en el primero. */
    huellaAnterior: string | null;
    /** ISO 8601 CON offset explícito: 2026-01-01T19:20:30+01:00 (nunca "Z"). */
    fechaHoraHusoGenRegistro: string;
}

export interface HuellaAnulacionInput {
    idEmisorFacturaAnulada: string;
    numSerieFacturaAnulada: string;
    fechaExpedicionFacturaAnulada: string;
    huellaAnterior: string | null;
    fechaHoraHusoGenRegistro: string;
}

/** Cadena exacta que se firma para un registro de ALTA — expuesta para poder probarla contra los vectores oficiales sin repetir el hash. */
export function huellaAltaInputString(input: HuellaAltaInput): string {
    return serialize([
        ['IDEmisorFactura', input.idEmisorFactura],
        ['NumSerieFactura', input.numSerieFactura],
        ['FechaExpedicionFactura', input.fechaExpedicionFactura],
        ['TipoFactura', input.tipoFactura],
        ['CuotaTotal', input.cuotaTotal],
        ['ImporteTotal', input.importeTotal],
        ['Huella', input.huellaAnterior],
        ['FechaHoraHusoGenRegistro', input.fechaHoraHusoGenRegistro],
    ]);
}

export function huellaAlta(input: HuellaAltaInput): string {
    return sha256Hex(huellaAltaInputString(input));
}

/** Cadena exacta que se firma para un registro de ANULACIÓN. */
export function huellaAnulacionInputString(input: HuellaAnulacionInput): string {
    return serialize([
        ['IDEmisorFacturaAnulada', input.idEmisorFacturaAnulada],
        ['NumSerieFacturaAnulada', input.numSerieFacturaAnulada],
        ['FechaExpedicionFacturaAnulada', input.fechaExpedicionFacturaAnulada],
        ['Huella', input.huellaAnterior],
        ['FechaHoraHusoGenRegistro', input.fechaHoraHusoGenRegistro],
    ]);
}

export function huellaAnulacion(input: HuellaAnulacionInput): string {
    return sha256Hex(huellaAnulacionInputString(input));
}

/**
 * `dd-mm-aaaa`, el formato de fecha que exige la huella — NO es ISO. Se
 * deriva de un `Date` en hora de MADRID (Europe/Madrid), no en UTC: la
 * factura es española y su fecha de expedición debe leerse en esa zona.
 */
export function fechaExpedicionAEAT(date: Date): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', year: 'numeric',
    }).formatToParts(date);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
    return `${get('day')}-${get('month')}-${get('year')}`;
}

/**
 * ISO 8601 con offset explícito de Madrid (+01:00 invierno, +02:00 verano) —
 * la huella se rompe si aquí se manda "Z" (UTC) en vez del huso real, porque
 * el campo se llama literalmente FechaHoraHuso**GenRegistro**.
 */
export function fechaHoraHusoAEAT(date: Date): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Madrid',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).formatToParts(date);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
    // El offset se deriva comparando la hora de Madrid contra UTC en el mismo
    // instante — más confiable que una tabla de "verano/invierno" a mano.
    const madridMs = new Date(`${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}Z`).getTime();
    const offsetMinutes = Math.round((madridMs - date.getTime()) / 60000);
    const sign = offsetMinutes >= 0 ? '+' : '-';
    const abs = Math.abs(offsetMinutes);
    const oh = String(Math.floor(abs / 60)).padStart(2, '0');
    const om = String(abs % 60).padStart(2, '0');
    return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}${sign}${oh}:${om}`;
}

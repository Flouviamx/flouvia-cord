// Texto, RUT y fechas del DTE.
//
// - El DTE se codifica en ISO-8859-1 (primera línea del envío, instructivo
//   técnico, Anexo 3) y el timbre electrónico se firma sobre bytes ISO-8859-1
//   (Anexo 2, A.2.4: "el SII podría obtener un resultado negativo al verificar
//   la firma electrónica del timbre"). Todo texto que Cord pone en un DTE pasa
//   por `textoLatin1()`: lo que no existe en ISO-8859-1 se translitera o se
//   quita ANTES de firmar, para que el XML, el timbre y el PDF417 digan lo mismo.
// - Escape en el archivo: las cinco entidades predefinidas (Anexo 2, A.2.4:
//   "Empresas A&amp;B Limitada"). El timbre se firma sobre ese mismo texto.
// - El RUT viaja sin puntos, con guion y DV en mayúscula ("76123456-0").
//
// Puro: lo cargan los scripts de contrato con Node plano.

import { validateTaxId } from '../../../../../packages/elements/src/fiscal/tax-id.ts';
import { ZONA_CL } from './constantes.ts';

// ── RUT ──────────────────────────────────────────────────────────────────────

/** RUT válido (dígito verificador) normalizado como lo exige el XSD (RUTType): "76123456-0". */
export function rutValido(value: unknown): string | null {
    const raw = String(value ?? '').trim();
    if (!raw) return null;
    const v = validateTaxId('CL', raw);
    if (!v.ok || v.kind !== 'rut') return null;
    const [cuerpo, dv] = v.normalized.split('-');
    return `${Number(cuerpo)}-${dv}`;
}

/** Cuerpo y dígito verificador por separado (parámetros de los web services). */
export function partesRut(rut: string): { cuerpo: string; dv: string } {
    const [cuerpo, dv] = rut.split('-');
    return { cuerpo, dv };
}

/** "76123456-0" → "76.123.456-0" (recuadro de la representación impresa, manual 1.1.7). */
export function rutConPuntos(rut: string): string {
    const { cuerpo, dv } = partesRut(rut);
    return `${cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${dv}`;
}

// ── Texto ────────────────────────────────────────────────────────────────────

// Equivalencias de puntuación tipográfica fuera de ISO-8859-1 (llegan pegadas
// desde procesadores de texto): se cambian por su forma ASCII.
const EQUIVALENCIAS: Record<string, string> = {
    '‘': "'", '’': "'", '‚': "'", '‛': "'", '“': '"', '”': '"', '„': '"',
    '‐': '-', '‑': '-', '‒': '-', '–': '-', '—': '-', '―': '-', '−': '-',
    '…': '...', '•': '-', '€': 'EUR', '™': 'TM',
    ' ': ' ', ' ': ' ', ' ': ' ', ' ': ' ', '​': '', '‌': '', '‍': '', '﻿': '',
};

// Controles C0/C1 (salvo tab y salto de línea): XML 1.0 no los admite o el
// esquema del SII los rechaza.
const CONTROLES = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;

/**
 * Texto representable en ISO-8859-1. Lo que falta se translitera (comillas
 * tipográficas, guiones largos, letras con diacríticos fuera del juego) o se
 * quita (emojis, otros alfabetos). Nunca se agrega texto.
 */
export function textoLatin1(value: unknown): string {
    let out = '';
    for (const ch of String(value ?? '').normalize('NFC').replace(CONTROLES, '')) {
        const cp = ch.codePointAt(0)!;
        if (cp <= 0xff) { out += ch; continue; }
        if (ch in EQUIVALENCIAS) { out += EQUIVALENCIAS[ch]; continue; }
        const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
        if (base && [...base].every((c) => c.codePointAt(0)! <= 0xff)) out += base;
    }
    return out;
}

/**
 * Texto de un campo del DTE: Latin-1, en una línea y recortado al largo del
 * esquema. Los espacios internos se respetan: el timbre repite la razón social
 * tal como va en el encabezado (ejemplo oficial F60T33: "EMPRESA  LTDA").
 */
export function campo(value: unknown, largo: number): string {
    return textoLatin1(value).replace(/[\r\n\t]+/g, ' ').trim().slice(0, largo).trim();
}

/** Texto largo (descripción de un ítem): conserva los saltos de línea. */
export function campoLargo(value: unknown, largo: number): string {
    return textoLatin1(value).replace(/\r\n?/g, '\n').replace(/\t/g, ' ').trim().slice(0, largo).trim();
}

/** Escape del archivo: las cinco entidades predefinidas de XML (instructivo, Anexo 2, A.2.4). */
export function escXml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/** Escape de texto de la canonicalización C14N 1.0 (W3C, §2.3). */
export function escC14nTexto(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r/g, '&#xD;');
}

/** Escape de un valor de atributo de la canonicalización C14N 1.0. */
export function escC14nAtributo(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
        .replace(/\t/g, '&#x9;').replace(/\n/g, '&#xA;').replace(/\r/g, '&#xD;');
}

/** Bytes ISO-8859-1 de un texto que ya pasó por textoLatin1(). Lanza si queda algo fuera del juego. */
export function bytesLatin1(texto: string): Buffer {
    for (const ch of texto) {
        if (ch.codePointAt(0)! > 0xff) throw new Error(`sii: carácter fuera de ISO-8859-1 en un DTE (U+${ch.codePointAt(0)!.toString(16)})`);
    }
    return Buffer.from(texto, 'latin1');
}

/** Base64 en líneas de a lo más 76 caracteres (instructivo, Anexo 3, A 3.1). */
export function base64Lineas(bytes: Uint8Array | string): string {
    const b64 = typeof bytes === 'string' ? bytes : Buffer.from(bytes).toString('base64');
    return b64.replace(/(.{76})(?=.)/g, '$1\n');
}

// ── Fechas (hora de Chile) ───────────────────────────────────────────────────

function partesChile(instante: Date) {
    const partes = new Intl.DateTimeFormat('en-CA', {
        timeZone: ZONA_CL, hourCycle: 'h23',
        year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(instante);
    const v = (t: string) => partes.find((p) => p.type === t)?.value ?? '';
    return { y: v('year'), m: v('month'), d: v('day'), h: v('hour'), mi: v('minute'), s: v('second') };
}

/** AAAA-MM-DD del día en Chile (FchEmis, FE del timbre). */
export function fechaChile(instante: Date): string {
    const p = partesChile(instante);
    return `${p.y}-${p.m}-${p.d}`;
}

/** AAAA-MM-DDTHH:MM:SS en hora de Chile (TSTED, TmstFirma, TmstFirmaEnv). */
export function fechaHoraChile(instante: Date): string {
    const p = partesChile(instante);
    return `${p.y}-${p.m}-${p.d}T${p.h}:${p.mi}:${p.s}`;
}

/** 'aaaa-mm-dd' válido o null. */
export function fechaIso(value: unknown): string | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? ''));
    if (!m) return null;
    const d = new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === `${m[1]}-${m[2]}-${m[3]}` ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** 'aaaa-mm-dd' → 'dd/mm/aaaa' (impresión). */
export const fechaDma = (iso: string | null | undefined) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ''));
    return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
};

/** 'aaaa-mm-dd' más n meses de calendario (el día se topa al último del mes). */
export function sumarMeses(iso: string, meses: number): string {
    const [y, m, d] = iso.split('-').map(Number);
    const total = y * 12 + (m - 1) + meses;
    const ny = Math.floor(total / 12);
    const nm = total % 12;
    const ultimo = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
    return `${ny}-${String(nm + 1).padStart(2, '0')}-${String(Math.min(d, ultimo)).padStart(2, '0')}`;
}

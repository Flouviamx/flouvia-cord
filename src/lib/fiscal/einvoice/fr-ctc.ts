// Francia: lo que la reforma de la facturación electrónica (CTC) pide a la
// factura que Cord genera, además de EN 16931.
//
// Fuentes primarias, verificadas en oct 2026:
//   - DGFiP, Spécifications externes v3.2 (30/04/2026): Dossier général,
//     Annexe 1 (formato semántico del flujo 1) y Annexe 7 v1.9 (reglas de
//     gestión G1.xx / G6.xx / G7.xx);
//   - FNFE-MPE, schematrons "BR-FR" del flujo 2 v1.4.0.04 (04/09/2026), que
//     implementan las reglas BR-FR de la norma AFNOR XP Z12-012 v1.4. Los
//     corre `npm run security:einvoice` sobre las muestras francesas.
//
// Las cuatro menciones nuevas que la DGFiP enumera (FAQ "Tout savoir sur la
// facturation électronique", ago 2026): SIREN del cliente, categoría de la
// operación (bienes, servicios o ambas), la opción de pagar la TVA sobre los
// débitos y la dirección de entrega si difiere de la del cliente. Aquí se
// derivan del snapshot del documento; `model.ts` las escribe y
// `frCtcProblems` dice qué falta para transmitir la factura por una
// plataforma autorizada.
//
// Puro: sin base de datos ni red. Lo cargan vitest y los checks con Node.

import type { FiscalAddress, FiscalLineItem, FiscalParty } from '../index';
import { checkTaxId } from '../../../../packages/elements/src/fiscal/tax-id';

/**
 * Cadre de facturation (BT-23), Annexe 7 G1.02 y BR-FR-08: B1 bienes, S1
 * prestación de servicios, M1 factura doble (bienes y servicios que no son
 * accesorios unos de otros). Los demás (ya pagada, después de anticipo,
 * subcontratación, multi-vendedor…) describen flujos que Cord no emite.
 */
export type CadreFacturation = 'B1' | 'S1' | 'M1';

/**
 * Qué tratamiento recibe la operación (nota BAR de BR-FR-20):
 *   B2B    → facturación electrónica entre empresas establecidas en Francia;
 *   B2BINT → e-reporting de la operación con una empresa extranjera;
 *   B2C    → e-reporting agregado de las ventas a particulares.
 */
export type FluxFr = 'B2B' | 'B2BINT' | 'B2C';

/**
 * Tasas de TVA admitidas, en porcentaje (Annexe 7 G1.24; BR-FR-16 del
 * schematron FNFE v1.4.0.04, función `custom:is-valid-vat-rate`).
 */
export const FR_VAT_RATES: readonly number[] = [0, 0.9, 1.05, 1.75, 2.1, 5.5, 7, 8.5, 9.2, 9.6, 10, 13, 19.6, 20, 20.6];

/** Identificador de factura: hasta 35 caracteres y solo `A-Za-z0-9 + - _ /` (G1.05, BR-FR-01/02). */
export const FR_INVOICE_ID = /^[A-Za-z0-9+\-_/]{1,35}$/;

const clean = (v: unknown) => String(v ?? '').trim();

/** Porcentaje desde la fracción del snapshot (0.055 → 5.5), sin ruido de coma flotante. */
export const pctDe = (fraction: number) => Math.round(Number(fraction) * 1e6) / 1e4;

export function tasaFrancesa(fraction: number): boolean {
    const pct = pctDe(fraction);
    return FR_VAT_RATES.some((r) => Math.abs(r - pct) < 1e-9);
}

/** SIREN (9 dígitos) y, si lo hay, SIRET de una parte francesa. */
export function sirenDe(party: FiscalParty | null | undefined): { siren: string; siret?: string } | null {
    if (!party) return null;
    const candidatos = [clean(party.legalRegistrationId?.id), clean(party.taxId)].filter(Boolean);
    for (const raw of candidatos) {
        const c = checkTaxId('FR', raw);
        if (!c.ok || !c.kind) continue;
        const n = c.normalized.replace(/\s+/g, '');
        if (c.kind === 'siren') return { siren: n };
        if (c.kind === 'siret') return { siren: n.slice(0, 9), siret: n };
        if (c.kind === 'tva') return { siren: n.slice(4) };
    }
    return null;
}

/**
 * El tratamiento de una factura de un emisor francés, o `null` si el emisor
 * no está en Francia. Un cliente francés con SIREN es una empresa: su factura
 * va por la red de plataformas (B2B). Sin SIREN es un particular (B2C). Fuera
 * de Francia, con identificador fiscal es una empresa extranjera (B2BINT) y
 * sin él, un particular.
 */
export function fluxFr(issuer: FiscalParty | null | undefined, recipient: FiscalParty | null | undefined): FluxFr | null {
    if (clean(issuer?.address?.countryCode).toUpperCase() !== 'FR') return null;
    const cc = clean(recipient?.address?.countryCode).toUpperCase() || 'FR';
    if (cc === 'FR') return sirenDe(recipient) ? 'B2B' : 'B2C';
    return clean(recipient?.taxId) ? 'B2BINT' : 'B2C';
}

/** B1, S1 o M1 según la naturaleza de las líneas; `null` si alguna no la declara. */
export function cadreDe(lines: readonly Pick<FiscalLineItem, 'nature'>[]): CadreFacturation | null {
    if (!lines.length) return null;
    let bienes = false;
    let servicios = false;
    for (const l of lines) {
        if (l.nature === 'goods') bienes = true;
        else if (l.nature === 'services') servicios = true;
        else return null;
    }
    return bienes && servicios ? 'M1' : bienes ? 'B1' : 'S1';
}

/**
 * La dirección de entrega solo se declara si difiere de la del cliente
 * (G6.16) y nunca en una prestación de servicios ("Ces données ne sont pas à
 * transmettre pour les prestations de service").
 */
export function entregaDistinta(entrega: FiscalAddress | null | undefined, cliente: FiscalAddress | null | undefined): boolean {
    if (!entrega) return false;
    const norm = (a: FiscalAddress | null | undefined) => [a?.line1, a?.line2, a?.city, a?.postalCode, a?.countryCode]
        .map((v) => clean(v).toLowerCase().replace(/\s+/g, ' ')).join('|');
    return norm(entrega) !== norm(cliente);
}

/** Decimales escritos de un número (para BR-FR-DEC-02: cantidades con 4 como máximo). */
export function decimales(n: number): number {
    const s = String(Number(n));
    if (/e-/i.test(s)) return Number(s.split(/e-/i)[1]) + (s.split('.')[1]?.split(/e/i)[0].length ?? 0);
    return s.includes('.') ? s.split('.')[1].length : 0;
}

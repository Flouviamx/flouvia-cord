// Constructor ÚNICO de las opciones de impuesto que ve el vendedor.
//
// Existía uno por superficie: el editor de facturas armaba su lista desde el
// catálogo, y el de cotizaciones ni siquiera la armaba —leía la columna plana
// `orgs.iva_pct`—, así que configurar "IVA 8% frontera" o "Exento" en Ajustes
// no cambiaba nada en una cotización. Con un constructor por camino es cuestión
// de tiempo que alguno se quede con el vocabulario equivocado o sin la opción
// exenta; con uno solo, las dos superficies dicen lo mismo por construcción.

import type { ImpuestoRow, TaxKind } from './queries';
import { taxKindLabel, taxPresetsFor } from './countries.ts';

export interface TaxOption {
    /** Id del perfil del catálogo; null en las opciones sintéticas. */
    id: string | null;
    label: string;
    /** Fracción 0–1, lista para el motor. Nunca porcentaje. */
    rate: number;
    kind: TaxKind;
}

/**
 * Opciones de impuesto de CONSUMO para el selector por línea.
 *
 * Invariantes que esta función garantiza y que ninguna superficie debe repetir:
 *   · "Exento" siempre está disponible — es el caso que una tasa única global
 *     no podía representar, y es legal en todos lados.
 *   · Las retenciones NO aparecen aquí: no se eligen por línea, se aplican al
 *     documento (ver `retencionesFrom`).
 *   · Si el catálogo está vacío, se cae a la tasa plana heredada de la org para
 *     que una cuenta vieja no se quede sin poder cotizar.
 */
export function buildTaxOptions(
    impuestos: ImpuestoRow[],
    opts: { locale: 'es' | 'en'; countryCode: string; orgTaxRate?: number },
): TaxOption[] {
    const { locale, countryCode } = opts;
    const options: TaxOption[] = impuestos
        .filter((i) => i.activo && i.kind !== 'retencion')
        .map((i) => ({
            id: i.id,
            // El nombre del perfil manda: lo escribió el negocio y es lo que
            // reconoce en su propia factura ("Moms 25%", "ITBIS 18%").
            label: i.nombre,
            rate: i.rate,
            kind: i.kind,
        }));

    // Tasa plana heredada: solo si el catálogo no la cubre ya.
    const orgRate = Number(opts.orgTaxRate) || 0;
    if (orgRate > 0 && !options.some((o) => close(o.rate, orgRate / 100))) {
        options.unshift({
            id: null,
            label: `${taxKindLabel('consumo', locale, countryCode)} ${orgRate}%`,
            rate: orgRate / 100,
            kind: 'consumo',
        });
    }

    if (!options.some((o) => close(o.rate, 0))) {
        options.push({
            id: null,
            label: taxKindLabel('exento', locale, countryCode),
            rate: 0,
            kind: 'exento',
        });
    }

    return options.sort((a, b) => a.rate - b.rate);
}

/** Tasa que traen las líneas nuevas: el perfil default, o la plana heredada. */
export function defaultTaxRate(impuestos: ImpuestoRow[], orgTaxRate?: number): number {
    const def = impuestos.find((i) => i.activo && i.esDefault && i.kind === 'consumo');
    if (def) return def.rate;
    return (Number(orgTaxRate) || 0) / 100;
}

/**
 * Retenciones que aplican al documento, en la forma del motor.
 *
 * Se toman los perfiles marcados como predeterminados: una retención es una
 * política del negocio (o de su régimen), no una decisión línea por línea.
 */
export function retencionesFrom(impuestos: ImpuestoRow[]) {
    return impuestos
        .filter((i) => i.kind === 'retencion' && i.activo && i.esDefault && i.rate > 0)
        .map((i) => ({ nombre: i.nombre, tipo: i.tipo, tasa: i.rate, base: i.retencionBase }));
}

// Las tasas viajan como fracciones con decimales largos (0.106667). Comparar
// con === deja pasar duplicados que se ven idénticos en pantalla.
const close = (a: number, b: number) => Math.abs(a - b) < 1e-9;

/**
 * Tasa estándar de consumo del país, en PORCENTAJE (para orgs.iva_pct).
 *
 * Sustituye al `countryCode === 'MX' ? 16 : 0` que vivía duplicado en la
 * creación de org y en el onboarding: con ese ternario, una cuenta nueva en
 * España nacía con 0% y una en Australia también, así que el primer documento
 * de todo negocio fuera de México salía sin impuesto.
 */
export function defaultCountryTaxPct(countryCode: string): number {
    const preset = taxPresetsFor(countryCode).find((p) => p.esDefault);
    return preset ? preset.tasa : 0;
}

/**
 * Primera tasa propuesta que NO está en el catálogo del negocio, o `null` si
 * todas lo están (o vienen vacías y caen al default a propósito).
 *
 * `catalogo.resolve()` sustituye en silencio una tasa desconocida por la
 * predeterminada: correcto como red de seguridad, pero el usuario no se
 * enteraba — capturaba una línea al 8% y el documento salía al 16%. Los
 * endpoints que guardan una cotización o factura responden 400 con esta tasa
 * en vez de cambiarla.
 */
export function unknownTaxRate(
    catalogo: { resolve(proposed: unknown, fallback: number): number },
    proposed: unknown[],
): number | null {
    for (const p of proposed) {
        if (p === null || p === undefined || p === '') continue;
        if (Number.isNaN(catalogo.resolve(p, Number.NaN))) return Number(p);
    }
    return null;
}

/** Mensaje para el dueño del negocio cuando una tasa no está en su catálogo. */
export function unknownTaxRateMessage(rate: number): string {
    const pct = Number.isFinite(rate) ? `${Math.round(rate * 10000) / 100}%` : String(rate);
    return `La tasa de impuesto ${pct} no está en tu catálogo. Elige una de las tasas configuradas en Ajustes.`;
}

/**
 * El catálogo, más las tasas que ESTE documento ya tiene guardadas.
 *
 * Editar o reenviar un documento viejo no puede fallar porque el negocio
 * desactivó después una tasa con la que se capturó: esa tasa es un snapshot
 * del documento (regla 23), no una propuesta nueva. Lo que se rechaza es una
 * tasa que ni el catálogo ni el propio documento conocen.
 */
export function withStoredRates<C extends { resolve(proposed: unknown, fallback: number): number }>(
    catalogo: C,
    stored: unknown[],
): C {
    const known = stored.map(Number).filter((n) => Number.isFinite(n) && n >= 0 && n <= 1);
    return {
        ...catalogo,
        resolve(proposed: unknown, fallback: number): number {
            if (proposed !== null && proposed !== undefined && proposed !== '') {
                const n = Number(proposed);
                if (known.some((k) => Math.abs(k - n) < 1e-9)) return n;
            }
            return catalogo.resolve(proposed, fallback);
        },
    };
}

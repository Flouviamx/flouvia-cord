// Forma de GET /api/v1/elements/config. El servidor (src/lib/elements-config.ts)
// devuelve este tipo; el Builder headless dibuja a partir de él.

export interface CordTaxOption {
    /** Id del perfil del catálogo; null en las opciones sintéticas (Exento). */
    id: string | null;
    label: string;
    /** Fracción 0–1, nunca porcentaje. */
    rate: number;
    kind: 'consumo' | 'retencion' | 'exento';
}

export interface CordRetencion {
    nombre: string;
    tasa: number;
    base: 'subtotal' | 'impuesto';
}

/** `contado` o `net<N>`: N días naturales de crédito desde la fecha del documento. */
export type CordTerminos = 'contado' | 'net7' | 'net15' | 'net30' | 'net45' | 'net60' | 'net90';

/** Los plazos que acepta Cord, en orden. Fuente: src/lib/payment-terms.ts (un test verifica la paridad). */
export const CORD_TERMINOS: readonly CordTerminos[] = ['contado', 'net7', 'net15', 'net30', 'net45', 'net60', 'net90'];

export interface CordElementsConfig {
    object: 'elements_config';
    org: {
        nombre: string;
        pais: string;
        locale: 'es' | 'en';
        moneda: string;
        color_primario: string | null;
        logo_url: string | null;
    };
    /** Divisas en las que el servidor acepta cotizar. */
    monedas: string[];
    impuestos: {
        /** Nombre del impuesto en el país: IVA, VAT, GST, Sales tax. */
        etiqueta: string;
        opciones: CordTaxOption[];
        tasa_default: number;
        retenciones: CordRetencion[];
        precios_incluyen_impuesto: boolean;
    };
    terminos: CordTerminos[];
    terminos_default: CordTerminos;
    vigencia_dias_default: number;
    fiscal: { pais: string; reglas_propias: boolean };
}

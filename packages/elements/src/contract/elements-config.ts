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
    /** `gravado`: solo los conceptos que llevan impuesto (Retención de IVA en México). */
    base: 'subtotal' | 'impuesto' | 'gravado';
}

export type CordTerminos = 'contado' | 'net30' | 'net60';

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

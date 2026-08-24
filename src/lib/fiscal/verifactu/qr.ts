// Código QR de Verifactu — URL de cotejo en la sede electrónica de la AEAT.
//
// Verificado el 23-ago-2026 contra el documento oficial "Detalle de las
// especificaciones técnicas del código QR de la factura" (AEAT, v0.5.0):
// dominio, ruta, los cuatro parámetros y el ejemplo con NIF 89890001K
// coinciden literalmente con el documento.
//
// El QR NO lleva datos cifrados ni la huella: es una URL en claro con NIF,
// serie+número, fecha e importe — el cotejo real lo hace la AEAT contra lo
// que el propio sistema le mandó por el servicio web.

export interface QrInput {
    /** NIF del emisor (sin guiones ni espacios). */
    nif: string;
    /** Serie y número tal como aparecen en la factura, ej. "12345678/G33". */
    numSerie: string;
    /** dd-mm-aaaa. */
    fecha: string;
    /** Importe total con 2 decimales, punto decimal (no coma). */
    importeTotal: number;
}

const QR_BASE = {
    verifactu: 'https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR',
    // No-Verifactu: para el modo "envío diferido" (regulado en el mismo
    // Reglamento pero fuera de alcance de este plan, que solo cubre el modo
    // VERI*FACTU con remisión en tiempo real). Se deja documentado por si el
    // negocio necesita ese carril más adelante.
    noVerifactu: 'https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQRNoVerifactu',
};

/**
 * Frase legal obligatoria junto al QR (arts. 15–16 del Reglamento). Tipo de
 * letra y tamaño deben ser legibles, iguales o mayores a los del resto de la
 * factura — eso lo decide el layout del PDF, no esta función.
 */
export const VERIFACTU_LEYENDA = 'Factura verificable en la sede electrónica de la AEAT' as const;
export const VERIFACTU_LEYENDA_CORTA = 'VERI*FACTU' as const;

export function verifactuQrUrl(input: QrInput, base: 'verifactu' | 'noVerifactu' = 'verifactu'): string {
    // Construido a mano, NO con URLSearchParams: los ejemplos oficiales de la
    // AEAT muestran "numserie=12345678/G33" con la barra SIN codificar
    // (URLSearchParams la habría convertido en %2F). Solo se escapa el
    // espacio, que sí puede aparecer en una serie con separador.
    const enc = (v: string) => v.trim().replace(/ /g, '%20');
    const parts = [
        `nif=${enc(input.nif)}`,
        `numserie=${enc(input.numSerie)}`,
        `fecha=${enc(input.fecha)}`,
        `importe=${input.importeTotal.toFixed(2)}`,
    ];
    return `${QR_BASE[base]}?${parts.join('&')}`;
}

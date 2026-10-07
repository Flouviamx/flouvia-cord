// Código QR de Verifactu — URL de cotejo en la sede electrónica de la AEAT.
//
// Verificado contra el documento oficial "Detalle de las especificaciones
// técnicas del código QR de la factura" (AEAT, v0.5.0): dominios de pruebas y
// producción (§5.1), los cuatro parámetros (§6), su «URL encoding» en UTF-8
// (§4) y la presentación dentro de la factura (§3, arts. 20–21 de la Orden
// HAC/1177/2024).
//
// El QR NO lleva datos cifrados ni la huella: es una URL en claro con NIF,
// serie+número, fecha e importe — el cotejo real lo hace la AEAT contra lo
// que el propio sistema le mandó por el servicio web. Por eso el importe del
// QR es SIEMPRE el ImporteTotal del registro (Σ base + cuota, sin retenciones
// de IRPF: FAQ desarrolladores §20) y el host es el del MISMO entorno al que se
// remite el registro: un QR de producción para un registro enviado a pruebas
// nunca coteja.

export interface QrInput {
    /** NIF del emisor (9 caracteres, sin prefijo de país). */
    nif: string;
    /** Serie y número tal como aparecen en la factura y en el registro. */
    numSerie: string;
    /** dd-mm-aaaa. */
    fecha: string;
    /**
     * ImporteTotal del registro, ya formateado ("241.40", "-21.00") o como
     * número. El string del registro es la fuente: así QR, XML y huella llevan
     * exactamente el mismo valor.
     */
    importeTotal: number | string;
}

export type VerifactuEntorno = 'pruebas' | 'produccion';

// §5.1 "Sistema que emite facturas verificables": prewww2 en el portal de
// pruebas externas, www2 en producción (el servicio WEB de remisión usa
// prewww1/www1; el cotejo del QR, prewww2/www2 — no son intercambiables).
const QR_BASE: Record<VerifactuEntorno, { verifactu: string; noVerifactu: string }> = {
    pruebas: {
        verifactu: 'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR',
        noVerifactu: 'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQRNoVerifactu',
    },
    produccion: {
        verifactu: 'https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR',
        // Modo "no VERI*FACTU" (conservación + remisión bajo requerimiento):
        // regulado en el mismo Reglamento pero fuera de alcance; Cord solo
        // opera remisión inmediata. Documentado por si se necesita después.
        noVerifactu: 'https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQRNoVerifactu',
    },
};

/**
 * Frase legal obligatoria junto al QR (arts. 15–16 del Reglamento; art. 20.1.b
 * de la Orden). Debe ir JUSTO DEBAJO del QR, centrada respecto a él, con letra
 * igual o mayor que el resto de la factura.
 */
export const VERIFACTU_LEYENDA = 'Factura verificable en la sede electrónica de la AEAT' as const;
export const VERIFACTU_LEYENDA_CORTA = 'VERI*FACTU' as const;

/**
 * Presentación del QR dentro de la factura (§3 del documento del QR y art. 21
 * de la Orden). Es un contrato para quien dibuja el PDF, no algo que esta
 * función pueda imponer:
 *
 *   - lado entre 30 y 40 mm (85–113 puntos PDF), nivel de corrección M
 *     (ISO/IEC 18004:2015);
 *   - al menos 2 mm (6 mm recomendados) de blanco en los cuatro lados;
 *   - el texto "QR tributario:" ENCIMA del código, centrado;
 *   - la leyenda justo DEBAJO, centrada; puede partirse en varias líneas;
 *   - ambos textos con letra igual o mayor que el resto de datos de la factura;
 *   - el QR al principio de la factura (arriba, centrado o arriba a la
 *     izquierda en vertical), una única vez y solo en la primera página, y
 *     siempre el primer QR del documento.
 */
export const VERIFACTU_QR_PRESENTACION = {
    ladoMinimoMm: 30,
    ladoMaximoMm: 40,
    margenMinimoMm: 2,
    margenRecomendadoMm: 6,
    nivelCorreccion: 'M',
    etiquetaSuperior: 'QR tributario:',
    leyendaInferior: VERIFACTU_LEYENDA,
    soloPrimeraPagina: true,
} as const;

/** Milímetros → puntos PDF (1 pt = 1/72 in). 30 mm ≈ 85 pt; 40 mm ≈ 113 pt. */
export function mmAPuntos(mm: number): number {
    return Math.round((mm * 72 / 25.4) * 100) / 100;
}

function importeQr(value: number | string): string {
    if (typeof value === 'string') return value.trim();
    const rounded = Math.round((value + Math.sign(value) * Number.EPSILON) * 100) / 100;
    return (rounded === 0 ? 0 : rounded).toFixed(2);
}

/**
 * URL del QR. Cada valor va con «URL encoding» UTF-8 (§4): una serie
 * "12345678&G33" debe viajar como "12345678%26G33" — sin codificar, el `&`
 * parte el parámetro y la AEAT lee la serie "12345678". `encodeURIComponent`
 * codifica también "/" (%2F), que el servicio decodifica igual que el
 * URLEncoder de Java del ejemplo oficial.
 */
export function verifactuQrUrl(
    input: QrInput,
    options: { entorno?: VerifactuEntorno; base?: 'verifactu' | 'noVerifactu' } = {},
): string {
    const entorno = options.entorno ?? 'produccion';
    const base = QR_BASE[entorno][options.base ?? 'verifactu'];
    const parts = [
        `nif=${encodeURIComponent(input.nif.trim())}`,
        `numserie=${encodeURIComponent(input.numSerie)}`,
        `fecha=${encodeURIComponent(input.fecha.trim())}`,
        `importe=${encodeURIComponent(importeQr(input.importeTotal))}`,
    ];
    return `${base}?${parts.join('&')}`;
}

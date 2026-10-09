// Representación impresa de un comprobante autorizado por una autoridad de
// LatAm: el punto de extensión con el que cada riel le dice al PDF de Cord
// (invoice-pdf.ts) lo que la norma de SU país exige impreso — título y letra
// del comprobante, número legal, código de autorización y su vencimiento, el
// QR de verificación y las leyendas obligatorias.
//
// El riel la arma UNA vez, al autorizar, y queda guardada en
// `documentos_fiscales.provider_data.latam.representacion`: la descarga de
// mañana imprime lo que la autoridad autorizó hoy, aunque cambien las reglas
// de presentación o la configuración de la cuenta. El PDF no conoce ningún
// riel; solo dibuja esta forma.
//
// Puro: lo cargan el PDF, los scripts de contrato y las pruebas.

export interface FilaRepresentacion {
    /** Rótulo, en la lengua del documento. */
    k: string;
    v: string;
}

export interface RepresentacionImpresa {
    /** Rail que la generó ('arca'). */
    rail: string;
    /** Título del documento, en mayúsculas: "FACTURA A", "NOTA DE CRÉDITO B". */
    titulo: string;
    /** Letra del comprobante para el recuadro (A/B/C), si la norma la usa. */
    letra?: string;
    /** Código del tipo de comprobante tal como se imprime ("COD. 01"). */
    codigo?: string;
    /** Datos que la autoridad exige impresos, en orden. */
    filas: FilaRepresentacion[];
    /** Contenido del QR de verificación, si la norma lo exige. */
    qrUrl?: string;
    /** Texto que acompaña al QR. */
    qrLeyenda?: string;
    /**
     * Nivel de corrección de errores del QR que exige la norma. Ausente = 'M',
     * el de siempre. SUNAT exige 'Q' (RS 113-2018, anexo 6, §6.4.2).
     */
    qrNivel?: 'L' | 'M' | 'Q' | 'H';
    /**
     * Dónde va el QR. Ausente = arriba, junto a los datos de la autorización.
     * 'inferior': al final del documento, como exige SUNAT (§6.4.4 a).
     */
    qrPosicion?: 'inferior';
    /**
     * La norma exige el QR en TODAS las páginas (Colombia: Anexo Técnico de la
     * DIAN, numeral 11.7, mínimo 2 cm). El PDF lo repite en el pie de cada
     * página siguiente a la primera.
     */
    qrCadaPagina?: boolean;
    /** Leyendas obligatorias del comprobante, cada una completa. */
    leyendas: string[];
    /** Pie legal: reemplaza al aviso de "documento comercial" de Cord. */
    pie: string;
    /** Autorizado en el entorno de pruebas de la autoridad: sin validez fiscal. */
    prueba?: boolean;
}

const texto = (v: unknown) => (typeof v === 'string' ? v : '');

/**
 * Lee la representación guardada en `provider_data`. Devuelve null si el
 * documento no tiene una (comercial, CFDI, Verifactu) o si está mal formada:
 * un PDF nunca debe dibujar a medias un bloque legal.
 */
export function representacionDe(providerData: unknown): RepresentacionImpresa | null {
    if (!providerData || typeof providerData !== 'object') return null;
    const latam = (providerData as Record<string, unknown>).latam;
    if (!latam || typeof latam !== 'object') return null;
    const r = (latam as Record<string, unknown>).representacion as Record<string, unknown> | undefined;
    if (!r || typeof r !== 'object') return null;
    const titulo = texto(r.titulo);
    const pie = texto(r.pie);
    const filas = Array.isArray(r.filas)
        ? (r.filas as unknown[]).filter((f): f is FilaRepresentacion => !!f && typeof f === 'object'
            && typeof (f as FilaRepresentacion).k === 'string' && typeof (f as FilaRepresentacion).v === 'string')
        : [];
    if (!titulo || !pie || !filas.length) return null;
    return {
        rail: texto(r.rail),
        titulo,
        ...(texto(r.letra) ? { letra: texto(r.letra) } : {}),
        ...(texto(r.codigo) ? { codigo: texto(r.codigo) } : {}),
        filas,
        ...(texto(r.qrUrl) ? { qrUrl: texto(r.qrUrl) } : {}),
        ...(texto(r.qrLeyenda) ? { qrLeyenda: texto(r.qrLeyenda) } : {}),
        ...(['L', 'M', 'Q', 'H'].includes(texto(r.qrNivel)) ? { qrNivel: texto(r.qrNivel) as RepresentacionImpresa['qrNivel'] } : {}),
        ...(r.qrPosicion === 'inferior' ? { qrPosicion: 'inferior' as const } : {}),
        ...(r.qrCadaPagina === true && texto(r.qrUrl) ? { qrCadaPagina: true } : {}),
        leyendas: Array.isArray(r.leyendas) ? (r.leyendas as unknown[]).filter((l): l is string => typeof l === 'string' && !!l) : [],
        pie,
        ...(r.prueba === true ? { prueba: true } : {}),
    };
}

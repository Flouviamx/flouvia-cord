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
    /**
     * Recuadro enmarcado del tipo de documento, arriba a la derecha (Chile:
     * RUT del emisor, nombre del documento y N° de folio), con un pie debajo
     * (la unidad del SII). Reemplaza el título y el número de la cabecera.
     */
    recuadro?: { lineas: string[]; pie?: string };
    /**
     * Código de barras 2D que la norma exige al pie del documento, ya
     * calculado por el riel (Chile: el timbre electrónico en PDF417). Cada
     * fila es hexadecimal (1 = módulo oscuro) con `modulos` módulos útiles.
     */
    timbre?: { filas: string[]; modulos: number; moduloMm: number; altoFilaMm: number; leyendas: string[] };
    /**
     * Copia cedible (Chile, Ley 19.983): recuadro de acuse de recibo y la
     * leyenda de destino. Solo se imprime cuando se pide esa copia.
     */
    cedible?: { leyenda: string; acuseTitulo: string; acuseCampos: string[]; acuseTexto: string };
    /**
     * Datos del emisor tal como los declaró el documento ante la autoridad
     * (Chile: giro sin abreviar, casa matriz y sucursal, en ese orden — manual
     * de muestras impresas del SII, 1.1.7). Van bajo la razón social y
     * reemplazan las líneas de dirección de la ficha.
     */
    emisor?: string[];
    /** Lo mismo para el receptor (Chile: giro, dirección y comuna del DTE). */
    receptor?: string[];
    /**
     * Totalizadores que exige la norma, en la zona de totales y en su orden
     * (Chile: "Monto Neto", "Monto Exento", "IVA (19%)"; la factura exenta solo
     * el exento). Reemplazan subtotal, descuento e impuestos genéricos; el
     * total sigue siendo el del documento.
     */
    totales?: FilaRepresentacion[];
    /** Rótulo del total ("Monto total"). */
    totalEtiqueta?: string;
    /**
     * El descuento de cada línea se imprime en su línea, en monto (Chile: "los
     * descuentos por línea de detalle se deben señalar obligatoriamente en
     * montos", manual de muestras impresas, 1.4).
     */
    descuentoPorLinea?: boolean;
}

const texto = (v: unknown) => (typeof v === 'string' ? v : '');
const textos = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x) : []);
const positivo = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);

function filasDe(v: unknown): FilaRepresentacion[] {
    return Array.isArray(v)
        ? (v as unknown[]).filter((f): f is FilaRepresentacion => !!f && typeof f === 'object'
            && typeof (f as FilaRepresentacion).k === 'string' && typeof (f as FilaRepresentacion).v === 'string')
        : [];
}

function recuadroDe(v: unknown): RepresentacionImpresa['recuadro'] | null {
    if (!v || typeof v !== 'object') return null;
    const r = v as Record<string, unknown>;
    const lineas = textos(r.lineas);
    return lineas.length ? { lineas, ...(texto(r.pie) ? { pie: texto(r.pie) } : {}) } : null;
}

function timbreDe(v: unknown): RepresentacionImpresa['timbre'] | null {
    if (!v || typeof v !== 'object') return null;
    const t = v as Record<string, unknown>;
    const filas = textos(t.filas);
    const modulos = positivo(t.modulos);
    if (!filas.length || !modulos || !filas.every((f) => /^[0-9a-f]+$/.test(f) && f.length * 4 >= modulos)) return null;
    if (!positivo(t.moduloMm) || !positivo(t.altoFilaMm)) return null;
    return { filas, modulos, moduloMm: positivo(t.moduloMm), altoFilaMm: positivo(t.altoFilaMm), leyendas: textos(t.leyendas) };
}

function cedibleDe(v: unknown): RepresentacionImpresa['cedible'] | null {
    if (!v || typeof v !== 'object') return null;
    const c = v as Record<string, unknown>;
    if (!texto(c.leyenda) || !texto(c.acuseTexto)) return null;
    return { leyenda: texto(c.leyenda), acuseTitulo: texto(c.acuseTitulo), acuseCampos: textos(c.acuseCampos), acuseTexto: texto(c.acuseTexto) };
}

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
    const filas = filasDe(r.filas);
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
        ...(recuadroDe(r.recuadro) ? { recuadro: recuadroDe(r.recuadro)! } : {}),
        ...(timbreDe(r.timbre) ? { timbre: timbreDe(r.timbre)! } : {}),
        ...(cedibleDe(r.cedible) ? { cedible: cedibleDe(r.cedible)! } : {}),
        ...(textos(r.emisor).length ? { emisor: textos(r.emisor) } : {}),
        ...(textos(r.receptor).length ? { receptor: textos(r.receptor) } : {}),
        ...(filasDe(r.totales).length ? { totales: filasDe(r.totales) } : {}),
        ...(texto(r.totalEtiqueta) ? { totalEtiqueta: texto(r.totalEtiqueta) } : {}),
        ...(r.descuentoPorLinea === true ? { descuentoPorLinea: true } : {}),
    };
}

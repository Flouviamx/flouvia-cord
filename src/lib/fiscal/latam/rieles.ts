// Rieles fiscales de LatAm: integración DIRECTA con cada autoridad tributaria,
// sin agregador ni proveedor intermedio — la misma filosofía que Verifactu
// (src/lib/fiscal/verifactu/). Cord arma el comprobante, se autentica con el
// certificado del contribuyente, pide la autorización y guarda la respuesta de
// la autoridad como la fuente de verdad del documento fiscal.
//
// Este archivo es el REGISTRO de rieles: qué país atiende cada uno, con qué
// `document_type` persiste sus documentos y qué propiedades de la autoridad
// cambian el comportamiento común (si numera ella, si un comprobante
// autorizado se puede anular). Un riel nuevo (NFS-e Nacional de Brasil, DIAN,
// SUNAT, SII) se agrega AQUÍ con su definición completa y su proveedor en
// FiscalFactory; mientras no esté implementado de punta a punta no se lista
// (regla 15: un riel declarado sin consumidor es una promesa falsa).
//
// Puro (sin base de datos ni red) a propósito: lo cargan document-kind.ts,
// los scripts de contrato y la UI.

/** Identificador estable del riel. Es parte de la clave de las tablas `fiscal_rail_*`. */
export type RailId = 'arca' | 'nfse';

/**
 * Entorno de la autoridad. `homologacion` es el ambiente de pruebas de la
 * autoridad (ARCA lo llama así; SII "certificación", SUNAT "beta", DIAN
 * "habilitación"): sus comprobantes NO tienen validez fiscal.
 */
export type EntornoRail = 'homologacion' | 'produccion';

/**
 * Máquina de estados de un comprobante ante la autoridad (`fiscal_rail_comprobantes.estado`):
 *
 *   pendiente  ──► autorizado   (la autoridad lo aprobó: definitivo e inmutable)
 *       │      ──► rechazado    (la autoridad lo rechazó: el número NO se consumió)
 *       │      ──► incierto     (se envió y no hubo respuesta legible: hay que CONSULTAR)
 *       │      ──► descartado   (nunca llegó a la autoridad: el número queda libre)
 *   incierto   ──► autorizado | descartado   (solo tras consultar a la autoridad)
 *
 * `rechazado` y `descartado` son finales. Un reintento de emisión crea OTRO
 * intento; jamás se reescribe el anterior.
 */
export type EstadoComprobante = 'pendiente' | 'autorizado' | 'rechazado' | 'incierto' | 'descartado';

export const ESTADOS_VIVOS: readonly EstadoComprobante[] = ['pendiente', 'incierto', 'autorizado'];

export interface RailDefinicion {
    id: RailId;
    /** País ISO 3166-1 alfa-2 cuyo emisor usa este riel. */
    pais: string;
    /** Nombre de la autoridad tal como lo conoce el dueño del negocio (regla 14: nunca el del web service). */
    autoridad: string;
    /** `documentos_fiscales.document_type` de los documentos de este riel. */
    documentos: { factura: string; notaCredito: string };
    /** Prefijo de las variables de entorno del riel: `<PREFIJO>_ENABLED`, `<PREFIJO>_ENTORNO`. */
    envPrefijo: string;
    /**
     * ¿Un comprobante ya autorizado se puede anular ante la autoridad? En
     * Argentina no: se compensa con una nota de crédito. `voidInvoice` lo usa
     * para no cerrar los cobros en vuelo de algo que no se va a anular.
     */
    anulable: boolean;
    /**
     * La autoridad asigna (o valida) la numeración: el número legal del
     * documento sale del riel y reemplaza al folio interno de Cord.
     */
    numeracionPropia: boolean;
}

export const RIELES: Readonly<Record<RailId, RailDefinicion>> = {
    arca: {
        id: 'arca',
        pais: 'AR',
        autoridad: 'ARCA',
        documentos: { factura: 'arca_invoice', notaCredito: 'arca_credit_note' },
        envPrefijo: 'ARCA',
        anulable: false,
        numeracionPropia: true,
    },
    // Brasil: NFS-e de Padrão Nacional (Sistema Nacional NFS-e, Sefin
    // Nacional), solo servicios. La Sefin numera la NFS-e y una NFS-e
    // generada se cancela con el evento e101101 (src/lib/fiscal/latam/nfse/).
    nfse: {
        id: 'nfse',
        pais: 'BR',
        autoridad: 'Sistema Nacional NFS-e',
        documentos: { factura: 'nfse_invoice', notaCredito: 'nfse_credit_note' },
        envPrefijo: 'NFSE',
        anulable: true,
        numeracionPropia: true,
    },
};

const LISTA = Object.values(RIELES);

/** Riel regulatorio del país del EMISOR, si Cord tiene uno. */
export function railDePais(country: unknown): RailDefinicion | null {
    const code = String(country ?? '').trim().toUpperCase();
    return LISTA.find((r) => r.pais === code) ?? null;
}

/** Riel al que pertenece un `document_type` persistido. */
export function railDeDocumento(documentType: unknown): RailDefinicion | null {
    const type = String(documentType ?? '');
    return LISTA.find((r) => r.documentos.factura === type || r.documentos.notaCredito === type) ?? null;
}

/** Todos los `document_type` que pertenecen a un riel regulatorio de LatAm. */
export const DOCUMENTOS_DE_RIELES: readonly string[] = LISTA.flatMap((r) => [r.documentos.factura, r.documentos.notaCredito]);

export function esNotaCreditoDeRail(documentType: unknown): boolean {
    return LISTA.some((r) => r.documentos.notaCredito === String(documentType ?? ''));
}

export function esRailId(value: unknown): value is RailId {
    return typeof value === 'string' && Object.prototype.hasOwnProperty.call(RIELES, value);
}

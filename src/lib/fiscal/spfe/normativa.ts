// Lo que dice la norma de la factura electrónica obligatoria entre empresarios
// y profesionales de España y de su solución pública (SPFE), transcrito de la
// fuente primaria. Nada de aquí es una reconstrucción: cada constante cita el
// artículo o la lista del anexo de donde sale.
//
// Fuentes (verificadas el 9 de octubre de 2026):
//   - Ley 56/2007, art. 2 bis, en la redacción del art. 12 de la Ley 18/2022
//     (BOE-A-2007-22440, versión consolidada).
//   - Ley 18/2022, disposición final octava (BOE-A-2022-15818).
//   - Real Decreto 238/2026, de 25 de marzo (BOE-A-2026-7295, BOE núm. 79 de
//     31 de marzo de 2026).
//   - Orden HAC/1028/2026, de 2 de octubre (BOE-A-2026-20587, BOE núm. 247 de
//     5 de octubre de 2026; en vigor el 6 de octubre de 2026). Anexo I
//     (factura y copia fiel, UBL) y Anexo II (estados de pago, rechazo, cobro
//     e impago, UBL ApplicationResponse).
//   - OASIS UBL 2.5, OASIS Standard de 12 de agosto de 2026: la "última versión
//     aprobada" de UBL a la que remiten las rutas de los dos anexos, y la que la
//     AEAT anunció para la SPFE (seminario técnico del 10-09-2026).
//
// Puro y sin dependencias: lo cargan vitest, el check con Node plano y el
// servidor.

/** Las normas, para citarlas en pantalla y en los documentos. */
export const SPFE_FUENTES = {
    ley: 'Ley 56/2007, art. 2 bis (redacción de la Ley 18/2022, art. 12)',
    realDecreto: 'Real Decreto 238/2026, de 25 de marzo (BOE-A-2026-7295)',
    orden: 'Orden HAC/1028/2026, de 2 de octubre (BOE-A-2026-20587)',
    ubl: 'OASIS UBL 2.5 (OASIS Standard, 12-08-2026)',
} as const;

/**
 * Fechas de aplicación efectiva (aaaa-mm-dd), contadas desde la entrada en
 * vigor de la Orden (6-10-2026, su disposición final única):
 *   - RD 238/2026, disp. final cuarta 1.a): doce meses después para quien
 *     superó 8 M€ de volumen de operaciones (art. 121 LIVA) el año anterior;
 *   - disp. final cuarta 1.b): veinticuatro meses para el resto;
 *   - disp. transitoria tercera: los estados (arts. 10 y 12) de las personas
 *     físicas y entidades en atribución de rentas de hasta 8 M€, doce meses
 *     después de su propia fecha; hasta entonces, voluntarios;
 *   - disp. final cuarta 2: las obligaciones de las plataformas privadas
 *     (copia fiel, interconexión), doce meses desde la Orden.
 * La sede de la AEAT publica las mismas fechas (noticia del 7-10-2026).
 */
export const SPFE_PLAZOS = {
    ordenEnVigor: '2026-10-06',
    granEmpresa: '2027-10-06',
    resto: '2028-10-06',
    estadosPersonasFisicas: '2029-10-06',
    plataformasPrivadas: '2027-10-06',
} as const;

/** BT-23, Anexo I: "Adoptará el valor". */
export const SPFE_PROCESO = 'urn:aeat:names:specification:ubl:schema:profile:B2B';
/** BT-24, Anexo I: identificador de especificación (EN 16931:2026 con la extensión de la AEAT). */
export const SPFE_ESPECIFICACION = 'urn:cen.eu:en16931:2026#conformant#urn:aeat.es:spfe:1.0.0:extended';

/** L1, Anexo I: tipos de factura admitidos (UNTDID 1001). */
export const SPFE_TIPOS_FACTURA = ['380', '384', '388', '389', '471'] as const;
export type SpfeTipoFactura = (typeof SPFE_TIPOS_FACTURA)[number];

/** L2.A, Anexo I: tipo de factura rectificativa (BT-ES-27). */
export const SPFE_TIPOS_RECTIFICATIVA = ['R1', 'R2', 'R3', 'R4'] as const;
export type SpfeTipoRectificativa = (typeof SPFE_TIPOS_RECTIFICATIVA)[number];

/** L2.B, Anexo I: I por diferencias, S por sustitución (BT-ES-28). */
export const SPFE_MODALIDADES_RECTIFICATIVA = ['I', 'S'] as const;

/**
 * L4, Anexo I: categorías de IVA admitidas (UNTDID 5305). No incluye K
 * (entrega intracomunitaria): la SPFE es para operaciones con un destinatario
 * establecido en España (RD 238/2026, art. 3).
 */
export const SPFE_CATEGORIAS = ['S', 'Z', 'E', 'AE', 'O', 'G', 'L', 'M', 'N', 'D', 'F'] as const;

/** Calificador de BT-ES-24 (tipo de impuesto nacional) y lista de claves de régimen que le corresponde. */
export type SpfeImpuesto = 'IVA' | 'IGIC' | 'IPSI';

/** L3A, L3B y L3C, Anexo I: claves de régimen (BT-161 con BT-160 = REGI). */
export const SPFE_CLAVES_REGIMEN: Record<SpfeImpuesto, readonly string[]> = {
    IVA: ['01', '02', '03', '04', '05', '06', '07', '08', '09', '11', '14', '15'],
    IGIC: ['01', '02', '03', '04', '05', '06', '07', '08', '09', '11', '14', '15', '17', '18', '19'],
    IPSI: ['01', '08', '11', '19', '20'],
};

/** L8, Anexo I: código de la propiedad de línea para la clave de régimen (BT-160). */
export const SPFE_PROPIEDAD_REGIMEN = 'REGI';

/** L10, Anexo I: identificadores de los documentos justificativos (BT-122). */
export const SPFE_DOC_QR = 'QR';
export const SPFE_DOC_RECT_TIPO = 'RECT:TIPO';
export const SPFE_DOC_RECT_MODALIDAD = 'RECT:MODALIDAD';

/** L5, Anexo I: claves de retención (BT-ES-21). Cord todavía no las escribe (ver PENDIENTES_AEAT). */
export const SPFE_CLAVES_RETENCION = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11'] as const;

/**
 * Anexo II: los códigos de cada comunicación (cbc:ResponseCode del
 * ApplicationResponse). Los del destinatario son obligatorios para él (RD
 * 238/2026, art. 12.1 y 12.3); los del emisor, voluntarios (art. 12.4; Orden,
 * art. 7.2). La baja de una factura (CANCELINVOICE) es del Anexo I.
 */
export const SPFE_CODIGOS_EMISOR = ['SETTLEMENT', 'CANCELSETTLEMENT', 'DEFAULT', 'CANCELDEFAULT'] as const;
export const SPFE_CODIGOS_DESTINATARIO = ['PAYMENT', 'CANCELPAYMENT', 'REJECTION', 'CANCELREJECTION'] as const;
export const SPFE_CODIGO_BAJA = 'CANCELINVOICE';
export type SpfeCodigoEmisor = (typeof SPFE_CODIGOS_EMISOR)[number];
export type SpfeCodigoDestinatario = (typeof SPFE_CODIGOS_DESTINATARIO)[number];

/** L1, Anexo II: motivos de rechazo del destinatario. */
export const SPFE_MOTIVOS_RECHAZO: Record<'01' | '02', { es: string; en: string }> = {
    '01': { es: 'Rechazo comercial', en: 'Commercial rejection' },
    '02': { es: 'Consumo particular o no afecto a la actividad', en: 'Private consumption or not related to the business' },
};

/**
 * Provincias de régimen foral (País Vasco: 01 Álava, 20 Gipuzkoa, 48 Bizkaia;
 * Navarra: 31). La SPFE para sus contribuyentes depende de los acuerdos con
 * las Haciendas Forales (RD 238/2026, disposición adicional tercera), que no
 * se han publicado.
 */
export const SPFE_PROVINCIAS_FORALES = new Set(['01', '20', '31', '48']);

/**
 * Lo que la norma NO fija y la AEAT todavía no publicó (a 9 de octubre de
 * 2026). La Orden remite cada punto a "las especificaciones técnicas y
 * volumetría que consten en la Sede electrónica" (arts. 3.1, 4.2, 7.3, 9.2,
 * 10.3 y 11.2), y el seminario técnico del 10-09-2026 anuncia que se
 * publicarán en el Portal de Entidades Desarrolladoras ANTES del entorno de
 * pruebas: WSDL, XSD de las extensiones, schematron, catálogo de servicios,
 * errores y ejemplos. Mientras esta lista no esté vacía, el riel no se puede
 * encender (`transporteDisponible` en transporte.ts) y la pantalla dice
 * "Próximamente". Al publicarse cada pieza, se resuelve aquí y se borra.
 */
export interface PendienteAeat {
    id: string;
    /** Qué falta, en vocabulario técnico (documentación y check, nunca pantalla). */
    que: string;
    /** Dónde lo deja abierto la norma. */
    fuente: string;
}

export const PENDIENTES_AEAT: readonly PendienteAeat[] = [
    {
        id: 'transporte',
        que: 'WSDL de los servicios, sobre ebXML, direcciones de los entornos y catálogo de errores. Sin ellos no hay forma de remitir, anular, consultar ni comunicar estados.',
        fuente: 'Orden HAC/1028/2026, arts. 5.2, 8.1.a), 10.1.a) y 11.2 (remiten a la Sede electrónica de la AEAT)',
    },
    {
        id: 'validacion',
        que: 'XSD de las extensiones propias y schematron de la EN 16931:2026 con las reglas de la AEAT. Hoy solo se puede validar la sintaxis contra el XSD oficial de UBL 2.5.',
        fuente: 'Orden HAC/1028/2026, art. 3.1 y art. 5.4 (validación de sintaxis, semántica y especificaciones)',
    },
    {
        id: 'calificadores',
        que: 'Dónde va el calificador de las listas L7, L8 y L10 (urn:aeat:names:specification:schema:…): el Anexo I lo enuncia sin ruta UBL. Cord escribe el código (REGI, QR, RECT:TIPO, RECT:MODALIDAD) y omite el calificador.',
        fuente: 'Orden HAC/1028/2026, Anexo I, listas L7, L8 y L10',
    },
    {
        id: 'retenciones',
        que: 'Cómo viajan BT-179 y BT-180 en cac:CollectionInvoiceLine (grupo RETENCIONES, código RETE) y su efecto en el total a pagar (BT-115). Depende de la correspondencia sintáctica UBL de la EN 16931:2026 (CEN/TS 16931-3-2:2026), no publicada en abierto. Una factura con retención no se envía.',
        fuente: 'Orden HAC/1028/2026, Anexo I, grupos BG-34 y BG-ES-4 (BT-ES-16 a BT-ES-21)',
    },
    {
        id: 'cabecera_mensajes',
        que: 'Identificador, fecha y partes emisora y receptora del ApplicationResponse (obligatorios en el XSD de UBL 2.5) y el esquema del NIF en cac:IssuerParty/cac:PartyTaxScheme: el Anexo II solo define el cuerpo (cac:DocumentResponse).',
        fuente: 'Orden HAC/1028/2026, Anexo II, y Anexo I (mensaje de anulación)',
    },
    {
        id: 'entorno_pruebas',
        que: 'Entorno de pruebas de la SPFE, anunciado para octubre de 2026 y no desplegado.',
        fuente: 'AEAT, seminario técnico de la SPFE del 10-09-2026',
    },
];

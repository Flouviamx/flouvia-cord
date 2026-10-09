// Los estados del ciclo de vida de una factura francesa (flujo 6), con su
// código de la DGFiP y lo que el negocio tiene que hacer con cada uno.
//
// Fuente: DGFiP, Dossier général des spécifications externes v3.2, §3.6.4,
// Tableau 8 "Les statuts d'une facture" (200 a 213) y Annexe 2 (501
// "Irrecevable": el flujo no pasó los controles de recepción). Obligatorios
// ante la administración: 200 Déposée, 210 Refusée, 212 Encaissée y 213
// Rejetée. Ante un 210 o un 213 "le fournisseur doit procéder à une
// annulation comptable (avoir interne). Cette opération ne doit pas générer de
// flux de données réglementaires": la nota de crédito que la anula NO se
// transmite, y la factura correcta se emite de nuevo con otro número.
//
// Puro: sin base de datos ni red.

export interface EstadoDgfip {
    codigo: string;
    es: string;
    en: string;
    fr: string;
    /** Termina el recorrido de la factura con un rechazo: el negocio la anula y vuelve a facturar. */
    rechazo?: boolean;
}

export const ESTADOS_DGFIP: Record<string, EstadoDgfip> = {
    '200': { codigo: '200', es: 'Depositada en la plataforma', en: 'Submitted to the platform', fr: 'Déposée' },
    '201': { codigo: '201', es: 'Emitida por la plataforma', en: 'Issued by the platform', fr: 'Émise par la plateforme' },
    '202': { codigo: '202', es: 'Recibida por la plataforma del cliente', en: "Received by the client's platform", fr: 'Reçue par la plateforme' },
    '203': { codigo: '203', es: 'Puesta a disposición del cliente', en: 'Made available to the client', fr: 'Mise à disposition' },
    '204': { codigo: '204', es: 'El cliente la tomó en cuenta', en: 'Acknowledged by the client', fr: 'Prise en charge' },
    '205': { codigo: '205', es: 'Aprobada por el cliente', en: 'Approved by the client', fr: 'Approuvée' },
    '206': { codigo: '206', es: 'Aprobada en parte por el cliente', en: 'Partially approved by the client', fr: 'Approuvée partiellement' },
    '207': { codigo: '207', es: 'En litigio con el cliente', en: 'Disputed by the client', fr: 'En litige' },
    '208': { codigo: '208', es: 'Suspendida: el cliente pide justificantes', en: 'Suspended: the client asks for supporting documents', fr: 'Suspendue' },
    '209': { codigo: '209', es: 'Completada con los justificantes', en: 'Completed with supporting documents', fr: 'Complétée' },
    '210': { codigo: '210', es: 'Rechazada por el cliente', en: 'Refused by the client', fr: 'Refusée', rechazo: true },
    '211': { codigo: '211', es: 'Pago transmitido', en: 'Payment sent', fr: 'Paiement transmis' },
    '212': { codigo: '212', es: 'Cobrada', en: 'Payment received', fr: 'Encaissée' },
    '213': { codigo: '213', es: 'Rechazada por una plataforma', en: 'Rejected by a platform', fr: 'Rejetée', rechazo: true },
    '501': { codigo: '501', es: 'Archivo no admitido por la plataforma', en: 'File not accepted by the platform', fr: 'Irrecevable', rechazo: true },
};

/**
 * Códigos de Iopole → código de la DGFiP. El webhook de estado trae además el
 * código numérico (`status.value`, p. ej. "202"); este mapa es el respaldo
 * para el historial, que solo trae el nombre. CANCELLED (la anula el emisor
 * tras un litigio) no tiene código propio en la tabla de la DGFiP: se guarda
 * con el del proveedor y sin código.
 */
export const CODIGO_DE_IOPOLE: Record<string, string> = {
    SUBMITTED: '200',
    ISSUED: '201',
    RECEIVED: '202',
    MADE_AVAILABLE: '203',
    IN_HAND: '204',
    APPROVED: '205',
    PARTIALLY_APPROVED: '206',
    DISPUTED: '207',
    SUSPENDED: '208',
    COMPLETED: '209',
    REFUSED: '210',
    PAYMENT_SENT: '211',
    PAYMENT_RECEIVED: '212',
    REJECTED: '213',
    UNACCEPTABLE: '501',
};

/** El código de la DGFiP de un estado: el numérico si viene y es conocido, si no el del mapa. */
export function codigoDgfip(numerico: unknown, codigoProveedor: unknown): string | null {
    const n = String(numerico ?? '').trim();
    if (/^\d{3}$/.test(n) && ESTADOS_DGFIP[n]) return n;
    return CODIGO_DE_IOPOLE[String(codigoProveedor ?? '').toUpperCase()] ?? null;
}

export function etiquetaEstado(codigo: string | null, codigoProveedor: string, lang: 'es' | 'en'): string {
    const e = codigo ? ESTADOS_DGFIP[codigo] : null;
    if (e) return `${e[lang]} (${e.codigo})`;
    if (codigoProveedor.toUpperCase() === 'CANCELLED') return lang === 'en' ? 'Cancelled after a dispute' : 'Anulada tras un litigio';
    return codigoProveedor;
}

export const esRechazo = (codigo: string | null | undefined) => !!(codigo && ESTADOS_DGFIP[codigo]?.rechazo);

/**
 * El texto que deja el estado en la historia de la factura. Se escribe en
 * español (como el resto de `eventos.detalle`) y se traduce al pintar
 * (timeline-detail.ts): "Estado 213 · Rechazada por una plataforma: motivo".
 */
export function detalleTimeline(codigo: string | null, codigoProveedor: string, motivo?: string | null): string {
    const base = codigo
        ? `Estado ${codigo} · ${ESTADOS_DGFIP[codigo]?.es ?? codigoProveedor}`
        : codigoProveedor.toUpperCase() === 'CANCELLED' ? 'Anulada tras un litigio' : `Estado ${codigoProveedor}`;
    return motivo ? `${base}: ${motivo}` : base;
}

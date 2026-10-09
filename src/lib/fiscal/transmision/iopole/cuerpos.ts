// Iopole: cómo se escribe cada petición y cómo se lee cada respuesta, en
// funciones puras. Cada ruta y cada campo sale de la OpenAPI del operador
// publicada por Iopole (https://api.ppd.iopole.fr/v1/api/operator/{config,
// invoicing,reporting}), fijada con su SHA-256 en scripts/fixtures/iopole/.
// `npm run security:fr-pa` comprueba, sin red, que cada ruta de RUTAS existe
// en esa especificación y que los cuerpos que arman estas funciones validan
// contra sus esquemas; test/fr-pa-db.test.ts hace lo mismo con una Iopole
// simulada.

import type {
    AltaConsultada, CobroFactura, EstadoAlta, EstadoFactura, FechaExigibilidad, ParteReporte, ReporteFactura,
    ReportePagoFactura, ReportePagoTransacciones, ReporteTransacciones, SolicitudAlta,
} from '../proveedor';
import type { RegimenTva } from '../periodos';
import { codigoDgfip } from '../estados';

/** Las rutas que usa Cord, tal como las declara la OpenAPI (método, plantilla y archivo). */
export const RUTAS = {
    crearAlta: { metodo: 'POST', ruta: '/v1/config/french/enrollment', spec: 'config' },
    consultarAlta: { metodo: 'GET', ruta: '/v1/config/enrollment/{enrollmentId}', spec: 'config' },
    altaPorIdentificador: { metodo: 'GET', ruta: '/v1/config/enrollment/{scheme}/{identifier}/link', spec: 'config' },
    entidades: { metodo: 'GET', ruta: '/v1/config/business/entity', spec: 'config' },
    crearWebhook: { metodo: 'POST', ruta: '/v1/config/webhook', spec: 'config' },
    enviarFactura: { metodo: 'POST', ruta: '/v1/invoice', spec: 'invoicing' },
    buscarFacturas: { metodo: 'GET', ruta: '/v1.1/invoice/search', spec: 'invoicing' },
    historialEstados: { metodo: 'GET', ruta: '/v1/invoice/{invoiceId}/status-history', spec: 'invoicing' },
    enviarEstado: { metodo: 'POST', ruta: '/v1/invoice/{invoiceId}/status', spec: 'invoicing' },
    reporteFactura: { metodo: 'POST', ruta: '/v1/reporting/transaction/invoice/scheme/{identifierScheme}/value/{identifierValue}', spec: 'reporting' },
    reporteTransacciones: { metodo: 'POST', ruta: '/v1/reporting/transaction/scheme/{identifierScheme}/value/{identifierValue}', spec: 'reporting' },
    reportePagoFactura: { metodo: 'POST', ruta: '/v1/reporting/payment/invoice/scheme/{identifierScheme}/value/{identifierValue}', spec: 'reporting' },
    reportePagoTransacciones: { metodo: 'POST', ruta: '/v1/reporting/payment/transaction/scheme/{identifierScheme}/value/{identifierValue}', spec: 'reporting' },
} as const;

export type NombreRuta = keyof typeof RUTAS;

/** La ruta con sus parámetros, codificados. */
export function ruta(nombre: NombreRuta, params: Record<string, string> = {}): string {
    return RUTAS[nombre].ruta.replace(/\{(\w+)\}/g, (_m, k: string) => {
        if (params[k] === undefined) throw new Error(`iopole: falta el parámetro ${k} de ${nombre}`);
        return encodeURIComponent(params[k]);
    });
}

/** El SIREN identifica a la empresa francesa en el e-reporting (esquema ICD 0002). */
export const ESQUEMA_SIREN = '0002';

// ── Alta ─────────────────────────────────────────────────────────────────────

export const REGIMEN_IOPOLE: Record<RegimenTva, string> = {
    reel_mensuel: 'REAL_MONTHLY_TAX_REGIME',
    reel_trimestriel: 'REAL_QUARTERLY_TAX_REGIME',
    simplifie: 'SIMPLIFIED_TAX_REGIME',
    franchise: 'VAT_EXEMPTION_REGIME',
};

/**
 * Alta de un negocio francés SOLO para emitir:
 *   - `registrationStrategy: 'NONE'`: no se registra ninguna dirección de
 *     recepción en el annuaire. Recibir facturas exige mostrarlas, y Cord no
 *     las muestra; además registrar una dirección la movería desde la
 *     plataforma de recepción que el negocio ya tenga.
 *   - `operatorRelation.direction: 'OUTBOUND'`: la relación del operador con
 *     el negocio es solo de emisión ("an invoice or status issued to a
 *     customer").
 *   - Ni Peppol internacional ni autofacturación.
 */
export function cuerpoAlta(s: SolicitudAlta): Record<string, unknown> {
    return {
        siren: s.siren,
        registerInPeppolInternational: false,
        selfBilling: false,
        registrationStrategy: 'NONE',
        businessEntityDetails: {
            vatRegime: REGIMEN_IOPOLE[s.regimen],
            contactEmail: s.contactoEmail,
            address: s.direccion,
        },
        ...(s.representante ? {
            legalRepresentative: { firstName: s.representante.nombre, lastName: s.representante.apellido, position: s.representante.cargo },
        } : {}),
        operatorRelation: { direction: 'OUTBOUND' },
    };
}

/**
 * Las etapas del alta (enum `stages` del webhook de onboarding) en el estado
 * de Cord. Las de revisión manual de Iopole siguen "en curso": no le piden
 * nada al negocio. Las que sí (acción requerida, migración o disputa de una
 * dirección) se dicen como tales.
 */
const ETAPA_ACCION = new Set(['ACTION_REQUIRED', 'ELECTRONIC_ADDRESS_MIGRATION', 'ELECTRONIC_ADDRESS_DISPUTE']);

export function estadoDeEtapa(etapa: unknown): EstadoAlta {
    const e = String(etapa ?? '').toUpperCase();
    if (e === 'COMPLETED') return 'completada';
    if (e === 'CANCELLED') return 'cancelada';
    if (ETAPA_ACCION.has(e)) return 'accion_requerida';
    return 'en_curso';
}

export function leerAlta(json: any): AltaConsultada | null {
    if (!json || typeof json !== 'object' || !json.enrollmentId) return null;
    const etapa = String(json.state ?? json.status ?? '').toUpperCase();
    return { altaId: String(json.enrollmentId), etapa, estado: estadoDeEtapa(etapa), enlace: json.enrollmentLink ? String(json.enrollmentLink) : null };
}

// ── Estados de una factura ───────────────────────────────────────────────────

function primeraRespuesta(json: any): any {
    return Array.isArray(json?.responses) ? json.responses[0] ?? null : null;
}

/** Motivo de un rechazo, tal como lo da el estado (motivo codificado y mensaje). */
function motivoDe(resp: any): string | null {
    const r = resp?.rejectionDetail ?? (Array.isArray(resp?.rejectionDetails) ? resp.rejectionDetails[0] : null);
    if (!r) return null;
    const partes = [r.message, r.reason].map((x: unknown) => String(x ?? '').trim()).filter(Boolean);
    const errores = Array.isArray(r.errors) ? r.errors.map((e: any) => String(e?.message ?? '').trim()).filter(Boolean) : [];
    return [...new Set([...partes, ...errores.slice(0, 3)])].join(' · ').slice(0, 1000) || null;
}

/** Un estado del webhook `status` o del historial, en el vocabulario de Cord. */
export function leerEstado(x: any): EstadoFactura | null {
    if (!x || typeof x !== 'object' || !x.statusId || !x.invoiceId) return null;
    const codigoProveedor = String(x.status?.code ?? '').toUpperCase();
    if (!codigoProveedor) return null;
    const resp = primeraRespuesta(x.json);
    const ref = resp?.documentReference ?? {};
    const emisor = ref.issuerTradeParty ?? ref.issuer ?? null;
    return {
        estadoId: String(x.statusId),
        facturaId: String(x.invoiceId),
        codigo: codigoDgfip(x.status?.value ?? x.status?.networkCode, codigoProveedor),
        codigoProveedor,
        fecha: String(x.date ?? x.json?.context?.date ?? new Date().toISOString()),
        numero: ref.issuerAssignedId ? String(ref.issuerAssignedId) : null,
        sirenEmisor: emisor?.siren ? String(emisor.siren) : null,
        motivo: motivoDe(resp),
        detalle: resp ? { documentStatus: resp.documentStatus ?? null, rejectionDetail: resp.rejectionDetail ?? null } : null,
    };
}

// ── Cobro (estado 212) ───────────────────────────────────────────────────────

/** PAYMENT_RECEIVED (212 "Encaissée"): un renglón por tasa; una devolución va en negativo con su motivo (P1.17). */
export function cuerpoCobro(c: CobroFactura): Record<string, unknown> {
    return {
        code: 'PAYMENT_RECEIVED',
        ...(c.mensaje ? { message: c.mensaje } : {}),
        payment: c.porTasa.map((x) => ({ vatRate: x.tasa, amount: x.importe, currency: c.moneda })),
    };
}

// ── E-reporting ──────────────────────────────────────────────────────────────

const IOP_CODE: Record<FechaExigibilidad, string> = { factura: 'INVOICE_DATE', entrega: 'DELIVERY_DATE', cobro: 'PAYMENT_DATE' };

function opcionTva(exigibilidad: FechaExigibilidad | null | undefined, debitos?: boolean): Record<string, unknown> {
    if (!exigibilidad) return {};
    return { taxPaymentOption: { iopCode: IOP_CODE[exigibilidad], ...(debitos ? { debitTaxPaymentActive: true } : {}) } };
}

const importe = (n: number) => Math.round(n * 100) / 100;
/** `collectedAmount` es un decimal en texto, positivo y con dos decimales como máximo. */
const decimal = (n: number) => importe(n).toFixed(2);

function parteIopole(p: ParteReporte): Record<string, unknown> {
    return {
        name: p.nombre.slice(0, 200),
        ...(p.tva ? { vatNumber: p.tva.slice(0, 18) } : {}),
        postalAddress: {
            ...(p.direccion.linea1 ? { addressLineOne: p.direccion.linea1.slice(0, 255) } : {}),
            ...(p.direccion.ciudad ? { cityName: p.direccion.ciudad.slice(0, 255) } : {}),
            ...(p.direccion.cp ? { postalCode: p.direccion.cp.slice(0, 10) } : {}),
            country: p.pais,
        },
        identifier: { type: 'PARTY_LEGAL_IDENTIFIER', scheme: p.identificador.esquema, value: p.identificador.valor },
    };
}

export function cuerpoReporteFactura(r: ReporteFactura): Record<string, unknown> {
    return {
        invoice: {
            invoiceId: r.numero,
            invoiceDate: r.fecha,
            type: r.tipo,
            processType: r.cadre,
            ...(r.vencimiento ? { invoiceDueDate: r.vencimiento } : {}),
            ...opcionTva(r.exigibilidad, r.debitos),
            monetary: {
                invoiceCurrency: r.moneda,
                taxBasisTotalAmount: { amount: importe(r.base) },
                taxTotalAmount: { amount: importe(r.impuesto), currency: r.monedaImpuesto },
            },
            taxDetails: r.desglose.map((d) => ({
                taxableAmount: { amount: importe(d.base) },
                taxAmount: { amount: importe(d.impuesto) },
                percent: d.tasa,
                code: d.categoria,
            })),
            seller: parteIopole(r.vendedor),
            buyer: parteIopole(r.comprador),
            ...(r.facturaPrevia ? { referencedDocuments: [{ invoiceId: r.facturaPrevia.numero.slice(0, 20), date: r.facturaPrevia.fecha }] } : {}),
        },
    };
}

/** Caja virtual de Cord: el agregado diario de una divisa es un "cierre" de esta caja. */
export const CAJA_CORD = 'CORD';

export function cuerpoTransacciones(r: ReporteTransacciones): Record<string, unknown> {
    return {
        transactionDate: r.fecha,
        registerId: CAJA_CORD,
        closureId: r.cierre,
        transactions: r.categorias.map((c) => ({
            currency: r.moneda,
            categoryCode: c.categoria,
            monetary: {
                taxBasisTotalAmount: { amount: importe(c.base) },
                taxTotalAmount: { amount: importe(c.impuesto) },
            },
            taxDetails: c.desglose.map((d) => ({
                taxableAmount: { amount: importe(d.base) },
                taxAmount: { amount: importe(d.impuesto) },
                percent: d.tasa,
                code: d.categoria,
            })),
            ...opcionTva(c.exigibilidad, c.debitos),
        })),
    };
}

export function cuerpoPagoFactura(r: ReportePagoFactura): Record<string, unknown> {
    return {
        invoice: {
            invoiceId: r.numero,
            invoiceDate: r.fechaFactura,
            payment: { paymentDate: r.fechaPago, taxDetails: r.porTasa.map((x) => ({ taxRate: x.tasa, collectedAmount: decimal(x.importe) })) },
        },
    };
}

export function cuerpoPagoTransacciones(r: ReportePagoTransacciones): Record<string, unknown> {
    return {
        transaction: {
            payment: { paymentDate: r.fechaPago, taxDetails: r.porTasa.map((x) => ({ taxRate: x.tasa, collectedAmount: decimal(x.importe) })) },
        },
    };
}

// ── Webhook ──────────────────────────────────────────────────────────────────

/** Los eventos del operador que Cord atiende (enum `subscribedEvents`). */
export const EVENTOS_SUSCRITOS = [
    'OUTBOUND_INVOICE_NOT_DELIVERED',
    'OUTBOUND_STATUS_INVALID',
    'OUTBOUND_STATUS_NOT_ALLOWED',
    'EREPORTING_TRANSACTION_ATTACHED',
    'EREPORTING_PAYMENT_ATTACHED',
    'EREPORTING_ERROR',
] as const;

/**
 * El webhook de Cord: solo lo EMITIDO (`filterStreamDirection: 'OUTBOUND'`:
 * los estados de las facturas que el negocio emite), las etapas del alta y los
 * eventos del e-reporting, firmados con HMAC. Sin `invoice`: Cord no recibe
 * facturas. Lo registra `scripts/iopole-webhook.mjs`, una vez por entorno.
 */
export function cuerpoWebhook(base: string, secreto: string): Record<string, unknown> {
    const url = (tipo: string) => `${base.replace(/\/+$/, '')}/api/fiscal/iopole/webhook?tipo=${tipo}`;
    return {
        filterStreamDirection: 'OUTBOUND',
        status: 'ACTIVE',
        adapterCode: 'standardAdapter',
        label: 'Cord',
        interopData: {
            endpoints: {
                status: { callbackUrl: url('status') },
                onboarding: { callbackUrl: url('onboarding') },
                events: { callbackUrl: url('events'), subscribedEvents: [...EVENTOS_SUSCRITOS] },
                authentication: { hmac: { secretKey: secreto } },
            },
        },
    };
}

// ── Búsqueda de una factura enviada ──────────────────────────────────────────

/**
 * Consulta de búsqueda (sintaxis Lucene de la documentación de Iopole,
 * "Search"): facturas EMITIDAS por el SIREN del negocio desde un día antes del
 * envío. Los campos `invoice.direction`, `seller.siren` y `createdDate` son los
 * de los ejemplos oficiales; el número de factura se compara en la respuesta
 * (`businessData.invoiceId`), no en la consulta.
 */
export function consultaFacturas(siren: string, desde: string): string {
    const d = new Date(desde);
    const t = Number.isNaN(d.getTime()) ? new Date(Date.now() - 86_400_000) : new Date(d.getTime() - 86_400_000);
    const fecha = t.toISOString().slice(0, 19).replace('T', ' ');
    return `invoice.direction:"OUTBOUND" AND seller.siren:"${siren.replace(/[^0-9]/g, '')}" AND createdDate:>"${fecha}"`;
}

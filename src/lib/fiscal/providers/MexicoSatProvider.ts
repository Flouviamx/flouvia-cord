import type { FiscalProvider, FiscalCancelRequest, FiscalCancelResponse, FiscalDocumentRequest, FiscalDocumentResponse } from '../index';
import { mexicoItems } from './mexico-items';
import { toAlpha3 } from '../../countries';
import { PERIODICIDADES, PUBLICO_EN_GENERAL, RFC_GENERICO_NACIONAL, esNombrePublicoGeneral, isFormaPago } from '../cfdi-catalogos';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Proveedor fiscal de México: timbra CFDI 4.0 vía Facturapi (facturapi.io).
//
// Gated por env: si FACTURAPI_KEY está seteada (sk_test_… o sk_live_…), crea la
// factura real en Facturapi y devuelve el UUID del SAT. Si NO está configurada,
// devuelve una respuesta SIMULADA marcada `simulado: true` en provider_data —
// para que la app nunca confunda un timbre de prueba con uno real.
//
// Facturapi autentica con HTTP Basic: la API key como usuario, password vacío.
// Astro/Vite carga `.env` en `import.meta.env`; algunas funciones desplegadas
// lo exponen además en `process.env`. Leer ambos carriles evita que desarrollo
// ignore una llave válida y degrade silenciosamente a una emisión simulada.
const FACTURAPI_KEY = import.meta.env.FACTURAPI_API_KEY
  || import.meta.env.FACTURAPI_KEY
  || process.env.FACTURAPI_API_KEY
  || process.env.FACTURAPI_KEY
  || '';
const FACTURAPI_BASE = (import.meta.env.FACTURAPI_URL || process.env.FACTURAPI_URL || 'https://www.facturapi.io/v2').replace(/\/$/, '');

function authHeader(key: string): string {
  return 'Basic ' + Buffer.from(`${key}:`).toString('base64');
}

/**
 * Receptor en el formato de Facturapi; el mismo para el ingreso y su complemento de pago.
 *
 * `issuerZip` es el código postal del EMISOR (el LugarExpedicion del CFDI): el
 * Anexo 20 exige que un receptor con RFC genérico XAXX010101000 declare como
 * DomicilioFiscalReceptor ese mismo código postal, y régimen 616. Antes se
 * mandaba el del cliente o "00000", que el SAT rechaza.
 */
function facturapiCustomer(c: FiscalDocumentRequest['recipient'], issuerZip?: string):
  | { ok: true; customer: Record<string, unknown>; generico: boolean; extranjero: boolean; foreignCountry: string | null }
  | { ok: false; error: string } {
  // ── Receptor extranjero ────────────────────────────────────────────────
  // Un cliente con país distinto de México no tiene RFC: el CFDI lleva el RFC
  // genérico de extranjeros (XEXX010101000), su residencia fiscal y, si lo
  // tiene, su número de identificación tributaria (NumRegIdTrib). Facturapi
  // arma todo eso cuando `address.country` NO es "MEX" (ISO alfa-3) y
  // `tax_id` trae el número extranjero; `tax_system` solo es obligatorio para
  // nacionales y no se manda. Antes el RFC genérico de PÚBLICO EN GENERAL
  // (XAXX) se usaba también aquí y el CFDI declaraba nacional a un cliente de
  // Madrid o de Austin. Lo comparten la factura y su complemento de pago: el
  // receptor de un CFDI tipo P tiene que ser el mismo de la factura.
  const recipientCountry = String(c.address?.countryCode || 'MX').toUpperCase();
  const extranjero = recipientCountry !== 'MX';
  const foreignCountry = extranjero ? toAlpha3(recipientCountry) : null;
  if (extranjero && !foreignCountry) {
    return { ok: false, error: 'El país del cliente no es válido para el CFDI. Revísalo en su ficha.' };
  }
  const rfc = extranjero ? '' : String(c.taxId || '').toUpperCase().trim();
  // RFC genérico = "público en general" (sin RFC real del cliente).
  const generico = !extranjero && (!rfc || rfc === 'XAXX010101000');
  // NumRegIdTrib: el identificador fiscal del país del cliente, sin espacios
  // (el SAT lo valida contra el formato de ese país); hasta 40 caracteres.
  const foreignTaxId = extranjero ? String(c.taxId || '').replace(/\s/g, '').toUpperCase().slice(0, 40) : '';
  const lugarExpedicion = String(issuerZip || '').trim();
  if (generico && !/^\d{5}$/.test(lugarExpedicion)) {
    return { ok: false, error: 'Para facturar a un cliente sin RFC, el CFDI declara el código postal fiscal de tu negocio. Captúralo en Ajustes › Datos fiscales.' };
  }
  // "PUBLICO EN GENERAL" con el RFC genérico obliga al SAT a exigir el nodo de
  // factura global (Anexo 20, InformacionGlobal). Un comprobante individual a
  // un cliente sin RFC lleva el nombre del cliente; la global tiene su carril.
  if (generico && esNombrePublicoGeneral(c.legalName)) {
    return { ok: false, error: 'Una factura a "PUBLICO EN GENERAL" solo se emite como factura global. Usa el nombre de tu cliente o emite la factura global del periodo.' };
  }

  const customer = extranjero
    ? {
        legal_name: String(c.legalName || 'CLIENTE EXTRANJERO').toUpperCase().slice(0, 254),
        ...(foreignTaxId ? { tax_id: foreignTaxId } : {}),
        address: {
          country: foreignCountry,
          ...(c.address?.postalCode ? { zip: String(c.address.postalCode).slice(0, 20) } : {}),
          ...(c.address?.city ? { city: String(c.address.city).slice(0, 100) } : {}),
        },
        ...(c.email ? { email: String(c.email) } : {}),
      }
    : {
        legal_name: String(c.legalName || 'CLIENTE').toUpperCase().slice(0, 254),
        tax_id: generico ? RFC_GENERICO_NACIONAL : rfc,
        // Con el RFC genérico el SAT exige 616 (Sin obligaciones fiscales), sin
        // importar lo que diga la ficha; con RFC real, el del cliente o 601.
        tax_system: generico ? '616' : (c.taxSystem || '601'),
        address: { zip: generico ? lugarExpedicion : String(c.address?.postalCode || '00000') },
        ...(c.email ? { email: String(c.email) } : {}),
      };
  return { ok: true, customer, generico, extranjero, foreignCountry };
}

export interface PaymentComplementRequest {
  /** Id del CFDI de ingreso EN FACTURAPI (no el UUID del SAT). */
  facturapiInvoiceId: string;
  providerApiKey?: string;
  recipient: FiscalDocumentRequest['recipient'];
  /** Importe del pago en la divisa de la factura. */
  amount: number;
  /** Forma de pago del catálogo c_FormaPago (03, 04, 28…). */
  paymentForm: string;
  /** Cuándo se recibió el dinero (ISO). */
  paidAt: string;
  reference?: string | null;
  idempotencyKey: string;
  externalId: string;
}

export class MexicoSatProvider implements FiscalProvider {
  /**
   * Timbra el complemento de pago (CFDI tipo P, Pagos 2.0) de un cobro sobre un
   * CFDI emitido como PPD. El documento relacionado —parcialidad, saldo
   * anterior e impuestos prorrateados al importe— lo calcula el propio PAC con
   * `GET /invoices/{id}/payment-summary`, que la especificación de Facturapi
   * declara "listo para usarse" como elemento de `related_documents`: calcular
   * aquí la proporción de cada impuesto sería otra aritmética que diverge.
   */
  async issuePaymentComplement(input: PaymentComplementRequest): Promise<FiscalDocumentResponse> {
    const apiKey = input.providerApiKey || FACTURAPI_KEY;
    if (!apiKey) {
      return { success: false, provider: 'facturapi', documentId: input.externalId,
        error: 'No hay una credencial de timbrado configurada para emitir el complemento de pago.' };
    }
    const receptor = facturapiCustomer(input.recipient);
    if (!receptor.ok) return { success: false, provider: 'facturapi', documentId: input.externalId, error: receptor.error };
    const headers = { 'Content-Type': 'application/json', Authorization: authHeader(apiKey) };
    try {
      const summaryRes = await fetch(
        `${FACTURAPI_BASE}/invoices/${encodeURIComponent(input.facturapiInvoiceId)}/payment-summary?amount=${encodeURIComponent(String(input.amount))}`,
        { headers, signal: AbortSignal.timeout(25000) },
      );
      const summary: any = await summaryRes.json().catch(() => null);
      if (!summaryRes.ok || !summary?.uuid) {
        return { success: false, provider: 'facturapi', documentId: input.externalId,
          error: summaryRes.status >= 500
            ? 'El servicio de timbrado no respondió. El complemento de pago se reintentará.'
            : (typeof summary?.message === 'string' ? summary.message.replace(/facturapi/gi, 'el servicio de timbrado') : 'No se pudo preparar el complemento de pago.'),
          rawProviderData: { http_status: summaryRes.status, stage: 'payment_summary', retry_safe: true } };
      }
      // `date` solo cuando el pago es anterior a la emisión del complemento, y
      // nunca en el futuro (la especificación rechaza fechas futuras).
      const paidAt = new Date(input.paidAt);
      const sendDate = Number.isFinite(paidAt.getTime()) && paidAt.getTime() < Date.now() - 60_000;
      const body = {
        type: 'P',
        customer: receptor.customer,
        complements: [{
          type: 'pago',
          data: [{
            payment_form: input.paymentForm,
            ...(sendDate ? { date: paidAt.toISOString() } : {}),
            ...(input.reference ? { numOperacion: String(input.reference).slice(0, 100) } : {}),
            related_documents: [summary],
          }],
        }],
        idempotency_key: input.idempotencyKey,
        external_id: input.externalId,
      };
      const res = await fetch(`${FACTURAPI_BASE}/invoices`, {
        method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(25000),
      });
      const data: any = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { success: false, provider: 'facturapi', documentId: input.externalId,
          error: res.status >= 500
            ? 'El servicio de timbrado no respondió. El complemento de pago se reintentará.'
            : (typeof data?.message === 'string' ? data.message.replace(/facturapi/gi, 'el servicio de timbrado') : 'El SAT rechazó el complemento de pago.'),
          rawProviderData: { http_status: res.status, delivery_uncertain: res.status >= 500, retry_safe: true } };
      }
      return { success: true, provider: 'facturapi', documentId: data.id, fiscalId: data.uuid,
        rawProviderData: { facturapi_id: data.id, uuid: data.uuid, livemode: data.livemode, installment: summary.installment, last_balance: summary.last_balance } };
    } catch (err: any) {
      return { success: false, provider: 'facturapi', documentId: input.externalId,
        error: 'No pudimos comunicarnos con el servicio de timbrado. El complemento de pago se reintentará.',
        rawProviderData: { delivery_uncertain: true, retry_safe: true, error_kind: err?.name === 'TimeoutError' ? 'timeout' : 'network' } };
    }
  }

  supports(countryCode: string): boolean {
    return countryCode.toUpperCase() === 'MX';
  }

  async issueDocument(request: FiscalDocumentRequest): Promise<FiscalDocumentResponse> {
    // Multi-tenant: si la org subió su CSD, usamos SU llave LIVE (timbra bajo su
    // RFC). Si no, caemos a la llave global de la cuenta (modo una-sola-cuenta).
    const apiKey = request.providerApiKey || FACTURAPI_KEY;

    // Sin ninguna llave → timbre simulado, honesto (no finge un UUID real).
    if (!apiKey) {
      return {
        success: true,
        provider: 'facturapi',
        documentId: 'sim_mx_' + request.quoteId,
        fiscalId: undefined,
        pdfUrl: `/api/fiscal/documents/${request.documentId}/pdf`,
        rawProviderData: {
          simulado: true,
          motivo: 'Sin credencial de timbrado configurada',
          idempotency_key: request.idempotencyKey,
        },
      };
    }

    // ── Factura global ─────────────────────────────────────────────────────
    // Guía de llenado del CFDI global 4.0: receptor XAXX010101000 "PUBLICO EN
    // GENERAL", régimen 616, uso S01, DomicilioFiscalReceptor = LugarExpedicion,
    // método PUE y nodo InformacionGlobal (Facturapi: objeto `global`).
    const global = request.global;
    const issuerZip = String(request.issuer?.address?.postalCode || '').trim();
    if (global) {
      const periodicity = PERIODICIDADES[global.periodicidad as keyof typeof PERIODICIDADES]?.facturapi;
      if (!periodicity || !/^(0[1-9]|1[0-8])$/.test(global.meses) || !Number.isInteger(global.anio)) {
        return { success: false, provider: 'facturapi', documentId: request.documentId, error: 'El periodo de la factura global no es válido.' };
      }
      if (!/^\d{5}$/.test(issuerZip)) {
        return { success: false, provider: 'facturapi', documentId: request.documentId,
          error: 'La factura global declara el código postal fiscal de tu negocio. Captúralo en Ajustes › Datos fiscales.' };
      }
      if (!isFormaPago(request.cfdi?.paymentForm)) {
        return { success: false, provider: 'facturapi', documentId: request.documentId, error: 'Elige la forma de pago de la factura global.' };
      }
    }
    const receptor = global
      ? { ok: true as const, generico: true, extranjero: false, foreignCountry: null,
          customer: { legal_name: PUBLICO_EN_GENERAL, tax_id: RFC_GENERICO_NACIONAL, tax_system: '616', address: { zip: issuerZip } } }
      : facturapiCustomer(request.recipient, issuerZip);
    if (!receptor.ok) return { success: false, provider: 'facturapi', documentId: request.documentId, error: receptor.error };
    const { customer, generico, extranjero, foreignCountry } = receptor;
    // Sustitución (relación 04): el UUID del comprobante que este reemplaza.
    const substitutes = !global && request.substitutesFiscalId ? String(request.substitutesFiscalId) : '';
    if (substitutes && !UUID_RE.test(substitutes)) {
      return { success: false, provider: 'facturapi', documentId: request.documentId,
        error: 'La factura que se sustituye no tiene un folio fiscal válido.' };
    }

    const isCreditNote = ['cfdi_egreso', 'credit_note'].includes(request.documentType || '');
    if (isCreditNote && !UUID_RE.test(request.relatedFiscalId || '')) {
      return { success: false, provider: 'facturapi', documentId: request.documentId,
        error: 'La nota de crédito necesita el folio fiscal de la factura original.' };
    }
    let items;
    try { items = mexicoItems(request); }
    catch (error) {
      return { success: false, provider: 'facturapi', documentId: request.documentId,
        error: error instanceof Error ? error.message : 'El desglose fiscal no es válido.' };
    }

    // Uso del CFDI: con RFC genérico —público en general o extranjero— el SAT
    // EXIGE S01 (sin efectos fiscales): ese receptor no deduce en México. Con
    // RFC real se usa el uso configurado o G03 por defecto.
    const sinEfectos = generico || extranjero;
    const cfdiUse = sinEfectos ? 'S01' : (request.cfdi?.use || 'G03');
    // Divisa y tipo de cambio del comprobante. Facturapi asume MXN cuando no se
    // manda `currency`: un CFDI de una venta en USD se timbraba con los importes
    // en dólares pero etiquetados como pesos. El SAT exige `exchange` (TipoCambio)
    // en cuanto la moneda no es la nacional.
    //
    // OJO con la semántica: el TipoCambio del SAT es SIEMPRE moneda del
    // comprobante → MXN. Si la contabilidad de la organización lleva una tercera
    // divisa (una org mexicana con libros en USD, por ejemplo), la tasa que trae
    // el documento apunta a esa divisa y NO sirve como TipoCambio. En ese caso no
    // se manda un número que el SAT interpretaría mal: se omite y el timbrado
    // falla del lado del PAC con un error explícito, en vez de sellar un CFDI con
    // un tipo de cambio incorrecto.
    const currency = String(request.totals.currency || 'MXN').toUpperCase();
    const ledger = String(request.totals.ledgerCurrency || 'MXN').toUpperCase();
    const rate = Number(request.totals.exchangeRate);
    const exchange = ledger === 'MXN' ? rate : Number.NaN;
    const body = {
      type: isCreditNote ? 'E' : 'I',
      ...(isCreditNote ? { related_documents: [{ relationship: '01', documents: [request.relatedFiscalId] }] } : {}),
      ...(!isCreditNote && substitutes ? { related_documents: [{ relationship: '04', documents: [substitutes] }] } : {}),
      ...(global ? { global: { periodicity: PERIODICIDADES[global.periodicidad as keyof typeof PERIODICIDADES].facturapi, months: global.meses, year: global.anio } } : {}),
      customer,
      items,
      currency,
      ...(currency !== 'MXN' && Number.isFinite(exchange) && exchange > 0
        ? { exchange }
        : {}),
      use: isCreditNote && !sinEfectos ? 'G02' : cfdiUse,
      payment_form: request.cfdi?.paymentForm || '03', // 03 = Transferencia electrónica
      // La global es SIEMPRE PUE (Guía de llenado del CFDI global).
      payment_method: global ? 'PUE' : (request.cfdi?.paymentMethod || 'PUE'),
      // Facturapi documenta esta llave como la protección oficial contra
      // duplicados al reintentar la misma petición.
      idempotency_key: request.idempotencyKey,
      external_id: request.documentId,
    };

    try {
      const res = await fetch(`${FACTURAPI_BASE}/invoices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: authHeader(apiKey) },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(25000),
      });
      const data: any = await res.json().catch(() => ({}));
      if (!res.ok) {
        const providerPayload = data && typeof data === 'object' && !Array.isArray(data)
          ? data
          : { response: data };
        return {
          success: false,
          provider: 'facturapi',
          documentId: 'err_mx_' + request.quoteId,
          // El mensaje de validación del SAT (RFC no inscrito, régimen que no
          // corresponde…) es accionable para el vendedor y se conserva; lo que
          // nunca llega a la pantalla es el nombre del proveedor (regla 14).
          error: res.status >= 500
            ? 'El servicio de timbrado no respondió. Reintenta en unos minutos: no se duplicará.'
            : (typeof data?.message === 'string' && data.message.trim()
              ? data.message.replace(/facturapi/gi, 'el servicio de timbrado')
              : 'El SAT rechazó el comprobante. Revisa los datos fiscales del cliente y del negocio.'),
          rawProviderData: {
            ...providerPayload,
            // Un 5xx puede ocurrir después de que el PAC aceptó el documento.
            // Se conserva la señal para auditoría; el reintento usa exactamente
            // la misma idempotency_key reconocida por Facturapi.
            delivery_uncertain: res.status >= 500,
            retry_safe: true,
            idempotency_key: request.idempotencyKey,
            http_status: res.status,
          },
        };
      }
      return {
        success: true,
        provider: 'facturapi',
        documentId: data.id,
        fiscalId: data.uuid, // Folio fiscal (UUID) del SAT
        // Facturapi no expone URLs públicas: el PDF/XML se sirven por un proxy de Cord.
        pdfUrl: data.id ? `/api/fiscal/documents/${request.documentId}/pdf` : undefined,
        xmlUrl: data.id ? `/api/fiscal/documents/${request.documentId}/xml` : undefined,
        rawProviderData: {
          facturapi_id: data.id,
          uuid: data.uuid,
          total: data.total,
          currency,
          exchange: currency !== 'MXN' && Number.isFinite(exchange) && exchange > 0 ? exchange : undefined,
          status: data.status,
          livemode: data.livemode,
          idempotency_key: request.idempotencyKey,
          credential_scope: request.providerApiKey ? 'organization' : 'platform',
          // Lo leen el complemento de pago (solo un PPD lo necesita) y la
          // conciliación: es lo que el comprobante declaró ante el SAT.
          payment_method: body.payment_method,
          payment_form: body.payment_form,
          // Auditoría: con qué residencia fiscal se timbró a un extranjero.
          ...(extranjero ? { receptor_extranjero: foreignCountry } : {}),
          ...(substitutes ? { sustituye_uuid: substitutes } : {}),
          ...(global ? { global: { periodicidad: global.periodicidad, meses: global.meses, anio: global.anio } } : {}),
        },
      };
    } catch (err: any) {
      return {
        success: false,
        provider: 'facturapi',
        documentId: 'err_mx_' + request.quoteId,
        // Regla 14: el estado, no el proveedor ni el error de red crudo.
        error: 'No pudimos comunicarnos con el servicio de timbrado. Reintenta en unos minutos: no se duplicará.',
        // La petición pudo haber llegado al PAC aunque Cord no recibiera la
        // respuesta. El siguiente intento conserva la misma llave oficial de
        // idempotencia, por lo que no crea otro CFDI.
        rawProviderData: {
          delivery_uncertain: true,
          retry_safe: true,
          idempotency_key: request.idempotencyKey,
          error_kind: err?.name === 'TimeoutError' ? 'timeout' : 'network',
        },
      };
    }
  }

  /**
   * Cancela un CFDI ante el SAT. La llave de la ORGANIZACIÓN emisora manda: un
   * CFDI timbrado bajo el CSD del cliente no existe en la cuenta global, así
   * que cancelar con la global devolvía 404 y dejaba el comprobante vivo en el
   * SAT mientras Cord lo pintaba como cancelado.
   */
  async cancelDocument(documentId: string, request?: FiscalCancelRequest): Promise<FiscalCancelResponse> {
    const key = request?.providerApiKey || FACTURAPI_KEY;
    if (!key) return { success: false, status: 'unknown', error: 'Falta la credencial del emisor para consultar la cancelación.' };
    const motive = MexicoSatProvider.cancelMotive(request?.reason);
    // Motivo 01: el folio fiscal del comprobante que ya sustituyó a este
    // (Facturapi: parámetro `substitution`, acepta su ID o el UUID).
    const substitution = motive === '01' && UUID_RE.test(String(request?.substitution || '')) ? String(request?.substitution) : '';
    const url = `${FACTURAPI_BASE}/invoices/${encodeURIComponent(documentId)}`;
    const deleteUrl = `${url}?motive=${motive}${substitution ? `&substitution=${encodeURIComponent(substitution)}` : ''}`;
    const read = async (method: 'GET' | 'DELETE'): Promise<FiscalCancelResponse> => {
      const res = await fetch(method === 'DELETE' ? deleteUrl : url, {
        method, headers: { Authorization: authHeader(key) }, signal: AbortSignal.timeout(25000),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || data.id !== documentId) {
        return { success: false, status: 'unknown', error: 'No se pudo confirmar el estado de cancelación.',
          rawProviderData: { http_status: res.status, motive, status: 'unknown' } };
      }
      const status: FiscalCancelResponse['status'] = data.status === 'canceled' && data.cancellation_status === 'accepted'
        ? 'accepted'
        : data.status === 'valid' && ['pending', 'verifying', 'rejected', 'expired', 'none'].includes(data.cancellation_status)
          ? data.cancellation_status : 'unknown';
      return { success: status !== 'unknown', status,
        ...(status === 'unknown' ? { error: 'El estado fiscal aún no está confirmado.' } : {}),
        rawProviderData: { status, invoice_status: data.status, cancellation_status: data.cancellation_status, motive,
          ...(substitution ? { substitution } : {}), checked_at: new Date().toISOString() } };
    };
    try {
      // Consultar primero también recupera un DELETE aceptado cuya respuesta se perdió.
      const current = await read('GET');
      if (!current.success || request?.checkOnly || ['accepted', 'pending', 'verifying'].includes(current.status || '')) return current;
      if (motive === '01' && !substitution) return { success: false, status: current.status,
        error: 'El motivo 01 requiere una factura de sustitución; usa el flujo de sustitución fiscal.' };
      return await read('DELETE');
    } catch {
      return { success: false, status: 'unknown', error: 'No se pudo confirmar la cancelación. Consulta su estado antes de reintentar.',
        rawProviderData: { status: 'unknown', motive, retry_safe: true } };
    }
  }

  private static cancelMotive(reason?: string): string {
    return ['01', '02', '03', '04'].includes(String(reason || '')) ? String(reason) : '02';
  }
}

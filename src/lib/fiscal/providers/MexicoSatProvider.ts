import type { FiscalProvider, FiscalCancelRequest, FiscalCancelResponse, FiscalDocumentRequest, FiscalDocumentResponse } from '../index';
import { mexicoItems } from './mexico-items';

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

/** Receptor en el formato de Facturapi; el mismo para el ingreso y su complemento de pago. */
function facturapiCustomer(c: FiscalDocumentRequest['recipient']) {
  const rfc = String(c.taxId || '').toUpperCase().trim();
  // RFC genérico = "público en general" (sin RFC real del cliente).
  const generico = !rfc || rfc === 'XAXX010101000';
  const customer = {
    legal_name: String(c.legalName || 'PÚBLICO EN GENERAL').toUpperCase().slice(0, 254),
    tax_id: generico ? 'XAXX010101000' : rfc,
    // 616 = Sin obligaciones fiscales (genérico); 601 = Persona Moral (default con RFC).
    tax_system: c.taxSystem || (generico ? '616' : '601'),
    address: { zip: String(c.address?.postalCode || '00000') },
    ...(c.email ? { email: String(c.email) } : {}),
  };
  return { customer, generico };
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
        customer: facturapiCustomer(input.recipient).customer,
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

    const { customer, generico } = facturapiCustomer(request.recipient);

    const isCreditNote = ['cfdi_egreso', 'credit_note'].includes(request.documentType || '');
    if (isCreditNote && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(request.relatedFiscalId || '')) {
      return { success: false, provider: 'facturapi', documentId: request.documentId,
        error: 'La nota de crédito necesita el folio fiscal de la factura original.' };
    }
    let items;
    try { items = mexicoItems(request); }
    catch (error) {
      return { success: false, provider: 'facturapi', documentId: request.documentId,
        error: error instanceof Error ? error.message : 'El desglose fiscal no es válido.' };
    }

    // Uso del CFDI: "público en general" (RFC genérico) EXIGE S01 (sin efectos
    // fiscales); con RFC real se usa el uso configurado o G03 por defecto.
    const cfdiUse = generico ? 'S01' : (request.cfdi?.use || 'G03');
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
      customer,
      items,
      currency,
      ...(currency !== 'MXN' && Number.isFinite(exchange) && exchange > 0
        ? { exchange }
        : {}),
      use: isCreditNote && !generico ? 'G02' : cfdiUse,
      payment_form: request.cfdi?.paymentForm || '03', // 03 = Transferencia electrónica
      payment_method: request.cfdi?.paymentMethod || 'PUE',
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
    const url = `${FACTURAPI_BASE}/invoices/${encodeURIComponent(documentId)}`;
    const read = async (method: 'GET' | 'DELETE'): Promise<FiscalCancelResponse> => {
      const res = await fetch(method === 'DELETE' ? `${url}?motive=${motive}` : url, {
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
        rawProviderData: { status, invoice_status: data.status, cancellation_status: data.cancellation_status, motive, checked_at: new Date().toISOString() } };
    };
    try {
      // Consultar primero también recupera un DELETE aceptado cuya respuesta se perdió.
      const current = await read('GET');
      if (!current.success || request?.checkOnly || ['accepted', 'pending', 'verifying'].includes(current.status || '')) return current;
      if (motive === '01') return { success: false, status: current.status,
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

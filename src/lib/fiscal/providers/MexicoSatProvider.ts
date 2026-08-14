import type { FiscalProvider, FiscalDocumentRequest, FiscalDocumentResponse } from '../index';

// Proveedor fiscal de México: timbra CFDI 4.0 vía Facturapi (facturapi.io).
//
// Gated por env: si FACTURAPI_KEY está seteada (sk_test_… o sk_live_…), crea la
// factura real en Facturapi y devuelve el UUID del SAT. Si NO está configurada,
// devuelve una respuesta SIMULADA marcada `simulado: true` en provider_data —
// para que la app nunca confunda un timbre de prueba con uno real.
//
// Facturapi autentica con HTTP Basic: la API key como usuario, password vacío.
const FACTURAPI_KEY = process.env.FACTURAPI_API_KEY || process.env.FACTURAPI_KEY || '';
const FACTURAPI_BASE = (process.env.FACTURAPI_URL || 'https://www.facturapi.io/v2').replace(/\/$/, '');

function authHeader(key: string): string {
  return 'Basic ' + Buffer.from(`${key}:`).toString('base64');
}

export class MexicoSatProvider implements FiscalProvider {
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
          motivo: 'Facturapi no configurado (falta CSD del cliente y FACTURAPI_API_KEY global)',
          idempotency_key: request.idempotencyKey,
        },
      };
    }

    const c = request.recipient;
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

    const items = request.lines.map((it) => ({
      quantity: it.quantity,
      product: {
        description: String(it.description || 'Concepto').slice(0, 1000),
        // Claves SAT por defecto: 01010101 = "No existe en el catálogo"; H87 = Pieza.
        product_key: String(it.productKey || '01010101'),
        unit_key: String(it.unitKey || 'H87'),
        price: it.unitPrice,
        tax_included: false, // Cord maneja precios SIN IVA; Facturapi agrega el 16%.
      },
    }));

    // Uso del CFDI: "público en general" (RFC genérico) EXIGE S01 (sin efectos
    // fiscales); con RFC real se usa el uso configurado o G03 por defecto.
    const cfdiUse = generico ? 'S01' : (request.cfdi?.use || 'G03');
    const body = {
      customer,
      items,
      use: cfdiUse,
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
          error: data?.message || `Facturapi ${res.status}`,
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
          status: data.status,
          livemode: data.livemode,
          idempotency_key: request.idempotencyKey,
          credential_scope: request.providerApiKey ? 'organization' : 'platform',
        },
      };
    } catch (err: any) {
      return {
        success: false,
        provider: 'facturapi',
        documentId: 'err_mx_' + request.quoteId,
        error: err?.message || 'fallo de red con Facturapi',
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

  async cancelDocument(documentId: string, reason?: string): Promise<boolean> {
    // Nota: cancelar usa la llave global (la interfaz no recibe el contexto de org).
    if (!FACTURAPI_KEY) return true; // simulado
    try {
      // Facturapi: DELETE /invoices/{id}?motive=02 (02 = comprobante con errores sin relación).
      const res = await fetch(`${FACTURAPI_BASE}/invoices/${documentId}?motive=${encodeURIComponent(reason || '02')}`, {
        method: 'DELETE',
        headers: { Authorization: authHeader(FACTURAPI_KEY) },
        signal: AbortSignal.timeout(25000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}

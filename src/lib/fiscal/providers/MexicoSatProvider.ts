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
        documentId: 'sim_mx_' + request.quoteId,
        fiscalId: undefined,
        rawProviderData: { simulado: true, motivo: 'Facturapi no configurado (falta CSD del cliente y FACTURAPI_API_KEY global)' },
      };
    }

    const c: any = request.customerData || {};
    const rfc = String(c.tax_id || '').toUpperCase().trim();
    // RFC genérico = "público en general" (sin RFC real del cliente).
    const generico = !rfc || rfc === 'XAXX010101000';

    const customer = {
      legal_name: String(c.legal_name || 'PÚBLICO EN GENERAL').toUpperCase().slice(0, 254),
      tax_id: generico ? 'XAXX010101000' : rfc,
      // 616 = Sin obligaciones fiscales (genérico); 601 = Persona Moral (default con RFC).
      tax_system: c.tax_system || (generico ? '616' : '601'),
      address: { zip: String(c.zip || '00000') },
      ...(c.email ? { email: String(c.email) } : {}),
    };

    const items = (request.items || []).map((it: any) => ({
      quantity: Number(it.quantity ?? it.cantidad ?? 1),
      product: {
        description: String(it.description ?? it.descripcion ?? 'Concepto').slice(0, 1000),
        // Claves SAT por defecto: 01010101 = "No existe en el catálogo"; H87 = Pieza.
        product_key: String(it.product_key || '01010101'),
        unit_key: String(it.unit_key || 'H87'),
        price: Number(it.unit_price ?? it.precio_negociado ?? it.precio_unitario ?? 0),
        tax_included: false, // Cord maneja precios SIN IVA; Facturapi agrega el 16%.
      },
    }));

    // Uso del CFDI: "público en general" (RFC genérico) EXIGE S01 (sin efectos
    // fiscales); con RFC real se usa el uso configurado o G03 por defecto.
    const cfdiUse = generico ? 'S01' : (c.cfdi_use || 'G03');
    const body = {
      customer,
      items,
      use: cfdiUse,
      payment_form: c.payment_form || '03', // 03 = Transferencia electrónica
      payment_method: 'PUE',             // Pago en una sola exhibición
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
        return {
          success: false,
          documentId: 'err_mx_' + request.quoteId,
          error: data?.message || `Facturapi ${res.status}`,
          rawProviderData: data,
        };
      }
      return {
        success: true,
        documentId: data.id,
        fiscalId: data.uuid, // Folio fiscal (UUID) del SAT
        // Facturapi no expone URLs públicas: el PDF/XML se sirven por un proxy de Cord.
        pdfUrl: data.id ? `/api/cotizaciones/${request.quoteId}/cfdi?type=pdf` : undefined,
        xmlUrl: data.id ? `/api/cotizaciones/${request.quoteId}/cfdi?type=xml` : undefined,
        rawProviderData: { facturapi_id: data.id, uuid: data.uuid, total: data.total, status: data.status, livemode: data.livemode },
      };
    } catch (err: any) {
      return { success: false, documentId: 'err_mx_' + request.quoteId, error: err?.message || 'fallo de red con Facturapi' };
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

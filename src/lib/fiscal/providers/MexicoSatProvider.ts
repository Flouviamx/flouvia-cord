import type { FiscalProvider, FiscalDocumentRequest, FiscalDocumentResponse } from '../index';

// Proveedor fiscal de México: timbra CFDI 4.0 contra un PAC.
//
// Integración REAL gated por env: si PAC_API_URL + PAC_API_KEY están seteadas,
// hace el POST de timbrado al PAC y parsea su respuesta. Si NO están configuradas
// (o el PAC falla), devuelve una respuesta SIMULADA marcada explícitamente con
// `simulado: true` en provider_data — para que la app NUNCA confunda un timbre
// de prueba con uno real (el status del documento queda registrado tal cual).
const PAC_URL = process.env.PAC_API_URL || '';
const PAC_KEY = process.env.PAC_API_KEY || '';

export class MexicoSatProvider implements FiscalProvider {
  supports(countryCode: string): boolean {
    return countryCode.toUpperCase() === 'MX';
  }

  async issueDocument(request: FiscalDocumentRequest): Promise<FiscalDocumentResponse> {
    // Sin PAC configurado → timbre simulado, honesto (no finge un UUID real).
    if (!PAC_URL || !PAC_KEY) {
      return {
        success: true,
        documentId: 'sim_mx_' + request.quoteId,
        fiscalId: undefined,
        rawProviderData: { simulado: true, motivo: 'PAC no configurado (faltan PAC_API_URL/PAC_API_KEY)' },
      };
    }

    // Timbrado REAL contra el PAC. Contrato genérico REST — ajustar los nombres
    // de campos a los del PAC contratado (el mismo de la app de Shopify).
    try {
      const res = await fetch(`${PAC_URL.replace(/\/$/, '')}/cfdi/stamp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${PAC_KEY}` },
        body: JSON.stringify({
          org_id: request.orgId,
          quote_id: request.quoteId,
          receptor: request.customerData,
          conceptos: request.items,
          totales: request.totalAmounts,
        }),
        signal: AbortSignal.timeout(15000),
      });

      const data: any = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { success: false, documentId: 'err_mx_' + request.quoteId, error: data?.error || `PAC ${res.status}`, rawProviderData: data };
      }

      return {
        success: true,
        documentId: data.id || data.documentId || ('mx_' + request.quoteId),
        fiscalId: data.uuid || data.fiscal_id, // UUID del SAT
        pdfUrl: data.pdf_url || data.pdfUrl,
        xmlUrl: data.xml_url || data.xmlUrl,
        rawProviderData: data,
      };
    } catch (err: any) {
      return { success: false, documentId: 'err_mx_' + request.quoteId, error: err?.message || 'fallo de red con el PAC' };
    }
  }

  async cancelDocument(documentId: string, reason?: string): Promise<boolean> {
    if (!PAC_URL || !PAC_KEY) return true; // simulado
    try {
      const res = await fetch(`${PAC_URL.replace(/\/$/, '')}/cfdi/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${PAC_KEY}` },
        body: JSON.stringify({ document_id: documentId, motivo: reason }),
        signal: AbortSignal.timeout(15000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}

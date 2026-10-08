// Sin imports a propósito: lo leen la página de detalle (vía queries.ts) y el
// editor, que no deben arrastrar los proveedores fiscales.

/**
 * ¿Falló la emisión con CERTEZA de que no existe comprobante? Solo entonces el
 * borrador con folio reservado se puede corregir y reintentar. Una entrega
 * incierta (timeout, 5xx) pudo haber creado el CFDI del otro lado: ahí se
 * reintenta tal cual, con la misma llave, nunca con otro contenido. Las
 * facturas que nacen de una cotización conservan su llave de idempotencia
 * (`quote:<id>:invoice:v1`) y no se editan por aquí.
 */
export function isRetryableIssuanceError(doc: {
  lifecycle?: unknown; status?: unknown; cotizacion_id?: unknown;
  provider_data?: any; provider_document_id?: unknown;
}): boolean {
  if (doc.lifecycle !== 'draft' || doc.status !== 'error' || doc.cotizacion_id) return false;
  if (doc.provider_data?.delivery_uncertain === true || doc.provider_data?.cord_issuance) return false;
  const providerId = doc.provider_document_id ? String(doc.provider_document_id) : '';
  return !providerId || providerId.startsWith('err_');
}

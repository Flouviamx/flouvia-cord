// Descarga interna: la organización siempre procede de la sesión del vendedor.
export const prerender = false;

import type { APIRoute } from 'astro';
import { getActiveOrgId } from '../../../../../lib/db';
import { requirePermAny } from '../../../../../lib/queries';
import { downloadInvoiceDocument } from '../../../../../lib/fiscal/invoice-download';

export const GET: APIRoute = async ({ params }) => {
  // El PDF/XML lleva el RFC/NIF y el domicilio del cliente. Antes cualquier
  // miembro —incluido "Solo lectura"— lo descargaba por id aunque la bandeja de
  // facturas le estuviera vedada. Cobranza (la bandeja) o cotizar (la descarga
  // desde el detalle de la cotización que originó la factura).
  const denied = await requirePermAny(['cobranza', 'cotizar']);
  if (denied) return denied;
  const orgId = await getActiveOrgId();
  return downloadInvoiceDocument(orgId, params.id ?? '', params.format ?? '');
};

// Descarga interna: la organización siempre procede de la sesión del vendedor.
export const prerender = false;

import type { APIRoute } from 'astro';
import { getActiveOrgId } from '../../../../../lib/db';
import { downloadInvoiceDocument } from '../../../../../lib/fiscal/invoice-download';

export const GET: APIRoute = async ({ params }) => {
  const orgId = await getActiveOrgId();
  return downloadInvoiceDocument(orgId, params.id ?? '', params.format ?? '');
};

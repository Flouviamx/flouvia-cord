// GET /api/cotizaciones/[id]/cfdi?type=pdf|xml
// Sirve el PDF o XML del CFDI emitido por Facturapi para esta cotización.
// Facturapi no expone URLs públicas: descarga el archivo con auth y lo streamea.
// Ruta INTERNA (protegida por el middleware de sesión + filtro por org).
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId, withOrgTx } from '../../../../lib/db';
import { decryptSecret } from '../../../../lib/crypto-secret';
import { requirePermAny } from '../../../../lib/queries';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PRIVATE_HEADERS = {
  'Cache-Control': 'private, no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
};

const FACTURAPI_KEY = import.meta.env.FACTURAPI_API_KEY || process.env.FACTURAPI_API_KEY || import.meta.env.FACTURAPI_KEY || process.env.FACTURAPI_KEY || '';
const FACTURAPI_BASE = (import.meta.env.FACTURAPI_URL || process.env.FACTURAPI_URL || 'https://www.facturapi.io/v2').replace(/\/$/, '');

export const GET: APIRoute = async ({ params, url }) => {
  // Mismo permiso que la descarga interna del documento: el CFDI lleva el RFC y
  // el domicilio fiscal del cliente.
  const denied = await requirePermAny(['cobranza', 'cotizar']);
  if (denied) return denied;
  const type = url.searchParams.get('type') === 'xml' ? 'xml' : 'pdf';
  const orgId = await getActiveOrgId();
  const id = params.id ?? '';
  if (!UUID_RE.test(id)) return new Response('CFDI no encontrado', { status: 404, headers: PRIVATE_HEADERS });

  // Documento fiscal emitido más reciente de esta cotización + la llave LIVE de la
  // org (si timbró bajo su propio RFC, la global no puede descargar su CFDI).
  const [docs] = await withOrgTx(orgId, sql`
    select d.provider_data, o.facturapi_live_key, o.facturapi_live_key_enc
    from documentos_fiscales d
    join orgs o on o.id = d.org_id
    where d.cotizacion_id = ${id} and d.org_id = ${orgId} and d.status = 'issued'
    order by d.created_at desc limit 1`);
  const doc = docs[0];

  const facturapiId = doc?.provider_data?.facturapi_id as string | undefined;
  if (!facturapiId) return new Response('CFDI no encontrado', { status: 404, headers: PRIVATE_HEADERS });

  // La credencial con la que se timbró manda (igual que invoice-download.ts):
  // un CFDI emitido con la llave de plataforma no existe en la cuenta propia
  // que la organización conectó después, y viceversa.
  const orgKey = decryptSecret(doc?.facturapi_live_key_enc as string) || (doc?.facturapi_live_key as string) || '';
  const apiKey = doc?.provider_data?.credential_scope === 'platform' ? FACTURAPI_KEY : (orgKey || FACTURAPI_KEY);
  // Regla 14: el estado, no el proveedor.
  if (!apiKey) return new Response('El documento no está disponible por el momento.', { status: 503, headers: PRIVATE_HEADERS });
  const auth = 'Basic ' + Buffer.from(`${apiKey}:`).toString('base64');
  let res: Response;
  try {
    res = await fetch(`${FACTURAPI_BASE}/invoices/${facturapiId}/${type}`, {
      headers: { Authorization: auth },
      signal: AbortSignal.timeout(25000),
    });
  } catch {
    return new Response('No se pudo obtener el CFDI', { status: 502, headers: PRIVATE_HEADERS });
  }
  if (!res.ok) return new Response('No se pudo obtener el CFDI', { status: 502, headers: PRIVATE_HEADERS });

  const body = await res.arrayBuffer();
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': type === 'xml' ? 'application/xml' : 'application/pdf',
      'Content-Disposition': `inline; filename="cfdi-${String(facturapiId).replace(/[^a-zA-Z0-9._-]/g, '-')}.${type}"`,
      ...PRIVATE_HEADERS,
    },
  });
};

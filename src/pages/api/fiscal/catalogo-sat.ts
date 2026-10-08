// /api/fiscal/catalogo-sat — búsqueda en los catálogos del SAT para clasificar
// un producto del negocio.
//   GET ?tipo=productos&q=consultoria → { disponible, data: [{ clave, descripcion }] }
//   GET ?tipo=unidades&q=hora         → igual, con claves de unidad
//
// c_ClaveProdServ tiene más de 50 000 claves: no se embebe, se busca en el
// catálogo del PAC. Se usa la credencial fiscal del propio negocio si ya
// conectó su CSD y, si no, la de la plataforma. Sin ninguna, responde
// `disponible: false` y la pantalla deja escribir la clave a mano: buscar es
// una ayuda, no un requisito para guardar el producto.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId, withOrgTx } from '../../../lib/db';
import { requirePerm } from '../../../lib/queries';
import { decryptSecret } from '../../../lib/crypto-secret';
import { rateLimit } from '../../../lib/ratelimit';
import { isProductKey, isUnitKey } from '../../../lib/fiscal/sat-claves';

const FACTURAPI_BASE = (import.meta.env.FACTURAPI_URL || process.env.FACTURAPI_URL || 'https://www.facturapi.io/v2').replace(/\/$/, '');
const PLATFORM_KEY = import.meta.env.FACTURAPI_API_KEY || import.meta.env.FACTURAPI_KEY
    || process.env.FACTURAPI_API_KEY || process.env.FACTURAPI_KEY || '';

const TIPOS = { productos: 'products', unidades: 'units' } as const;

export const GET: APIRoute = async ({ url }) => {
    const denied = await requirePerm('productos'); if (denied) return denied;
    const tipo = url.searchParams.get('tipo') as keyof typeof TIPOS;
    if (!tipo || !Object.hasOwn(TIPOS, tipo)) return json({ error: 'tipo debe ser productos o unidades.' }, 400);
    const q = String(url.searchParams.get('q') ?? '').trim().slice(0, 80);
    if (q.length < 2) return json({ disponible: true, data: [] });

    const orgId = await getActiveOrgId();
    const limit = await rateLimit(`sat-catalogo:${orgId}`, 90, 60);
    if (!limit.ok) return json({ error: 'Demasiadas búsquedas seguidas. Espera un momento.' }, 429, { 'Retry-After': String(limit.retryAfter) });

    const [[org]] = await withOrgTx(orgId, sql`
        select facturapi_live_key, facturapi_live_key_enc from orgs where id = ${orgId}`);
    const apiKey = decryptSecret(org?.facturapi_live_key_enc as string)
        || (org?.facturapi_live_key as string)
        || PLATFORM_KEY;
    if (!apiKey) return json({ disponible: false, data: [] });

    let res: Response;
    try {
        res = await fetch(`${FACTURAPI_BASE}/catalogs/${TIPOS[tipo]}?q=${encodeURIComponent(q)}&limit=20`, {
            headers: { Authorization: 'Basic ' + Buffer.from(`${apiKey}:`).toString('base64') },
            signal: AbortSignal.timeout(8000),
        });
    } catch {
        return json({ error: 'El catálogo del SAT no respondió. Intenta de nuevo o escribe la clave.' }, 502);
    }
    // El mensaje del proveedor no viaja al usuario (regla 14).
    if (!res.ok) return json({ error: 'El catálogo del SAT no respondió. Intenta de nuevo o escribe la clave.' }, 502);
    const body: any = await res.json().catch(() => ({}));
    const rows = Array.isArray(body?.data) ? body.data : [];
    const data = rows
        .map((r: any) => {
            // El catálogo devuelve c_ClaveProdServ como número: 01010101 llega
            // como 1010101 y hay que restituir los ceros a la izquierda.
            const raw = String(r?.key ?? '').trim();
            const clave = tipo === 'productos' ? raw.padStart(8, '0') : raw.toUpperCase();
            return { clave, descripcion: String(r?.description ?? '').slice(0, 300) };
        })
        .filter((r: { clave: string }) => (tipo === 'productos' ? isProductKey(r.clave) : isUnitKey(r.clave)));
    return json({ disponible: true, data }, 200, { 'Cache-Control': 'private, max-age=3600' });
};

function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

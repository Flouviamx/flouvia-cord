// /api/mcp/playground — PROBADOR de tools MCP desde la UI (Ajustes › Developers).
// A diferencia de /api/mcp (auth por API key, protocolo JSON-RPC), este corre con
// la SESIÓN de Clerk del usuario y ejecuta una sola tool para que el dev vea qué
// devuelve sin tener que configurar un cliente MCP. Solo tools de LECTURA: las de
// escritura crearían datos reales, así que se rechazan aquí (úsalas con una key).
//   POST { tool, args? } → { ok, result } | { error }
export const prerender = false;

import type { APIRoute } from 'astro';
import { reqIp } from '../../../lib/db';
import { requirePerm } from '../../../lib/queries';
import { MCP_TOOLS } from '../../../lib/mcp';

export const POST: APIRoute = async ({ request }) => {
    const denied = await requirePerm('ajustes');
    if (denied) return denied;

    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }

    const name = String(body.tool ?? '');
    const tool = MCP_TOOLS.find((t) => t.name === name);
    if (!tool) return json({ error: `Tool desconocida: ${name}` }, 404);

    if (tool.scope === 'write') {
        return json({ error: 'El probador solo ejecuta tools de lectura. Las de escritura (crear) requieren una API key real para evitar generar datos de prueba.' }, 400);
    }

    try {
        const result = await tool.handler(body.args ?? {}, { ip: reqIp(request), keyId: 'playground' });
        return json({ ok: true, tool: name, result });
    } catch (err: any) {
        return json({ error: err?.message || 'La tool falló' }, 500);
    }
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

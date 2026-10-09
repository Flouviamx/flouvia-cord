// /api/cupones/validar — ¿aplica este código a este documento?
//   POST { codigo, moneda, cliente_id?, cotizacion_id?, documento_id? }
//     → 200 { cupon: { codigo, nombre, tipo, valor, moneda } }
//     → 404/409 { error, code }   (code = coupon_<motivo>, el editor lo traduce)
//
// Lo usan los editores de cotización y factura para mostrar el descuento antes
// de guardar. Es solo una vista previa: al guardar, el servidor vuelve a validar
// el cupón y calcula el importe con el motor; nunca acepta uno del navegador.
// Basta el permiso de cotizar (quien arma documentos), no el de Ajustes.
export const prerender = false;

import type { APIRoute } from 'astro';
import { getActiveOrgId } from '../../../lib/db';
import { requirePerm } from '../../../lib/queries';
import { strictRateLimit, strictLimitResponse } from '../../../lib/ratelimit';
import { normalizeCurrency } from '../../../lib/currency';
import { MENSAJE_CUPON, validarCupon } from '../../../lib/cupones';
import { normalizarCodigo } from '../../../lib/descuentos';

export const POST: APIRoute = async ({ request }) => {
    const denied = await requirePerm('cotizar'); if (denied) return denied;
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
    const orgId = await getActiveOrgId();
    // Techo por organización: probar códigos al azar no debe ser gratis.
    const limitado = strictLimitResponse(await strictRateLimit(`cupon-validar:${orgId}`, 60, 60));
    if (limitado) return limitado;

    const codigo = normalizarCodigo(body?.codigo);
    if (!codigo) return json({ error: MENSAJE_CUPON.no_existe, code: 'coupon_no_existe' }, 404);
    const moneda = normalizeCurrency(body?.moneda, '');
    if (!moneda) return json({ error: 'Falta la divisa del documento.', code: 'invalid_request' }, 400);

    const r = await validarCupon(orgId, codigo, {
        moneda,
        clienteId: typeof body?.cliente_id === 'string' ? body.cliente_id : null,
        cotizacionId: typeof body?.cotizacion_id === 'string' ? body.cotizacion_id : null,
        documentoId: typeof body?.documento_id === 'string' ? body.documento_id : null,
    });
    if (!r.ok) return json({ error: MENSAJE_CUPON[r.motivo], code: `coupon_${r.motivo}` }, r.motivo === 'no_existe' ? 404 : 409);
    const { cupon } = r;
    return json({ cupon: { codigo: cupon.codigo, nombre: cupon.nombre, tipo: cupon.tipo, valor: cupon.valor, moneda: cupon.moneda } });
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

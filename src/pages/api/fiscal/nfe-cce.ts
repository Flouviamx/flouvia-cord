// /api/fiscal/nfe-cce — Carta de Correção Eletrônica (evento 110110) de una NF-e.
//   POST { documento_id, correcao } → registra la CC-e ante la SEFAZ
//
// Una CC-e corrige datos de una NF-e AUTORIZADA sin cancelarla, con dos límites
// que fija la ley y que la SEFAZ no valida [xCondUso, Ajuste SINIEF 01/07]: no
// corrige importes, cantidades, alícuotas ni bases; ni los datos que cambian
// quién emite o quién recibe; ni la fecha de emisión o de salida. La pantalla
// lo dice antes de enviar. Cada CC-e reemplaza a la anterior (hasta 20 por
// nota) y no se borra. El texto se envía tal cual: es un acto del negocio.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId, logAudit, reqIp, withOrgTx } from '../../../lib/db';
import { requirePerm } from '../../../lib/queries';
import { requireEntitlement } from '../../../lib/org-entitlements';
import { currentUserId } from '../../../lib/context';
import { log } from '../../../lib/log';
import { strictLimitResponse, strictRateLimit } from '../../../lib/ratelimit';
import { railConfig } from '../../../lib/fiscal/latam/config';
import { intentoAutorizado } from '../../../lib/fiscal/latam/comprobantes';
import { esErrorSeguro } from '../../../lib/fiscal/latam/errores';
import { railDeDocumento } from '../../../lib/fiscal/latam/rieles';
import { eventosDaNota, registrarCce } from '../../../lib/fiscal/latam/nfe/eventos';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

export const POST: APIRoute = async ({ request }) => {
    // Corregir una factura emitida es del carril de facturación, como emitirla.
    const denied = await requirePerm('cotizar'); if (denied) return denied;
    const orgId = await getActiveOrgId();
    const subscriptionDenied = await requireEntitlement(orgId, 'cfdi'); if (subscriptionDenied) return subscriptionDenied;
    const limitado = strictLimitResponse(await strictRateLimit(`nfe-cce:${orgId}`, 20, 600));
    if (limitado) return limitado;
    const config = railConfig('nfe');
    if (!config.habilitado) return json({ error: 'La NF-e todavía no está disponible en Cord.' }, 409);

    let body: Record<string, unknown>;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
    const documentoId = String(body?.documento_id ?? '');
    if (!UUID_RE.test(documentoId)) return json({ error: 'Factura no encontrada' }, 404);
    const [[doc]] = await withOrgTx(orgId, sql`
        select id, document_type, invoice_number from documentos_fiscales where id = ${documentoId} and org_id = ${orgId}`);
    if (!doc || railDeDocumento(String(doc.document_type))?.id !== 'nfe') return json({ error: 'Esta factura no es una NF-e.' }, 404);
    const intento = await intentoAutorizado(orgId, documentoId, 'nfe');
    if (!intento) return json({ error: 'La Carta de Correção solo aplica a una NF-e autorizada.' }, 409);
    if (intento.entorno !== config.entorno) return json({ error: 'Esta NF-e se autorizó en otro ambiente de la SEFAZ.' }, 409);

    let r;
    try {
        r = await registrarCce(orgId, intento, String(body?.correcao ?? ''), currentUserId());
    } catch (error) {
        if (esErrorSeguro(error)) return json({ error: error.message }, 409);
        log.error('nfe: no se pudo registrar la CC-e', { route: 'api/fiscal/nfe-cce', orgId, documentoId, err: error });
        return json({ error: 'No pudimos enviar la Carta de Correção a la SEFAZ en este momento. Reintenta en unos minutos.' }, 502);
    }
    if (r.estado === 'registrado') {
        await logAudit(orgId, {
            accion: 'nfe.cce_registrada', entidad: 'factura', entidad_id: documentoId,
            detalle: `Carta de Correção de la NF-e ${doc.invoice_number ?? ''} registrada${r.datos?.nProt ? `, protocolo ${r.datos.nProt}` : ''}`,
            ip: reqIp(request),
        });
    }
    const eventos = await eventosDaNota(orgId, String(intento.autorizacion));
    const status = r.estado === 'registrado' ? 200 : r.estado === 'incierto' ? 202 : 409;
    return json({ ok: r.estado === 'registrado', estado: r.estado, ...(r.mensaje ? { error: r.mensaje } : {}), eventos }, status);
};

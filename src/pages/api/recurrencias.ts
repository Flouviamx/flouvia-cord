// /api/recurrencias — facturas recurrentes de la organización.
//   GET    → { recurrencias: [...] }
//   POST   { clienteId, nombre, lineas, currency, cadencia, diaMes, diasCredito, ... } → { id }
//   PATCH  { id, activa?, diaMes?, diasCredito?, endDate?, nombre? } → { ok }
//   DELETE { id } → { ok }
//
// El gate de plan se evalúa AQUÍ y también en cada corrida del cron: ocultar el
// botón no es autorización (regla 17), y un downgrade debe dejar inoperante lo
// ya creado sin borrarlo.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId, logAudit, reqIp, withOrgTx } from '../../lib/db';
import { requirePerm } from '../../lib/queries';
import { requireEntitlement } from '../../lib/org-entitlements';
import { currentUserId } from '../../lib/context';
import { createRecurrencia, type Cadencia } from '../../lib/fiscal/recurrencias';
import { normalizeCurrency } from '../../lib/currency';

const CADENCIAS = new Set(['mensual', 'trimestral', 'anual']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const GET: APIRoute = async () => {
    const denied = await requirePerm('cobranza'); if (denied) return denied;
    const orgId = await getActiveOrgId();
    const [rows] = await withOrgTx(orgId, sql`
        select r.id, r.nombre, r.currency, r.cadencia, r.dia_mes, r.dias_credito,
               r.next_run_at, r.end_date, r.activa, r.autopay, r.ultimo_error,
               r.ultima_emision_at, cl.empresa as cliente,
               (select count(*)::int from documentos_fiscales d where d.recurrencia_id = r.id) as emitidas
          from documento_recurrencias r
          join clientes cl on cl.id = r.cliente_id
         where r.org_id = ${orgId}
         order by r.activa desc, r.next_run_at asc`);
    return json({ recurrencias: rows });
};

export const POST: APIRoute = async ({ request }) => {
    const denied = await requirePerm('cobranza'); if (denied) return denied;
    const orgId = await getActiveOrgId();
    const gate = await requireEntitlement(orgId, 'recurring_invoices');
    if (gate) return gate;

    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }

    // "Repetir esta factura": la forma natural de crear una recurrencia no es
    // capturar todo otra vez, es señalar una factura que ya salió bien. Las
    // líneas se copian del snapshot inmutable, que es exactamente lo que se
    // facturó — no del catálogo, que pudo cambiar de precio desde entonces.
    let lineasBase = Array.isArray(body.lineas) ? body.lineas : [];
    let clienteId = String(body.clienteId ?? '');
    let currency = body.currency;
    let nombre = String(body.nombre ?? '').trim().slice(0, 120);

    if (UUID_RE.test(String(body.fromDocumentoId ?? ''))) {
        const [[doc]] = await withOrgTx(orgId, sql`
            select d.cliente_id, d.currency, d.line_items_snapshot, d.invoice_number, cl.empresa
              from documentos_fiscales d
              left join clientes cl on cl.id = d.cliente_id
             where d.id = ${String(body.fromDocumentoId)} and d.org_id = ${orgId}
             limit 1`);
        if (!doc) return json({ error: 'Factura no encontrada.' }, 404);
        if (!doc.cliente_id) return json({ error: 'Esta factura no tiene un cliente al que repetirle el cobro.' }, 400);
        clienteId = String(doc.cliente_id);
        currency = doc.currency;
        // El snapshot fiscal usa el vocabulario del documento
        // (description/quantity/unitPrice); el editor y el borrador usan el
        // suyo. Se traduce explícitamente en vez de confiar en que coincidan:
        // con nombres distintos, copiar el objeto tal cual produce líneas con
        // cantidad 0 y precio 0 sin que nada falle.
        lineasBase = (Array.isArray(doc.line_items_snapshot) ? doc.line_items_snapshot : [])
            .map((l: any) => ({
                descripcion: String(l.description ?? l.descripcion ?? ''),
                cantidad: Number(l.quantity ?? l.cantidad) || 1,
                precioUnitario: Number(l.unitPrice ?? l.precioUnitario) || 0,
                taxRate: l.taxRate ?? l.tax_rate ?? null,
            }));
        if (!nombre) nombre = String(doc.empresa || doc.invoice_number || 'Recurrente').slice(0, 120);
    }

    if (!UUID_RE.test(clienteId)) return json({ error: 'Elige un cliente.' }, 400);
    if (!nombre) return json({ error: 'Ponle un nombre a la recurrencia.' }, 400);
    const cadencia = CADENCIAS.has(String(body.cadencia)) ? String(body.cadencia) as Cadencia : 'mensual';

    const result = await createRecurrencia(orgId, {
        clienteId,
        nombre,
        lineas: lineasBase,
        currency: normalizeCurrency(currency),
        cadencia,
        diaMes: Number(body.diaMes) || 1,
        diasCredito: Number(body.diasCredito) || 0,
        notas: body.notas ? String(body.notas).slice(0, 1000) : null,
        primeraEmision: body.primeraEmision ? String(body.primeraEmision).slice(0, 10) : null,
        endDate: body.endDate ? String(body.endDate).slice(0, 10) : null,
        autopay: false,   // el cobro automático llega con el método guardado del cliente
    }, currentUserId());

    if (!result.ok) return json({ error: result.error }, 400);
    await logAudit(orgId, {
        accion: 'recurrencia.creada', entidad: 'recurrencia', entidad_id: result.id,
        detalle: `${nombre} · ${cadencia}`, ip: reqIp(request),
    });
    return json({ id: result.id });
};

export const PATCH: APIRoute = async ({ request }) => {
    const denied = await requirePerm('cobranza'); if (denied) return denied;
    const orgId = await getActiveOrgId();

    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
    const id = String(body.id ?? '');
    if (!UUID_RE.test(id)) return json({ error: 'Falta id' }, 400);

    // Pausar SIEMPRE se permite, incluso sin plan: dejar a alguien sin poder
    // detener una emisión automática porque bajó de plan es un cobro que no
    // puede parar.
    if (typeof body.activa === 'boolean') {
        await withOrgTx(orgId, sql`
            update documento_recurrencias set activa = ${body.activa}, updated_at = now()
             where id = ${id} and org_id = ${orgId}`);
        await logAudit(orgId, {
            accion: body.activa ? 'recurrencia.reanudada' : 'recurrencia.pausada',
            entidad: 'recurrencia', entidad_id: id, ip: reqIp(request),
        });
    }

    // El resto de los cambios sí exige el plan.
    const cambios = ['nombre', 'diaMes', 'diasCredito', 'endDate'].some((k) => body[k] !== undefined);
    if (cambios) {
        const gate = await requireEntitlement(orgId, 'recurring_invoices');
        if (gate) return gate;
        if (body.nombre !== undefined) {
            await withOrgTx(orgId, sql`update documento_recurrencias set nombre = ${String(body.nombre).slice(0, 120)}, updated_at = now() where id = ${id} and org_id = ${orgId}`);
        }
        if (body.diaMes !== undefined) {
            const dia = Math.min(28, Math.max(1, Number(body.diaMes) || 1));
            await withOrgTx(orgId, sql`update documento_recurrencias set dia_mes = ${dia}, updated_at = now() where id = ${id} and org_id = ${orgId}`);
        }
        if (body.diasCredito !== undefined) {
            const dias = Math.max(0, Math.min(365, Number(body.diasCredito) || 0));
            await withOrgTx(orgId, sql`update documento_recurrencias set dias_credito = ${dias}, updated_at = now() where id = ${id} and org_id = ${orgId}`);
        }
        if (body.endDate !== undefined) {
            await withOrgTx(orgId, sql`update documento_recurrencias set end_date = ${body.endDate ? String(body.endDate).slice(0, 10) : null}, updated_at = now() where id = ${id} and org_id = ${orgId}`);
        }
    }
    return json({ ok: true });
};

export const DELETE: APIRoute = async ({ request }) => {
    const denied = await requirePerm('cobranza'); if (denied) return denied;
    const orgId = await getActiveOrgId();
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
    const id = String(body.id ?? '');
    if (!UUID_RE.test(id)) return json({ error: 'Falta id' }, 400);

    // Se borra la recurrencia, NO las facturas que emitió: son documentos
    // fiscales con folio propio y vida independiente.
    const [rows] = await withOrgTx(orgId, sql`
        delete from documento_recurrencias where id = ${id} and org_id = ${orgId} returning nombre`);
    if (!rows.length) return json({ error: 'No encontrada' }, 404);
    await logAudit(orgId, {
        accion: 'recurrencia.eliminada', entidad: 'recurrencia', entidad_id: id,
        detalle: String(rows[0].nombre), ip: reqIp(request),
    });
    return json({ ok: true });
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

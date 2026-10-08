// Acciones de recuperación de Cord Ops: re-entregar un webhook, reintentar un
// workflow fallido y reenviar una factura al cliente.
//
// Ops no tiene su propia versión de estas operaciones: llama a la MISMA función
// que usa la app, en el carril de la organización (withOrgTx con el org_id que
// Ops resolvió de la fila). Así no se amplía ninguna política para Ops y la
// operación respeta las mismas reglas que si la hiciera el negocio — solo
// ejecuciones y entregas fallidas se reintentan, solo facturas emitidas se
// reenvían. Solo admin, y cada intento queda en la bitácora de Ops con su
// resultado.
//
// Orden: primero la acción y el estado que la acompaña (sent_at, timeline);
// la bitácora va al final y su falla se registra sin convertir un éxito en 500.
// Un 500 invita a reintentar, y reintentar aquí manda otro correo o entrega.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, withOpsTx, logAudit, withOrgTx } from '../../../lib/db';
import { setRequestCurrency, setRequestFormatLocale, setRequestLocale, setRequestTimeZone } from '../../../lib/context';
import { getCountryProfile } from '../../../lib/countries';
import { notifyInvoiceIssued } from '../../../lib/email';
import { logInvoiceEvent } from '../../../lib/fiscal/timeline';
import { after } from '../../../lib/after';
import { dispatchInvoiceEvent } from '../../../lib/webhooks';
import { trustedIp } from '../../../lib/ip';
import { log } from '../../../lib/log';
import { opsAuditQuery } from '../../../lib/ops-auth';
import { redeliver } from '../../../lib/webhook-delivery';
import { retryWorkflowRun } from '../../../lib/workflows/service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTIONS = new Set(['redeliver_webhook', 'retry_workflow_run', 'resend_invoice']);
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

// Lo que el negocio lee en su historial: soporte de Cord, nunca el correo del operador.
const supportActor = (idioma: unknown) => String(idioma || '').startsWith('en') ? 'Cord Support' : 'Soporte de Cord';

export const PATCH: APIRoute = async ({ request, locals, url }) => {
    const operator = locals.opsOperator;
    if (!operator) return json({ error: 'No autenticado' }, 401);
    if (operator.role !== 'admin') return json({ error: 'Permiso insuficiente' }, 403);

    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
    const action = typeof body?.action === 'string' ? body.action : '';
    const targetId = typeof body?.targetId === 'string' ? body.targetId : '';
    if (!ACTIONS.has(action)) return json({ error: 'Acción no permitida' }, 400);
    if (!UUID.test(targetId)) return json({ error: 'Registro inválido' }, 400);

    const ip = trustedIp(request);
    const audit = (orgId: string, result: 'success' | 'failure', metadata: Record<string, unknown>) => withOpsTx(opsAuditQuery({
        actorUserId: operator.userId,
        actorEmail: operator.email,
        action: `ops.${action}`,
        targetType: 'organization',
        targetId: orgId,
        result,
        metadata: { record: targetId, ...metadata },
        ip,
        userAgent: request.headers.get('user-agent') || 'desconocido',
    })).then(() => undefined, (err) => log.error('auditoría de recuperación no escrita', { route: 'ops/recovery', action, err }));

    try {
        if (action === 'redeliver_webhook') {
            const [rows] = await withOpsTx(sql`
                select d.org_id, d.evento, d.ok from webhook_deliveries d where d.id = ${targetId} limit 1`);
            const target = rows[0] as any;
            if (!target) return json({ error: 'Entrega no encontrada' }, 404);
            if (target.ok) return json({ error: 'Esa entrega ya fue aceptada por el endpoint.' }, 409);
            const outcome = await redeliver(target.org_id, targetId);
            await audit(target.org_id, outcome.ok ? 'success' : 'failure', { event: target.evento, status: outcome.status, error: outcome.error });
            // status 0 = no llegó a salir (payload vencido, endpoint borrado, red):
            // no es que el endpoint la rechazara, y el mensaje no debe decirlo.
            if (!outcome.ok) {
                const reason = outcome.status ? `el endpoint respondió ${outcome.status}${outcome.error ? ` (${outcome.error})` : ''}` : (outcome.error || 'no hubo respuesta');
                return json({ error: `No se re-entregó: ${reason}.` }, 502);
            }
            return json({ success: true, message: `Entregada. El endpoint respondió ${outcome.status}.` });
        }

        if (action === 'retry_workflow_run') {
            const [rows] = await withOpsTx(sql`
                select r.org_id, r.status, w.nombre, o.idioma
                from workflow_runs r join workflows w on w.id = r.workflow_id and w.org_id = r.org_id
                join orgs o on o.id = r.org_id
                where r.id = ${targetId} limit 1`);
            const target = rows[0] as any;
            if (!target) return json({ error: 'Ejecución no encontrada' }, 404);
            if (target.status !== 'failed') return json({ error: 'Solo se reintenta una ejecución fallida.' }, 409);
            const outcome = await retryWorkflowRun({ orgId: target.org_id, origin: url.origin, ip, actor: supportActor(target.idioma), source: 'manual' }, targetId);
            await audit(target.org_id, outcome.status === 200 ? 'success' : 'failure', { workflow: target.nombre, status: outcome.status });
            if (outcome.status !== 200) return json({ error: 'No se pudo reintentar: la ejecución cambió de estado. Recarga la página.' }, outcome.status);
            return json({ success: true, message: 'Ejecución en cola de nuevo. El motor la retoma en segundos.' });
        }

        // resend_invoice — sale un correo al cliente del negocio: se confirma
        // escribiendo el número de la factura, igual que en el resto de Ops.
        const [rows] = await withOpsTx(sql`
            select d.org_id, d.invoice_number, d.lifecycle, d.currency, o.idioma, o.country_code, o.zona_horaria,
                   (d.sent_at > now() - interval '2 minutes') recently_sent,
                   coalesce(cl.email, cq.email) cliente_email
            from documentos_fiscales d join orgs o on o.id = d.org_id
            left join clientes cl on cl.id = d.cliente_id and cl.org_id = d.org_id
            left join cotizaciones c on c.id = d.cotizacion_id and c.org_id = d.org_id
            left join clientes cq on cq.id = c.cliente_id and cq.org_id = d.org_id
            where d.id = ${targetId} limit 1`);
        const target = rows[0] as any;
        if (!target) return json({ error: 'Factura no encontrada' }, 404);
        if (!target.invoice_number || body?.confirmation !== target.invoice_number) {
            return json({ error: 'La confirmación no coincide con el número de la factura' }, 400);
        }
        if (target.lifecycle === 'draft' || target.lifecycle === 'void') {
            return json({ error: 'Solo se reenvía una factura emitida y vigente.' }, 409);
        }
        if (!target.cliente_email) return json({ error: 'El cliente de esta factura no tiene correo registrado.' }, 409);
        // Dos admins o un doble clic tras recargar no mandan dos correos seguidos.
        if (target.recently_sent) return json({ error: 'Esta factura se envió hace menos de dos minutos. Espera antes de reenviarla.' }, 409);
        // El correo sale en el idioma, formato y divisa del NEGOCIO, no en los de Ops.
        setRequestLocale(target.idioma);
        setRequestFormatLocale(getCountryProfile(String(target.country_code || 'MX')).locale);
        setRequestTimeZone(target.zona_horaria);
        setRequestCurrency(target.currency);
        const sent = await notifyInvoiceIssued(target.org_id, targetId);
        if (!sent) {
            await audit(target.org_id, 'failure', { invoice: target.invoice_number });
            return json({ error: 'No se pudo enviar el correo. Inténtalo de nuevo en unos minutos.' }, 502);
        }
        // El correo ya salió: de aquí en adelante nada puede responder 500.
        const actor = supportActor(target.idioma);
        try {
            await withOrgTx(target.org_id, sql`
                update documentos_fiscales set sent_at = now(), updated_at = now()
                 where id = ${targetId} and org_id = ${target.org_id}`);
        } catch (err) { log.error('sent_at no actualizado tras reenvío', { route: 'ops/recovery', err }); }
        await logInvoiceEvent(target.org_id, targetId, 'sent', `Reenviada por ${actor} a ${target.cliente_email}`);
        await logAudit(target.org_id, { accion: 'factura.enviada', entidad: 'factura', entidad_id: targetId, detalle: target.cliente_email, ip, actor });
        // Igual que el envío desde la app: las integraciones del negocio se enteran.
        after(dispatchInvoiceEvent(target.org_id, targetId, 'invoice.sent'));
        await audit(target.org_id, 'success', { invoice: target.invoice_number });
        return json({ success: true, message: `Factura ${target.invoice_number} reenviada a ${target.cliente_email}.` });
    } catch (error) {
        log.error('error no controlado', { route: 'ops/recovery', action, err: error });
        return json({ error: 'No se pudo completar la acción. Revisa el estado antes de reintentar.' }, 500);
    }
};

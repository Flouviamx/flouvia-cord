// GET /api/notificaciones — feed de actividad reciente de la org (campana de la topbar).
// Reusa la tabla `eventos` (mismo origen que el feed del dashboard) y devuelve los
// últimos movimientos con un texto legible + ruta para abrir la cotización.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId, withOrgTx } from '../../lib/db';

// Tipos de evento → texto e ícono (clave que el front mapea a un SVG).
const META: Record<string, { label: string; icon: string }> = {
    sent:     { label: 'Cotización enviada',        icon: 'send' },
    viewed:   { label: 'Tu cliente vio la cotización', icon: 'eye' },
    approved: { label: 'Cotización aprobada',        icon: 'check' },
    rejected: { label: 'Cotización rechazada',       icon: 'x' },
    paid:     { label: 'Pago recibido',              icon: 'card' },
    invoiced: { label: 'Cotización facturada (CFDI)', icon: 'doc' },
    comment:  { label: 'Nuevo mensaje del cliente',  icon: 'chat' },
    counter:  { label: 'Contraoferta del cliente',   icon: 'chat' },
    reply:    { label: 'Respondiste al cliente',     icon: 'chat' },
    email:    { label: 'Correo enviado',             icon: 'send' },
};

function relative(d: string): string {
    const diff = Date.now() - new Date(d).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'hace un momento';
    if (m < 60) return `hace ${m} min`;
    const h = Math.floor(m / 60);
    if (h < 24) return `hace ${h} h`;
    const days = Math.floor(h / 24);
    if (days < 7) return `hace ${days} d`;
    return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' }).format(new Date(d));
}

export const GET: APIRoute = async () => {
    try {
        const orgId = await getActiveOrgId();
        const [rows] = await withOrgTx(orgId, sql`
            select e.id, e.tipo, e.detalle, e.created_at, c.folio, c.id as cotizacion_id,
                   coalesce(cl.empresa, 'Sin cliente') as cliente
            from eventos e
            join cotizaciones c on c.id = e.cotizacion_id
            left join clientes cl on cl.id = c.cliente_id
            where e.org_id = ${orgId}
            order by e.created_at desc limit 15`);

        const items = rows.map((e) => {
            const meta = META[e.tipo as string] ?? { label: (e.detalle as string) || 'Actividad', icon: 'doc' };
            return {
                id: e.id as string,
                tipo: e.tipo as string,
                icon: meta.icon,
                title: meta.label,
                sub: `${e.folio} · ${e.cliente}`,
                cuando: relative(e.created_at as string),
                ts: new Date(e.created_at as string).getTime(),
                href: `/app/cotizaciones/${e.cotizacion_id}`,
            };
        });

        return json({ items, latest: items[0]?.ts ?? 0 });
    } catch {
        return json({ items: [], latest: 0 });
    }
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

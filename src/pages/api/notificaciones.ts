// GET /api/notificaciones — feed de actividad reciente de la org (campana de la topbar).
// Reusa la tabla `eventos` (mismo origen que el feed del dashboard) y devuelve los
// últimos movimientos con un texto legible + ruta para abrir la cotización.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId, withOrgTx } from '../../lib/db';
import { currentLocale } from '../../lib/context';
import { t } from '../../i18n/app';
import { fmtDate, intlLocale } from '../../lib/fmt-server';

// Tipos de evento → clave de texto e ícono (el front mapea el icon a un SVG).
// El label sale del diccionario: esta campana vive en la topbar de todas las
// páginas y se quedaba en español con la cuenta en inglés.
const META: Record<string, { key: Parameters<typeof t>[1]; icon: string }> = {
    sent:     { key: 'notif.tipo.sent',     icon: 'send'  },
    viewed:   { key: 'notif.tipo.viewed',   icon: 'eye'   },
    approved: { key: 'notif.tipo.approved', icon: 'check' },
    rejected: { key: 'notif.tipo.rejected', icon: 'x'     },
    paid:     { key: 'notif.tipo.paid',     icon: 'card'  },
    invoiced: { key: 'notif.tipo.invoiced', icon: 'doc'   },
    comment:  { key: 'notif.tipo.comment',  icon: 'chat'  },
    counter:  { key: 'notif.tipo.counter',  icon: 'chat'  },
    reply:    { key: 'notif.tipo.reply',    icon: 'chat'  },
    email:    { key: 'notif.tipo.email',    icon: 'send'  },
};

/**
 * "hace 5 min" / "5 min ago". Se arma con Intl.RelativeTimeFormat en vez de una
 * tabla de strings por idioma: la pluralización y el orden de las palabras son
 * problema del motor, no nuestro. Más allá de una semana se cae a la fecha, que
 * ya viaja en la zona horaria del negocio vía fmtDate().
 */
function relative(d: string): string {
    const diff = Date.now() - new Date(d).getTime();
    const rtf = new Intl.RelativeTimeFormat(intlLocale(), { numeric: 'auto', style: 'short' });
    const m = Math.floor(diff / 60000);
    if (m < 1) return rtf.format(0, 'minute');
    if (m < 60) return rtf.format(-m, 'minute');
    const h = Math.floor(m / 60);
    if (h < 24) return rtf.format(-h, 'hour');
    const days = Math.floor(h / 24);
    if (days < 7) return rtf.format(-days, 'day');
    return fmtDate(d);
}

export const GET: APIRoute = async () => {
    try {
        const L = currentLocale();
        const orgId = await getActiveOrgId();
        const [rows] = await withOrgTx(orgId, sql`
            select e.id, e.tipo, e.detalle, e.created_at, c.folio, c.id as cotizacion_id,
                   cl.empresa as cliente
            from eventos e
            join cotizaciones c on c.id = e.cotizacion_id
            left join clientes cl on cl.id = c.cliente_id
            where e.org_id = ${orgId}
            order by e.created_at desc limit 15`);

        const items = rows.map((e) => {
            const meta = META[e.tipo as string];
            const title = meta ? t(L, meta.key) : ((e.detalle as string) || t(L, 'notif.tipo.otro'));
            return {
                id: e.id as string,
                tipo: e.tipo as string,
                icon: meta?.icon ?? 'doc',
                title,
                sub: `${e.folio} · ${(e.cliente as string) || t(L, 'notif.sin_cliente')}`,
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

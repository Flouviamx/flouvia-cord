// GET /api/notificaciones — bandeja de la campana de la topbar.
// Qué cuenta como notificación vive en src/lib/notificaciones.ts (solo lo que
// hizo el cliente o el dinero que entró, cotizaciones y facturas juntas). Aquí
// solo se le da texto legible y la ruta para abrir el documento.
export const prerender = false;

import type { APIRoute } from 'astro';
import { getActiveOrgId } from '../../lib/db';
import { currentLocale } from '../../lib/context';
import { t } from '../../i18n/app';
import { fmtDate, intlLocale } from '../../lib/fmt-server';
import { listNotificaciones } from '../../lib/notificaciones';

// Tipo de evento → clave de texto e ícono (el front mapea el icon a un SVG).
// El label sale del diccionario: esta campana vive en la topbar de todas las
// páginas y se quedaba en español con la cuenta en inglés.
type Key = Parameters<typeof t>[1];
const META_COT: Record<string, { key: Key; icon: string }> = {
    viewed:   { key: 'notif.tipo.viewed',   icon: 'eye'   },
    approved: { key: 'notif.tipo.approved', icon: 'check' },
    rejected: { key: 'notif.tipo.rejected', icon: 'x'     },
    counter:  { key: 'notif.tipo.counter',  icon: 'chat'  },
    paid:     { key: 'notif.tipo.paid',     icon: 'card'  },
};
const META_FAC: Record<string, { key: Key; icon: string }> = {
    viewed:   { key: 'notif.fac.viewed',  icon: 'eye'  },
    payment:  { key: 'notif.fac.payment', icon: 'card' },
    paid:     { key: 'notif.fac.paid',    icon: 'card' },
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
        const rows = await listNotificaciones(orgId);

        const items = rows.map((e) => {
            const factura = e.origen === 'factura';
            const meta = (factura ? META_FAC : META_COT)[e.tipo];
            // Un `comment` externo puede ser el mensaje del cliente o una nota del
            // sistema sobre su pago ("el intento de pago no se completó"): el texto
            // real dice cuál, una etiqueta fija mentiría en uno de los dos casos.
            const detalle = (e.detalle || '').replace(/\s+/g, ' ').trim();
            const title = e.tipo === 'comment' && detalle
                ? (detalle.length > 90 ? detalle.slice(0, 89) + '…' : detalle)
                : meta ? t(L, meta.key) : (detalle || t(L, 'notif.tipo.otro'));
            return {
                id: e.id,
                tipo: e.tipo,
                icon: e.tipo === 'comment' ? 'chat' : meta?.icon ?? 'doc',
                title,
                sub: `${e.folio || '—'} · ${e.cliente || t(L, 'notif.sin_cliente')}`,
                cuando: relative(e.created_at),
                ts: new Date(e.created_at).getTime(),
                href: factura ? `/app/facturas/${e.ref_id}` : `/app/cotizaciones/${e.ref_id}`,
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

// Exportación CSV de las listas de Ops con EXACTAMENTE los filtros de la
// pantalla (mismo parser). Solo administradores, tope de filas, y la bitácora
// se escribe en la misma transacción que la lectura: si no se puede auditar,
// no se descarga nada.
export const prerender = false;

import type { APIRoute } from 'astro';
import { withOpsTx } from '../../../lib/db';
import { trustedIp } from '../../../lib/ip';
import { log } from '../../../lib/log';
import { opsAuditQuery } from '../../../lib/ops-auth';
import { parseOrgFilters, parseUserFilters, filtersQuery } from '../../../lib/ops-filters';
import { OPS_EXPORT_LIMIT, opsOrganizationsExportSql, opsUsersExportSql } from '../../../lib/ops-list-queries';
import { toCsv } from '../../../lib/ops-csv';

const json = (body: unknown, status: number) => new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

export const GET: APIRoute = async ({ url, request, locals }) => {
    const operator = locals.opsOperator;
    if (!operator) return json({ error: 'No autenticado' }, 401);
    if (operator.role !== 'admin') return json({ error: 'Permiso insuficiente' }, 403);

    const type = url.searchParams.get('type');
    if (type !== 'organizations' && type !== 'users') return json({ error: 'Exportación no disponible' }, 400);

    const audit = (filters: Record<string, string>) => opsAuditQuery({
        actorUserId: operator.userId,
        actorEmail: operator.email,
        action: 'ops.list_exported',
        targetType: type,
        metadata: { filters: filtersQuery(filters), limit: OPS_EXPORT_LIMIT },
        ip: trustedIp(request),
        userAgent: request.headers.get('user-agent'),
    });

    try {
        let csv: string;
        let truncated = false;
        if (type === 'organizations') {
            const filters = parseOrgFilters(url.searchParams);
            const [fetched] = await withOpsTx(opsOrganizationsExportSql(filters), audit({ ...filters }));
            truncated = fetched.length > OPS_EXPORT_LIMIT;
            const rows = fetched.slice(0, OPS_EXPORT_LIMIT);
            csv = toCsv(
                ['id', 'nombre', 'propietario', 'pais', 'moneda', 'plan', 'suscripcion', 'cobros_en_linea', 'miembros', 'clientes', 'productos', 'cotizaciones', 'cotizaciones_30d', 'cierre_acumulado', 'divisa_cierre', 'eventos_7d', 'ultima_actividad', 'alta'],
                rows.map((o: any) => [o.id, o.nombre, o.owner_email, o.country_code, o.moneda, o.plan || 'free', o.subscription_status, o.stripe_charges_enabled ? 'si' : 'no', o.members, o.clients, o.products, o.quotes, o.quotes_30d, o.closed_value, o.moneda, o.events_7d, o.last_event, o.created_at]),
            );
        } else {
            const filters = parseUserFilters(url.searchParams);
            const [fetched] = await withOpsTx(opsUsersExportSql(filters), audit({ ...filters }));
            truncated = fetched.length > OPS_EXPORT_LIMIT;
            const rows = fetched.slice(0, OPS_EXPORT_LIMIT);
            csv = toCsv(
                ['id', 'correo', 'nombre', 'estado', 'correo_verificado', 'mfa', 'organizaciones', 'sesiones_activas', 'ultima_actividad', 'alta'],
                rows.map((u: any) => {
                    const locked = u.locked_until && new Date(u.locked_until) > new Date();
                    return [
                        u.id, u.email, [u.first_name, u.last_name].filter(Boolean).join(' '),
                        u.suspended_at ? 'suspendida' : locked ? 'bloqueada' : 'activa',
                        u.email_verified_at ? 'si' : 'no',
                        Number(u.passkeys) > 0 ? 'passkey' : u.totp_enabled ? 'totp' : 'sin_mfa',
                        u.organizations, u.active_sessions, u.last_seen, u.created_at,
                    ];
                }),
            );
        }
        const day = new Date().toISOString().slice(0, 10);
        const name = type === 'organizations' ? 'organizaciones' : 'usuarios';
        return new Response(csv, {
            status: 200,
            headers: {
                'Content-Type': 'text/csv; charset=utf-8',
                // Una exportación recortada lo dice en el nombre del archivo, que es
                // lo único que el operador ve sin abrirlo.
                'Content-Disposition': `attachment; filename="cord-ops-${name}-${day}${truncated ? `-primeras-${OPS_EXPORT_LIMIT}` : ''}.csv"`,
                'X-Ops-Export-Truncated': truncated ? 'true' : 'false',
                'Cache-Control': 'no-store',
            },
        });
    } catch (error) {
        log.error('error no controlado', { route: 'ops/export', err: error });
        return json({ error: 'No se pudo generar la exportación.' }, 500);
    }
};

// La tarjeta de Cord dentro de HubSpot (Deal, Empresa y Contacto). HubSpot la
// consulta con `hubspot.fetch`, firmada con el secreto de la app: el portal
// resuelve la organización y el registro de HubSpot resuelve el cliente o la
// cotización por su vínculo. La tarjeta no escribe: crear abre Cord con sesión.

import { sql, withOrgTx } from '../../db';
import { publicDocumentUrl } from '../../public-links';
import { normalizeCurrency } from '../../currency';

export type ObjetoHubSpot = 'deal' | 'company' | 'contact';
export type IdiomaTarjeta = 'es' | 'en';

const ESTADOS: Record<IdiomaTarjeta, Record<string, string>> = {
    es: { draft: 'Borrador', sent: 'Enviada', viewed: 'Vista', approved: 'Aprobada', rejected: 'Rechazada', expired: 'Vencida', paid: 'Pagada', invoiced: 'Facturada' },
    en: { draft: 'Draft', sent: 'Sent', viewed: 'Viewed', approved: 'Approved', rejected: 'Rejected', expired: 'Expired', paid: 'Paid', invoiced: 'Invoiced' },
};

/** Tono del estado para el componente de HubSpot: verde cerrado, rojo perdido, amarillo en juego. */
export function tonoEstado(status: string): 'success' | 'danger' | 'warning' | 'default' {
    if (status === 'approved' || status === 'paid' || status === 'invoiced') return 'success';
    if (status === 'rejected' || status === 'expired') return 'danger';
    if (status === 'sent' || status === 'viewed') return 'warning';
    return 'default';
}

export function importe(total: number, moneda: string, idioma: IdiomaTarjeta): string {
    const code = normalizeCurrency(moneda);
    try {
        return new Intl.NumberFormat(idioma === 'en' ? 'en-US' : 'es-MX', { style: 'currency', currency: code, currencyDisplay: 'code' }).format(Number(total) || 0);
    } catch {
        return `${code} ${(Number(total) || 0).toFixed(2)}`;
    }
}

export function fechaCorta(iso: string, idioma: IdiomaTarjeta): string {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(idioma === 'en' ? 'en-US' : 'es-MX', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export interface TarjetaCotizacion {
    folio: string;
    estado: string;
    tono: ReturnType<typeof tonoEstado>;
    importe: string;
    creada: string;
    abrir: string;
    link: string | null;
}

export interface Tarjeta {
    cliente: { nombre: string; abrir: string } | null;
    cotizaciones: TarjetaCotizacion[];
    crear: string | null;
    resumen: { abiertas: number; ganadas: number };
}

export async function armarTarjeta(input: {
    orgId: string; conexionId: string; objeto: ObjetoHubSpot; externoId: string; idioma: IdiomaTarjeta; origen: string;
}): Promise<Tarjeta> {
    const { orgId, conexionId, objeto, externoId, idioma, origen } = input;
    const [vinculos] = await withOrgTx(orgId, sql`
        select objeto, local_id from integracion_vinculos
         where org_id = ${orgId} and conexion_id = ${conexionId}
           and externo_tipo = ${objeto} and externo_id = ${externoId}`);

    let clienteId: string | null = null;
    let cotizacionId: string | null = null;
    for (const v of vinculos) {
        if (v.objeto === 'quote') cotizacionId = String(v.local_id);
        if (v.objeto === 'client' || v.objeto === 'client_contact') clienteId = String(v.local_id);
    }

    const [filas] = await withOrgTx(orgId, cotizacionId
        ? sql`select c.id, c.folio, c.status, c.total, c.base_currency, c.public_token, c.created_at, c.cliente_id, cl.empresa
                from cotizaciones c left join clientes cl on cl.id = c.cliente_id and cl.org_id = c.org_id
               where c.org_id = ${orgId} and c.id = ${cotizacionId}`
        : clienteId
            ? sql`select c.id, c.folio, c.status, c.total, c.base_currency, c.public_token, c.created_at, c.cliente_id, cl.empresa
                    from cotizaciones c left join clientes cl on cl.id = c.cliente_id and cl.org_id = c.org_id
                   where c.org_id = ${orgId} and c.cliente_id = ${clienteId}
                   order by c.created_at desc limit 8`
            : sql`select null limit 0`);

    if (!clienteId && filas[0]?.cliente_id) clienteId = String(filas[0].cliente_id);
    let nombre = filas[0]?.empresa ? String(filas[0].empresa) : null;
    if (clienteId && !nombre) {
        const [[cl]] = await withOrgTx(orgId, sql`select empresa from clientes where org_id = ${orgId} and id = ${clienteId}`);
        nombre = cl?.empresa ? String(cl.empresa) : null;
    }

    const cotizaciones: TarjetaCotizacion[] = [];
    for (const f of filas) {
        const status = String(f.status);
        cotizaciones.push({
            folio: String(f.folio),
            estado: ESTADOS[idioma][status] ?? status,
            tono: tonoEstado(status),
            importe: importe(Number(f.total), String(f.base_currency || ''), idioma),
            creada: fechaCorta(String(f.created_at), idioma),
            abrir: `${origen}/app/cotizaciones/${f.id}`,
            link: status !== 'draft' && f.public_token ? await publicDocumentUrl(orgId, 'q', String(f.public_token)) : null,
        });
    }

    const estados = filas.map((f: any) => String(f.status));
    return {
        cliente: clienteId && nombre ? { nombre, abrir: `${origen}/app/clientes/${clienteId}` } : null,
        cotizaciones,
        crear: clienteId ? `${origen}/app/cotizaciones/nueva?cliente=${clienteId}` : null,
        resumen: {
            abiertas: estados.filter((s) => s === 'sent' || s === 'viewed').length,
            ganadas: estados.filter((s) => s === 'approved' || s === 'paid' || s === 'invoiced').length,
        },
    };
}

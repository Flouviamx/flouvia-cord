// Lo que la plataforma notifica (webhook ya VERIFICADO) aplicado a Cord:
// etapas del alta, estados del ciclo de vida de cada factura (con su renglón
// en la historia de la factura), confirmación o rechazo del e-reporting y
// rechazo de un cobro. Independiente del proveedor: recibe EventoPlataforma.
//
// Un id de la plataforma identifica, no autoriza (regla 30): la organización
// se resuelve con las funciones `security definer` de la sección fr-pa del
// esquema y el trabajo vuelve a withOrgTx con ese id. Un aviso que no
// corresponde a nada de Cord se acusa y se ignora: los avisos son "al menos
// una vez" y repetirlos no cambia nada (`pa_estados` es único por estado).

import { sql, withOrgTx } from '../../db';
import { logInvoiceEvent } from '../timeline';
import { aplicarEtapa } from './alta';
import { detalleTimeline } from './estados';
import type { EntornoPa, EventoPlataforma, ProveedorId } from './proveedor';

export interface Aplicado {
    aplicado: boolean;
    razon?: string;
}

async function envioDe(proveedor: ProveedorId, entorno: EntornoPa, id: string): Promise<{ orgId: string; envioId: string; documentoId: string | null } | null> {
    const [r] = await sql`select org_id, envio_id, documento_id from cord_pa_envio_de_proveedor(${proveedor}, ${entorno}, ${id})`;
    return r?.org_id ? { orgId: String(r.org_id), envioId: String(r.envio_id), documentoId: r.documento_id ? String(r.documento_id) : null } : null;
}

export async function aplicarEvento(evento: EventoPlataforma, proveedor: ProveedorId, entorno: EntornoPa): Promise<Aplicado> {
    switch (evento.tipo) {
        case 'ignorado':
            return { aplicado: false, razon: evento.razon };

        case 'alta': {
            const [r] = await sql`select cord_pa_org_de_alta(${proveedor}, ${entorno}, ${evento.altaId}) as org_id`;
            const orgId = r?.org_id ? String(r.org_id) : null;
            if (!orgId) return { aplicado: false, razon: 'alta_desconocida' };
            return { aplicado: await aplicarEtapa(orgId, evento.altaId, evento.etapa, evento.estado, evento.fecha) };
        }

        case 'estado_factura': {
            const e = evento.estado;
            let destino = await envioDe(proveedor, entorno, e.facturaId);
            if (!destino && e.numero && e.sirenEmisor) {
                // Una factura que salió sin respuesta: su primer estado la
                // encuentra por emisor y número, y resuelve el incierto.
                const [f] = await sql`select org_id, envio_id, documento_id from cord_pa_factura_por_numero(${proveedor}, ${entorno}, ${e.sirenEmisor}, ${e.numero})`;
                if (f?.org_id) {
                    destino = { orgId: String(f.org_id), envioId: String(f.envio_id), documentoId: f.documento_id ? String(f.documento_id) : null };
                    await withOrgTx(destino.orgId, sql`
                        update pa_envios set estado = 'aceptado', id_proveedor = ${e.facturaId}, resuelto_at = now(),
                               respuesta = ${JSON.stringify({ id: e.facturaId, porEstado: e.estadoId })}::jsonb, error_mensaje = null
                         where id = ${destino.envioId} and org_id = ${destino.orgId} and estado in ('pendiente', 'incierto')
                           and id_proveedor is null`);
                }
            }
            if (!destino?.documentoId) return { aplicado: false, razon: 'factura_desconocida' };
            const [ins] = await withOrgTx(destino.orgId, sql`
                insert into pa_estados (org_id, documento_id, envio_id, proveedor, entorno, estado_id, codigo, codigo_proveedor, fecha, motivo, detalle)
                values (${destino.orgId}, ${destino.documentoId}, ${destino.envioId}, ${proveedor}, ${entorno}, ${e.estadoId},
                        ${e.codigo}, ${e.codigoProveedor}, ${e.fecha}::timestamptz, ${e.motivo ?? null}, ${e.detalle ? JSON.stringify(e.detalle) : null}::jsonb)
                on conflict do nothing
                returning id`);
            if (!ins[0]) return { aplicado: false, razon: 'repetido' };
            await logInvoiceEvent(destino.orgId, destino.documentoId, 'plataforma', detalleTimeline(e.codigo, e.codigoProveedor, e.motivo));
            return { aplicado: true };
        }

        case 'reporte_integrado': {
            const d = await envioDe(proveedor, entorno, evento.envioProveedorId);
            if (!d) return { aplicado: false, razon: 'envio_desconocido' };
            await withOrgTx(d.orgId, sql`
                update pa_envios set confirmado_at = coalesce(confirmado_at, ${evento.fecha}::timestamptz)
                 where id = ${d.envioId} and org_id = ${d.orgId} and estado = 'aceptado'`);
            return { aplicado: true };
        }

        case 'reporte_rechazado':
        case 'cobro_rechazado': {
            const d = await envioDe(proveedor, entorno, evento.envioProveedorId);
            if (!d) return { aplicado: false, razon: 'envio_desconocido' };
            const [hecho] = await withOrgTx(d.orgId, sql`
                update pa_envios set estado = 'rechazado', resuelto_at = now(),
                       respuesta = coalesce(respuesta, '{}'::jsonb) || ${JSON.stringify({ rechazo: evento.motivo })}::jsonb,
                       error_codigo = ${evento.tipo === 'cobro_rechazado' ? 'estado_invalido' : 'ereporting_error'},
                       error_mensaje = ${evento.tipo === 'cobro_rechazado'
                           ? 'La plataforma no admitió la comunicación de este cobro.'
                           : 'La plataforma no admitió este envío de e-reporting.'}
                 where id = ${d.envioId} and org_id = ${d.orgId} and estado = 'aceptado'
                returning id`);
            if (hecho[0] && d.documentoId && evento.tipo === 'cobro_rechazado') {
                await logInvoiceEvent(d.orgId, d.documentoId, 'plataforma', 'La plataforma no admitió el cobro comunicado');
            }
            return { aplicado: hecho.length > 0 };
        }

        case 'factura_no_entregada': {
            const d = await envioDe(proveedor, entorno, evento.facturaId);
            if (!d) return { aplicado: false, razon: 'factura_desconocida' };
            await withOrgTx(d.orgId, sql`
                update pa_envios set error_codigo = 'no_entregada',
                       error_mensaje = 'La plataforma no pudo entregar la factura a la de tu cliente.',
                       respuesta = coalesce(respuesta, '{}'::jsonb) || ${JSON.stringify({ noEntregada: evento.motivo })}::jsonb
                 where id = ${d.envioId} and org_id = ${d.orgId} and estado = 'aceptado'`);
            if (d.documentoId) await logInvoiceEvent(d.orgId, d.documentoId, 'plataforma', 'La plataforma no pudo entregar la factura');
            return { aplicado: true };
        }
    }
}

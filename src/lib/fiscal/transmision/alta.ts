// El alta del negocio en la plataforma autorizada (enrollment): Cord la crea
// con los datos del perfil fiscal y le da al negocio el enlace donde verifica
// su identidad y firma el mandato. La plataforma avisa de cada etapa por
// webhook (eventos.ts); la cola consulta como respaldo si un aviso no llega.
//
// La creación NO es idempotente en la plataforma (cada llamada crea un alta
// nueva), así que sigue el contrato del outbox: la fila se escribe ANTES de
// llamar y una creación sin respuesta queda "incierta" hasta que una CONSULTA
// por SIREN la encuentra (o pasa el tiempo suficiente para saber que no se
// creó). Nunca se repite a ciegas.
//
// Carril (regla 30): todo en withOrgTx con el org_id de la sesión o del cron.

import { sql, withOrgTx } from '../../db';
import { log } from '../../log';
import { sirenDe } from '../einvoice/fr-ctc';
import { metadata } from '../parties';
import { entornoPa } from './config';
import { regimenDe } from './periodos';
import { proveedorConfigurado } from './activo';
import {
    TransmisionPeticionRechazadaError, TransmisionRechazoError, TransmisionSinRespuestaError,
    type EstadoAlta, type ProveedorTransmision,
} from './proveedor';

/** Antigüedad a partir de la cual un alta incierta que la consulta no encuentra se da por no creada. */
export const ALTA_INCIERTA_DESCARTE_S = 2 * 3600;

export interface Representante { nombre: string; apellido: string; cargo: string }

export type ResultadoAlta =
    | { ok: true; estado: string; enlace: string | null }
    | { ok: false; status: number; code: string; es: string; en: string };

const fallo = (status: number, code: string, es: string, en: string): ResultadoAlta => ({ ok: false, status, code, es, en });

const txt = (v: unknown, max: number) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);

/** El representante solo viaja completo: nombre, apellido y cargo, o nada. */
export function representanteDe(body: Record<string, unknown>): Representante | null | 'incompleto' {
    const r = { nombre: txt(body.representante_nombre, 100), apellido: txt(body.representante_apellido, 100), cargo: txt(body.representante_cargo, 100) };
    const llenos = [r.nombre, r.apellido, r.cargo].filter(Boolean).length;
    if (!llenos) return null;
    return llenos === 3 ? r : 'incompleto';
}

/** Lo que el perfil fiscal aporta al alta, o qué falta. */
export function datosDelPerfil(org: any): { siren: string; regimen: NonNullable<ReturnType<typeof regimenDe>>; email: string; direccion: string } | { falta: string; es: string; en: string } {
    const fm = metadata(org?.fiscal_metadata);
    const siren = sirenDe({
        legalName: '',
        taxId: fm.tax_id || (org?.rfc ? String(org.rfc) : undefined),
        legalRegistrationId: fm.legal_registration_id ? { id: fm.legal_registration_id } : undefined,
    })?.siren;
    if (!siren) return { falta: 'siren', es: 'Falta el SIREN de tu negocio (o tu número de TVA, que lo contiene) en Datos fiscales.', en: 'Your business SIREN (or your TVA number, which contains it) is missing in Tax details.' };
    const regimen = regimenDe(org?.fiscal_metadata);
    if (!regimen) return { falta: 'regimen', es: 'Elige tu régimen de TVA en Datos fiscales: decide cada cuánto se declaran tus operaciones.', en: 'Choose your VAT regime in Tax details: it sets how often your transactions are reported.' };
    const email = txt(org?.email_contacto, 200);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { falta: 'email', es: 'Falta el correo de contacto de tu negocio en General.', en: 'Your business contact email is missing in General.' };
    const direccion = [fm.address_line1 || org?.direccion, fm.address_line2, [fm.postal_code || org?.cp_fiscal, fm.city].filter(Boolean).join(' ')]
        .map((x) => txt(x, 200)).filter(Boolean).join(', ');
    if (!direccion) return { falta: 'direccion', es: 'Falta la dirección fiscal de tu negocio en Datos fiscales.', en: 'Your business address is missing in Tax details.' };
    return { siren, regimen, email, direccion };
}

/**
 * Crea el alta del negocio en la plataforma. Devuelve el estado y el enlace
 * de verificación y mandato (o el del alta que ya estaba en curso).
 */
export async function solicitarAlta(orgId: string, representante: Representante | null, opts: { proveedor?: ProveedorTransmision | null } = {}): Promise<ResultadoAlta> {
    const proveedor = opts.proveedor === undefined ? proveedorConfigurado() : opts.proveedor;
    if (!proveedor) {
        return fallo(409, 'riel_apagado', 'La emisión por plataforma autorizada todavía no está disponible.', 'Issuing through an approved platform is not available yet.');
    }
    const entorno = proveedor.entorno;
    const [[org], [viva]] = await withOrgTx(orgId,
        sql`select country_code, fiscal_metadata, rfc, email_contacto, direccion, cp_fiscal, sandbox_of, is_demo from orgs where id = ${orgId} limit 1`,
        sql`select estado, enlace from pa_altas
             where org_id = ${orgId} and proveedor = ${proveedor.id} and entorno = ${entorno}
               and estado not in ('cancelada', 'rechazada', 'descartada')
             limit 1`,
    );
    if (String(org?.country_code || '').toUpperCase() !== 'FR') {
        return fallo(409, 'fuera_de_francia', 'La emisión por plataforma autorizada es para negocios establecidos en Francia.', 'Issuing through an approved platform is for businesses established in France.');
    }
    if (entorno === 'produccion' && (org?.sandbox_of || org?.is_demo)) {
        return fallo(409, 'cuenta_de_prueba', 'Una cuenta de prueba no se da de alta en la plataforma.', 'A test account cannot be registered with the platform.');
    }
    if (viva) return { ok: true, estado: String(viva.estado), enlace: viva.enlace ? String(viva.enlace) : null };
    const perfil = datosDelPerfil(org);
    if ('falta' in perfil) return fallo(400, `falta_${perfil.falta}`, perfil.es, perfil.en);

    const solicitud = { siren: perfil.siren, regimen: perfil.regimen, contactoEmail: perfil.email, direccion: perfil.direccion, representante };
    // La fila va ANTES de la llamada: si el proceso muere, queda "solicitando"
    // con su hora y la cola la trata como incierta.
    const [insert] = await withOrgTx(orgId, sql`
        insert into pa_altas (org_id, proveedor, entorno, siren, regimen_tva, datos, solicitado_at)
        values (${orgId}, ${proveedor.id}, ${entorno}, ${perfil.siren}, ${perfil.regimen},
                ${JSON.stringify({ representante, contactoEmail: perfil.email, direccion: perfil.direccion })}::jsonb, now())
        on conflict do nothing
        returning id`);
    const altaRow = insert[0];
    if (!altaRow) {
        // Otra pestaña se adelantó: lo que haya en curso es la respuesta.
        const [[ya]] = await withOrgTx(orgId, sql`
            select estado, enlace from pa_altas where org_id = ${orgId} and proveedor = ${proveedor.id} and entorno = ${entorno}
               and estado not in ('cancelada', 'rechazada', 'descartada') limit 1`);
        return { ok: true, estado: String(ya?.estado ?? 'solicitando'), enlace: ya?.enlace ? String(ya.enlace) : null };
    }
    const id = String(altaRow.id);
    try {
        const creada = await proveedor.crearAlta(solicitud);
        await withOrgTx(orgId, sql`
            update pa_altas set estado = 'en_curso', alta_id = ${creada.altaId}, enlace = ${creada.enlace}, updated_at = now()
             where id = ${id} and org_id = ${orgId} and estado = 'solicitando'`);
        return { ok: true, estado: 'en_curso', enlace: creada.enlace };
    } catch (error) {
        if (error instanceof TransmisionSinRespuestaError) {
            await withOrgTx(orgId, sql`
                update pa_altas set estado = 'incierto', error_mensaje = ${error.message.slice(0, 500)}, updated_at = now()
                 where id = ${id} and org_id = ${orgId} and estado = 'solicitando'`);
            // Se consulta de inmediato: si la plataforma la creó, ya hay enlace.
            const r = await resolverIncierta(orgId, proveedor).catch(() => null);
            return { ok: true, estado: r?.estado ?? 'incierto', enlace: r?.enlace ?? null };
        }
        if (error instanceof TransmisionPeticionRechazadaError) {
            log.error('fr-pa: la plataforma rechazó la petición de alta', { route: 'fiscal/transmision/alta', orgId, err: error });
            await withOrgTx(orgId, sql`
                update pa_altas set estado = 'descartada', error_mensaje = 'La plataforma no atendió la petición.', updated_at = now()
                 where id = ${id} and org_id = ${orgId} and estado = 'solicitando'`);
            return fallo(503, 'plataforma_no_disponible', 'La plataforma no está disponible en este momento. Intenta de nuevo más tarde.', 'The platform is not available right now. Try again later.');
        }
        if (error instanceof TransmisionRechazoError) {
            log.warn('fr-pa: la plataforma rechazó el alta', { route: 'fiscal/transmision/alta', orgId, motivo: error.message, codigo: error.codigo });
            await withOrgTx(orgId, sql`
                update pa_altas set estado = 'rechazada', error_mensaje = 'La plataforma no aceptó el alta con estos datos.',
                       datos = datos || ${JSON.stringify({ respuesta: { codigo: error.codigo ?? null, mensaje: error.message } })}::jsonb, updated_at = now()
                 where id = ${id} and org_id = ${orgId} and estado = 'solicitando'`);
            return fallo(422, 'alta_rechazada', 'La plataforma no aceptó el alta con estos datos. Revisa tu SIREN y tu dirección en Datos fiscales, o escríbenos.', 'The platform did not accept the registration with this data. Check your SIREN and address in Tax details, or write to us.');
        }
        throw error;
    }
}

/**
 * Un alta que salió sin respuesta se busca por SIREN. Encontrada, sigue en
 * curso con su enlace; sin encontrar y con más de dos horas, se da por no
 * creada (el negocio puede volver a pedirla). Nunca se crea otra sola.
 */
export async function resolverIncierta(orgId: string, proveedor: ProveedorTransmision): Promise<{ estado: string; enlace: string | null } | null> {
    const [[a]] = await withOrgTx(orgId, sql`
        select id, siren, extract(epoch from (now() - coalesce(solicitado_at, created_at)))::int as edad
          from pa_altas
         where org_id = ${orgId} and proveedor = ${proveedor.id} and entorno = ${proveedor.entorno}
           and (estado = 'incierto' or (estado = 'solicitando' and solicitado_at < now() - interval '2 minutes'))
         limit 1`);
    if (!a) return null;
    const encontrada = await proveedor.buscarAltaEnCurso(String(a.siren));
    if (encontrada) {
        await withOrgTx(orgId, sql`
            update pa_altas set estado = 'en_curso', alta_id = ${encontrada.altaId}, enlace = ${encontrada.enlace},
                   error_mensaje = null, consultado_at = now(), updated_at = now()
             where id = ${a.id} and org_id = ${orgId} and estado in ('incierto', 'solicitando')`);
        return { estado: 'en_curso', enlace: encontrada.enlace };
    }
    if (Number(a.edad) >= ALTA_INCIERTA_DESCARTE_S) {
        await withOrgTx(orgId, sql`
            update pa_altas set estado = 'descartada', consultado_at = now(), updated_at = now(),
                   error_mensaje = 'La plataforma no registró el alta; puedes volver a pedirla.'
             where id = ${a.id} and org_id = ${orgId} and estado in ('incierto', 'solicitando')`);
        return { estado: 'descartada', enlace: null };
    }
    await withOrgTx(orgId, sql`update pa_altas set estado = 'incierto', consultado_at = now(), updated_at = now() where id = ${a.id} and org_id = ${orgId}`);
    return { estado: 'incierto', enlace: null };
}

/**
 * Aplica una etapa del alta (del webhook o de una consulta). Una etapa más
 * vieja que la ya registrada no retrocede el estado: los avisos llegan "al
 * menos una vez" y no necesariamente en orden.
 */
export async function aplicarEtapa(orgId: string, altaId: string, etapa: string, estado: EstadoAlta, fecha: string, enlace?: string | null): Promise<boolean> {
    const [rows] = await withOrgTx(orgId, sql`
        update pa_altas set
               etapa = ${etapa}, etapa_at = ${fecha}::timestamptz,
               estado = case when estado in ('cancelada', 'rechazada', 'descartada') then estado else ${estado}::text end,
               completada_at = case when ${estado}::text = 'completada' then coalesce(completada_at, ${fecha}::timestamptz) else completada_at end,
               enlace = coalesce(${enlace ?? null}, enlace),
               updated_at = now()
         where org_id = ${orgId} and alta_id = ${altaId} and entorno = ${entornoPa()}
           and (etapa_at is null or etapa_at <= ${fecha}::timestamptz)
           and estado <> 'completada'
        returning id`);
    return rows.length > 0;
}

/** Consulta el alta viva (respaldo del webhook y botón "Actualizar"). */
export async function refrescarAlta(orgId: string, opts: { proveedor?: ProveedorTransmision | null } = {}): Promise<{ estado: string } | null> {
    const proveedor = opts.proveedor === undefined ? proveedorConfigurado() : opts.proveedor;
    if (!proveedor) return null;
    const [[a]] = await withOrgTx(orgId, sql`
        select id, alta_id, estado, siren, entidad_id from pa_altas
         where org_id = ${orgId} and proveedor = ${proveedor.id} and entorno = ${proveedor.entorno}
           and estado not in ('cancelada', 'rechazada', 'descartada')
         limit 1`);
    if (!a) return null;
    if (a.estado === 'incierto' || a.estado === 'solicitando') return resolverIncierta(orgId, proveedor);
    if (a.estado !== 'completada' && a.alta_id) {
        const c = await proveedor.consultarAlta(String(a.alta_id));
        await withOrgTx(orgId, sql`update pa_altas set consultado_at = now() where id = ${a.id} and org_id = ${orgId}`);
        if (c) await aplicarEtapa(orgId, String(a.alta_id), c.etapa, c.estado, new Date().toISOString(), c.enlace);
    }
    // Completada: el id de la entidad del negocio en la plataforma, una vez.
    const [[ahora]] = await withOrgTx(orgId, sql`select estado, entidad_id from pa_altas where id = ${a.id} and org_id = ${orgId}`);
    if (ahora?.estado === 'completada' && !ahora.entidad_id) {
        const entidad = await proveedor.buscarEntidad(String(a.siren)).catch(() => null);
        if (entidad) await withOrgTx(orgId, sql`update pa_altas set entidad_id = ${entidad}, updated_at = now() where id = ${a.id} and org_id = ${orgId}`);
    }
    return { estado: String(ahora?.estado ?? a.estado) };
}

// Proyección local de las Person de Connect.
//
// El proveedor de pagos es la ÚNICA fuente de verdad del KYC. Esta tabla es un
// espejo reconstruible, y existe por tres cosas que él no puede dar: una FK
// contra la cual validar la captura móvil, lecturas baratas en el sondeo del
// wizard (cada 2.5 s), y un nombre que mostrar en Ops sin autenticarse como la
// cuenta ajena.
//
// Reglas del espejo, en orden de importancia:
//
//   1. Toda escritura va al proveedor PRIMERO; la proyección se rellena con SU
//      respuesta, nunca con lo que mandó el cliente.
//   2. Es reconstruible en cualquier momento con `reconcilePersons()`, que no
//      escribe una sola letra del lado del proveedor.
//   3. NINGUNA decisión de producto se toma desde aquí. El gate de cobros sigue
//      leyendo `charges_enabled` del proveedor. Una divergencia es una etiqueta
//      vieja durante segundos, jamás un permiso mal concedido.

import { sql, withOrgTx } from './db';
import { listPersons } from './billing';
import { sanitizeStripeRequirements } from './connect-fields';

export type PersonaRol = 'representante' | 'dueno' | 'director' | 'ejecutivo';

export interface ConnectPersona {
    id: string;
    stripePersonId: string | null;
    nombre: string;
    esRepresentante: boolean;
    esDueno: boolean;
    esDirector: boolean;
    esEjecutivo: boolean;
    porcentaje: number | null;
    puesto: string | null;
    verificacion: 'unverified' | 'pending' | 'verified';
    /** Texto del proveedor, apto para mostrar (así lo documenta). */
    verifDetalle: string | null;
    verifCodigo: string | null;
    docCodigo: string | null;
    requisitos: string[];
}

/** Tope duro de personas por organización. Un KYC legítimo no se acerca. */
export const MAX_PERSONAS = 25;

function nombreDe(person: any): string {
    return [person?.first_name, person?.last_name].filter(Boolean).join(' ').trim();
}

/** Fila -> DTO. Lo que el navegador puede ver de una persona. */
export function toDto(row: Record<string, any>): ConnectPersona {
    return {
        id: row.id as string,
        stripePersonId: (row.stripe_person_id as string) || null,
        nombre: (row.nombre_visible as string) || '',
        esRepresentante: !!row.es_representante,
        esDueno: !!row.es_dueno,
        esDirector: !!row.es_director,
        esEjecutivo: !!row.es_ejecutivo,
        porcentaje: row.porcentaje == null ? null : Number(row.porcentaje),
        puesto: (row.puesto as string) || null,
        verificacion: (row.verificacion as ConnectPersona['verificacion']) || 'unverified',
        verifDetalle: (row.verif_detalle as string) || null,
        verifCodigo: (row.verif_codigo as string) || null,
        docCodigo: (row.doc_codigo as string) || null,
        requisitos: Array.isArray(row.requisitos?.currently_due) ? row.requisitos.currently_due : [],
    };
}

/**
 * Escribe en la proyección lo que el proveedor acaba de devolver.
 *
 * `orden` no se toca en el upsert: es preferencia de presentación local y una
 * re-sincronización no tiene por qué reordenar la lista que el usuario ve.
 */
export async function upsertPersonaFromStripe(
    orgId: string,
    stripeAccountId: string,
    person: any,
): Promise<void> {
    if (!person?.id) return;
    const rel = person.relationship || {};
    const ver = person.verification || {};
    await withOrgTx(orgId, sql`
        insert into connect_personas (
            org_id, stripe_account_id, stripe_person_id,
            es_representante, es_dueno, es_director, es_ejecutivo,
            porcentaje, puesto, nombre_visible,
            verificacion, verif_detalle, verif_codigo, doc_codigo, requisitos, synced_at
        ) values (
            ${orgId}, ${stripeAccountId}, ${person.id},
            ${!!rel.representative}, ${!!rel.owner}, ${!!rel.director}, ${!!rel.executive},
            ${rel.percent_ownership == null ? null : Number(rel.percent_ownership)},
            ${rel.title ?? null}, ${nombreDe(person)},
            ${ver.status || 'unverified'}, ${ver.details ?? null}, ${ver.details_code ?? null},
            ${ver.document?.details_code ?? null},
            ${JSON.stringify(sanitizeStripeRequirements(person.requirements))}, now()
        )
        on conflict (org_id, stripe_person_id) where stripe_person_id is not null
        do update set
            es_representante = excluded.es_representante,
            es_dueno         = excluded.es_dueno,
            es_director      = excluded.es_director,
            es_ejecutivo     = excluded.es_ejecutivo,
            porcentaje       = excluded.porcentaje,
            puesto           = excluded.puesto,
            nombre_visible   = excluded.nombre_visible,
            verificacion     = excluded.verificacion,
            verif_detalle    = excluded.verif_detalle,
            verif_codigo     = excluded.verif_codigo,
            doc_codigo       = excluded.doc_codigo,
            requisitos       = excluded.requisitos,
            synced_at        = now(),
            updated_at       = now()
    `);
}

/**
 * Reconstruye la proyección desde el proveedor. NO escribe nada del lado de él.
 *
 * Es también el camino de migración de las organizaciones que completaron el
 * alta con el modelo viejo (una sola persona en `orgs.stripe_person_id`): sus
 * Person ya existen con los roles que se les pusieron entonces, y aquí se
 * reflejan TAL CUAL. No se corrigen ni se cuestionan — una cuenta que ya puede
 * cobrar no recibe ninguna exigencia nueva por haber desplegado esto.
 */
export async function reconcilePersons(orgId: string, stripeAccountId: string): Promise<ConnectPersona[]> {
    const remoto = await listPersons(stripeAccountId);
    const personas: any[] = Array.isArray(remoto?.data) ? remoto.data : [];

    for (const person of personas) {
        await upsertPersonaFromStripe(orgId, stripeAccountId, person);
    }

    // Lo que el proveedor ya no tiene, aquí tampoco. Se borra por id remoto, así
    // que un borrador local (sin `stripe_person_id`) nunca se pierde.
    const vivos = personas.map((p) => String(p.id));
    await withOrgTx(orgId, vivos.length
        ? sql`delete from connect_personas
               where org_id = ${orgId} and stripe_person_id is not null
                 and not (stripe_person_id = any(${vivos}::text[]))`
        : sql`delete from connect_personas
               where org_id = ${orgId} and stripe_person_id is not null`);

    return listPersonas(orgId);
}

/** La lista local, ya ordenada para pintarse. */
export async function listPersonas(orgId: string): Promise<ConnectPersona[]> {
    const [rows] = await withOrgTx(orgId, sql`
        select * from connect_personas
         where org_id = ${orgId}
         order by es_representante desc, orden asc, created_at asc`);
    return rows.map(toDto);
}

/**
 * Resuelve una persona de ESTA organización a su id remoto.
 *
 * Es la verificación de pertenencia que faltaba: `persons.ts` pasaba el
 * `personId` del body directo al proveedor, y lo único que impedía tocar la
 * persona de otra organización era que él devolviera 404. Seguridad delegada a
 * un tercero no es seguridad.
 */
export async function resolvePersona(
    orgId: string,
    stripePersonId: string,
): Promise<{ id: string; stripePersonId: string } | null> {
    if (!stripePersonId || typeof stripePersonId !== 'string') return null;
    const [rows] = await withOrgTx(orgId, sql`
        select id, stripe_person_id from connect_personas
         where org_id = ${orgId} and stripe_person_id = ${stripePersonId} limit 1`);
    const row = rows[0];
    return row ? { id: row.id as string, stripePersonId: row.stripe_person_id as string } : null;
}

/** Cuántas personas tiene ya la organización (para el tope duro). */
export async function countPersonas(orgId: string): Promise<number> {
    const [rows] = await withOrgTx(orgId, sql`select count(*)::int as n from connect_personas where org_id = ${orgId}`);
    return Number(rows[0]?.n ?? 0);
}

/** Borra la proyección de una persona que ya se eliminó del lado del proveedor. */
export async function deletePersona(orgId: string, stripePersonId: string): Promise<void> {
    await withOrgTx(orgId, sql`
        delete from connect_personas
         where org_id = ${orgId} and stripe_person_id = ${stripePersonId}`);
}

export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId, withOrgTx } from '../../../../lib/db';
import { requirePerm } from '../../../../lib/queries';
import { createPerson, updatePerson, deletePerson, retrieveAccount, listPersons } from '../../../../lib/billing';
import { translateStripeError } from '../../../../lib/stripe-catalogs';
import { flattenConnectFields, PERSON_CONNECT_FIELDS, sanitizeStripeRequirements, UnknownConnectFieldError } from '../../../../lib/connect-fields';
import { auditConnect } from '../../../../lib/connect-audit';
import { limitConnectMutation, limitConnectRead } from '../../../../lib/connect-security';
import { requireFreshAuth } from '../../../../lib/step-up';
import {
    countPersonas, deletePersona, listPersonas, MAX_PERSONAS,
    reconcilePersons, resolvePersona, upsertPersonaFromStripe,
} from '../../../../lib/connect-personas';

const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

function personFields(data: unknown, ignoreId = false): Record<string, string> | Response {
    try {
        return flattenConnectFields(data, PERSON_CONNECT_FIELDS, ignoreId ? ['id'] : []);
    } catch (error) {
        const field = error instanceof UnknownConnectFieldError ? error.field : 'payload';
        return json({ error: `Campo no permitido: ${field}` }, 400);
    }
}

/** La cuenta conectada de la organización activa, o una respuesta de error. */
async function connectedAccount(orgId: string): Promise<string | Response> {
    const [rows] = await withOrgTx(orgId, sql`select stripe_account_id from orgs where id = ${orgId}`);
    const accountId = rows[0]?.stripe_account_id as string | undefined;
    return accountId || json({ error: 'Cuenta no creada' }, 400);
}

/**
 * Refresca los requisitos de la cuenta y devuelve la forma saneada.
 *
 * Se recalcula desde el proveedor tras cada mutación: los requisitos de la
 * cuenta cambian con cada persona (agregar un dueño puede satisfacer
 * `company.owners_provided`, quitarlo puede reabrirlo).
 */
async function refreshRequirements(orgId: string, accountId: string) {
    const account = await retrieveAccount(accountId);
    const requirements = sanitizeStripeRequirements(account.requirements);
    await withOrgTx(orgId, sql`update orgs set stripe_requirements = ${JSON.stringify(requirements)} where id = ${orgId}`);
    return requirements;
}

// ── GET: la lista de personas ───────────────────────────────────────────────
//
// Lee de la proyección local. Se reconstruye desde el proveedor cuando está
// vacía y la cuenta sí existe: ese es el backfill perezoso de las
// organizaciones que completaron el alta con el modelo de una sola persona.
// Nadie tiene que correr una migración ni volver a hacer KYC.
export const GET: APIRoute = async ({ request }) => {
    const denied = await requirePerm('cobros_config');
    if (denied) return denied;

    const orgId = await getActiveOrgId();
    const limited = await limitConnectRead(request, 'persons-list', orgId);
    if (limited) return limited;

    const accountId = await connectedAccount(orgId);
    if (accountId instanceof Response) return json({ ok: true, personas: [] });

    try {
        let personas = await listPersonas(orgId);
        if (personas.length === 0) personas = await reconcilePersons(orgId, accountId);
        return json({ ok: true, personas });
    } catch (e: any) {
        return json({ error: translateStripeError(e) }, 400);
    }
};

// ── POST: alta de una persona ───────────────────────────────────────────────
export const POST: APIRoute = async ({ request }) => {
    const denied = await requirePerm('cobros_config');
    if (denied) return denied;

    const orgId = await getActiveOrgId();
    const limited = await limitConnectMutation(request, 'persons-create', orgId, 12);
    if (limited) return limited;
    // Escribir la identidad de quien representa legalmente al negocio es de la
    // misma clase que cambiar la cuenta de depósito, y esa sí exigía step-up.
    // En el alta de primera vez es un no-op (la sesión acaba de autenticarse);
    // la fricción aparece al editar meses después, que es justo cuando importa.
    const stale = await requireFreshAuth();
    if (stale) return stale;

    const accountId = await connectedAccount(orgId);
    if (accountId instanceof Response) return accountId;

    // Tope duro. El rate limit acota la VELOCIDAD, no el total.
    if (await countPersonas(orgId) >= MAX_PERSONAS) {
        return json({ error: `No puedes agregar más de ${MAX_PERSONAS} personas. Si tu estructura societaria las necesita, escríbenos.` }, 409);
    }

    const data = await request.json().catch(() => null);
    const mapped = personFields(data);
    if (mapped instanceof Response) return mapped;

    try {
        const person = await createPerson(accountId, mapped);

        // `orgs.stripe_person_id` queda como columna DERIVADA: se sigue
        // escribiendo mientras haya consumidores, pero la fuente de la lista es
        // ya `connect_personas`.
        if (data?.relationship?.representative) {
            await withOrgTx(orgId, sql`update orgs set stripe_person_id = ${person.id} where id = ${orgId}`);
        }
        await upsertPersonaFromStripe(orgId, accountId, person);

        const requirements = await refreshRequirements(orgId, accountId);
        await auditConnect(orgId, request, 'persona_creada', {
            entity: 'connect_person',
            entityId: person.id,
            detail: rolesDe(data),
        });
        return json({ ok: true, personId: person.id, requirements, personas: await listPersonas(orgId) });
    } catch (e: any) {
        return json({ error: translateStripeError(e) }, 400);
    }
};

// ── PATCH: edición ──────────────────────────────────────────────────────────
export const PATCH: APIRoute = async ({ request }) => {
    const denied = await requirePerm('cobros_config');
    if (denied) return denied;

    const orgId = await getActiveOrgId();
    const limited = await limitConnectMutation(request, 'persons-update', orgId, 20);
    if (limited) return limited;
    const stale = await requireFreshAuth();
    if (stale) return stale;

    const accountId = await connectedAccount(orgId);
    if (accountId instanceof Response) return accountId;

    const data = await request.json().catch(() => null);
    const personId = data?.id;
    if (!personId) return json({ error: 'Falta el identificador de la persona' }, 400);

    // Pertenencia verificada en Postgres ANTES de llamar al proveedor. Antes el
    // `personId` del body viajaba directo, y lo único que impedía tocar la
    // persona de otra organización era que el proveedor devolviera 404 —
    // seguridad delegada a un tercero. Se responde 404, no 403: confirmar que
    // un id existe pero es ajeno ya es información.
    if (!await resolvePersona(orgId, String(personId))) {
        return json({ error: 'Esa persona no existe en tu cuenta' }, 404);
    }

    const mapped = personFields(data, true);
    if (mapped instanceof Response) return mapped;

    try {
        const person = await updatePerson(accountId, personId, mapped);
        await upsertPersonaFromStripe(orgId, accountId, person);
        const requirements = await refreshRequirements(orgId, accountId);
        await auditConnect(orgId, request, 'persona_actualizada', {
            entity: 'connect_person',
            entityId: personId,
            detail: [Object.keys(mapped).join(', '), rolesDe(data)].filter(Boolean).join(' · '),
        });
        return json({ ok: true, requirements, personas: await listPersonas(orgId) });
    } catch (e: any) {
        return json({ error: translateStripeError(e) }, 400);
    }
};

// ── DELETE: baja ────────────────────────────────────────────────────────────
export const DELETE: APIRoute = async ({ request }) => {
    const denied = await requirePerm('cobros_config');
    if (denied) return denied;

    const orgId = await getActiveOrgId();
    const limited = await limitConnectMutation(request, 'persons-delete', orgId, 8);
    if (limited) return limited;
    const stale = await requireFreshAuth();
    if (stale) return stale;

    const [orgRows] = await withOrgTx(orgId, sql`select stripe_account_id, stripe_person_id from orgs where id = ${orgId}`);
    const org = orgRows[0];
    if (!org?.stripe_account_id) return json({ error: 'Cuenta no creada' }, 400);
    const accountId = org.stripe_account_id as string;

    const data = await request.json().catch(() => null);
    const personId = data?.id;
    if (!personId) return json({ error: 'Falta el identificador de la persona' }, 400);
    if (!await resolvePersona(orgId, String(personId))) {
        return json({ error: 'Esa persona no existe en tu cuenta' }, 404);
    }

    try {
        await deletePerson(accountId, personId);
        await deletePersona(orgId, String(personId));
        if (org.stripe_person_id === personId) {
            await withOrgTx(orgId, sql`update orgs set stripe_person_id = null where id = ${orgId}`);
        }
        const requirements = await refreshRequirements(orgId, accountId);
        await auditConnect(orgId, request, 'persona_eliminada', { entity: 'connect_person', entityId: personId });
        return json({ ok: true, requirements, personas: await listPersonas(orgId) });
    } catch (e: any) {
        return json({ error: translateStripeError(e) }, 400);
    }
};

/** Roles declarados, para que la auditoría diga QUÉ cambió y no sólo que cambió. */
function rolesDe(data: any): string {
    const rel = data?.relationship || {};
    const roles = [
        rel.representative && 'representante',
        rel.owner && 'dueño',
        rel.director && 'director',
        rel.executive && 'ejecutivo',
    ].filter(Boolean);
    if (!roles.length) return '';
    const pct = rel.percent_ownership != null ? ` (${rel.percent_ownership}%)` : '';
    return `roles: ${roles.join('+')}${pct}`;
}

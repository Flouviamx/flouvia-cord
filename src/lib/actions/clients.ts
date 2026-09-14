import { sql, withOrgTx } from '../db';
import { requireResourceCapacity, resourceLimitError } from '../org-entitlements';
import { isCountryCode } from '../countries';
import { after } from '../after';
import { dispatchEvent } from '../webhooks';
import { clientEventData } from '../event-payloads';
import { type ActionContext, type ActionOutcome, auditAction, done, fromResponse, isUuid } from './outcome';

const TERMINOS = ['contado', 'net30', 'net60'];
const NIVELES = ['estandar', 'plata', 'oro', 'distribuidor'];

export function cleanClientInput(input: Record<string, any>) {
    const countryRaw = String(input.country_code ?? '').trim().toUpperCase();
    return {
        empresa: String(input.empresa ?? '').trim(),
        contacto: String(input.contacto ?? '').trim() || null,
        email: String(input.email ?? '').trim() || null,
        telefono: String(input.telefono ?? '').trim() || null,
        rfc: String(input.rfc ?? '').trim().toUpperCase() || null,
        terminos: TERMINOS.includes(input.terminos) ? input.terminos : 'contado',
        limite: input.limite === '' || input.limite === null || input.limite === undefined
            ? null : Math.max(0, Number(input.limite) || 0),
        nivel: NIVELES.includes(input.nivel) ? input.nivel : 'estandar',
        descuento: Math.min(100, Math.max(0, Number(input.descuento_pct) || 0)),
        regimen_fiscal: String(input.regimen_fiscal ?? '').trim() || null,
        uso_cfdi: String(input.uso_cfdi ?? '').trim() || null,
        cp_fiscal: String(input.cp_fiscal ?? '').trim().slice(0, 20) || null,
        country_code: isCountryCode(countryRaw) ? countryRaw : null,
        direccion_line1: String(input.direccion_line1 ?? '').trim().slice(0, 200) || null,
        direccion_line2: String(input.direccion_line2 ?? '').trim().slice(0, 200) || null,
        ciudad: String(input.ciudad ?? '').trim().slice(0, 100) || null,
        region: String(input.region ?? '').trim().slice(0, 100) || null,
    };
}

const EMPRESA_OBLIGATORIA = done(400, { error: 'El nombre de la empresa es obligatorio', code: 'invalid_request' });
const NO_ENCONTRADO = done(404, { error: 'Cliente no encontrado', code: 'not_found' });

export async function createClient(ctx: ActionContext, input: Record<string, any>): Promise<ActionOutcome> {
    const c = cleanClientInput(input);
    if (!c.empresa) return EMPRESA_OBLIGATORIA;
    const capacityDenied = await requireResourceCapacity(ctx.orgId, 'clients');
    if (capacityDenied) return fromResponse(capacityDenied);
    let row: any;
    try {
        [[row]] = await withOrgTx(ctx.orgId, sql`
            insert into clientes (
                org_id, empresa, contacto, email, telefono, rfc, terminos_default, limite_credito,
                nivel, descuento_pct, regimen_fiscal, uso_cfdi, cp_fiscal,
                country_code, direccion_line1, direccion_line2, ciudad, region
            )
            values (
                ${ctx.orgId}, ${c.empresa}, ${c.contacto}, ${c.email}, ${c.telefono}, ${c.rfc}, ${c.terminos}, ${c.limite},
                ${c.nivel}, ${c.descuento}, ${c.regimen_fiscal}, ${c.uso_cfdi}, ${c.cp_fiscal},
                ${c.country_code}, ${c.direccion_line1}, ${c.direccion_line2}, ${c.ciudad}, ${c.region}
            )
            returning *`);
    } catch (error) {
        const limit = resourceLimitError(error);
        if (limit) return fromResponse(limit);
        return done(500, { error: 'No se pudo crear el cliente.', code: 'server_error' });
    }
    await auditAction(ctx, 'cliente.creado', 'cliente', row.id as string, ctx.source === 'api' ? `${c.empresa} (vía API)` : c.empresa);
    after(dispatchEvent(ctx.orgId, 'client.created', clientEventData(row), ctx.actor));
    return done(200, { id: row.id });
}

export async function updateClient(ctx: ActionContext, id: string, input: Record<string, any>): Promise<ActionOutcome> {
    const c = cleanClientInput(input);
    if (!c.empresa) return EMPRESA_OBLIGATORIA;
    if (!isUuid(id)) return NO_ENCONTRADO;
    const [rows] = await withOrgTx(ctx.orgId, sql`
        update clientes set
            empresa = ${c.empresa}, contacto = ${c.contacto}, email = ${c.email},
            telefono = ${c.telefono}, rfc = ${c.rfc},
            terminos_default = ${c.terminos}, limite_credito = ${c.limite},
            nivel = ${c.nivel}, descuento_pct = ${c.descuento},
            regimen_fiscal = ${c.regimen_fiscal}, uso_cfdi = ${c.uso_cfdi}, cp_fiscal = ${c.cp_fiscal},
            country_code = ${c.country_code}, direccion_line1 = ${c.direccion_line1},
            direccion_line2 = ${c.direccion_line2}, ciudad = ${c.ciudad}, region = ${c.region}
        where id = ${id} and org_id = ${ctx.orgId}
        returning *`);
    if (!rows.length) return NO_ENCONTRADO;
    after(dispatchEvent(ctx.orgId, 'client.updated', clientEventData(rows[0]), ctx.actor));
    return done(200, { ok: true });
}

export async function deleteClient(ctx: ActionContext, id: string): Promise<ActionOutcome> {
    if (!isUuid(id)) return NO_ENCONTRADO;
    const [rows] = await withOrgTx(ctx.orgId, sql`delete from clientes where id = ${id} and org_id = ${ctx.orgId} returning id, empresa`);
    if (!rows.length) return NO_ENCONTRADO;
    await auditAction(ctx, 'cliente.eliminado', 'cliente', id, rows[0].empresa as string);
    after(dispatchEvent(ctx.orgId, 'client.deleted', { id, object: 'client', empresa: rows[0].empresa }, ctx.actor));
    return done(200, { ok: true });
}

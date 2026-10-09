import { sql, withOrgTx } from '../db';
import { requireResourceCapacity, resourceLimitError } from '../org-entitlements';
import { isCountryCode } from '../countries';
import { validateTaxId } from '../tax-id';
import { normalizeTerm } from '../payment-terms';
import { checkLeitwegId, einvoiceAddressLeitwegProblem, leitwegProblem, normalizeEInvoiceAddress, splitEInvoiceAddress } from '../fiscal/einvoice/codes';
import { currentLocale } from '../context';
import { after } from '../after';
import { dispatchEvent } from '../webhooks';
import { clientEventData, clientPrevData } from '../event-payloads';
import { type ActionContext, type ActionOutcome, auditAction, done, fromResponse, isUuid } from './outcome';
import { CONDICIONES_IVA_RECEPTOR } from '../fiscal/latam/arca/constantes';

const NIVELES = ['estandar', 'plata', 'oro', 'distribuidor'];
const CONDICIONES_IVA_IDS = new Set(CONDICIONES_IVA_RECEPTOR.map((c) => c.id));

export function cleanClientInput(input: Record<string, any>) {
    const countryRaw = String(input.country_code ?? '').trim().toUpperCase();
    return {
        empresa: String(input.empresa ?? '').trim(),
        contacto: String(input.contacto ?? '').trim() || null,
        email: String(input.email ?? '').trim() || null,
        telefono: String(input.telefono ?? '').trim() || null,
        rfc: String(input.rfc ?? '').trim().toUpperCase() || null,
        terminos: normalizeTerm(input.terminos),
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
        // Factura electrónica europea: dirección electrónica del cliente (BT-49,
        // "esquema EAS:identificador") y su referencia de comprador por defecto
        // (BT-10, el Leitweg-ID de una administración alemana). `undefined` =
        // el llamador no los mandó y se conservan.
        einvoice_address: input.einvoice_address === undefined ? undefined
            : (normalizeEInvoiceAddress(input.einvoice_address) ?? null),
        einvoice_address_invalida: String(input.einvoice_address ?? '').trim() !== ''
            && normalizeEInvoiceAddress(input.einvoice_address) === null,
        buyer_reference: input.buyer_reference === undefined ? undefined
            : (String(input.buyer_reference ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 200) || null),
        // Condición frente al IVA (Argentina): CondicionIVAReceptorId de ARCA.
        // Fuera del catálogo se descarta en vez de guardarse a medias; ausente
        // (undefined) significa "no tocarla" — un llamador que no la conoce no
        // puede borrarla.
        condicion_iva: input.condicion_iva === undefined
            ? undefined
            : CONDICIONES_IVA_IDS.has(Number(input.condicion_iva)) ? Number(input.condicion_iva) : null,
    };
}

/**
 * Factura electrónica: la dirección va como "esquema EAS:identificador" y, con
 * el esquema 0204 (administración pública alemana), es un Leitweg-ID cuyo
 * dígito de control se comprueba (Formatspezifikation Leitweg-ID v2.0.2, cap.
 * 2.4). Con esa dirección, la referencia del comprador (BT-10) también es su
 * Leitweg-ID. `storedAddress` es la guardada, para una edición que solo manda
 * la referencia.
 */
function einvoiceInputError(c: ClientInput, storedAddress?: string | null): ActionOutcome | null {
    const lang = currentLocale() === 'en' ? 'en' : 'es';
    if (c.einvoice_address_invalida) {
        return done(400, {
            error: lang === 'en'
                ? 'The electronic address goes as "scheme:identifier" with a scheme from the EAS list, for example 0204:04011000-1234512345-06 or 0088:4000001000005.'
                : 'La dirección electrónica va como "esquema:identificador" con un esquema de la lista EAS, por ejemplo 0204:04011000-1234512345-06 o 0088:4000001000005.',
            code: 'invalid_request',
        });
    }
    const address = c.einvoice_address === undefined ? storedAddress : c.einvoice_address;
    const leitweg = c.einvoice_address === undefined ? null : einvoiceAddressLeitwegProblem(address);
    if (leitweg) return done(400, { error: leitwegProblem(leitweg.reason, lang), code: 'invalid_request', field: 'einvoice_address' });
    if (c.buyer_reference && splitEInvoiceAddress(address)?.scheme === '0204') {
        const ref = checkLeitwegId(c.buyer_reference);
        if (!ref.ok) return done(400, { error: leitwegProblem(ref.reason, lang), code: 'invalid_request', field: 'buyer_reference' });
    }
    return null;
}

const EMPRESA_OBLIGATORIA = done(400, { error: 'El nombre de la empresa es obligatorio', code: 'invalid_request' });
const NO_ENCONTRADO = done(404, { error: 'Cliente no encontrado', code: 'not_found' });

/** Código del rechazo por identificador fiscal; la API pública lo responde como 422. */
export const INVALID_TAX_ID = 'invalid_tax_id';

type ClientInput = ReturnType<typeof cleanClientInput>;
type TaxIdBefore = { rfc?: unknown; country_code?: unknown };

// Compara sin separadores ni mayúsculas: reescribir "B-12345674" como
// "B12345674" no es cambiar el identificador.
const compactTaxId = (v: unknown) => String(v ?? '').toUpperCase().replace(/[\s.\-/,]/g, '');

/**
 * Valida el identificador fiscal con el país del CLIENTE y, sin él, con el de
 * la organización: `country_code` null significa "hereda el país del emisor"
 * (db/schema.sql), y así lo lee la factura. Vacío sigue siendo válido (campo
 * opcional). Con `before`, solo se valida si el identificador o el país
 * cambiaron: un RFC antiguo mal capturado no puede bloquear que se corrija el
 * teléfono, ni que una integración sincronice el correo. Deja `c.rfc`
 * normalizado cuando pasa.
 */
async function checkClientTaxId(ctx: ActionContext, c: ClientInput, before?: TaxIdBefore): Promise<ActionOutcome | null> {
    if (!c.rfc) return null;
    const sameId = !!before && compactTaxId(before.rfc) === compactTaxId(c.rfc);
    const beforeCountry = (before?.country_code as string | null | undefined) ?? null;
    if (sameId && beforeCountry === c.country_code) return null;
    let orgCountry: string | null = null;
    if (!c.country_code || (sameId && !beforeCountry)) {
        const [[org]] = await withOrgTx(ctx.orgId, sql`select country_code from orgs where id = ${ctx.orgId}`);
        orgCountry = (org?.country_code as string | undefined) ?? null;
    }
    const country = c.country_code ?? orgCountry;
    // Escribir explícito el país que ya heredaba no cambia contra qué se valida.
    if (sameId && (beforeCountry ?? orgCountry) === country) return null;
    const v = validateTaxId(country ?? '', c.rfc);
    if (!v.ok) return done(400, { error: v.reason, code: INVALID_TAX_ID });
    c.rfc = v.normalized;
    return null;
}

export async function createClient(ctx: ActionContext, input: Record<string, any>): Promise<ActionOutcome> {
    const c = cleanClientInput(input);
    if (!c.empresa) return EMPRESA_OBLIGATORIA;
    const einvoiceDenied = einvoiceInputError(c);
    if (einvoiceDenied) return einvoiceDenied;
    const taxDenied = await checkClientTaxId(ctx, c);
    if (taxDenied) return taxDenied;
    const capacityDenied = await requireResourceCapacity(ctx.orgId, 'clients');
    if (capacityDenied) return fromResponse(capacityDenied);
    let row: any;
    try {
        [[row]] = await withOrgTx(ctx.orgId, sql`
            insert into clientes (
                org_id, empresa, contacto, email, telefono, rfc, terminos_default, limite_credito,
                nivel, descuento_pct, regimen_fiscal, uso_cfdi, cp_fiscal,
                country_code, direccion_line1, direccion_line2, ciudad, region, condicion_iva,
                einvoice_address, buyer_reference
            )
            values (
                ${ctx.orgId}, ${c.empresa}, ${c.contacto}, ${c.email}, ${c.telefono}, ${c.rfc}, ${c.terminos}, ${c.limite},
                ${c.nivel}, ${c.descuento}, ${c.regimen_fiscal}, ${c.uso_cfdi}, ${c.cp_fiscal},
                ${c.country_code}, ${c.direccion_line1}, ${c.direccion_line2}, ${c.ciudad}, ${c.region}, ${c.condicion_iva ?? null},
                ${c.einvoice_address ?? null}, ${c.buyer_reference ?? null}
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
    const needsBefore = !!c.rfc || (!!c.buyer_reference && c.einvoice_address === undefined);
    const [[before]] = needsBefore
        ? await withOrgTx(ctx.orgId, sql`select rfc, country_code, einvoice_address from clientes where id = ${id} and org_id = ${ctx.orgId}`)
        : [[null]];
    if (needsBefore && !before) return NO_ENCONTRADO;
    const einvoiceDenied = einvoiceInputError(c, before?.einvoice_address as string | null | undefined);
    if (einvoiceDenied) return einvoiceDenied;
    if (c.rfc) {
        const taxDenied = await checkClientTaxId(ctx, c, before ?? undefined);
        if (taxDenied) return taxDenied;
    }
    return writeClientUpdate(ctx, id, c);
}

async function writeClientUpdate(ctx: ActionContext, id: string, c: ClientInput): Promise<ActionOutcome> {
    // El "antes" se lee en la MISMA transacción que el update: leerlo fuera
    // dejaría una ventana donde otro cambio se cuela entre las dos.
    const [antes, rows] = await withOrgTx(ctx.orgId,
        sql`select empresa, email, terminos_default from clientes where id = ${id} and org_id = ${ctx.orgId}`,
        sql`
        update clientes set
            empresa = ${c.empresa}, contacto = ${c.contacto}, email = ${c.email},
            telefono = ${c.telefono}, rfc = ${c.rfc},
            terminos_default = ${c.terminos}, limite_credito = ${c.limite},
            nivel = ${c.nivel}, descuento_pct = ${c.descuento},
            regimen_fiscal = ${c.regimen_fiscal}, uso_cfdi = ${c.uso_cfdi}, cp_fiscal = ${c.cp_fiscal},
            country_code = ${c.country_code}, direccion_line1 = ${c.direccion_line1},
            direccion_line2 = ${c.direccion_line2}, ciudad = ${c.ciudad}, region = ${c.region},
            condicion_iva = case when ${c.condicion_iva === undefined} then condicion_iva else ${c.condicion_iva ?? null}::smallint end,
            einvoice_address = case when ${c.einvoice_address === undefined}::boolean then einvoice_address else ${c.einvoice_address ?? null}::text end,
            buyer_reference = case when ${c.buyer_reference === undefined}::boolean then buyer_reference else ${c.buyer_reference ?? null}::text end
        where id = ${id} and org_id = ${ctx.orgId}
        returning *`);
    if (!rows.length) return NO_ENCONTRADO;
    after(dispatchEvent(ctx.orgId, 'client.updated', { ...clientEventData(rows[0]), ...clientPrevData(antes[0]) }, ctx.actor));
    return done(200, { ok: true });
}

export const CLIENT_CONTACT_FIELDS = ['empresa', 'contacto', 'email', 'telefono', 'rfc', 'terminos', 'country_code'] as const;

export async function patchClientContact(ctx: ActionContext, id: string, input: Record<string, any>): Promise<ActionOutcome> {
    if (!isUuid(id)) return NO_ENCONTRADO;
    const [[actual]] = await withOrgTx(ctx.orgId, sql`select * from clientes where id = ${id} and org_id = ${ctx.orgId}`);
    if (!actual) return NO_ENCONTRADO;
    const changes: Record<string, unknown> = {};
    for (const k of CLIENT_CONTACT_FIELDS) if (input && input[k] !== undefined) changes[k] = input[k];
    const c = cleanClientInput({ ...clientRowToInput(actual), ...changes });
    if (!c.empresa) return EMPRESA_OBLIGATORIA;
    // `actual` ya es el "antes": no hace falta releerlo para saber si cambió el identificador.
    const taxDenied = await checkClientTaxId(ctx, c, actual);
    if (taxDenied) return taxDenied;
    return writeClientUpdate(ctx, id, c);
}

function clientRowToInput(c: Record<string, any>): Record<string, unknown> {
    return {
        empresa: c.empresa, contacto: c.contacto, email: c.email, telefono: c.telefono, rfc: c.rfc,
        terminos: c.terminos_default, limite: c.limite_credito, nivel: c.nivel, descuento_pct: c.descuento_pct,
        regimen_fiscal: c.regimen_fiscal, uso_cfdi: c.uso_cfdi, cp_fiscal: c.cp_fiscal, country_code: c.country_code,
        direccion_line1: c.direccion_line1, direccion_line2: c.direccion_line2, ciudad: c.ciudad, region: c.region,
        condicion_iva: c.condicion_iva,
    };
}

export async function deleteClient(ctx: ActionContext, id: string): Promise<ActionOutcome> {
    if (!isUuid(id)) return NO_ENCONTRADO;
    const [rows] = await withOrgTx(ctx.orgId, sql`delete from clientes where id = ${id} and org_id = ${ctx.orgId} returning id, empresa`);
    if (!rows.length) return NO_ENCONTRADO;
    await auditAction(ctx, 'cliente.eliminado', 'cliente', id, rows[0].empresa as string);
    after(dispatchEvent(ctx.orgId, 'client.deleted', { id, object: 'client', empresa: rows[0].empresa }, ctx.actor));
    return done(200, { ok: true });
}

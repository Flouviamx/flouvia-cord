export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId, reqIp, withOrgTx } from '../../../../lib/db';
import { requirePerm } from '../../../../lib/queries';
import { updateConnectAccount } from '../../../../lib/billing';
import { translateStripeError } from '../../../../lib/stripe-catalogs';
import { ACCOUNT_CONNECT_FIELDS, flattenConnectFields, UnknownConnectFieldError, sanitizeStripeRequirements } from '../../../../lib/connect-fields';
import { auditConnect } from '../../../../lib/connect-audit';
import { limitConnectMutation } from '../../../../lib/connect-security';
import { FEE_TERMS_VERSION } from '../../../../lib/fees';

// Declaraciones legales de la empresa. Mismo contrato que `tos_acceptance`:
// son una firma, no un dato de formulario. Stripe las pide en varios países del
// set de Cord y no estaban en ningún lado — el requisito llegaba en
// `currently_due` y no había forma de satisfacerlo.
const DECLARACIONES = ['ownership_declaration', 'directorship_declaration', 'representative_declaration'] as const;

// Enum CERRADO de Stripe. Un valor fuera de estos dos es un 400 del proveedor
// con un texto que no le habla al dueño del negocio (regla 14).
const MOTIVOS_EXENCION = new Set([
    'qualified_entity_exceeds_ownership_threshold',
    'qualifies_as_financial_institution',
]);

export const PATCH: APIRoute = async ({ request }) => {
    const denied = await requirePerm('cobros_config');
    if (denied) return denied;

    const orgId = await getActiveOrgId();
    const limited = await limitConnectMutation(request, 'account', orgId, 20);
    if (limited) return limited;
    const [orgRows] = await withOrgTx(orgId, sql`select stripe_account_id, stripe_business_type from orgs where id = ${orgId}`);
    const org = orgRows[0];
    if (!org?.stripe_account_id) {
        return new Response(JSON.stringify({ error: 'Cuenta no creada' }), { status: 400 });
    }

    const data = await request.json().catch(() => null);
    let fields: Record<string, string>;
    try {
        fields = flattenConnectFields(data, ACCOUNT_CONNECT_FIELDS, [
            'tos_acceptance', 'legal_consents',
            // Las declaraciones se ignoran en el flatten a propósito: el cliente
            // manda un BOOLEANO y el servidor construye el bloque con fecha, IP y
            // user-agent reales. Dejar que el navegador escriba `date`/`ip`
            // convertiría una declaración legal en un campo de texto libre.
            ...DECLARACIONES.map((d) => `company.${d}`),
        ]);
    } catch (error) {
        const field = error instanceof UnknownConnectFieldError ? error.field : 'payload';
        return new Response(JSON.stringify({ error: `Campo no permitido: ${field}` }), { status: 400 });
    }

    if (data.tos_acceptance) {
        if (data?.legal_consents?.payments_terms !== FEE_TERMS_VERSION || data?.legal_consents?.privacy !== true) {
            return new Response(JSON.stringify({ error: 'Debes aceptar los términos de Cord Payments y el Aviso de Privacidad vigentes' }), { status: 400 });
        }
        // La aceptación del acuerdo es EVIDENCIA LEGAL: si un día se discute quién
        // aceptó qué y desde dónde, esta es la prueba. Caía a '127.0.0.1' cuando
        // `reqIp()` no resolvía, es decir, se firmaba con una IP inventada — peor
        // que no tener el dato, porque parece uno real. Falla cerrado.
        const ip = reqIp(request);
        if (!ip) {
            return new Response(JSON.stringify({
                error: 'No pudimos registrar tu aceptación en este momento. Vuelve a intentarlo desde tu conexión habitual.',
            }), { status: 503, headers: { 'Content-Type': 'application/json' } });
        }
        fields['tos_acceptance[date]'] = Math.floor(Date.now() / 1000).toString();
        fields['tos_acceptance[ip]'] = ip;
        fields['tos_acceptance[service_agreement]'] = 'full'; // En Custom de MX se necesita
    }

    // Las declaraciones se firman en el servidor, con los datos del servidor.
    const firmadas: string[] = [];
    for (const declaracion of DECLARACIONES) {
        if (data?.company?.[declaracion] !== true) continue;
        const ip = reqIp(request);
        if (!ip) {
            return new Response(JSON.stringify({
                error: 'No pudimos registrar tu declaración en este momento. Vuelve a intentarlo desde tu conexión habitual.',
            }), { status: 503, headers: { 'Content-Type': 'application/json' } });
        }
        fields[`company[${declaracion}][date]`] = Math.floor(Date.now() / 1000).toString();
        fields[`company[${declaracion}][ip]`] = ip;
        fields[`company[${declaracion}][user_agent]`] = (request.headers.get('user-agent') || '').slice(0, 500);
        firmadas.push(declaracion);
    }

    const motivoExencion = fields['company[ownership_exemption_reason]'];
    if (motivoExencion && !MOTIVOS_EXENCION.has(motivoExencion)) {
        return new Response(JSON.stringify({ error: 'Ese motivo de exención no es válido.' }), { status: 400 });
    }

    if (Object.keys(fields).length === 0) {
        return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
    }

    try {
        const res = await updateConnectAccount(org.stripe_account_id as string, fields);
        const accion = data?.tos_acceptance
            ? 'terminos_aceptados'
            : (firmadas.length ? 'declaraciones_firmadas' : 'cuenta_actualizada');
        await auditConnect(orgId, request, accion, {
            entityId: org.stripe_account_id as string,
            detail: data?.tos_acceptance
                ? `Acuerdo Stripe, Aviso de Privacidad y términos ${FEE_TERMS_VERSION} aceptados con IP y fecha del servidor`
                : (firmadas.length
                    ? `${firmadas.join(', ')} firmadas con IP, fecha y navegador del servidor`
                    : Object.keys(fields).join(', ')),
        });
        return new Response(JSON.stringify({ ok: true, requirements: sanitizeStripeRequirements(res.requirements) }), { headers: { 'Content-Type': 'application/json' } });
    } catch (e: any) {
        return new Response(JSON.stringify({ error: translateStripeError(e) }), { status: 400 });
    }
};

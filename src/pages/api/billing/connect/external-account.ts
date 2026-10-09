export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId, reqIp, withOrgTx } from '../../../../lib/db';
import { requirePerm } from '../../../../lib/queries';
import { createExternalAccount, retrieveAccount, stripe } from '../../../../lib/billing';
import { translateStripeError } from '../../../../lib/stripe-catalogs';
import { encryptRequiredSecret } from '../../../../lib/crypto-secret';
import { auditConnect } from '../../../../lib/connect-audit';
import { limitConnectMutation } from '../../../../lib/connect-security';
import { sanitizeStripeRequirements } from '../../../../lib/connect-fields';
import { requireFreshAuth } from '../../../../lib/step-up';
import { validatePayout, stripeExternalAccountFields, cuentaDeDepositoVigente } from '../../../../lib/payout-fields';
import { getCountryProfile } from '../../../../lib/countries';
import { currentLocale, currentUserId } from '../../../../lib/context';
import { notifyMoneyDestinationChange } from '../../../../lib/auth-email';
import { after } from '../../../../lib/after';
import {
    cancelarCambio, completarCambio, horasDeEspera, programarCambio, registrarFalla, urlRevertir,
    type CambioProgramado,
} from '../../../../lib/money-hold';
import { sincronizarControl } from '../../../../lib/deposit-control';

export const POST: APIRoute = async ({ request }) => {
    const denied = await requirePerm('cobros_config');
    if (denied) return denied;

    const orgId = await getActiveOrgId();
    const limited = await limitConnectMutation(request, 'external-account', orgId, 6);
    if (limited) return limited;
    const staleAuth = await requireFreshAuth();
    if (staleAuth) return staleAuth;
    const [orgRows] = await withOrgTx(orgId, sql`
        select stripe_account_id, stripe_business_type, banco_clabe_enc, banco_clabe_last4, banco_beneficiario, country_code, moneda
          from orgs where id = ${orgId}`);
    const org = orgRows[0];
    if (!org?.stripe_account_id) return new Response(JSON.stringify({ error: 'No account' }), { status: 400 });

    // Cada país identifica una cuenta bancaria a su manera: CLABE en México,
    // IBAN en la zona SEPA, routing + account en Estados Unidos, sort code en
    // Reino Unido. Este endpoint sabía capturar SOLO la CLABE y respondía 409 a
    // todos los demás, así que un negocio en Madrid terminaba su alta de Connect
    // y no tenía cómo decir a dónde mandarle su dinero.
    const pais = String(org.country_code || 'MX').toUpperCase();
    const L = currentLocale();

    const data = await request.json().catch(() => ({}));
    const account_holder_name = String(data.account_holder_name || '').trim().slice(0, 120);
    if (!account_holder_name) {
        return new Response(JSON.stringify({
            error: L === 'en' ? 'Enter the account holder name.' : 'Captura el titular de la cuenta.',
        }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    if (data.account_holder_type && !['individual', 'company'].includes(data.account_holder_type)) {
        return new Response(JSON.stringify({ error: 'Tipo de titular inválido' }), { status: 400 });
    }

    // Los dígitos de control se verifican AQUÍ. Dejarlos para Stripe devolvía un
    // error del proveedor que no le dice nada al vendedor, y con una cuenta mal
    // tecleada el dinero queda en el limbo hasta que alguien lo note (regla 14).
    const validation = validatePayout(pais, data, L);
    if (!validation.ok) {
        return new Response(JSON.stringify({ error: validation.error }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    const values = validation.values!;
    const principal = values.iban ?? values.clabe ?? values.account_number ?? '';

    let encryptedAccount: string;
    try { encryptedAccount = encryptRequiredSecret(principal); }
    catch {
        return new Response(JSON.stringify({
            error: L === 'en'
                ? 'Your bank details could not be saved securely. Try again in a few minutes.'
                : 'No se pudieron guardar los datos bancarios de forma segura. Intenta de nuevo en unos minutos.',
        }), { status: 503, headers: { 'Content-Type': 'application/json' } });
    }
    // La divisa del depósito la fija el PAÍS de la cuenta conectada, no
    // `orgs.moneda`. Esa columna es la divisa CONTABLE del negocio, se edita
    // libre en Ajustes y no tiene por qué coincidir: una S.L. en Madrid que
    // lleva sus libros en USD mandaba `currency=usd` para un IBAN español y el
    // alta de depósitos se caía. El fallback 'MXN' hacía lo mismo con
    // cualquier país sin `moneda` guardada.
    const moneda = getCountryProfile(pais).currency;
    const acct = org.stripe_account_id as string;
    const actorUserId = currentUserId();

    // ── La espera (regla 38, src/lib/money-hold.ts) ─────────────────────────
    // La cuenta que recibe HOY en esta divisa es la que se restaura con "No fui
    // yo". Con ella, la nueva se agrega SIN ser predeterminada y los depósitos
    // siguen llegando a la anterior durante la espera. Sin ella (primera cuenta),
    // Stripe hace predeterminada a la nueva, y si la cuenta ya cobró, la espera
    // son depósitos manuales: el cambio se registra ANTES de crearla, para que
    // ningún depósito automático salga hacia ella en el hueco.
    let anterior: any = null;
    let horas = 0;
    let cambio: CambioProgramado | null = null;
    try {
        const cuenta = await retrieveAccount(acct);
        anterior = cuentaDeDepositoVigente<any>(((cuenta?.external_accounts?.data ?? []) as any[])
            .filter((a) => a?.object === 'bank_account' && String(a?.currency || '').toUpperCase() === moneda));
        // Si la predeterminada de Stripe es una primera cuenta que todavía espera,
        // no es "la de antes": nunca llegó a estar vigente. La de antes es la que
        // ESE cambio tenía (ninguna), y la espera sigue siendo con control.
        const [[pendiente]] = await withOrgTx(orgId, sql`
            select antes, despues from destino_dinero_cambios
             where org_id = ${orgId} and tipo = 'banco' and estado = 'en_espera'
             order by creado_at desc limit 1`);
        const pendDespues = typeof pendiente?.despues === 'string' ? JSON.parse(pendiente.despues) : pendiente?.despues;
        if (anterior && pendDespues?.external_account_id && String(pendDespues.external_account_id) === String(anterior.id)) {
            anterior = null;
        }
        horas = await horasDeEspera(orgId, { tipo: 'banco', primerDestino: !anterior, actorUserId });
        if (horas > 0) {
            cambio = await programarCambio(orgId, {
                tipo: 'banco', horas, actorUserId, reemplazar: false,
                antes: {
                    external_account_id: anterior?.id ?? null, last4: anterior?.last4 ?? null, banco: anterior?.bank_name ?? null,
                    clabe_enc: org.banco_clabe_enc ?? null, clabe_last4: org.banco_clabe_last4 ?? null,
                    beneficiario: org.banco_beneficiario ?? null,
                },
                despues: {
                    last4: validation.last4, moneda,
                    clabe_enc: encryptedAccount, clabe_last4: validation.last4, beneficiario: account_holder_name,
                },
            });
            if (!anterior) await sincronizarControl(orgId, acct, pais);
        }
    } catch (e: any) {
        if (cambio) await cancelarCambio(orgId, cambio.id).catch((err) => registrarFalla(orgId, err, 'cancelar'));
        return new Response(JSON.stringify({ error: translateStripeError(e) }), { status: 400 });
    }

    let result: any;
    try {
        const reqFields = stripeExternalAccountFields(
            pais, moneda, account_holder_name,
            (data.account_holder_type as 'individual' | 'company') || (org.stripe_business_type === 'individual' ? 'individual' : 'company'),
            values,
        );
        // Sin espera la nueva es la predeterminada desde ya (`default_for_currency`:
        // sin esto Stripe la AGREGABA y seguía depositando en la anterior mientras
        // Cord mostraba la nueva). Con espera y cuenta anterior, NO lo es todavía.
        const conEsperaSobreAnterior = horas > 0 && !!anterior;
        result = await createExternalAccount(acct, {
            ...reqFields,
            default_for_currency: conEsperaSobreAnterior ? 'false' : 'true',
        });
        if (result?.default_for_currency !== !conEsperaSobreAnterior) {
            // Stripe no la dejó como se pidió: se borra. Predeterminada durante
            // una espera, el dinero iría a ella antes de tiempo; no
            // predeterminada sin espera, quedaría colgada y cada reintento
            // agregaría otra.
            if (result?.id) {
                await stripe(`/v1/accounts/${encodeURIComponent(acct)}/external_accounts/${encodeURIComponent(String(result.id))}`, undefined, 'DELETE')
                    .catch((err) => registrarFalla(orgId, err, 'borrar_predeterminada_inesperada'));
            }
            throw new Error('La cuenta nueva no quedó como cuenta de depósito predeterminada.');
        }
    } catch (e: any) {
        if (cambio) {
            await cancelarCambio(orgId, cambio.id).catch((err) => registrarFalla(orgId, err, 'cancelar'));
            if (!anterior) await sincronizarControl(orgId, acct, pais).catch((err) => registrarFalla(orgId, err, 'soltar_control'));
        }
        return new Response(JSON.stringify({ error: translateStripeError(e) }), { status: 400 });
    }

    try {
        if (cambio) {
            // Los cambios que seguían en espera quedan reemplazados por este; sus
            // cuentas (nunca predeterminadas) se borran del proveedor.
            const reemplazados = await completarCambio(orgId, cambio.id, { external_account_id: String(result.id) });
            for (const r of reemplazados) {
                if (!r.external_account_id || String(r.external_account_id) === String(result.id)) continue;
                await stripe(`/v1/accounts/${encodeURIComponent(acct)}/external_accounts/${encodeURIComponent(String(r.external_account_id))}`, undefined, 'DELETE')
                    .catch((err) => registrarFalla(orgId, err, 'borrar_reemplazada'));
            }
        } else {
            // Las columnas se llaman `banco_clabe*` por herencia mexicana; guardan
            // la cuenta de depósito sea cual sea su formato. Renombrarlas es una
            // migración aparte y no cambia lo que hacen.
            await withOrgTx(orgId, sql`update orgs
                         set banco_clabe = null, banco_clabe_enc = ${encryptedAccount},
                             banco_clabe_last4 = ${validation.last4}, banco_beneficiario = ${account_holder_name}
                       where id = ${orgId}`);
            cambio = await programarCambio(orgId, {
                tipo: 'banco', horas: 0, actorUserId,
                antes: { external_account_id: null, clabe_enc: org.banco_clabe_enc ?? null, clabe_last4: org.banco_clabe_last4 ?? null },
                despues: { external_account_id: String(result.id), last4: validation.last4, moneda, clabe_last4: validation.last4 },
            });
        }

        const account = await retrieveAccount(acct);
        const requirements = sanitizeStripeRequirements(account.requirements);
        await withOrgTx(orgId, sql`update orgs set stripe_requirements = ${JSON.stringify(requirements)} where id = ${orgId}`);
        await auditConnect(orgId, request, 'cuenta_bancaria_actualizada', {
            entity: 'external_account',
            entityId: result.id,
            detail: `last4 ${String(anterior?.last4 || org.banco_clabe_last4 || 'ninguna')} -> ${validation.last4}`
                + (horas > 0 ? `; en espera ${horas} h` : ''),
        });
        // A dónde llega el dinero cambió: los dueños se enteran por SU correo,
        // con la fecha en que entra en vigor y el enlace para revertirlo.
        after(notifyMoneyDestinationChange(orgId, 'banco', {
            detalle: `termina en ${validation.last4}${anterior?.last4 || org.banco_clabe_last4 ? ` (antes ${String(anterior?.last4 || org.banco_clabe_last4)})` : ''}`,
            actorUserId, ip: reqIp(request),
            efectivoDesde: horas > 0 ? cambio.efectivoDesde : null,
            revertirUrl: urlRevertir(cambio.revertirToken),
        }));

        return new Response(JSON.stringify({
            ok: true, external_account: result, requirements,
            espera: horas > 0 ? { horas, efectivo_desde: cambio.efectivoDesde.toISOString() } : null,
        }), { headers: { 'Content-Type': 'application/json' } });
    } catch (e: any) {
        // La cuenta ya existe en Stripe y el registro también: lo que falló es
        // secundario (requisitos, auditoría). No se reporta como fallido un
        // cambio que sí ocurrió.
        registrarFalla(orgId, e, 'despues_de_crear');
        return new Response(JSON.stringify({
            ok: true, external_account: result,
            espera: horas > 0 && cambio ? { horas, efectivo_desde: cambio.efectivoDesde.toISOString() } : null,
        }), { headers: { 'Content-Type': 'application/json' } });
    }
};

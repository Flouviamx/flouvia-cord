// /api/org — ajustes del negocio (marca, fiscales, PDF).
//   PATCH { nombre?, rfc?, razon_social?, color_marca?, quote_prefix?, iva_pct?,
//           email_contacto?, telefono?, direccion?, logo_url?, pdf_template?,
//           pdf_mensaje?, pdf_condiciones?, pdf_mostrar_lista? }  → { ok }
// Solo actualiza los campos presentes en el body.
export const prerender = false;

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { createSettingsRevision, parseSettingsRevision, restoreSettingsRevision } from '../../lib/settings-history';
import { brandProfileSchema } from '../../lib/brand-profile';
import { sql, getActiveOrgId, logAudit, reqIp, withOrgTx } from '../../lib/db';
import { requirePerm, invalidateMoneyCaches } from '../../lib/queries';
import { currentUserId, currentLocale } from '../../lib/context';
import { t } from '../../i18n/app';
import { reauthenticate, revokeAllSessions } from '../../lib/auth';
import { parseJsonBody } from '../../lib/validation';
import { rateLimit, tooMany } from '../../lib/ratelimit';
import { deleteOrgCascade, OrgConservacionError } from '../../lib/org-delete';
import { decryptSecret, encryptRequiredSecret } from '../../lib/crypto-secret';
import { requireFreshAuth } from '../../lib/step-up';
import { requireEntitlement } from '../../lib/org-entitlements';
import type { FeatureKey } from '../../lib/entitlements';
import { getCountryProfile, isCountryCode, isSupportedCountry } from '../../lib/countries';
import { defaultCountryTaxPct } from '../../lib/impuestos';
import { validateTaxId } from '../../lib/tax-id';
import { payoutSpecFor, clabeValida, ibanValido } from '../../lib/payout-fields';
import { reseedTaxCatalogForTerritory } from '../../lib/impuestos-db';
import { listOfferedCurrencies } from '../../lib/currency';
import { isValidTimeZone } from '../../lib/timezones';
import { validateLateInterestRate } from '../../lib/late-interest-policy';
import { normalizeTerm } from '../../lib/payment-terms';
import { serieCompartida, serieCompartidaMensaje } from '../../lib/fiscal/serie';

const HEX = /^#[0-9a-fA-F]{6}$/;

/**
 * Cuenta bancaria para TRANSFERENCIA MANUAL (la que el cliente ve en el link
 * para pagar por su cuenta), validada con el riel del país:
 *   · México: CLABE de 18 dígitos con su dígito de control.
 *   · Zona SEPA y demás países IBAN: IBAN con mod-97.
 *   · El resto (EE.UU., Reino Unido, Canadá, Brasil, Latam sin IBAN): son
 *     varios datos (routing + cuenta, sort code + cuenta, banco + agência +
 *     conta) que el negocio escribe juntos; se acota a un texto legible.
 */
function normalizeBankAccount(country: string, raw: string, locale: 'es' | 'en'): { ok: true; value: string | null } | { ok: false; error: string } {
    const text = raw.trim();
    if (!text) return { ok: true, value: null };
    const format = payoutSpecFor(country).format;
    if (format === 'clabe') {
        const clabe = text.replace(/\D/g, '');
        if (!/^\d{18}$/.test(clabe)) return { ok: false, error: locale === 'en' ? 'The CLABE must have 18 digits.' : 'La CLABE debe tener 18 dígitos.' };
        if (!clabeValida(clabe)) return { ok: false, error: locale === 'en' ? "That CLABE isn't valid: the control digit doesn't match." : 'La CLABE no es válida: el dígito de control no coincide.' };
        return { ok: true, value: clabe };
    }
    if (format === 'iban') {
        const iban = text.replace(/\s+/g, '').toUpperCase();
        if (!ibanValido(iban)) return { ok: false, error: locale === 'en' ? "That IBAN isn't valid. Check the characters." : 'El IBAN no es válido. Revisa los caracteres.' };
        // Se guarda en grupos de 4, que es como se lee y se copia un IBAN.
        return { ok: true, value: iban.replace(/(.{4})/g, '$1 ').trim() };
    }
    const value = text.replace(/\s+/g, ' ');
    if (value.length < 4 || value.length > 80 || !/^[\p{L}\p{N} .,:;#/·()\-]+$/u.test(value) || (value.match(/\d/g) || []).length < 4) {
        return { ok: false, error: locale === 'en'
            ? 'Enter your bank details (for example routing and account number).'
            : 'Escribe los datos de tu cuenta (por ejemplo, número de banco y de cuenta).' };
    }
    return { ok: true, value };
}
const TEMPLATES = new Set(['clasico', 'minimal', 'detallado']);
// La API acepta exactamente lo que el selector ofrece. Validar contra el ISO
// completo dejaba entrar por POST una divisa que la UI ya no lista y que
// después no se puede convertir ni cobrar — la superficie y su endpoint tienen
// que decir lo mismo.
// Logo: acepta data URL de imagen (subida, cap ~1.1MB) o URL http(s).
const logoOk = (s: string) =>
    s.length <= 1_500_000 &&
    (/^data:image\/(png|jpe?g|webp|svg\+xml);base64,/.test(s) || /^https?:\/\//.test(s));

export const PATCH: APIRoute = async ({ request }) => {
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }

    if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'Invalid settings' }, 400);
    let restoreRecord: ReturnType<typeof parseSettingsRevision> = null;
    if (body.restore_revision !== undefined) {
        const denied=await requirePerm('ajustes'); if(denied)return denied;
        const oid=await getActiveOrgId(); const gate=await requireEntitlement(oid,'audit_log');if(gate)return gate;
        if(Object.keys(body).length!==1 || typeof body.restore_revision!=='string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.restore_revision))return json({error:'Invalid revision'},400);
        const [[entry],[current]]=await withOrgTx(oid,
            sql`select detalle from audit_log where org_id=${oid} and id=${body.restore_revision}::uuid and accion='org.configuracion'`,
            sql`select * from orgs where id=${oid}`);
        const revision=entry?parseSettingsRevision(String(entry.detalle)):null;
        const patch=revision&&current?restoreSettingsRevision(revision,current):null;
        if(!patch)return json({error:currentLocale()==='en'?'These settings changed again or cannot be restored. Refresh the history.':'Estos ajustes cambiaron de nuevo o no se pueden restaurar. Actualiza el historial.'},409);
        restoreRecord=revision;
        body=patch;
    }
    const bankFields = new Set(['banco_nombre', 'banco_clabe', 'banco_beneficiario', 'acepta_transferencia', 'acepta_tarjeta', 'cobro_spei_auto']);
    const bodyKeys = Object.keys(body);
    const bankFieldTouched = bodyKeys
        .some((key) => bankFields.has(key) && body[key] !== undefined);
    const nonBankFieldTouched = bodyKeys.length === 0 || bodyKeys.some((key) => !bankFields.has(key));
    if (nonBankFieldTouched) {
        const denied = await requirePerm('ajustes');
        if (denied) return denied;
    }
    if (bankFieldTouched) {
        const cobrosDenied = await requirePerm('cobros_config');
        if (cobrosDenied) return cobrosDenied;
        if (body.banco_clabe !== undefined) {
            const staleAuth = await requireFreshAuth();
            if (staleAuth) return staleAuth;
        }
    }

    const orgId = await getActiveOrgId();

    // El body no puede activar ni reconfigurar una función superior llamando la
    // API directamente. Desactivar/restaurar defaults sigue permitido para que
    // un downgrade nunca encierre al usuario en una configuración vieja.
    const gatedWrites: Array<[FeatureKey, boolean]> = [
        ['remove_branding', body.portal_powered === false],
        ['custom_email', ['email_from_name', 'email_reply_to', 'email_intro', 'email_firma'].some((key) => body[key] !== undefined)],
        ['approvals', ['aprob_descuento_max', 'aprob_monto_max', 'aprob_margen_min'].some((key) => body[key] !== undefined && Number(body[key]) > 0)],
        ['late_interest', body.interes_moratorio_pct !== undefined && Number(body.interes_moratorio_pct) > 0],
        ['collections_ai', Object.keys(body).some((key) => key.startsWith('ai_cobranza_')) && body.ai_cobranza_activa !== false],
        ['sso', body.require_sso === true],
    ];
    for (const [feature, touched] of gatedWrites) {
        if (!touched) continue;
        const entitlementDenied = await requireEntitlement(orgId, feature);
        if (entitlementDenied) return entitlementDenied;
    }
    const [[actual]] = await withOrgTx(orgId, sql`select *, xmin::text as _revision from orgs where id = ${orgId}`);
    if (!actual) return json({error:'Organization unavailable'},404);
    if (restoreRecord) {
        const latestPatch=restoreSettingsRevision(restoreRecord,actual);
        if (!latestPatch) return json({error:currentLocale()==='en'?'Settings changed. Refresh the history.':'Los ajustes cambiaron. Actualiza el historial.'},409);
        // Rebase the visual fields on the latest profile, preserving concurrent logo edits.
        body=latestPatch;
    }
    if (body.interes_moratorio_pct !== undefined) {
        const checkedInterest = validateLateInterestRate(
            body.country_code ?? actual.country_code,
            body.interes_moratorio_pct,
        );
        if (!checkedInterest.ok) return json({ error: checkedInterest.error }, 422);
    }

    let brandProfile = actual.brand_profile ?? {};
    if (body.brand_profile !== undefined) {
        let value = body.brand_profile;
        if (typeof value === 'string') {
            try { value = JSON.parse(value); } catch { return json({ error: 'Invalid brand profile' }, 400); }
        }
        const parsed = brandProfileSchema.safeParse(value);
        if (!parsed.success) return json({ error: 'Invalid brand profile' }, 400);
        brandProfile = parsed.data;
    }

    // Cada campo: si viene en el body lo tomamos (saneado), si no, conservamos.
    const nombre = body.nombre !== undefined ? String(body.nombre).trim() : actual.nombre;
    if (!nombre) return json({ error: 'El nombre del negocio es obligatorio', field: 'nombre' }, 400);

    let rfc = body.rfc !== undefined ? (String(body.rfc).trim().toUpperCase() || null) : actual.rfc;
    const razon = body.razon_social !== undefined ? (String(body.razon_social).trim() || null) : actual.razon_social;
    const color = body.color_marca !== undefined
        ? (HEX.test(String(body.color_marca).trim()) ? String(body.color_marca).trim() : '#0a192f')
        : actual.color_marca;
    const prefix = body.quote_prefix !== undefined
        ? (String(body.quote_prefix).trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'COT')
        : actual.quote_prefix;
    const iva = body.iva_pct !== undefined
        ? Math.min(100, Math.max(0, Number(body.iva_pct) || 0))
        : actual.iva_pct;
    const email = body.email_contacto !== undefined ? (String(body.email_contacto).trim() || null) : actual.email_contacto;
    const telefono = body.telefono !== undefined ? (String(body.telefono).trim() || null) : actual.telefono;
    const direccion = body.direccion !== undefined ? (String(body.direccion).trim() || null) : actual.direccion;
    const pdfMensaje = body.pdf_mensaje !== undefined ? (String(body.pdf_mensaje ?? '').trim() || null) : actual.pdf_mensaje;
    const pdfCond = body.pdf_condiciones !== undefined ? (String(body.pdf_condiciones ?? '').trim() || null) : actual.pdf_condiciones;
    const pdfLista = body.pdf_mostrar_lista !== undefined ? Boolean(body.pdf_mostrar_lista) : actual.pdf_mostrar_lista;
    const ivaIncluidoDef = body.iva_incluido_defecto !== undefined ? Boolean(body.iva_incluido_defecto) : actual.iva_incluido_defecto;
    const pdfTemplate = body.pdf_template !== undefined
        ? (TEMPLATES.has(String(body.pdf_template)) ? String(body.pdf_template) : 'clasico')
        : actual.pdf_template;
    const aprobDesc = body.aprob_descuento_max !== undefined ? Math.min(100, Math.max(0, Number(body.aprob_descuento_max) || 0)) : actual.aprob_descuento_max;
    const aprobMonto = body.aprob_monto_max !== undefined ? Math.max(0, Number(body.aprob_monto_max) || 0) : actual.aprob_monto_max;
    // FIX jul 2026: este campo tenía data-field en Ajustes → Aprobaciones pero el
    // PATCH lo ignoraba — el margen mínimo del Auditor Silencioso nunca se guardaba.
    const aprobMargen = body.aprob_margen_min !== undefined ? Math.min(100, Math.max(0, Number(body.aprob_margen_min) || 0)) : actual.aprob_margen_min;
    const interes = body.interes_moratorio_pct !== undefined ? 0 : actual.interes_moratorio_pct;
    const logoUrl = body.logo_url !== undefined
        ? (String(body.logo_url) === '' ? null : (logoOk(String(body.logo_url)) ? String(body.logo_url) : actual.logo_url))
        : actual.logo_url;

    // ── Superpoderes de configuración (jun 2026) ──
    const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
    const str = (v: unknown, max = 200) => { const s = String(v ?? '').trim(); return s ? s.slice(0, max) : null; };

    // Perfil fiscal internacional. El JSON solo contiene este allowlist; no se
    // acepta fiscal_metadata arbitrario desde el cliente. México conserva sus
    // columnas SAT dedicadas y los demás países usan este bloque extensible.
    const currentFiscalMetadata = actual.fiscal_metadata && typeof actual.fiscal_metadata === 'object'
        ? { ...(actual.fiscal_metadata as Record<string, unknown>) }
        : {};
    const fiscalField = (bodyKey: string, metadataKey: string, max: number, transform?: (value: string) => string | null) => {
        if (body[bodyKey] === undefined) return;
        const raw = String(body[bodyKey]).trim();
        const value = transform ? transform(raw) : (raw ? raw.slice(0, max) : null);
        if (value) currentFiscalMetadata[metadataKey] = value;
        else delete currentFiscalMetadata[metadataKey];
    };
    fiscalField('fiscal_legal_name', 'legal_name', 200);
    fiscalField('fiscal_tax_id', 'tax_id', 64, (value) => value ? value.toUpperCase().slice(0, 64) : null);
    fiscalField('fiscal_address_line1', 'address_line1', 200);
    fiscalField('fiscal_address_line2', 'address_line2', 200);
    fiscalField('fiscal_city', 'city', 100);
    fiscalField('fiscal_region', 'region', 100);
    fiscalField('fiscal_postal_code', 'postal_code', 20, (value) => value
        ? value.toUpperCase().replace(/[^A-Z0-9 -]/g, '').slice(0, 20) || null
        : null);
    fiscalField('fiscal_invoice_prefix', 'invoice_prefix', 12, (value) => value
        ? value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 12) || null
        : null);
    // Franquicia de IVA (FR art. 293 B CGI, DE § 19 UStG). Solo existe en esos
    // dos países; el valor se guarda como texto porque partiesFrom() solo lee
    // cadenas de fiscal_metadata.
    if (body.fiscal_small_business !== undefined) {
        if (body.fiscal_small_business === true) currentFiscalMetadata.vat_regime = 'small_business';
        else delete currentFiscalMetadata.vat_regime;
    }

    const vigDias = body.vigencia_default_dias !== undefined ? clamp(Math.round(Number(body.vigencia_default_dias) || 0), 1, 365) : actual.vigencia_default_dias;
    const termDef = body.terminos_default !== undefined ? normalizeTerm(body.terminos_default) : actual.terminos_default;
    // % de anticipo por defecto (pre-llena el editor): 0/vacío = sin anticipo.
    const anticipoDef = body.anticipo_default_pct !== undefined
        ? (Number(body.anticipo_default_pct) >= 1 ? clamp(Math.round(Number(body.anticipo_default_pct)), 1, 99) : null)
        : actual.anticipo_default_pct;
    // ── Cobranza con IA (ago 2026): comportamiento del agente ──
    // Los rangos no son cosméticos: gracia 0 + cadencia 0 convertirían al agente
    // en spam diario a los clientes del usuario. El motor los vuelve a acotar al
    // leerlos (defensa en profundidad), pero no hay razón para guardar basura.
    const MODOS_IA = new Set(['aprobacion', 'automatico']);
    const TONOS_IA = new Set(['cercano', 'profesional', 'firme']);
    const IDIOMAS_IA = new Set(['es', 'en']);
    const aiModo = body.ai_cobranza_modo !== undefined
        ? (MODOS_IA.has(String(body.ai_cobranza_modo)) ? String(body.ai_cobranza_modo) : 'aprobacion') : actual.ai_cobranza_modo;
    const aiGracia = body.ai_cobranza_gracia_dias !== undefined
        ? clamp(Math.round(Number(body.ai_cobranza_gracia_dias) || 0), 0, 90) : actual.ai_cobranza_gracia_dias;
    const aiCadencia = body.ai_cobranza_cadencia_dias !== undefined
        ? clamp(Math.round(Number(body.ai_cobranza_cadencia_dias) || 7), 1, 90) : actual.ai_cobranza_cadencia_dias;
    const aiPlanDias = body.ai_cobranza_plan_dias !== undefined
        ? clamp(Math.round(Number(body.ai_cobranza_plan_dias) || 15), 1, 365) : actual.ai_cobranza_plan_dias;
    const aiMaxCuotas = body.ai_cobranza_max_cuotas !== undefined
        ? clamp(Math.round(Number(body.ai_cobranza_max_cuotas) || 3), 2, 6) : actual.ai_cobranza_max_cuotas;
    const aiTono = body.ai_cobranza_tono !== undefined
        ? (TONOS_IA.has(String(body.ai_cobranza_tono)) ? String(body.ai_cobranza_tono) : 'profesional') : actual.ai_cobranza_tono;
    const aiIdioma = body.ai_cobranza_idioma !== undefined
        ? (IDIOMAS_IA.has(String(body.ai_cobranza_idioma)) ? String(body.ai_cobranza_idioma) : 'es') : actual.ai_cobranza_idioma;
    const aiFirma = body.ai_cobranza_firma !== undefined ? str(body.ai_cobranza_firma, 400) : actual.ai_cobranza_firma;
    const aiMontoMin = body.ai_cobranza_monto_min !== undefined
        ? Math.max(0, Number(body.ai_cobranza_monto_min) || 0) : actual.ai_cobranza_monto_min;
    const aiMaxCorrida = body.ai_cobranza_max_corrida !== undefined
        ? clamp(Math.round(Number(body.ai_cobranza_max_corrida) || 25), 1, 200) : actual.ai_cobranza_max_corrida;
    // El interruptor maestro también entra por aquí (el panel de configuración
    // vive en /app/cobranza/agente, no en Ajustes › Agentes).
    const aiActiva = body.ai_cobranza_activa !== undefined ? Boolean(body.ai_cobranza_activa) : actual.ai_cobranza_activa;

    const retIsr = body.retencion_isr_pct !== undefined ? clamp(Number(body.retencion_isr_pct) || 0, 0, 100) : actual.retencion_isr_pct;
    const retIva = body.retencion_iva_pct !== undefined ? clamp(Number(body.retencion_iva_pct) || 0, 0, 100) : actual.retencion_iva_pct;
    const textoLegal = body.texto_legal !== undefined ? str(body.texto_legal, 600) : actual.texto_legal;
    const sitioWeb = body.sitio_web !== undefined ? str(body.sitio_web, 200) : actual.sitio_web;
    const whatsapp = body.whatsapp !== undefined ? (String(body.whatsapp) === '' ? null : String(body.whatsapp).replace(/[^0-9+]/g, '').slice(0, 20) || null) : actual.whatsapp;
    const regimen = body.regimen_fiscal !== undefined ? str(body.regimen_fiscal, 5) : actual.regimen_fiscal;
    const usoCfdi = body.uso_cfdi !== undefined ? str(body.uso_cfdi, 5) : actual.uso_cfdi;
    const cpFiscal = body.cp_fiscal !== undefined ? (String(body.cp_fiscal) === '' ? null : String(body.cp_fiscal).replace(/\D/g, '').slice(0, 5) || null) : actual.cp_fiscal;
    const serieFolio = body.serie_folio !== undefined ? (String(body.serie_folio) === '' ? null : String(body.serie_folio).trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || null) : actual.serie_folio;
    const countryCode = body.country_code !== undefined
        ? String(body.country_code).trim().toUpperCase()
        : String(actual.country_code || 'MX').toUpperCase();
    // El país debe estar en el set que Cord ofrece, O ser el que la organización
    // ya tenía guardado: recortar el catálogo no puede impedirle a una cuenta
    // existente guardar cualquier otro ajuste de esta misma pantalla.
    const paisActual = String(actual.country_code || 'MX').toUpperCase();
    const paisValido = isSupportedCountry(countryCode)
        || (countryCode === paisActual && isCountryCode(countryCode));
    if (!paisValido) return json({ error: 'País no soportado.' }, 400);

    // ── Identificador fiscal del propio negocio ─────────────────────────────
    // Se valida con el algoritmo del país (dígito verificador del RFC, letra
    // del NIF, Luhn del SIREN, mod 97 del VAT británico, DV del CUIT/RUT/RUC…)
    // antes de guardarse: es el dato que imprime cada factura y que Verifactu
    // encadena para siempre. Antes no se validaba en absoluto.
    if (body.rfc !== undefined && rfc) {
        const checked = validateTaxId(countryCode, rfc, { locale: currentLocale() });
        if (!checked.ok) return json({ error: checked.reason, code: 'invalid_tax_id', field: 'rfc' }, 400);
        if (countryCode === 'MX') {
            rfc = checked.normalized;
        } else {
            // Fuera de México el identificador vive en el perfil fiscal
            // internacional; `rfc` es la columna del CFDI. La configuración
            // asistida (src/lib/setup) lo manda como `rfc` en cualquier país.
            currentFiscalMetadata.tax_id = checked.normalized;
            rfc = actual.rfc;
        }
    }
    if (body.fiscal_tax_id !== undefined && currentFiscalMetadata.tax_id) {
        const checked = validateTaxId(countryCode, String(currentFiscalMetadata.tax_id), { locale: currentLocale() });
        if (!checked.ok) return json({ error: checked.reason, code: 'invalid_tax_id', field: 'fiscal_tax_id' }, 400);
        currentFiscalMetadata.tax_id = checked.normalized;
    }
    // Número de QST (Revenu Québec): 10 dígitos + "TQ" + 4 dígitos. Solo
    // existe en Canadá; fuera de ahí no se conserva.
    if (body.fiscal_qst_number !== undefined) {
        const qst = String(body.fiscal_qst_number ?? '').toUpperCase().replace(/[\s-]/g, '');
        if (qst && !/^\d{10}TQ\d{4}$/.test(qst)) {
            return json({
                error: currentLocale() === 'en'
                    ? 'The QST number has 10 digits, then TQ and 4 more digits (for example 1234567890TQ0001).'
                    : 'El número de QST lleva 10 dígitos, luego TQ y 4 dígitos más (por ejemplo 1234567890TQ0001).',
                field: 'fiscal_qst_number',
            }, 400);
        }
        if (qst) currentFiscalMetadata.qst_number = qst;
        else delete currentFiscalMetadata.qst_number;
    }
    if (countryCode !== 'CA') delete currentFiscalMetadata.qst_number;
    // La franquicia es un régimen de Francia y Alemania: al salir de esos
    // países (o en cualquier otro) no puede seguir imprimiendo su mención.
    if (countryCode !== 'FR' && countryCode !== 'DE') delete currentFiscalMetadata.vat_regime;

    // Una serie por emisor: si otra organización con el mismo identificador
    // fiscal ya numera con esta serie, se dice al guardar y no al emitir.
    if ((body.fiscal_invoice_prefix !== undefined || body.fiscal_tax_id !== undefined || body.rfc !== undefined)
        && !actual.sandbox_of && countryCode !== 'MX') {
        const defaultPrefix = getCountryProfile(countryCode).invoicePrefix;
        const enUso = await serieCompartida(orgId, {
            country: countryCode,
            taxId: String(currentFiscalMetadata.tax_id || rfc || ''),
            prefix: String(currentFiscalMetadata.invoice_prefix || ''),
            defaultPrefix,
        });
        if (enUso) {
            const serie = String(currentFiscalMetadata.invoice_prefix || defaultPrefix);
            return json({ error: serieCompartidaMensaje(serie), code: 'invoice_series_in_use', field: 'fiscal_invoice_prefix' }, 409);
        }
    }

    // ── El país de una cuenta de cobros es INMUTABLE ────────────────────────
    //
    // Stripe fija país y divisa al crear la cuenta conectada y no los deja
    // cambiar nunca. Cord sí dejaba editar `country_code` libremente, así que
    // una organización mexicana con cobros activos podía ponerse "España" en
    // Ajustes y a partir de ahí todo divergía en silencio: el formulario de
    // depósito le pedía un IBAN para una cuenta que Stripe tiene registrada en
    // México, el riel fiscal cambiaba de CFDI a factura comercial, y el alta de
    // depósitos se caía con un error del proveedor que no le dice nada al dueño
    // del negocio.
    //
    // Se bloquea con explicación, no en silencio: quien lo intenta necesita
    // saber POR QUÉ no se puede y qué tendría que hacer. El `<select>` de
    // Ajustes también queda fijo, pero eso es cortesía — la validación real es
    // ésta, porque ocultar una opción del select no es validar (regla 28).
    if (paisActual !== countryCode && actual.stripe_account_id) {
        await logAudit(orgId, {
            accion: 'org.pais_bloqueado',
            entidad: 'org',
            entidad_id: orgId,
            detalle: `Intento de cambiar el país de ${paisActual} a ${countryCode} con cobros conectados`,
            ip: reqIp(request),
        });
        return json({
            error: currentLocale() === 'en'
                ? 'Your country cannot be changed while online payments are connected: your payments account is registered in the country you set it up with. To operate from another country, disconnect payments first — you will need to complete verification again.'
                : 'No puedes cambiar tu país mientras los cobros en línea estén conectados: tu cuenta de cobros quedó registrada en el país con el que la diste de alta. Para operar desde otro país, primero desconecta los cobros — tendrás que volver a completar la verificación.',
        }, 409);
    }

    // ── Centro de mando Enterprise (jun 2026) ──
    // Cambiar de país arrastra la divisa y la zona horaria SOLO si la org nunca
    // las personalizó (siguen siendo las del país anterior). Sin esto una cuenta
    // que se mudaba a US/ES seguía con MXN y horario de CDMX para siempre: la
    // divisa es una decisión del negocio, pero heredar la del país viejo no lo es.
    const paisCambio = String(actual.country_code || 'MX').toUpperCase() !== countryCode;
    const perfilAnterior = getCountryProfile(String(actual.country_code || 'MX'));
    const perfilNuevo = getCountryProfile(countryCode);
    const monedaHeredada = paisCambio
        && String(actual.moneda || '').toUpperCase() === perfilAnterior.currency.toUpperCase();
    const zonaHeredada = paisCambio && String(actual.zona_horaria || '') === perfilAnterior.timeZone;

    const monedaOfrecida = new Set(listOfferedCurrencies(actual.moneda));
    const moneda = body.moneda !== undefined
        ? (monedaOfrecida.has(String(body.moneda).toUpperCase()) ? String(body.moneda).toUpperCase() : actual.moneda)
        : (monedaHeredada ? perfilNuevo.currency : actual.moneda);
    // La zona se valida contra los ids IANA reales, no por longitud: antes
    // entraba cualquier string de 40 caracteres y el valor inválido se
    // descartaba en silencio mucho después (setRequestTimeZone en context.ts),
    // así que el negocio guardaba "algo" y seguía viendo las fechas en la zona
    // del servidor sin ningún aviso.
    let zona = zonaHeredada ? perfilNuevo.timeZone : actual.zona_horaria;
    if (body.zona_horaria !== undefined) {
        const propuesta = str(body.zona_horaria, 64);
        if (!propuesta) zona = perfilNuevo.timeZone;
        else if (isValidTimeZone(propuesta)) zona = propuesta;
        else return json({ error: 'Esa zona horaria no existe. Elige una de la lista.', field: 'zona_horaria' }, 400);
    }
    // El idioma sigue al país con el mismo criterio que la divisa: se hereda solo
    // si nunca se personalizó. Un país hispanohablante deja la app en español;
    // cualquier otro, en inglés.
    const idiomaDelPais = (code: string) => getCountryProfile(code).locale.startsWith('es') ? 'es-MX' : 'en-US';
    const idiomaHeredado = paisCambio
        && String(actual.idioma || '') === idiomaDelPais(String(actual.country_code || 'MX'));
    // Vocabulario CERRADO: el idioma decide qué diccionario se sirve y qué
    // locale usan fechas y montos. Un string libre aquí guardaba 'fr-CA' y
    // dejaba la app cayendo a español sin que nadie supiera por qué.
    const IDIOMAS_APP = new Set(['es-MX', 'en-US']);
    const idioma = body.idioma !== undefined
        ? (IDIOMAS_APP.has(String(body.idioma)) ? String(body.idioma) : actual.idioma)
        : (idiomaHeredado ? idiomaDelPais(countryCode) : actual.idioma);
    const colorSec = body.color_secundario !== undefined
        ? (String(body.color_secundario ?? '') === '' ? null : (HEX.test(String(body.color_secundario ?? '').trim()) ? String(body.color_secundario ?? '').trim() : actual.color_secundario))
        : actual.color_secundario;
    const portalBien = body.portal_bienvenida !== undefined ? str(body.portal_bienvenida, 280) : actual.portal_bienvenida;

    // ── Seguridad de la organización ──
    const require2fa = body.require_2fa !== undefined ? Boolean(body.require_2fa) : actual.require_2fa;
    const sessionTimeout = body.session_timeout_min !== undefined ? clamp(Math.round(Number(body.session_timeout_min) || 0), 0, 1440) : actual.session_timeout_min;

    // Exigir SSO: activarlo está GUARDADO — sin esta precondición, el error
    // de soporte más probable es un admin que prende el toggle a medio setup
    // y deja fuera a toda la empresa (el owner conserva password siempre, ver
    // ssoRequirementFor en saml.ts, pero nadie más podría entrar). Rechaza
    // 422 salvo que exista una conexión habilitada con AL MENOS un dominio
    // verificado.
    const requireSso = body.require_sso !== undefined ? Boolean(body.require_sso) : actual.require_sso;
    const turningSsoOn = requireSso && !actual.require_sso;
    if (turningSsoOn) {
        const [[readyConn]] = await withOrgTx(orgId, sql`
            select 1 from sso_connections c
            join sso_domains d on d.connection_id = c.id
            where c.org_id = ${orgId} and c.enabled = true and d.verified_at is not null
            limit 1`);
        if (!readyConn) {
            return json({ error: 'Necesitas al menos una conexión SSO activa con un dominio verificado antes de exigir SSO.' }, 422);
        }
    }
    // Dominios de invitación: lista coma-sep saneada a host válido (sin @, minúsculas).
    const inviteDomains = body.invite_domains !== undefined
        ? (String(body.invite_domains).trim() === '' ? null
            : String(body.invite_domains).toLowerCase().split(',').map((d) => d.trim().replace(/^@/, '')).filter((d) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)).slice(0, 20).join(',') || null)
        : actual.invite_domains;

    // ── CORD Elements: allowlist de dominios que pueden embeber el cotizador.
    // Cada entrada es un host-source de CSP: "cliente.com", "*.cliente.com" o con
    // esquema "https://app.cliente.com". Saneada a comma-sep (col NOT NULL → '').
    const EMBED_HOST = /^(https?:\/\/)?(\*\.)?[a-z0-9.-]+\.[a-z]{2,}$/;
    const embedDomains = body.embed_domains !== undefined
        ? String(body.embed_domains).toLowerCase().split(/[\s,]+/).map((d) => d.trim()).filter((d) => EMBED_HOST.test(d)).slice(0, 30).join(',')
        : actual.embed_domains;

    // ── FASE 3: Portal del cliente (/q) ──
    const portalBanner = body.portal_banner !== undefined ? str(body.portal_banner, 200) : actual.portal_banner;
    const portalChat = body.portal_mostrar_chat !== undefined ? Boolean(body.portal_mostrar_chat) : actual.portal_mostrar_chat;
    const portalPowered = body.portal_powered !== undefined ? Boolean(body.portal_powered) : actual.portal_powered;

    // ── FASE 3: Correo (Resend) ──
    const emailFromName = body.email_from_name !== undefined ? str(body.email_from_name, 80) : actual.email_from_name;
    const emailReplyTo = body.email_reply_to !== undefined ? (String(body.email_reply_to).trim() || null) : actual.email_reply_to;
    const emailIntro = body.email_intro !== undefined ? str(body.email_intro, 500) : actual.email_intro;
    const emailFirma = body.email_firma !== undefined ? str(body.email_firma, 300) : actual.email_firma;

    // ── Pagos y Cobranza (Stripe Connect / Transferencias) ──
    const aceptaTarjeta = body.acepta_tarjeta !== undefined ? Boolean(body.acepta_tarjeta) : actual.acepta_tarjeta;
    const aceptaTransf = body.acepta_transferencia !== undefined ? Boolean(body.acepta_transferencia) : actual.acepta_transferencia;
    const cobroSpeiAuto = body.cobro_spei_auto !== undefined ? Boolean(body.cobro_spei_auto) : actual.cobro_spei_auto;
    const bancoNombre = body.banco_nombre !== undefined ? str(body.banco_nombre, 100) : actual.banco_nombre;
    const previousClabe = decryptSecret(actual.banco_clabe_enc as string) || (actual.banco_clabe as string) || null;
    // La cuenta para transferencia MANUAL se valida con el formato del país de
    // la organización. Antes TODO país pasaba por la regla de la CLABE (quitar
    // lo que no fuera dígito, cortar a 18 y exigir 18): Estados Unidos, Reino
    // Unido, Canadá y Brasil no podían guardar su cuenta, y un IBAN de Madrid o
    // París perdía sus letras y se cortaba a 18 dígitos — y ese número
    // corrompido era el que el cliente veía para transferir.
    let bancoClabe: string | null = previousClabe;
    if (body.banco_clabe !== undefined) {
        const cuenta = normalizeBankAccount(countryCode, String(body.banco_clabe ?? ''), currentLocale());
        if (!cuenta.ok) return json({ error: cuenta.error, field: 'banco_clabe' }, 400);
        bancoClabe = cuenta.value;
    }
    let bancoClabeEnc = actual.banco_clabe_enc;
    if (body.banco_clabe !== undefined) {
        try {
            bancoClabeEnc = bancoClabe ? encryptRequiredSecret(bancoClabe) : null;
        } catch {
            return json({ error: 'El servicio de cifrado no está disponible.' }, 503);
        }
    }
    const bancoClabeLast4 = body.banco_clabe !== undefined ? bancoClabe?.replace(/[^A-Za-z0-9]/g, '').slice(-4) || null : actual.banco_clabe_last4;
    const bancoBen = body.banco_beneficiario !== undefined ? str(body.banco_beneficiario, 150) : actual.banco_beneficiario;

    // ── Lo que deja de existir al salir de México ───────────────────────────
    // Régimen SAT, uso de CFDI, CP de expedición, serie del CFDI y SPEI son de
    // México. Al cambiar de país a otro se vacían: antes se quedaban y el
    // link público seguía mostrando "RFC …" y ofreciendo SPEI a un cliente en
    // Madrid. El RFC anterior queda en la bitácora.
    const saleDeMexico = paisCambio && paisActual === 'MX';
    const rfcFinal = saleDeMexico && body.rfc === undefined ? null : rfc;
    const regimenFinal = saleDeMexico ? null : regimen;
    const usoCfdiFinal = saleDeMexico ? null : usoCfdi;
    const cpFiscalFinal = saleDeMexico ? null : cpFiscal;
    const serieFolioFinal = saleDeMexico ? null : serieFolio;
    const cobroSpeiAutoFinal = countryCode === 'MX' ? cobroSpeiAuto : false;
    // La tasa plana heredada sigue al país si nunca se personalizó (mismo
    // criterio que la divisa): una org que pasaba de México a Francia
    // conservaba 16 y `taxCatalogFor` lo aceptaba como tasa válida.
    const ivaFinal = paisCambio && body.iva_pct === undefined
        && Number(actual.iva_pct) === defaultCountryTaxPct(paisActual)
        ? defaultCountryTaxPct(countryCode)
        : iva;
    if (saleDeMexico && (actual.rfc || actual.regimen_fiscal)) {
        await logAudit(orgId, {
            accion: 'org.fiscal_mx_archivado', entidad: 'org', entidad_id: orgId,
            detalle: `País ${paisActual} → ${countryCode}; RFC anterior ${actual.rfc || '—'}, régimen ${actual.regimen_fiscal || '—'}`,
            ip: reqIp(request),
        });
    }

    const revision = createSettingsRevision(actual, {
        color_marca:color,color_secundario:colorSec,brand_profile:brandProfile,
        pdf_template:pdfTemplate,pdf_mensaje:pdfMensaje,pdf_condiciones:pdfCond,pdf_mostrar_lista:pdfLista,
        portal_bienvenida:portalBien,portal_banner:portalBanner,email_intro:emailIntro,email_firma:emailFirma,
    }, Object.keys(body));
    const [recorded] = await withOrgTx(orgId, sql`
        with updated as (update orgs set
            nombre = ${nombre}, rfc = ${rfcFinal}, razon_social = ${razon},
            color_marca = ${color}, quote_prefix = ${prefix}, iva_pct = ${ivaFinal}, iva_incluido_defecto = ${ivaIncluidoDef},
            email_contacto = ${email}, telefono = ${telefono}, direccion = ${direccion},
            logo_url = ${logoUrl}, pdf_template = ${pdfTemplate},
            pdf_mensaje = ${pdfMensaje}, pdf_condiciones = ${pdfCond}, pdf_mostrar_lista = ${pdfLista},
            aprob_descuento_max = ${aprobDesc}, aprob_monto_max = ${aprobMonto}, aprob_margen_min = ${aprobMargen}, interes_moratorio_pct = ${interes},
            vigencia_default_dias = ${vigDias}, terminos_default = ${termDef}, anticipo_default_pct = ${anticipoDef},
            ai_cobranza_activa = ${aiActiva}, ai_cobranza_modo = ${aiModo},
            ai_cobranza_gracia_dias = ${aiGracia}, ai_cobranza_cadencia_dias = ${aiCadencia},
            ai_cobranza_plan_dias = ${aiPlanDias}, ai_cobranza_max_cuotas = ${aiMaxCuotas},
            ai_cobranza_tono = ${aiTono}, ai_cobranza_idioma = ${aiIdioma}, ai_cobranza_firma = ${aiFirma},
            ai_cobranza_monto_min = ${aiMontoMin}, ai_cobranza_max_corrida = ${aiMaxCorrida},
            retencion_isr_pct = ${retIsr}, retencion_iva_pct = ${retIva}, texto_legal = ${textoLegal},
            sitio_web = ${sitioWeb}, whatsapp = ${whatsapp},
            regimen_fiscal = ${regimenFinal}, uso_cfdi = ${usoCfdiFinal}, cp_fiscal = ${cpFiscalFinal}, serie_folio = ${serieFolioFinal},
            country_code = ${countryCode},
            fiscal_metadata = ${JSON.stringify(currentFiscalMetadata)},
            moneda = ${moneda}, zona_horaria = ${zona}, idioma = ${idioma},
            brand_profile = ${JSON.stringify(brandProfile)}::jsonb,
            color_secundario = ${colorSec}, portal_bienvenida = ${portalBien},
            require_2fa = ${require2fa}, session_timeout_min = ${sessionTimeout}, invite_domains = ${inviteDomains},
            require_sso = ${requireSso},
            embed_domains = ${embedDomains},
            portal_banner = ${portalBanner}, portal_mostrar_chat = ${portalChat}, portal_powered = ${portalPowered},
            email_from_name = ${emailFromName}, email_reply_to = ${emailReplyTo}, email_intro = ${emailIntro}, email_firma = ${emailFirma},
            acepta_tarjeta = ${aceptaTarjeta}, acepta_transferencia = ${aceptaTransf}, cobro_spei_auto = ${cobroSpeiAutoFinal},
            banco_nombre = ${bancoNombre}, banco_clabe = null, banco_clabe_enc = ${bancoClabeEnc},
            banco_clabe_last4 = ${bancoClabeLast4}, banco_beneficiario = ${bancoBen}
        where id = ${orgId} and xmin::text = ${actual._revision}
        returning id)
        insert into audit_log (org_id,actor,accion,entidad,entidad_id,detalle,ip)
        select id,${currentUserId() ?? 'system'},'org.configuracion','org',id::text,${JSON.stringify(revision)},${reqIp(request)} from updated
        returning id`);
    if (!recorded.length) return json({error:currentLocale()==='en'?'Another change was saved. Reload before saving again.':'Se guardó otro cambio. Recarga antes de volver a guardar.'},409);

    const submittedFields = Object.keys(body).filter((key) => key !== 'banco_clabe').sort();
    if (body.banco_clabe !== undefined) submittedFields.push(`banco_clabe(last4:${actual.banco_clabe_last4 || 'ninguna'}->${bancoClabeLast4 || 'ninguna'})`);
    await logAudit(orgId, { accion: 'org.actualizada', entidad: 'org', entidad_id: orgId, detalle: `Campos: ${submittedFields.join(', ') || 'ninguno'}`, ip: reqIp(request) });

    // Al ACTIVAR "Exigir SSO": las sesiones de contraseña de los no-owner
    // pueden seguir vivas hasta 30 días — sin esto, la política no surte
    // efecto real para nadie que ya tenga sesión abierta hasta que expire
    // sola. El owner NUNCA se toca (conserva su propia sesión + password).
    if (turningSsoOn) {
        const [members] = await withOrgTx(orgId, sql`
            select user_id from org_members
            where org_id = ${orgId} and estado = 'activo' and user_id is not null and user_id != ${actual.owner_id}`);
        for (const m of members as any[]) {
            await revokeAllSessions(m.user_id as string);
        }
        await logAudit(orgId, { accion: 'sso.exigir_activado', entidad: 'org', entidad_id: orgId, detalle: `${members.length} sesión(es) revocada(s)`, ip: reqIp(request) });
    }

    // Varios read-models cachean config de la org (getCobranzaIA lee todo el
    // bloque ai_cobranza_*, getCobranza lee interes_moratorio_pct). Sin esto,
    // guardar en Ajustes y recargar seguía mostrando los valores viejos hasta
    // 30-60 s: el usuario cree que no se guardó y vuelve a guardar.
    // ── Impuestos del territorio ────────────────────────────────────────────
    // Cambiar el país, o el estado / la provincia que decide el impuesto
    // (sales tax estatal en EE.UU., IGIC en Canarias), reemplaza el catálogo
    // de ARRANQUE del territorio anterior si sigue intacto. Antes una cuenta de
    // EE.UU. que declaraba su estado se quedaba con solo "Exempt" (toda
    // cotización salía al 0%) y una que pasaba de México a Francia conservaba
    // el IVA 16% mexicano.
    const regionAnterior = String((actual.fiscal_metadata as Record<string, unknown> | null)?.region || '') || null;
    const regionNueva = String(currentFiscalMetadata.region || '') || null;
    if (paisCambio || regionAnterior !== regionNueva) {
        const sembrados = await reseedTaxCatalogForTerritory(orgId,
            { country: paisActual, region: regionAnterior },
            { country: countryCode, region: regionNueva });
        if (sembrados > 0) {
            await logAudit(orgId, {
                accion: 'impuesto.catalogo_territorio', entidad: 'impuesto',
                detalle: `${sembrados} perfiles de ${countryCode}${regionNueva ? `/${regionNueva}` : ''} (antes ${paisActual}${regionAnterior ? `/${regionAnterior}` : ''})`,
                ip: reqIp(request),
            });
        }
    }

    invalidateMoneyCaches(orgId);

    return json({ ok: true });
};

const deleteSchema = z.object({
    confirmName: z.string().trim().max(200),
    password: z.string().max(256).optional(),
    code: z.string().trim().max(64).optional(),
});

// DELETE /api/org { confirmName, password?, code? } — borra la organización
// ACTIVA y sus filas operativas dependientes en la base primaria. No borra
// evidencia legal seudónima sin FK, respaldos ni registros que un proveedor
// conserve bajo su propio contrato. Solo el dueño, con re-autenticación (contraseña
// o código TOTP/respaldo) y type-to-confirm del nombre exacto de la org
// (patrón GitHub/Stripe — evita un borrado accidental por un clic de más).
// Las ~33 tablas hijas ya tienen `on delete cascade` (ver db/schema.sql), así
// que un solo DELETE limpia cotizaciones, clientes, catálogo, CFDI, equipo,
// llaves API, webhooks, kits, cobros, etc. Solo `orgs.parent_org_id` es
// `set null` (las sub-cuentas hijas sobreviven, huérfanas — correcto).
export const DELETE: APIRoute = async ({ request }) => {
    const userId = currentUserId();
    if (!userId) return json({ error: 'No autenticado' }, 401);

    const rl = await rateLimit(`org-delete:${userId}`, 5, 300);
    if (!rl.ok) return tooMany(rl.retryAfter);

    const parsed = await parseJsonBody(request, deleteSchema);
    if (!parsed.ok) return json({ error: parsed.error }, parsed.status);

    const orgId = await getActiveOrgId();
    const [[org]] = await withOrgTx(orgId, sql`select nombre, owner_id, sandbox_of, stripe_subscription_id, stripe_account_id from orgs where id = ${orgId}`);
    if (!org) return json({ error: 'No encontrada' }, 404);

    if (org.owner_id !== userId) {
        return json({ error: 'Solo el dueño puede eliminar la organización' }, 403);
    }
    if (org.sandbox_of) {
        // El entorno de prueba se vacía con /api/test-mode/reset, no aquí.
        return json({ error: t(currentLocale(), 'err.test.org_delete') }, 409);
    }

    const confirmed = await reauthenticate(userId, { password: parsed.data.password, code: parsed.data.code });
    if (!confirmed) return json({ error: 'confirmation_required' }, 401);

    if (parsed.data.confirmName !== org.nombre) {
        return json({ error: 'name_mismatch' }, 400);
    }

    // Paso de auditoría ANTES de borrar — si algo falla a medio camino, queda
    // rastro mientras la org todavía existe (una vez borrada, audit_log
    // cascadea con ella: no hay forma de que un log atado a esta org
    // sobreviva a su propio borrado).
    await logAudit(orgId, {
        accion: 'org.eliminacion_iniciada',
        entidad: 'org',
        entidad_id: orgId,
        detalle: `Eliminación solicitada por el dueño: ${org.nombre}`,
        ip: reqIp(request),
    });

    try {
        await deleteOrgCascade({
            id: orgId,
            nombre: org.nombre as string,
            stripe_subscription_id: org.stripe_subscription_id as string | null,
            stripe_account_id: org.stripe_account_id as string | null,
        });
    } catch (error) {
        if (error instanceof OrgConservacionError) return json({ error: error.message, code: 'retention_required' }, 409);
        throw error;
    }

    return json({ ok: true });
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

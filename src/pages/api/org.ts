// /api/org — ajustes del negocio (marca, fiscales, PDF).
//   PATCH { nombre?, rfc?, razon_social?, color_marca?, quote_prefix?, iva_pct?,
//           email_contacto?, telefono?, direccion?, logo_url?, pdf_template?,
//           pdf_mensaje?, pdf_condiciones?, pdf_mostrar_lista? }  → { ok }
// Solo actualiza los campos presentes en el body.
export const prerender = false;

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { sql, getActiveOrgId, logAudit, reqIp, withOrgTx } from '../../lib/db';
import { requirePerm, invalidateMoneyCaches } from '../../lib/queries';
import { currentUserId } from '../../lib/context';
import { reauthenticate, revokeAllSessions } from '../../lib/auth';
import { parseJsonBody } from '../../lib/validation';
import { rateLimit, tooMany } from '../../lib/ratelimit';
import { deleteOrgCascade } from '../../lib/org-delete';
import { decryptSecret, encryptRequiredSecret } from '../../lib/crypto-secret';
import { requireFreshAuth } from '../../lib/step-up';
import { requireEntitlement } from '../../lib/org-entitlements';
import type { FeatureKey } from '../../lib/entitlements';
import { isCountryCode } from '../../lib/countries';

const HEX = /^#[0-9a-fA-F]{6}$/;
const TEMPLATES = new Set(['clasico', 'minimal', 'detallado']);
// Node 24/ICU es la fuente local del catálogo ISO 4217. Así Ajustes admite la
// moneda de cualquier país sin depender de una API o paquete de terceros.
const SUPPORTED_CURRENCIES = new Set(Intl.supportedValuesOf('currency'));
// Logo: acepta data URL de imagen (subida, cap ~1.1MB) o URL http(s).
const logoOk = (s: string) =>
    s.length <= 1_500_000 &&
    (/^data:image\/(png|jpe?g|webp|svg\+xml);base64,/.test(s) || /^https?:\/\//.test(s));

export const PATCH: APIRoute = async ({ request }) => {
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }

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
    const [[actual]] = await withOrgTx(orgId, sql`select * from orgs where id = ${orgId}`);

    // Cada campo: si viene en el body lo tomamos (saneado), si no, conservamos.
    const nombre = body.nombre !== undefined ? String(body.nombre).trim() : actual.nombre;
    if (!nombre) return json({ error: 'El nombre del negocio es obligatorio' }, 400);

    const rfc = body.rfc !== undefined ? (String(body.rfc).trim().toUpperCase() || null) : actual.rfc;
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
    const pdfMensaje = body.pdf_mensaje !== undefined ? (String(body.pdf_mensaje).trim() || null) : actual.pdf_mensaje;
    const pdfCond = body.pdf_condiciones !== undefined ? (String(body.pdf_condiciones).trim() || null) : actual.pdf_condiciones;
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
    const interes = body.interes_moratorio_pct !== undefined ? Math.min(100, Math.max(0, Number(body.interes_moratorio_pct) || 0)) : actual.interes_moratorio_pct;
    const logoUrl = body.logo_url !== undefined
        ? (String(body.logo_url) === '' ? null : (logoOk(String(body.logo_url)) ? String(body.logo_url) : actual.logo_url))
        : actual.logo_url;

    // ── Superpoderes de configuración (jun 2026) ──
    const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
    const TERMS = new Set(['contado', 'net30', 'net60']);
    const str = (v: unknown, max = 200) => { const s = String(v).trim(); return s ? s.slice(0, max) : null; };

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

    const vigDias = body.vigencia_default_dias !== undefined ? clamp(Math.round(Number(body.vigencia_default_dias) || 0), 1, 365) : actual.vigencia_default_dias;
    const termDef = body.terminos_default !== undefined ? (TERMS.has(String(body.terminos_default)) ? String(body.terminos_default) : 'contado') : actual.terminos_default;
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
    if (!isCountryCode(countryCode)) return json({ error: 'País no soportado.' }, 400);

    // ── Centro de mando Enterprise (jun 2026) ──
    const moneda = body.moneda !== undefined
        ? (SUPPORTED_CURRENCIES.has(String(body.moneda).toUpperCase()) ? String(body.moneda).toUpperCase() : actual.moneda)
        : actual.moneda;
    const zona = body.zona_horaria !== undefined ? (str(body.zona_horaria, 40) || 'America/Mexico_City') : actual.zona_horaria;
    const idioma = body.idioma !== undefined ? (str(body.idioma, 10) || 'es-MX') : actual.idioma;
    const colorSec = body.color_secundario !== undefined
        ? (String(body.color_secundario) === '' ? null : (HEX.test(String(body.color_secundario).trim()) ? String(body.color_secundario).trim() : actual.color_secundario))
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
    const bancoClabe = body.banco_clabe !== undefined ? (String(body.banco_clabe) === '' ? null : String(body.banco_clabe).replace(/\D/g, '').slice(0, 18) || null) : previousClabe;
    if (bancoClabe && !/^\d{18}$/.test(bancoClabe)) return json({ error: 'La CLABE debe tener 18 dígitos.' }, 400);
    let bancoClabeEnc = actual.banco_clabe_enc;
    if (body.banco_clabe !== undefined) {
        try {
            bancoClabeEnc = bancoClabe ? encryptRequiredSecret(bancoClabe) : null;
        } catch {
            return json({ error: 'El servicio de cifrado no está disponible.' }, 503);
        }
    }
    const bancoClabeLast4 = body.banco_clabe !== undefined ? bancoClabe?.slice(-4) || null : actual.banco_clabe_last4;
    const bancoBen = body.banco_beneficiario !== undefined ? str(body.banco_beneficiario, 150) : actual.banco_beneficiario;

    await withOrgTx(orgId, sql`
        update orgs set
            nombre = ${nombre}, rfc = ${rfc}, razon_social = ${razon},
            color_marca = ${color}, quote_prefix = ${prefix}, iva_pct = ${iva}, iva_incluido_defecto = ${ivaIncluidoDef},
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
            regimen_fiscal = ${regimen}, uso_cfdi = ${usoCfdi}, cp_fiscal = ${cpFiscal}, serie_folio = ${serieFolio},
            country_code = ${countryCode},
            fiscal_metadata = ${JSON.stringify(currentFiscalMetadata)},
            moneda = ${moneda}, zona_horaria = ${zona}, idioma = ${idioma},
            color_secundario = ${colorSec}, portal_bienvenida = ${portalBien},
            require_2fa = ${require2fa}, session_timeout_min = ${sessionTimeout}, invite_domains = ${inviteDomains},
            require_sso = ${requireSso},
            embed_domains = ${embedDomains},
            portal_banner = ${portalBanner}, portal_mostrar_chat = ${portalChat}, portal_powered = ${portalPowered},
            email_from_name = ${emailFromName}, email_reply_to = ${emailReplyTo}, email_intro = ${emailIntro}, email_firma = ${emailFirma},
            acepta_tarjeta = ${aceptaTarjeta}, acepta_transferencia = ${aceptaTransf}, cobro_spei_auto = ${cobroSpeiAuto},
            banco_nombre = ${bancoNombre}, banco_clabe = null, banco_clabe_enc = ${bancoClabeEnc},
            banco_clabe_last4 = ${bancoClabeLast4}, banco_beneficiario = ${bancoBen}
        where id = ${orgId}`);
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
    invalidateMoneyCaches(orgId);

    return json({ ok: true });
};

const deleteSchema = z.object({
    confirmName: z.string().trim().max(200),
    password: z.string().max(256).optional(),
    code: z.string().trim().max(64).optional(),
});

// DELETE /api/org { confirmName, password?, code? } — borra la organización
// ACTIVA y TODOS sus datos. Solo el dueño, con re-autenticación (contraseña
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
        return json({ error: 'No se puede eliminar un entorno de prueba por esta vía' }, 409);
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

    await deleteOrgCascade({
        id: orgId,
        nombre: org.nombre as string,
        stripe_subscription_id: org.stripe_subscription_id as string | null,
        stripe_account_id: org.stripe_account_id as string | null,
    });

    return json({ ok: true });
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

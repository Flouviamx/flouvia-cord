// /api/org — ajustes del negocio (marca, fiscales, PDF).
//   PATCH { nombre?, rfc?, razon_social?, color_marca?, quote_prefix?, iva_pct?,
//           email_contacto?, telefono?, direccion?, logo_url?, pdf_template?,
//           pdf_mensaje?, pdf_condiciones?, pdf_mostrar_lista? }  → { ok }
// Solo actualiza los campos presentes en el body.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId, logAudit, reqIp } from '../../lib/db';
import { requirePerm } from '../../lib/queries';

const HEX = /^#[0-9a-fA-F]{6}$/;
const TEMPLATES = new Set(['clasico', 'minimal', 'detallado']);
// Logo: acepta data URL de imagen (subida, cap ~1.1MB) o URL http(s).
const logoOk = (s: string) =>
    s.length <= 1_500_000 &&
    (/^data:image\/(png|jpe?g|webp|svg\+xml);base64,/.test(s) || /^https?:\/\//.test(s));

export const PATCH: APIRoute = async ({ request }) => {
    const denied = await requirePerm('ajustes');
    if (denied) return denied;

    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }

    const orgId = await getActiveOrgId();
    const [actual] = await sql`select * from orgs where id = ${orgId}`;

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
    const pdfTemplate = body.pdf_template !== undefined
        ? (TEMPLATES.has(String(body.pdf_template)) ? String(body.pdf_template) : 'clasico')
        : actual.pdf_template;
    const aprobDesc = body.aprob_descuento_max !== undefined ? Math.min(100, Math.max(0, Number(body.aprob_descuento_max) || 0)) : actual.aprob_descuento_max;
    const aprobMonto = body.aprob_monto_max !== undefined ? Math.max(0, Number(body.aprob_monto_max) || 0) : actual.aprob_monto_max;
    const interes = body.interes_moratorio_pct !== undefined ? Math.min(100, Math.max(0, Number(body.interes_moratorio_pct) || 0)) : actual.interes_moratorio_pct;
    const logoUrl = body.logo_url !== undefined
        ? (String(body.logo_url) === '' ? null : (logoOk(String(body.logo_url)) ? String(body.logo_url) : actual.logo_url))
        : actual.logo_url;

    // ── Superpoderes de configuración (jun 2026) ──
    const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
    const TERMS = new Set(['contado', 'net30', 'net60']);
    const str = (v: unknown, max = 200) => { const s = String(v).trim(); return s ? s.slice(0, max) : null; };

    const vigDias = body.vigencia_default_dias !== undefined ? clamp(Math.round(Number(body.vigencia_default_dias) || 0), 1, 365) : actual.vigencia_default_dias;
    const termDef = body.terminos_default !== undefined ? (TERMS.has(String(body.terminos_default)) ? String(body.terminos_default) : 'contado') : actual.terminos_default;
    const retIsr = body.retencion_isr_pct !== undefined ? clamp(Number(body.retencion_isr_pct) || 0, 0, 100) : actual.retencion_isr_pct;
    const retIva = body.retencion_iva_pct !== undefined ? clamp(Number(body.retencion_iva_pct) || 0, 0, 100) : actual.retencion_iva_pct;
    const textoLegal = body.texto_legal !== undefined ? str(body.texto_legal, 600) : actual.texto_legal;
    const sitioWeb = body.sitio_web !== undefined ? str(body.sitio_web, 200) : actual.sitio_web;
    const whatsapp = body.whatsapp !== undefined ? (String(body.whatsapp) === '' ? null : String(body.whatsapp).replace(/[^0-9+]/g, '').slice(0, 20) || null) : actual.whatsapp;
    const regimen = body.regimen_fiscal !== undefined ? str(body.regimen_fiscal, 5) : actual.regimen_fiscal;
    const usoCfdi = body.uso_cfdi !== undefined ? str(body.uso_cfdi, 5) : actual.uso_cfdi;
    const cpFiscal = body.cp_fiscal !== undefined ? (String(body.cp_fiscal) === '' ? null : String(body.cp_fiscal).replace(/\D/g, '').slice(0, 5) || null) : actual.cp_fiscal;
    const serieFolio = body.serie_folio !== undefined ? (String(body.serie_folio) === '' ? null : String(body.serie_folio).trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || null) : actual.serie_folio;

    // ── Centro de mando Enterprise (jun 2026) ──
    const MONEDAS = new Set(['MXN', 'USD', 'EUR']);
    const moneda = body.moneda !== undefined ? (MONEDAS.has(String(body.moneda)) ? String(body.moneda) : 'MXN') : actual.moneda;
    const zona = body.zona_horaria !== undefined ? (str(body.zona_horaria, 40) || 'America/Mexico_City') : actual.zona_horaria;
    const idioma = body.idioma !== undefined ? (str(body.idioma, 10) || 'es-MX') : actual.idioma;
    const colorSec = body.color_secundario !== undefined
        ? (String(body.color_secundario) === '' ? null : (HEX.test(String(body.color_secundario).trim()) ? String(body.color_secundario).trim() : actual.color_secundario))
        : actual.color_secundario;
    const portalBien = body.portal_bienvenida !== undefined ? str(body.portal_bienvenida, 280) : actual.portal_bienvenida;

    // ── Seguridad de la organización ──
    const require2fa = body.require_2fa !== undefined ? Boolean(body.require_2fa) : actual.require_2fa;
    const sessionTimeout = body.session_timeout_min !== undefined ? clamp(Math.round(Number(body.session_timeout_min) || 0), 0, 1440) : actual.session_timeout_min;
    // Dominios de invitación: lista coma-sep saneada a host válido (sin @, minúsculas).
    const inviteDomains = body.invite_domains !== undefined
        ? (String(body.invite_domains).trim() === '' ? null
            : String(body.invite_domains).toLowerCase().split(',').map((d) => d.trim().replace(/^@/, '')).filter((d) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)).slice(0, 20).join(',') || null)
        : actual.invite_domains;

    // ── TRATO Elements: allowlist de dominios que pueden embeber el cotizador.
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

    await sql`
        update orgs set
            nombre = ${nombre}, rfc = ${rfc}, razon_social = ${razon},
            color_marca = ${color}, quote_prefix = ${prefix}, iva_pct = ${iva},
            email_contacto = ${email}, telefono = ${telefono}, direccion = ${direccion},
            logo_url = ${logoUrl}, pdf_template = ${pdfTemplate},
            pdf_mensaje = ${pdfMensaje}, pdf_condiciones = ${pdfCond}, pdf_mostrar_lista = ${pdfLista},
            aprob_descuento_max = ${aprobDesc}, aprob_monto_max = ${aprobMonto}, interes_moratorio_pct = ${interes},
            vigencia_default_dias = ${vigDias}, terminos_default = ${termDef},
            retencion_isr_pct = ${retIsr}, retencion_iva_pct = ${retIva}, texto_legal = ${textoLegal},
            sitio_web = ${sitioWeb}, whatsapp = ${whatsapp},
            regimen_fiscal = ${regimen}, uso_cfdi = ${usoCfdi}, cp_fiscal = ${cpFiscal}, serie_folio = ${serieFolio},
            moneda = ${moneda}, zona_horaria = ${zona}, idioma = ${idioma},
            color_secundario = ${colorSec}, portal_bienvenida = ${portalBien},
            require_2fa = ${require2fa}, session_timeout_min = ${sessionTimeout}, invite_domains = ${inviteDomains},
            embed_domains = ${embedDomains},
            portal_banner = ${portalBanner}, portal_mostrar_chat = ${portalChat}, portal_powered = ${portalPowered},
            email_from_name = ${emailFromName}, email_reply_to = ${emailReplyTo}, email_intro = ${emailIntro}, email_firma = ${emailFirma}
        where id = ${orgId}`;
    await logAudit(orgId, { accion: 'org.actualizada', entidad: 'org', entidad_id: orgId, detalle: 'Se actualizaron los ajustes del negocio', ip: reqIp(request) });
    return json({ ok: true });
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

// /api/org — ajustes del negocio (marca, fiscales, PDF).
//   PATCH { nombre?, rfc?, razon_social?, color_marca?, quote_prefix?, iva_pct?,
//           email_contacto?, telefono?, direccion?, logo_url?, pdf_template?,
//           pdf_mensaje?, pdf_condiciones?, pdf_mostrar_lista? }  → { ok }
// Solo actualiza los campos presentes en el body.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId } from '../../lib/db';

const HEX = /^#[0-9a-fA-F]{6}$/;
const TEMPLATES = new Set(['clasico', 'minimal', 'detallado']);
// Logo: acepta data URL de imagen (subida, cap ~1.1MB) o URL http(s).
const logoOk = (s: string) =>
    s.length <= 1_500_000 &&
    (/^data:image\/(png|jpe?g|webp|svg\+xml);base64,/.test(s) || /^https?:\/\//.test(s));

export const PATCH: APIRoute = async ({ request }) => {
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
    const logoUrl = body.logo_url !== undefined
        ? (String(body.logo_url) === '' ? null : (logoOk(String(body.logo_url)) ? String(body.logo_url) : actual.logo_url))
        : actual.logo_url;

    await sql`
        update orgs set
            nombre = ${nombre}, rfc = ${rfc}, razon_social = ${razon},
            color_marca = ${color}, quote_prefix = ${prefix}, iva_pct = ${iva},
            email_contacto = ${email}, telefono = ${telefono}, direccion = ${direccion},
            logo_url = ${logoUrl}, pdf_template = ${pdfTemplate},
            pdf_mensaje = ${pdfMensaje}, pdf_condiciones = ${pdfCond}, pdf_mostrar_lista = ${pdfLista}
        where id = ${orgId}`;
    return json({ ok: true });
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

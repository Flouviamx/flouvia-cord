// Avisos del cobro automático y del portal.
//
// Al CLIENTE: cuando un cargo automático no pasa, qué sigue (otro intento en
// una fecha, o algo que tiene que hacer él) con el botón a su portal. Al
// NEGOCIO: cuando el cobro automático se detiene, una tarea con el motivo; un
// reintento programado no le pide nada.
//
// Nunca lanzan: un aviso perdido no puede revertir el registro del fallo.

import { sql, withOrgTx } from '../db';
import { sendEmail } from '../email';
import { brandEmailShell, emailBrandFromRow, emailButtonStyle, escapeEmail } from '../brand-email';
import { currencyDecimals, normalizeCurrency } from '../currency';
import { t, type AppStringKey } from '../../i18n/app';
import { log } from '../log';
import type { Decision } from './reintentos';
import type { PagoAgrupadoRow } from './agrupados';
import { linkPortal } from './portal';

type Locale = 'es' | 'en';

const tv = (L: Locale, key: AppStringKey, vars: Record<string, string> = {}) => {
    let s = t(L, key);
    for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(v);
    return s;
};

const importe = (n: number, currency: string, L: Locale) => {
    const code = normalizeCurrency(currency);
    const decimales = currencyDecimals(code);
    return new Intl.NumberFormat(L === 'en' ? 'en-US' : 'es-MX', {
        style: 'currency', currency: code, minimumFractionDigits: decimales, maximumFractionDigits: decimales,
    }).format(n);
};

// El reintento es un INSTANTE: se fecha en la zona del negocio (regla 24). En
// UTC, un reintento a las 03:00 UTC le decía "el 12" a un cliente de Ciudad de
// México para quien todavía era el 11.
const fecha = (d: Date, L: Locale, zona?: string | null) => {
    const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' };
    try {
        return d.toLocaleDateString(L === 'en' ? 'en-US' : 'es-MX', { ...opts, timeZone: zona || 'UTC' });
    } catch {
        return d.toLocaleDateString(L === 'en' ? 'en-US' : 'es-MX', { ...opts, timeZone: 'UTC' });
    }
};

async function datosAviso(orgId: string, clienteId: string) {
    const [[r]] = await withOrgTx(orgId, sql`
        select c.empresa, c.contacto, c.email,
               o.nombre as org_nombre, coalesce(o.color_marca, '#0a192f') as color, o.logo_url, o.color_secundario,
               o.brand_profile, o.email_contacto, o.idioma, o.zona_horaria, o.sandbox_of, o.is_demo
          from clientes c join orgs o on o.id = c.org_id
         where c.id = ${clienteId} and c.org_id = ${orgId}`);
    return r ?? null;
}

const MOTIVO: Record<string, { cuerpo: AppStringKey; tarea: AppStringKey }> = {
    metodo_invalido: { cuerpo: 'portal.e_fallo_metodo', tarea: 'portal.tarea_metodo' },
    bloqueado: { cuerpo: 'portal.e_fallo_metodo', tarea: 'portal.tarea_bloqueado' },
    mandato_revocado: { cuerpo: 'portal.e_fallo_mandato', tarea: 'portal.tarea_mandato' },
    requiere_autenticacion: { cuerpo: 'portal.e_fallo_autenticacion', tarea: 'portal.tarea_autenticacion' },
    agotado: { cuerpo: 'portal.e_fallo_agotado', tarea: 'portal.tarea_agotado' },
};

/** Un cargo automático no pasó: avisa al cliente y, si se detuvo, deja la tarea al negocio. */
export async function avisarFalloCobro(orgId: string, pago: PagoAgrupadoRow, decision: Decision): Promise<void> {
    if (!pago.clienteId) return;
    try {
        const r = await datosAviso(orgId, pago.clienteId);
        if (!r || r.sandbox_of || r.is_demo) return;
        const L: Locale = String(r.idioma || '').toLowerCase().startsWith('en') ? 'en' : 'es';
        const monto = importe(pago.monto, pago.currency, L);
        const cliente = String(r.empresa || r.contacto || '');

        if (decision.accion === 'detener') {
            const tarea = MOTIVO[decision.motivo]?.tarea ?? 'portal.tarea_agotado';
            await withOrgTx(orgId, sql`
                insert into tareas (org_id, titulo, due_date, prioridad)
                values (${orgId}, ${tv(L, tarea, { cliente, monto }).slice(0, 200)}, current_date, 'alta')`);
        }

        const email = String(r.email || '').trim();
        if (!email) return;
        const link = await linkPortal(orgId, pago.clienteId);
        if (!link) return;
        const cuerpo = decision.accion === 'reintentar'
            ? tv(L, 'portal.e_fallo_reintento', { monto, fecha: fecha(decision.siguienteAt, L, r.zona_horaria) })
            : tv(L, MOTIVO[decision.motivo]?.cuerpo ?? 'portal.e_fallo_agotado', { monto });
        const brand = emailBrandFromRow(r);
        const html = brandEmailShell(brand, `
            <p style="font-size:16px;color:#111827;margin-top:0;font-weight:500;">${escapeEmail(cliente || t(L, 'fact.e_hola'))}</p>
            <p style="font-size:16px;line-height:1.6;color:#374151;margin:0 0 32px;">${escapeEmail(cuerpo)}</p>
            <a href="${escapeEmail(link)}" style="${emailButtonStyle(brand)}">${escapeEmail(t(L, 'portal.e_cta'))}</a>`,
            escapeEmail(`${r.org_nombre}${t(L, 'email.enviado_con_cord')}`));
        await sendEmail({
            orgId, operation: 'autopay_failed', to: email,
            subject: `${tv(L, 'portal.e_fallo_asunto', { monto })} — ${r.org_nombre}`,
            html, fromName: String(r.org_nombre), replyTo: r.email_contacto ? String(r.email_contacto) : null,
        });
    } catch (err) {
        log.error('no se pudo avisar del fallo del cobro automático', { route: 'cobros', orgId, err });
    }
}

/** El negocio comparte el portal con su cliente por correo. */
export async function enviarLinkPortal(orgId: string, clienteId: string): Promise<{ ok: true } | { ok: false; error: string }> {
    const r = await datosAviso(orgId, clienteId);
    if (!r) return { ok: false, error: 'Cliente no encontrado.' };
    const email = String(r.email || '').trim();
    if (!email) return { ok: false, error: 'Este cliente no tiene correo. Agrégalo en su ficha.' };
    const link = await linkPortal(orgId, clienteId);
    if (!link) return { ok: false, error: 'No se pudo generar el link del portal.' };
    const L: Locale = String(r.idioma || '').toLowerCase().startsWith('en') ? 'en' : 'es';
    const brand = emailBrandFromRow(r);
    const cliente = String(r.empresa || r.contacto || '');
    const html = brandEmailShell(brand, `
        <p style="font-size:16px;color:#111827;margin-top:0;font-weight:500;">${escapeEmail(cliente || t(L, 'fact.e_hola'))}</p>
        <p style="font-size:16px;line-height:1.6;color:#374151;margin:0 0 32px;">${escapeEmail(tv(L, 'portal.e_link_cuerpo', { org: String(r.org_nombre) }))}</p>
        <a href="${escapeEmail(link)}" style="${emailButtonStyle(brand)}">${escapeEmail(t(L, 'portal.e_cta'))}</a>`,
        escapeEmail(`${r.org_nombre}${t(L, 'email.enviado_con_cord')}`));
    const prueba = r.sandbox_of ? t(L, 'email.prueba_prefix') : '';
    const res = await sendEmail({
        orgId, operation: 'portal_link', to: email,
        subject: `${prueba}${tv(L, 'portal.e_link_asunto', { org: String(r.org_nombre) })}`,
        html, fromName: String(r.org_nombre), replyTo: r.email_contacto ? String(r.email_contacto) : null,
    });
    return res.sent ? { ok: true } : { ok: false, error: 'No se pudo enviar el correo. Intenta de nuevo en un momento.' };
}

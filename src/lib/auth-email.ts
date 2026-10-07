// src/lib/auth-email.ts — plantillas de correo del carril de autenticación
// (verificación de correo, reset de contraseña, alerta de nuevo dispositivo,
// invitación de equipo). Mismo lienzo minimalista que notifyQuoteSent en
// src/lib/email.ts, separado en su propio archivo porque estos correos no
// dependen de ninguna cotización/org de negocio — solo de `users`.
import { sendEmail, siteOrigin, type SendResult } from './email';
import { currentLocale } from './context';
import { t } from '../i18n/app';
import { escapeHtml } from './escape';
import { sql, withOrgTx } from './db';

const FROM_NAME = 'Cord Seguridad';

function shell(opts: { titulo: string; cuerpo: string; ctaLabel: string; ctaHref: string; footer?: string }): string {
    return `<div style="background-color:#ffffff;padding:40px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
        <div style="max-width:540px;margin:0 auto;">
            <div style="margin-bottom:32px;">
                <img src="https://cordhq.app/imgs/logo-cord-navy.png" width="90" height="auto" alt="Cord" style="display:block;">
            </div>
            <h1 style="font-size:20px;font-weight:600;color:#111827;margin:0 0 16px;letter-spacing:-0.02em;">${opts.titulo}</h1>
            <p style="font-size:15px;line-height:1.6;color:#374151;margin:0 0 32px;">${opts.cuerpo}</p>
            <div style="margin:0 0 32px;">
                <a href="${opts.ctaHref}" style="display:inline-block;background-color:#0a192f;color:#ffffff;text-decoration:none;font-weight:500;font-size:15px;padding:12px 24px;border-radius:8px;">${opts.ctaLabel}</a>
            </div>
            <p style="font-size:13px;color:#9CA3AF;line-height:1.5;word-break:break-all;">${opts.ctaHref}</p>
            ${opts.footer ? `<div style="margin-top:40px;padding-top:24px;border-top:1px solid #E5E7EB;"><p style="font-size:13px;color:#6B7280;line-height:1.5;margin:0;">${opts.footer}</p></div>` : ''}
        </div>
    </div>`;
}

export async function sendVerificationEmail(to: string, token: string): Promise<SendResult> {
    const L = currentLocale();
    const link = `${siteOrigin()}/verify-email?token=${encodeURIComponent(token)}`;
    return sendEmail({
        to,
        subject: t(L, 'authEmail.verify.asunto'),
        fromName: FROM_NAME,
        html: shell({
            titulo: t(L, 'authEmail.verify.titulo'),
            cuerpo: t(L, 'authEmail.verify.cuerpo'),
            ctaLabel: t(L, 'authEmail.verify.boton'),
            ctaHref: link,
            footer: t(L, 'authEmail.verify.expira'),
        }),
    });
}

export async function sendPasswordResetEmail(to: string, token: string): Promise<SendResult> {
    const L = currentLocale();
    const link = `${siteOrigin()}/reset-password?token=${encodeURIComponent(token)}`;
    return sendEmail({
        to,
        subject: t(L, 'authEmail.reset.asunto'),
        fromName: FROM_NAME,
        html: shell({
            titulo: t(L, 'authEmail.reset.titulo'),
            cuerpo: t(L, 'authEmail.reset.cuerpo'),
            ctaLabel: t(L, 'authEmail.reset.boton'),
            ctaHref: link,
            footer: t(L, 'authEmail.reset.expira'),
        }),
    });
}

/** Alerta best-effort de "nuevo dispositivo" — nunca bloquea el login si falla. */
export async function sendNewDeviceAlertEmail(to: string): Promise<SendResult> {
    const L = currentLocale();
    const link = `${siteOrigin()}/app/ajustes/cuenta`;
    return sendEmail({
        to,
        subject: t(L, 'authEmail.alert.asunto'),
        fromName: FROM_NAME,
        html: shell({
            titulo: t(L, 'authEmail.alert.titulo'),
            cuerpo: `${t(L, 'authEmail.alert.cuerpo')} ${t(L, 'authEmail.alert.detalle')}`,
            ctaLabel: t(L, 'authEmail.alert.boton'),
            ctaHref: link,
        }),
    });
}

/** Alerta de cada acceso exitoso al panel privilegiado de plataforma. */
export async function sendOpsLoginAlertEmail(to: string, ip: string, userAgent: string): Promise<SendResult> {
    const detail = `Se inició una sesión en Cord Ops. IP: ${escapeHtml(ip)}. Dispositivo: ${escapeHtml(userAgent)}. Si no fuiste tú, cambia tu contraseña, revoca tus sesiones y contacta al equipo de inmediato.`;
    return sendEmail({
        to,
        subject: 'Nuevo acceso a Cord Ops',
        fromName: FROM_NAME,
        html: shell({
            titulo: 'Nuevo acceso administrativo',
            cuerpo: detail,
            ctaLabel: 'Abrir Cord Ops',
            ctaHref: 'https://ops.cordhq.app/ops',
        }),
    });
}

export async function sendTeamInviteEmail(to: string, orgName: string, token: string): Promise<SendResult> {
    const L = currentLocale();
    const link = `${siteOrigin()}/unirse/${encodeURIComponent(token)}`;
    const orgEsc = escapeHtml(orgName);
    return sendEmail({
        to,
        subject: t(L, 'authEmail.invite.asunto').replace('{org}', orgEsc),
        fromName: FROM_NAME,
        html: shell({
            titulo: t(L, 'authEmail.invite.titulo'),
            cuerpo: t(L, 'authEmail.invite.cuerpo').replace('{org}', orgEsc),
            ctaLabel: t(L, 'authEmail.invite.boton'),
            ctaHref: link,
            footer: t(L, 'authEmail.invite.expira'),
        }),
    });
}

// ── A dónde llega el dinero ──────────────────────────────────────────────────

export type CambioDestinoDinero =
    | 'mp_conectado' | 'mp_cambiado' | 'mp_desconectado'
    | 'banco' | 'cobros_desconectados' | 'cuenta_creada' | 'permiso';

const CAMBIO_DESTINO_KEY = {
    mp_conectado: 'authEmail.dinero.mp_conectado',
    mp_cambiado: 'authEmail.dinero.mp_cambiado',
    mp_desconectado: 'authEmail.dinero.mp_desconectado',
    banco: 'authEmail.dinero.banco',
    cobros_desconectados: 'authEmail.dinero.cobros_desconectados',
    cuenta_creada: 'authEmail.dinero.cuenta_creada',
    permiso: 'authEmail.dinero.permiso',
} as const;

/**
 * Avisa a los DUEÑOS de la organización que cambió a dónde llega su dinero:
 * la cuenta de depósito, la cuenta de Mercado Pago, la cuenta de cobros, o
 * quién puede cambiarlas.
 *
 * Va al correo de la CUENTA de cada dueño, nunca a `orgs.email_contacto`: ese
 * campo lo edita cualquiera con permiso de ajustes, y quien desvía el dinero
 * empezaría por desviar el aviso. Best-effort: nunca bloquea la operación,
 * pero tampoco la sustituye — la operación ya exigió permiso y reautenticación.
 */
export async function notifyMoneyDestinationChange(
    orgId: string,
    cambio: CambioDestinoDinero,
    opts: { detalle?: string | null; actorUserId?: string | null; ip?: string | null } = {},
): Promise<void> {
    try {
        const [[org], owners, [actor]] = await withOrgTx(orgId,
            sql`select nombre, idioma from orgs where id = ${orgId}`,
            sql`select distinct lower(u.email) as email
                  from org_members m join users u on u.id = m.user_id
                 where m.org_id = ${orgId} and m.rol = 'owner' and m.estado = 'activo'
                   and u.email is not null and u.suspended_at is null
                union
                select lower(u.email) from orgs o join users u on u.id = o.owner_id
                 where o.id = ${orgId} and u.email is not null and u.suspended_at is null`,
            sql`select email from users where id = ${opts.actorUserId ?? null}::uuid`);
        if (!org || !owners.length) return;
        const L = org.idioma === 'en' ? 'en' : 'es';
        const nombre = escapeHtml(String(org.nombre || 'Cord'));
        const lineas = [
            `${t(L, CAMBIO_DESTINO_KEY[cambio])} <b>${nombre}</b>.`,
            opts.detalle ? `${t(L, 'authEmail.dinero.detalle')} ${escapeHtml(opts.detalle)}` : '',
            actor?.email ? `${t(L, 'authEmail.dinero.quien')} ${escapeHtml(String(actor.email))}${opts.ip ? ` (IP ${escapeHtml(opts.ip)})` : ''}` : '',
            new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC',
        ].filter(Boolean);
        const html = shell({
            titulo: t(L, 'authEmail.dinero.titulo'),
            cuerpo: lineas.join('<br>'),
            ctaLabel: t(L, 'authEmail.dinero.boton'),
            ctaHref: `${siteOrigin()}/app/ajustes/cobros`,
            footer: t(L, 'authEmail.dinero.no_fui_yo'),
        });
        for (const o of owners) {
            await sendEmail({
                to: String(o.email), subject: t(L, 'authEmail.dinero.asunto'), fromName: FROM_NAME,
                html, orgId, operation: 'money_destination_alert',
            });
        }
    } catch { /* el aviso nunca tumba la operación que ya se autorizó */ }
}

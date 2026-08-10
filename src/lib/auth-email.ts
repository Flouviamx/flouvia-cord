// src/lib/auth-email.ts — plantillas de correo del carril de autenticación
// (verificación de correo, reset de contraseña, alerta de nuevo dispositivo,
// invitación de equipo). Mismo lienzo minimalista que notifyQuoteSent en
// src/lib/email.ts, separado en su propio archivo porque estos correos no
// dependen de ninguna cotización/org de negocio — solo de `users`.
import { sendEmail, siteOrigin, type SendResult } from './email';
import { currentLocale } from './context';
import { t } from '../i18n/app';
import { escapeHtml } from './escape';

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

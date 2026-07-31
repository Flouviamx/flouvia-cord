import type { APIRoute } from 'astro';
import { sql } from '../../../../lib/db';
import { sendEmail } from '../../../../lib/email';
import { randomBytes } from 'node:crypto';

export const prerender = false;

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const { email } = await request.json();
    if (!email || typeof email !== 'string') {
      return new Response(JSON.stringify({ error: 'invalid_email' }), { status: 400 });
    }

    const emailLower = email.toLowerCase().trim();

    // 1. Buscar usuario
    const rows = await sql`select id from users where email = ${emailLower} limit 1`;
    if (rows.length === 0) {
      // Por seguridad, retornamos 200 aunque el correo no exista
      // para evitar enumeración de correos.
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }

    const userId = rows[0].id as string;

    // 2. Generar token criptográfico seguro
    const token = base64url(randomBytes(32));

    // Expiración: 15 minutos desde ahora
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    // Guardar en la DB
    await sql`
      insert into password_reset_tokens (id, user_id, expires_at)
      values (${token}, ${userId}, ${expiresAt})
    `;

    // 3. Enviar el correo usando Resend (sendEmail)
    const origin = new URL(request.url).origin;
    const resetLink = `${origin}/reset-password?token=${token}`;
    
    const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
        <h2 style="color: #0a192f;">Restablecer contraseña</h2>
        <p>Has solicitado restablecer tu contraseña en Cord. Haz clic en el botón de abajo para crear una nueva:</p>
        <div style="margin: 30px 0;">
          <a href="${resetLink}" style="background-color: #0a192f; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500;">Restablecer mi contraseña</a>
        </div>
        <p style="font-size: 0.9em; color: #666;">Si no solicitaste este cambio, puedes ignorar este correo.</p>
        <p style="font-size: 0.9em; color: #666;">Este enlace expirará en 15 minutos.</p>
      </div>
    `;

    const sendRes = await sendEmail({
      to: emailLower,
      subject: 'Restablecer contraseña - Cord',
      html,
      fromName: 'Cord Seguridad',
    });

    if (!sendRes.sent) {
      console.warn('[reset/request] Resend no envió el correo:', sendRes.error || sendRes.skipped);
    }

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (error) {
    console.error('[reset/request]', error);
    return new Response(JSON.stringify({ error: 'Ocurrió un error inesperado' }), { status: 500 });
  }
};

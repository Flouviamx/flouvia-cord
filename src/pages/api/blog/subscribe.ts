// POST /api/blog/subscribe — registra un suscriptor del blog.
// Guarda el email en Neon (tabla blog_subscribers) y manda un correo de
// bienvenida vía Resend. Público (sin sesión) → rate limit por IP.
// Patrón idéntico a /api/contacto/ventas.ts.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql } from '../../../lib/db';
import { sendEmail } from '../../../lib/email';
import { rateLimit, tooMany } from '../../../lib/ratelimit';

const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

export const POST: APIRoute = async ({ request }) => {
    // Rate limit por IP (público, sin sesión).
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'anon';
    const rl = await rateLimit(`blog-sub:${ip}`, 5, 60);
    if (!rl.ok) return tooMany(rl.retryAfter);

    let body: Record<string, unknown> = {};
    try { body = await request.json(); } catch {
        return json({ error: 'Cuerpo inválido' }, 400);
    }

    const email = String(body.email ?? '').trim().toLowerCase().slice(0, 160);
    if (!isEmail(email)) return json({ error: 'Correo inválido' }, 400);

    // Honeypot anti-spam (campo invisible "website").
    if (body.website) return json({ ok: true });

    // Insertar en blog_subscribers (ON CONFLICT = ya existe → no error).
    try {
        await sql`
            insert into blog_subscribers (email)
            values (${email})
            on conflict (email) do nothing`;
    } catch (err: any) {
        // Si la tabla no existe aún (pre-migración), respondemos ok igual —
        // no rompemos la UI. El admin puede correr db:migrate después.
        if (err?.code === '42P01') {
            console.warn('[blog/subscribe] Tabla blog_subscribers no existe — corre npm run db:migrate');
            return json({ ok: true, warning: 'tabla pendiente de migración' });
        }
        throw err;
    }

    // Correo de bienvenida (best-effort, gated por RESEND_API_KEY).
    await sendEmail({
        to: email,
        subject: '¡Bienvenido al Blog de Cord!',
        html: `<div style="background:#fff;padding:48px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<div style="max-width:520px;margin:0 auto;">

  <div style="margin-bottom:36px;">
    <img src="https://cordhq.app/imgs/logo-cord-navy.png" width="86" height="auto" alt="Cord" style="display:block;" />
  </div>

  <p style="font-size:16px;color:#111827;font-weight:500;margin:0 0 16px;">¡Hola!</p>
  <p style="font-size:15px;line-height:1.7;color:#374151;margin:0 0 16px;">Gracias por suscribirte al Blog de Cord. A partir de ahora recibirás artículos, guías y estrategias sobre <strong>ventas B2B, facturación y cómo acelerar tu flujo de ingresos</strong>.</p>
  <p style="font-size:15px;line-height:1.7;color:#374151;margin:0 0 40px;">No enviamos spam — solo contenido que vale la pena leer.</p>

  <div style="margin:40px 0;">
    <a href="https://cordhq.app/blog" style="display:inline-block;background-color:#0a192f;color:#fff;text-decoration:none;font-weight:500;font-size:15px;padding:12px 24px;border-radius:8px;">Visitar el Blog</a>
  </div>

  <div style="padding-top:24px;border-top:1px solid #F3F4F6;">
    <p style="font-size:12px;color:#9CA3AF;margin:0;line-height:1.5;">Equipo Cord · cordhq.app</p>
  </div>

</div>
</div>`,
        fromName: 'Cord Blog',
    });

    return json({ ok: true });
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

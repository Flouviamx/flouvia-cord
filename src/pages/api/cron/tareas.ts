// GET /api/cron/tareas — el correo de la mañana con las tareas de cada responsable.
//
// Antes el widget se llamaba "Tareas y recordatorios" y Cord no mandaba un solo
// recordatorio: una tarea solo se marcaba "vencida" en el Inicio de quien lo
// abriera (regla 15). Ahora, a partir de las 8:00 HORA DEL NEGOCIO, cada
// responsable recibe UN correo con lo que vence hoy y lo que ya venció.
//
// Lo dispara cada hora `.github/workflows/cord-crons.yml` (el plan de Vercel
// solo admite crons diarios, y una hora UTC fija no es "la mañana" en todos los
// países). Por eso decide aquí si en ESA organización ya es hora.
//
// Dedup: `tareas.recordada_el` guarda el día civil del último correo que
// incluyó la tarea. Se reclama ANTES de mandar (update … returning) y se
// libera si el envío falla — al revés, un fallo entre el envío y la escritura
// repetiría el correo (mismo criterio que la regla 25). Una corrida que llega
// dos veces el mismo día no encuentra nada que reclamar.
//
// Destinatario: el responsable; sin responsable, quien la creó; si ninguno es
// miembro activo, el dueño de la cuenta. Opt-out por organización en
// Ajustes › Notificaciones (`notif_prefs.task_due.email`, encendido si nunca
// se guardó).
export const prerender = false;

import type { APIRoute } from 'astro';
import { assertCronAuth } from '../../../lib/cron-auth';
import { sql, withOrgTx, withSystemTx } from '../../../lib/db';
import { reqContext } from '../../../lib/context';
import { sendEmail, siteOrigin } from '../../../lib/email';
import { isReminderTime, localClock, renderTaskDigest, type DigestTask } from '../../../lib/task-reminders';

export const GET: APIRoute = async ({ request }) => {
    const authError = assertCronAuth(request);
    if (authError) return authError;

    return reqContext.run({ userId: null, cronScope: true }, async () => {
        // Barrido cross-org: solo QUÉ organizaciones tienen algo que recordar.
        // `current_date + 1` cubre las zonas al este de UTC, donde ya es mañana.
        const [orgs] = await withSystemTx(sql`
            select o.id, o.nombre, o.zona_horaria, coalesce(o.idioma, 'es-MX') as idioma, o.owner_id
            from orgs o
            where o.sandbox_of is null
              and coalesce(o.is_demo, false) = false
              and o.owner_id::text <> '00000000-0000-0000-0000-000000000000'
              and coalesce((o.notif_prefs -> 'task_due' ->> 'email')::boolean, true)
              and exists (
                select 1 from tareas t
                 where t.org_id = o.id and t.done = false
                   and t.due_date <= current_date + 1
                   and (t.recordada_el is null or t.recordada_el < current_date + 1)
              )`);

        let correos = 0, tareas = 0, fallidos = 0, fueraDeHora = 0;
        for (const org of orgs) {
            const zona = org.zona_horaria as string;
            if (!isReminderTime(zona)) { fueraDeHora++; continue; }
            const r = await remindOrg({
                id: org.id as string,
                nombre: (org.nombre as string) || '',
                zona,
                en: String(org.idioma).toLowerCase().startsWith('en'),
                ownerId: (org.owner_id as string) || null,
            }).catch(() => ({ correos: 0, tareas: 0, fallidos: 1 }));
            correos += r.correos; tareas += r.tareas; fallidos += r.fallidos;
        }
        return json({ organizaciones: orgs.length, fueraDeHora, correos, tareas, fallidos });
    });
};

async function remindOrg(org: { id: string; nombre: string; zona: string; en: boolean; ownerId: string | null }) {
    const today = localClock(org.zona).day;
    // Reclamo atómico: lo que este UPDATE devuelve es lo que este correo cubre.
    const [claimed] = await withOrgTx(org.id, sql`
        with prev as (
            select id, recordada_el from tareas
             where org_id = ${org.id} and done = false and due_date <= ${today}::date
               and (recordada_el is null or recordada_el < ${today}::date)
             for update skip locked
        )
        update tareas t set recordada_el = ${today}::date
          from prev
         where t.id = prev.id and t.org_id = ${org.id}
        returning t.id, t.titulo, to_char(t.due_date, 'YYYY-MM-DD') as due, t.prioridad,
                  t.asignado_a, t.creado_por, prev.recordada_el as previa,
                  (select c.folio from cotizaciones c where c.id = t.cotizacion_id and c.org_id = t.org_id) as folio,
                  (select d.invoice_number from documentos_fiscales d where d.id = t.documento_id and d.org_id = t.org_id) as factura`);
    if (!claimed.length) return { correos: 0, tareas: 0, fallidos: 0 };

    const [members] = await withOrgTx(org.id, sql`
        select user_id, email, coalesce(nullif(nombre, ''), email) as nombre
        from org_members
        where org_id = ${org.id} and estado = 'activo' and user_id is not null and coalesce(email, '') <> ''`);
    const byId = new Map(members.map((m) => [m.user_id as string, { email: m.email as string, nombre: m.nombre as string }]));
    const owner = org.ownerId ? byId.get(org.ownerId) : undefined;

    const porDestino = new Map<string, { nombre: string; tasks: DigestTask[]; ids: { id: string; previa: string | null }[] }>();
    const huerfanas: { id: string; previa: string | null }[] = [];
    for (const t of claimed) {
        const dest = byId.get(t.asignado_a as string) ?? byId.get(t.creado_por as string) ?? owner;
        const item = { id: t.id as string, previa: (t.previa as string | null) ?? null };
        if (!dest) { huerfanas.push(item); continue; }
        const g = porDestino.get(dest.email) ?? { nombre: dest.nombre, tasks: [], ids: [] };
        g.tasks.push({
            titulo: t.titulo as string,
            due: t.due as string,
            prioridad: t.prioridad === 'alta' ? 'alta' : 'normal',
            ref: (t.folio as string) || (t.factura as string) || null,
        });
        g.ids.push(item);
        porDestino.set(dest.email, g);
    }

    let correos = 0, fallidos = 0;
    // Las huérfanas (nadie activo a quien avisar) se quedan marcadas: liberarlas
    // las haría reclamarse y descartarse en cada corrida del día.
    const liberar: { id: string; previa: string | null }[] = [];
    for (const [email, g] of porDestino) {
        const { subject, html } = renderTaskDigest({
            en: org.en, locale: org.en ? 'en-US' : 'es-MX', nombre: g.nombre, orgNombre: org.nombre,
            today, link: `${siteOrigin()}/app/tareas?scope=mias`, tasks: g.tasks,
        });
        const res = await sendEmail({ orgId: org.id, operation: 'task_reminder', to: email, subject, html })
            .catch(() => ({ sent: false }));
        if (res.sent) correos++;
        else { fallidos++; liberar.push(...g.ids); }
    }
    // Lo que no se pudo mandar vuelve a su marca anterior: la próxima corrida lo reintenta.
    for (const it of liberar) {
        await withOrgTx(org.id, sql`
            update tareas set recordada_el = ${it.previa}::date
             where id = ${it.id} and org_id = ${org.id} and recordada_el = ${today}::date`);
    }
    return { correos, tareas: claimed.length - liberar.length - huerfanas.length, fallidos };
}

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

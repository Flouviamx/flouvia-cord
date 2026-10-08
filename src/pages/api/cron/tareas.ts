// GET /api/cron/tareas — el correo de la mañana con las tareas de cada responsable.
//
// Antes el widget se llamaba "Tareas y recordatorios" y Cord no mandaba un solo
// recordatorio: una tarea solo se marcaba "vencida" en el Inicio de quien lo
// abriera (regla 15). Ahora, a partir de las 8:00 HORA DEL NEGOCIO, cada
// responsable recibe a lo sumo UN correo al día con lo que vence hoy y lo que
// ya venció.
//
// Lo dispara cada hora `.github/workflows/cord-crons.yml` (el plan de Vercel
// solo admite crons diarios, y una hora UTC fija no es "la mañana" en todos los
// países). Por eso decide aquí si en ESA organización ya es hora.
//
// Dos dedups, las dos por día civil del negocio:
//   · `tareas.recordada_el` — el día del último correo que incluyó la tarea.
//   · `org_members.tareas_avisadas_el` — el día del último correo a ESA persona.
// Las dos se reclaman ANTES de mandar (update … returning) y se liberan si el
// envío falla — al revés, un fallo entre el envío y la escritura repetiría el
// correo (mismo criterio que la regla 25). Una corrida que llega dos veces el
// mismo día no encuentra nada que reclamar.
//
// Un correo por persona y día, no uno por corrida: una tarea que entra a "hoy"
// DESPUÉS del correo de la mañana (se creó, se reprogramó o se reasignó a las
// 11:00) no dispara un segundo correo — se libera y sale en el de mañana, ya
// como "Venció ayer". Quien la capturó a media mañana ya sabe que existe; un
// segundo aviso el mismo día convierte el resumen en ruido. Si esa persona
// todavía no recibió el de hoy (no tenía nada en la mañana), sí le llega.
//
// Destinatario: el responsable; sin responsable, quien la creó; si ninguno es
// miembro activo, el dueño de la cuenta. Opt-out por organización en
// Ajustes › Notificaciones (`notif_prefs.task_due.email`, encendido si nunca
// se guardó); el pie del correo sólo invita a apagarlo a quien tiene el
// permiso de Ajustes.
export const prerender = false;

import type { APIRoute } from 'astro';
import { assertCronAuth } from '../../../lib/cron-auth';
import { sql, withOrgTx, withSystemTx } from '../../../lib/db';
import { reqContext } from '../../../lib/context';
import { sendEmail, siteOrigin } from '../../../lib/email';
import { digestLocale, isReminderTime, localClock, renderTaskDigest, type DigestTask } from '../../../lib/task-reminders';
import { getCountryProfile } from '../../../lib/countries';
import { memberCan, type PermMap } from '../../../lib/permissions';

export const GET: APIRoute = async ({ request }) => {
    const authError = assertCronAuth(request);
    if (authError) return authError;

    return reqContext.run({ userId: null, cronScope: true }, async () => {
        // Barrido cross-org: solo QUÉ organizaciones tienen algo que recordar.
        // `current_date + 1` cubre las zonas al este de UTC, donde ya es mañana.
        const [orgs] = await withSystemTx(sql`
            select o.id, o.nombre, o.zona_horaria, coalesce(o.idioma, 'es-MX') as idioma, o.owner_id, o.country_code
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

        let correos = 0, tareas = 0, fallidos = 0, fueraDeHora = 0, pospuestas = 0;
        for (const org of orgs) {
            const zona = org.zona_horaria as string;
            if (!isReminderTime(zona)) { fueraDeHora++; continue; }
            const en = String(org.idioma).toLowerCase().startsWith('en');
            const r = await remindOrg({
                id: org.id as string,
                nombre: (org.nombre as string) || '',
                zona,
                en,
                locale: digestLocale(en ? 'en' : 'es', getCountryProfile(String(org.country_code || 'MX')).locale),
                ownerId: (org.owner_id as string) || null,
            }).catch(() => ({ correos: 0, tareas: 0, fallidos: 1, pospuestas: 0 }));
            correos += r.correos; tareas += r.tareas; fallidos += r.fallidos; pospuestas += r.pospuestas;
        }
        return json({ organizaciones: orgs.length, fueraDeHora, correos, tareas, fallidos, pospuestas });
    });
};

type Claim = { id: string; previa: string | null };

async function remindOrg(org: { id: string; nombre: string; zona: string; en: boolean; locale: string; ownerId: string | null }) {
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
    if (!claimed.length) return { correos: 0, tareas: 0, fallidos: 0, pospuestas: 0 };

    const [members] = await withOrgTx(org.id, sql`
        select user_id, email, coalesce(nullif(nombre, ''), email) as nombre, rol, permisos
        from org_members
        where org_id = ${org.id} and estado = 'activo' and user_id is not null and coalesce(email, '') <> ''`);
    type Dest = { userId: string; email: string; nombre: string; puedeApagar: boolean };
    const byId = new Map<string, Dest>(members.map((m) => [m.user_id as string, {
        userId: m.user_id as string,
        email: m.email as string,
        nombre: m.nombre as string,
        // El apagado vive en Ajustes › Notificaciones y es de toda la organización.
        puedeApagar: memberCan({
            rol: String(m.rol || ''), permisos: (m.permisos as PermMap) ?? {}, esOwner: m.user_id === org.ownerId,
        }, 'ajustes'),
    }]));
    const owner = org.ownerId ? byId.get(org.ownerId) : undefined;

    const porDestino = new Map<string, { dest: Dest; tasks: DigestTask[]; ids: Claim[] }>();
    const huerfanas: Claim[] = [];
    for (const t of claimed) {
        const dest = byId.get(t.asignado_a as string) ?? byId.get(t.creado_por as string) ?? owner;
        const item = { id: t.id as string, previa: (t.previa as string | null) ?? null };
        if (!dest) { huerfanas.push(item); continue; }
        const g = porDestino.get(dest.userId) ?? { dest, tasks: [], ids: [] };
        g.tasks.push({
            titulo: t.titulo as string,
            due: t.due as string,
            prioridad: t.prioridad === 'alta' ? 'alta' : 'normal',
            ref: (t.folio as string) || (t.factura as string) || null,
        });
        g.ids.push(item);
        porDestino.set(dest.userId, g);
    }

    let correos = 0, fallidos = 0, pospuestas = 0;
    // Las huérfanas (nadie activo a quien avisar) se quedan marcadas: liberarlas
    // las haría reclamarse y descartarse en cada corrida del día.
    const liberar: Claim[] = [];
    for (const g of porDestino.values()) {
        // Un correo por persona y día: si ya recibió el de hoy, lo nuevo espera a mañana.
        const [[persona]] = await withOrgTx(org.id, sql`
            with prev as (
                select user_id, tareas_avisadas_el from org_members
                 where org_id = ${org.id} and user_id = ${g.dest.userId}
                   and (tareas_avisadas_el is null or tareas_avisadas_el < ${today}::date)
                 for update skip locked
            )
            update org_members m set tareas_avisadas_el = ${today}::date
              from prev
             where m.org_id = ${org.id} and m.user_id = prev.user_id
            returning prev.tareas_avisadas_el as previa`);
        if (!persona) { pospuestas += g.ids.length; liberar.push(...g.ids); continue; }

        const { subject, html } = renderTaskDigest({
            en: org.en, locale: org.locale, nombre: g.dest.nombre, orgNombre: org.nombre,
            puedeApagar: g.dest.puedeApagar,
            today, link: `${siteOrigin()}/app/tareas?scope=mias`, tasks: g.tasks,
        });
        const res = await sendEmail({ orgId: org.id, operation: 'task_reminder', to: g.dest.email, subject, html })
            .catch(() => ({ sent: false }));
        if (res.sent) { correos++; continue; }
        fallidos++;
        liberar.push(...g.ids);
        await withOrgTx(org.id, sql`
            update org_members set tareas_avisadas_el = ${(persona.previa as string | null) ?? null}::date
             where org_id = ${org.id} and user_id = ${g.dest.userId} and tareas_avisadas_el = ${today}::date`);
    }
    // Lo que no salió vuelve a su marca anterior: la próxima corrida lo reintenta
    // (o, si la persona ya recibió el de hoy, lo incluye el de mañana).
    for (const it of liberar) {
        await withOrgTx(org.id, sql`
            update tareas set recordada_el = ${it.previa}::date
             where id = ${it.id} and org_id = ${org.id} and recordada_el = ${today}::date`);
    }
    return { correos, tareas: claimed.length - liberar.length - huerfanas.length, fallidos, pospuestas };
}

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

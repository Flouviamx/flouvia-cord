// Recordatorio de tareas por correo — el correo de la mañana a cada responsable
// con lo que vence hoy y lo que ya venció. Puro: sin base de datos ni contexto
// de request, porque lo llama un cron que barre organizaciones en distintos
// idiomas y zonas (cada una pasa el suyo).
//
// El cron vive en src/pages/api/cron/tareas.ts y lo dispara cada hora el
// workflow de GitHub `cord-crons.yml`. "Hora de mandar" es la hora LOCAL del
// negocio (REMINDER_HOUR), no una hora UTC fija: a las 13:00 UTC Madrid ya
// comió y Tokio está dormido.

import { escapeEmail } from './brand-email';
import { dayDiff } from './tasks';

export const REMINDER_HOUR = 8;

export interface DigestTask {
    titulo: string;
    due: string;
    prioridad: 'normal' | 'alta';
    ref?: string | null;
}

/** Hora (0–23) y día civil en una zona IANA; una zona inválida cae a UTC. */
export function localClock(zone: string | null | undefined, now = new Date()): { hour: number; day: string } {
    const read = (tz: string) => {
        const parts = new Intl.DateTimeFormat('en-CA', {
            timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
        }).formatToParts(now);
        const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
        return { hour: Number(get('hour')) % 24, day: `${get('year')}-${get('month')}-${get('day')}` };
    };
    try { return read(zone || 'UTC'); } catch { return read('UTC'); }
}

/** A partir de la hora del recordatorio, no exactamente en ella: una corrida retrasada o perdida no se salta el día. */
export function isReminderTime(zone: string | null | undefined, now = new Date()): boolean {
    return localClock(zone, now).hour >= REMINDER_HOUR;
}

function dueText(due: string, today: string, en: boolean, locale: string): string {
    const diff = dayDiff(today, due);
    if (diff === 0) return en ? 'Due today' : 'Vence hoy';
    if (diff === -1) return en ? 'Overdue since yesterday' : 'Venció ayer';
    if (diff < 0) return en ? `Overdue by ${-diff} days` : `Venció hace ${-diff} días`;
    const [y, m, d] = due.split('-').map(Number);
    return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
}

function subjectFor(vencidas: number, hoy: number, en: boolean, orgNombre: string): string {
    const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;
    let s: string;
    if (en) {
        if (vencidas && hoy) s = `You have ${n(vencidas, 'overdue task', 'overdue tasks')} and ${hoy} due today`;
        else if (vencidas) s = `You have ${n(vencidas, 'overdue task', 'overdue tasks')}`;
        else s = `You have ${n(hoy, 'task', 'tasks')} due today`;
    } else {
        if (vencidas && hoy) s = `Tienes ${n(vencidas, 'tarea vencida', 'tareas vencidas')} y ${hoy} para hoy`;
        else if (vencidas) s = `Tienes ${n(vencidas, 'tarea vencida', 'tareas vencidas')}`;
        else s = `Tienes ${n(hoy, 'tarea', 'tareas')} para hoy`;
    }
    return orgNombre ? `${s} · ${orgNombre}` : s;
}

export function renderTaskDigest(input: {
    en: boolean;
    /** Locale de formato (`es-MX`, `en-GB`…). */
    locale: string;
    nombre: string;
    orgNombre: string;
    today: string;
    link: string;
    tasks: DigestTask[];
}): { subject: string; html: string } {
    const { en, locale, nombre, orgNombre, today, link } = input;
    // Lo vencido primero, de lo más viejo a lo más reciente; lo urgente arriba dentro del día.
    const tasks = [...input.tasks].sort((a, b) =>
        a.due.localeCompare(b.due) || (a.prioridad === b.prioridad ? 0 : a.prioridad === 'alta' ? -1 : 1));
    const vencidas = tasks.filter((t) => t.due < today).length;
    const hoy = tasks.length - vencidas;
    const subject = subjectFor(vencidas, hoy, en, orgNombre);
    const esc = escapeEmail;
    const saludo = nombre ? (en ? `Good morning, ${esc(nombre.split(/\s+/)[0])}.` : `Buenos días, ${esc(nombre.split(/\s+/)[0])}.`) : (en ? 'Good morning.' : 'Buenos días.');
    const intro = en ? 'This is what needs your attention today:' : 'Esto es lo que necesita tu atención hoy:';
    const alta = en ? 'High priority' : 'Prioridad alta';

    const rows = tasks.map((t) => {
        const overdue = t.due < today;
        const meta = [dueText(t.due, today, en, locale), t.ref ? esc(t.ref) : ''].filter(Boolean).join(' · ');
        return `<tr><td style="padding:12px 0;border-bottom:1px solid #E5E7EB;">
            <div style="font-size:15px;line-height:1.4;color:#111827;font-weight:500;">${t.prioridad === 'alta' ? `<span style="display:inline-block;font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#DC2626;background:#FEF2F2;border-radius:4px;padding:1px 5px;margin-right:6px;vertical-align:1px;">${alta}</span>` : ''}${esc(t.titulo)}</div>
            <div style="font-size:13px;color:${overdue ? '#DC2626' : '#6B7280'};margin-top:3px;${overdue ? 'font-weight:600;' : ''}">${meta}</div>
        </td></tr>`;
    }).join('');

    const html = `<div style="background-color:#ffffff;padding:40px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
        <div style="max-width:540px;margin:0 auto;">
            <div style="margin-bottom:32px;">
                <img src="https://cordhq.app/imgs/logo-cord-navy.png" width="90" height="auto" alt="Cord" style="display:block;">
            </div>
            <p style="font-size:16px;line-height:1.6;color:#111827;margin:0 0 4px;font-weight:600;">${saludo}</p>
            <p style="font-size:16px;line-height:1.6;color:#374151;margin:0 0 20px;">${intro}</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 32px;">${rows}</table>
            <div style="margin:0 0 40px;">
                <a href="${esc(link)}" style="display:inline-block;background-color:#0a192f;color:#ffffff;text-decoration:none;font-weight:500;font-size:15px;padding:12px 24px;border-radius:8px;">${en ? 'Open my tasks' : 'Abrir mis tareas'}</a>
            </div>
            <div style="margin-top:16px;padding-top:24px;border-top:1px solid #E5E7EB;">
                <p style="font-size:12px;color:#9CA3AF;margin:0;line-height:1.5;">${esc(orgNombre)} · ${en
                    ? 'You get this email because these tasks are assigned to you. Turn it off in Settings › Notifications.'
                    : 'Recibes este correo porque estas tareas están a tu cargo. Puedes apagarlo en Ajustes › Notificaciones.'}</p>
            </div>
        </div>
    </div>`;
    return { subject, html };
}

import { describe, it, expect } from 'vitest';
import { addDays, dayDiff, dueShortcut, groupTasks, isIsoDay, nextMonday, taskBucket } from '../src/lib/tasks';
import { isReminderTime, localClock, renderTaskDigest } from '../src/lib/task-reminders';

// Reglas puras de fecha de las tareas: todo en DÍA CIVIL ISO, nunca `new Date(iso)`.

describe('días civiles', () => {
    it('valida fechas reales, no solo el formato', () => {
        expect(isIsoDay('2026-10-08')).toBe(true);
        expect(isIsoDay('2026-02-29')).toBe(false);
        expect(isIsoDay('2028-02-29')).toBe(true);
        expect(isIsoDay('2026-13-01')).toBe(false);
        expect(isIsoDay('8/10/2026')).toBe(false);
        expect(isIsoDay(null)).toBe(false);
    });

    it('suma días cruzando mes y año', () => {
        expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
        expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
        expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
        expect(dayDiff('2026-10-08', '2026-10-01')).toBe(-7);
    });

    it('el próximo lunes es estricto: desde un lunes salta a la semana siguiente', () => {
        expect(nextMonday('2026-10-08')).toBe('2026-10-12'); // jueves
        expect(nextMonday('2026-10-12')).toBe('2026-10-19'); // lunes
        expect(nextMonday('2026-10-11')).toBe('2026-10-12'); // domingo
    });

    it('los atajos salen del día del negocio que se les pasa', () => {
        expect(dueShortcut('hoy', '2026-10-08')).toBe('2026-10-08');
        expect(dueShortcut('manana', '2026-10-08')).toBe('2026-10-09');
        expect(dueShortcut('lunes', '2026-10-08')).toBe('2026-10-12');
        expect(dueShortcut('semana', '2026-10-08')).toBe('2026-10-15');
    });
});

describe('agrupación por urgencia', () => {
    const today = '2026-10-08';
    it('clasifica cada fecha en su grupo', () => {
        expect(taskBucket('2026-10-07', today)).toBe('vencidas');
        expect(taskBucket('2026-10-08', today)).toBe('hoy');
        expect(taskBucket('2026-10-09', today)).toBe('manana');
        expect(taskBucket('2026-10-15', today)).toBe('semana');
        expect(taskBucket('2026-10-16', today)).toBe('despues');
        expect(taskBucket(null, today)).toBe('sin_fecha');
        expect(taskBucket('basura', today)).toBe('sin_fecha');
    });

    it('ordena los grupos de lo urgente a lo que no tiene fecha y omite los vacíos', () => {
        const items = [
            { id: 'a', bucket: 'sin_fecha' as const },
            { id: 'b', bucket: 'hoy' as const },
            { id: 'c', bucket: 'vencidas' as const },
            { id: 'd', bucket: 'hoy' as const },
        ];
        const g = groupTasks(items);
        expect(g.map((x) => x.bucket)).toEqual(['vencidas', 'hoy', 'sin_fecha']);
        expect(g[1].items.map((x) => x.id)).toEqual(['b', 'd']);
    });
});

describe('hora del recordatorio', () => {
    it('lee la hora y el día en la zona del negocio', () => {
        const now = new Date('2026-10-08T05:30:00Z');
        expect(localClock('America/Mexico_City', now)).toEqual({ hour: 23, day: '2026-10-07' });
        expect(localClock('Asia/Tokyo', now)).toEqual({ hour: 14, day: '2026-10-08' });
        expect(localClock('No/Existe', now)).toEqual({ hour: 5, day: '2026-10-08' });
    });

    it('manda desde las 8:00 locales en adelante, no solo en esa hora', () => {
        expect(isReminderTime('America/Mexico_City', new Date('2026-10-08T13:59:00Z'))).toBe(false); // 7:59
        expect(isReminderTime('America/Mexico_City', new Date('2026-10-08T14:00:00Z'))).toBe(true);  // 8:00
        expect(isReminderTime('America/Mexico_City', new Date('2026-10-08T20:00:00Z'))).toBe(true);  // 14:00
    });
});

describe('correo de recordatorio', () => {
    const base = { en: false, locale: 'es-MX', nombre: 'Ana López', orgNombre: 'Gama', today: '2026-10-08', link: 'https://cordhq.app/app/tareas' };

    it('el asunto dice cuántas vencen hoy y cuántas ya vencieron', () => {
        const { subject } = renderTaskDigest({ ...base, tasks: [
            { titulo: 'Llamar a Luis', due: '2026-10-08', prioridad: 'normal' },
            { titulo: 'Responder contracargo', due: '2026-10-05', prioridad: 'alta' },
        ] });
        expect(subject).toBe('Tienes 1 tarea vencida y 1 para hoy · Gama');
        expect(renderTaskDigest({ ...base, tasks: [{ titulo: 'x', due: '2026-10-08', prioridad: 'normal' }] }).subject)
            .toBe('Tienes 1 tarea para hoy · Gama');
        expect(renderTaskDigest({ ...base, en: true, locale: 'en-US', tasks: [
            { titulo: 'x', due: '2026-10-01', prioridad: 'normal' }, { titulo: 'y', due: '2026-10-02', prioridad: 'normal' },
        ] }).subject).toBe('You have 2 overdue tasks · Gama');
    });

    it('lista lo vencido primero, escapa el texto del usuario y no nombra infraestructura', () => {
        const { html } = renderTaskDigest({ ...base, tasks: [
            { titulo: 'Hoy <b>', due: '2026-10-08', prioridad: 'normal', ref: 'COT-0149' },
            { titulo: 'Vieja', due: '2026-10-05', prioridad: 'alta' },
        ] });
        expect(html.indexOf('Vieja')).toBeLessThan(html.indexOf('Hoy &lt;b&gt;'));
        expect(html).toContain('Venció hace 3 días');
        expect(html).toContain('Vence hoy · COT-0149');
        expect(html).toContain('Buenos días, Ana.');
        expect(html).not.toMatch(/RESEND|Vercel|CRON/i);
    });
});

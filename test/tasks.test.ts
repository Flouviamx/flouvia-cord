import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
    TASK_LIST_MAX, TASK_PAGE_STEP, addDays, clampTaskLimit, dayDiff, dueShortcut, groupTasks, isIsoDay, nextMonday, nextTaskLimit, taskBucket,
} from '../src/lib/tasks';
import { digestLocale, footerText, isReminderTime, localClock, renderTaskDigest } from '../src/lib/task-reminders';
import { memberCanWriteTasks } from '../src/lib/permissions';

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
    const base = { en: false, locale: 'es-MX', nombre: 'Ana López', orgNombre: 'Gama', today: '2026-10-08', link: 'https://cordhq.app/app/tareas', puedeApagar: true };

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

describe('formato y pie del recordatorio', () => {
    it('el locale sale del idioma de la org y la región de su país, no de es-MX/en-US fijo', () => {
        expect(digestLocale('es', 'es-ES')).toBe('es-ES');
        expect(digestLocale('en', 'en-GB')).toBe('en-GB');
        // Alemania en inglés: formato inglés con región alemana, no "9. Okt." dentro de un texto en inglés.
        expect(digestLocale('en', 'de-DE')).toBe('en-DE');
        expect(digestLocale('es', 'en-US')).toBe('es-US');
        expect(digestLocale('en', '')).toBe('en-US');
        expect(digestLocale('es', null)).toBe('es-MX');
    });

    it('sólo invita a apagarlo a quien puede, y aclara que es para todo el equipo', () => {
        expect(footerText(false, true)).toContain('Puedes apagarlo para todo el equipo');
        expect(footerText(false, false)).toContain('pide a quien administra la cuenta');
        expect(footerText(false, false)).not.toContain('Puedes apagarlo');
        expect(footerText(true, false)).toContain('ask whoever manages the account');
        expect(footerText(true, true)).toContain('for the whole team');
        const { html } = renderTaskDigest({
            en: false, locale: 'es-MX', nombre: 'Beto', orgNombre: 'Gama', today: '2026-10-08', link: 'x', puedeApagar: false,
            tasks: [{ titulo: 'x', due: '2026-10-08', prioridad: 'normal' }],
        });
        expect(html).toContain('pide a quien administra la cuenta');
    });
});

describe('paginación de /app/tareas', () => {
    it('crece de 200 en 200 hasta el tope y acota basura', () => {
        expect(clampTaskLimit(null, TASK_PAGE_STEP)).toBe(200);
        expect(clampTaskLimit('400', TASK_PAGE_STEP)).toBe(400);
        expect(clampTaskLimit('99999', TASK_PAGE_STEP)).toBe(TASK_LIST_MAX);
        expect(clampTaskLimit('-3', 12)).toBe(12);
        expect(nextTaskLimit(200)).toBe(400);
        expect(nextTaskLimit(TASK_LIST_MAX - 50)).toBe(TASK_LIST_MAX);
        expect(nextTaskLimit(TASK_LIST_MAX)).toBeNull();
    });
});

describe('quién escribe tareas', () => {
    const m = (permisos: Record<string, boolean>) => ({ rol: 'miembro', permisos, esOwner: false });
    it('el menú Crear › Tarea sigue el mismo permiso que el POST', () => {
        expect(memberCanWriteTasks(m({ productos: true }))).toBe(false);
        expect(memberCanWriteTasks(m({ cobranza: true }))).toBe(true);
        expect(memberCanWriteTasks(m({ cotizar: true }))).toBe(true);
        expect(memberCanWriteTasks(m({ clientes: true }))).toBe(true);
        expect(memberCanWriteTasks({ rol: 'owner', permisos: {}, esOwner: true })).toBe(true);
        expect(memberCanWriteTasks(null)).toBe(false);
    });

    it('AppLayout dibuja la opción y su atajo con ese permiso, no con "cualquier crear"', () => {
        const src = readFileSync('src/layouts/AppLayout.astro', 'utf8');
        expect(src).toMatch(/const canTarea = memberCanWriteTasks\(ME\)/);
        expect(src).toMatch(/\{canTarea && \(\s*<button[^>]*id="tbCreateTarea"/);
        expect(src).toMatch(/\{canTarea && <div class="kbd-row"><span>\{t\(L, 'layout\.kbd\.crear_tarea'\)/);
        expect(src).toMatch(/const canCreateAny = [^;]*canTarea/);
    });
});

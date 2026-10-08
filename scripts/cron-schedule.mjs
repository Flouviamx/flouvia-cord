// Qué endpoints de cron le toca llamar a `.github/workflows/cord-crons.yml`.
//
// La tabla NO se escribe dos veces: los diarios y mensuales salen de `crons`
// en vercel.json (el reloj principal) y aquí solo se declaran los que corren en
// CADA corrida de GitHub. Agregar un cron a vercel.json basta para que GitHub
// lo recupere el día que Vercel no lo dispare.
//
// Regla de recuperación: GitHub no corre el schedule a la hora pedida (en oct
// 2026 corrió 3-4 veces al día, a horas variables), así que no se compara la
// hora EXACTA. En cada corrida se llama todo endpoint cuya hora programada YA
// PASÓ hoy (UTC) y, para los mensuales, cuyo día ya pasó en el mes. El propio
// endpoint reclama su periodo en `cron_runs` (src/lib/cron-runs.ts), así que
// lo que ya corrió responde `omitido` sin trabajar.
//
//   node scripts/cron-schedule.mjs                      # rutas que tocan ahora
//   node scripts/cron-schedule.mjs --at 2026-10-08T21:56:00Z
//   node scripts/cron-schedule.mjs --tabla              # la tabla completa
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * En cada corrida de GitHub, sin importar la hora. Cada uno es seguro de
 * llamar varias veces al día por su propia construcción (reclamo por fila,
 * lease o `skip locked`), no por el reclamo de periodo.
 */
export const EN_CADA_CORRIDA = new Map([
    ['/api/cron/workflows', 'horarios elegidos por el negocio y esperas condicionadas; avanza next_run_at con compare-and-set'],
    ['/api/cron/tareas', 'decide él mismo en qué zonas ya son las 8:00; dedup en tareas.recordada_el y org_members.tareas_avisadas_el'],
    ['/api/cron/webhooks', 'reintentos del outbox; reclama filas con lease y skip locked'],
    ['/api/cron/verifactu-submit', 'la remisión a la AEAT debe ser lo más inmediata posible; reclamo por hora'],
    ['/api/cron/ops-alertas', 'alertas de Cord Ops; reclamo por hora y aviso solo al cambiar de estado (ops_alert_state)'],
]);

/** Programados en vercel.json que GitHub no llama, con el motivo. */
export const NO_LLAMAR = new Map([
    ['/api/health', 'lo muestrea status-probe.yml cada hora; vercel.json queda de respaldo'],
]);

/** `M H * * *` (diario) o `M H D * *` (mensual). Cualquier otra forma es un error. */
export function parseSchedule(expr) {
    const parts = String(expr).trim().split(/\s+/);
    const num = (s, max) => (/^\d+$/.test(s) && Number(s) <= max ? Number(s) : null);
    if (parts.length !== 5) throw new Error(`cron-schedule: "${expr}" no tiene 5 campos`);
    const [m, h, dom, mon, dow] = parts;
    const minute = num(m, 59);
    const hour = num(h, 23);
    const day = dom === '*' ? '*' : num(dom, 28);
    if (minute === null || hour === null || day === null || mon !== '*' || dow !== '*') {
        throw new Error(`cron-schedule: "${expr}" no es diario ni mensual simple (día del mes hasta 28)`);
    }
    return { minute, hour, day };
}

export function readVercelCrons(path = new URL('../vercel.json', import.meta.url)) {
    return JSON.parse(readFileSync(path, 'utf8')).crons ?? [];
}

/** Tabla efectiva: [{ path, hour, minute, day }] con `hour: '*'` para los de cada corrida. */
export function scheduleTable(crons = readVercelCrons()) {
    const table = [];
    for (const c of crons) {
        if (NO_LLAMAR.has(c.path) || EN_CADA_CORRIDA.has(c.path)) continue;
        table.push({ path: c.path, ...parseSchedule(c.schedule) });
    }
    table.sort((a, b) => (a.hour * 60 + a.minute) - (b.hour * 60 + b.minute));
    for (const path of EN_CADA_CORRIDA.keys()) table.push({ path, hour: '*', minute: 0, day: '*' });
    return table;
}

/** Rutas cuya hora ya pasó hoy (y, si son mensuales, cuyo día ya pasó en el mes). */
export function dueEndpoints(table, now = new Date()) {
    const nowMin = now.getUTCHours() * 60 + now.getUTCMinutes();
    const today = now.getUTCDate();
    return table.filter((e) => {
        if (e.hour === '*') return true;
        const passed = nowMin >= e.hour * 60 + e.minute;
        if (e.day === '*') return passed;
        return today > e.day || (today === e.day && passed);
    }).map((e) => e.path);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
    const args = process.argv.slice(2);
    const table = scheduleTable();
    if (args.includes('--tabla')) {
        for (const e of table) {
            const when = e.hour === '*' ? 'cada corrida' : `${String(e.hour).padStart(2, '0')}:${String(e.minute).padStart(2, '0')} UTC${e.day === '*' ? '' : ` día ${e.day}`}`;
            console.log(`${when.padEnd(22)} ${e.path}`);
        }
    } else {
        const at = args.indexOf('--at');
        const now = at >= 0 ? new Date(args[at + 1]) : new Date();
        if (Number.isNaN(now.getTime())) { console.error('--at necesita una fecha ISO'); process.exit(2); }
        for (const path of dueEndpoints(table, now)) console.log(path);
    }
}

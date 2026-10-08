// Monitor de crons de Ops: qué debía correr (horario de vercel.json y
// scripts/cron-schedule.mjs, la misma tabla que usa cord-crons.yml) contra lo
// que de verdad corrió (`cron_runs`). Las funciones de estado son puras y se
// prueban sin base; la lectura es un constructor `sql` para el carril que toque.
import { sql } from './db';
import { STALE_MINUTES } from './cron-runs';
import vercelConfig from '../../vercel.json';
import { EN_CADA_CORRIDA, NO_LLAMAR, parseSchedule } from '../../scripts/cron-schedule.mjs';

// Toda ruta de cron que existe, programada o no: una sin horario es un cron
// que nunca corre, y eso también se tiene que ver.
// El código fuente se lee en el build para saber qué crons reclaman su periodo
// en cron_runs: de esos, no tener filas es una falla, no falta de bitácora.
const CRON_SOURCES = import.meta.glob('../pages/api/cron/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const endpointOf = (file: string) => `/api/cron/${file.split('/').pop()!.replace(/\.ts$/, '')}`;
const CRON_FILES = Object.keys(CRON_SOURCES).map(endpointOf);
const CRON_TRACKED = new Set(Object.entries(CRON_SOURCES).filter(([, src]) => /runCronOnce\(/.test(src)).map(([file]) => endpointOf(file)));

export type OpsCronCadence =
  | { kind: 'daily'; hour: number; minute: number }
  | { kind: 'monthly'; day: number; hour: number; minute: number }
  | { kind: 'each_run' }
  | { kind: 'external'; reason: string }
  | { kind: 'unscheduled' };

export interface OpsCronDef {
  endpoint: string;
  cadence: OpsCronCadence;
  note?: string;
  /** Reclama su periodo en cron_runs (runCronOnce): sin filas = no corrió. */
  tracked?: boolean;
}

/** La tabla de crons esperados, desde las mismas fuentes que usa el reloj. */
export function opsCronDefs(
  crons: { path: string; schedule: string }[] = (vercelConfig as { crons?: { path: string; schedule: string }[] }).crons ?? [],
  files: string[] = CRON_FILES,
  tracked: Set<string> = CRON_TRACKED,
): OpsCronDef[] {
  const defs = new Map<string, OpsCronDef>();
  for (const c of crons) {
    if (NO_LLAMAR.has(c.path)) { defs.set(c.path, { endpoint: c.path, cadence: { kind: 'external', reason: NO_LLAMAR.get(c.path)! } }); continue; }
    if (EN_CADA_CORRIDA.has(c.path)) continue;
    const s = parseSchedule(c.schedule) as { minute: number; hour: number; day: number | '*' };
    defs.set(c.path, { endpoint: c.path, cadence: s.day === '*' ? { kind: 'daily', hour: s.hour, minute: s.minute } : { kind: 'monthly', day: s.day, hour: s.hour, minute: s.minute } });
  }
  for (const [path, note] of EN_CADA_CORRIDA) defs.set(path, { endpoint: path, cadence: { kind: 'each_run' }, note });
  for (const path of files) if (!defs.has(path)) defs.set(path, { endpoint: path, cadence: { kind: 'unscheduled' } });
  for (const def of defs.values()) def.tracked = tracked.has(def.endpoint);
  return [...defs.values()].sort((a, b) => a.endpoint.localeCompare(b.endpoint));
}

const pad = (n: number) => String(n).padStart(2, '0');
export function opsCadenceLabel(c: OpsCronCadence): string {
  if (c.kind === 'daily') return `Diario ${pad(c.hour)}:${pad(c.minute)} UTC`;
  if (c.kind === 'monthly') return `Día ${c.day} de cada mes, ${pad(c.hour)}:${pad(c.minute)} UTC`;
  if (c.kind === 'each_run') return 'En cada corrida del reloj';
  if (c.kind === 'external') return 'Lo muestrea otro reloj';
  return 'Sin horario';
}

/** Corridas recientes: 40 días cubren 14 periodos diarios y dos mensuales. */
export const opsCronRuns = () => sql`
  select endpoint, periodo, estado, intentos, started_at, finished_at, resultado
  from cron_runs where started_at >= now() - interval '40 days'
  order by started_at desc limit 3000`;

export interface OpsCronRun {
  endpoint: string; periodo: string; estado: 'running' | 'ok' | 'error'; intentos: number;
  started_at: string | Date; finished_at: string | Date | null; resultado: unknown;
}

export type OpsCronHealth = 'ok' | 'error' | 'stuck' | 'missed' | 'pending' | 'untracked' | 'unscheduled';

export interface OpsCronStatus extends OpsCronDef {
  health: OpsCronHealth;
  last: OpsCronRun | null;
  /** Periodos recientes, del más viejo al más nuevo, para la tira. */
  history: { periodo: string; estado: 'ok' | 'error' | 'running' | 'missing' | 'none' }[];
}

const day = (d: Date) => d.toISOString().slice(0, 10);
const month = (d: Date) => d.toISOString().slice(0, 7);

/**
 * Margen tras la hora programada antes de llamar "atrasado" a un periodo: el
 * reloj de respaldo (GitHub) corre 3 o 4 veces al día a horas variables, así
 * que unas horas de retraso son normales y no son una falla.
 */
export const OPS_CRON_GRACE_HOURS = 6;

/** Desde cuándo hay bitácora: la corrida más vieja registrada de cualquier cron. */
export const opsCronRecordingSince = (runs: OpsCronRun[]) => runs.reduce<Date | null>((acc, r) => {
  const d = new Date(r.started_at);
  return !acc || d < acc ? d : acc;
}, null);

export function opsCronStatus(def: OpsCronDef, runs: OpsCronRun[], now = new Date(), recordingSince: Date | null = opsCronRecordingSince(runs)): OpsCronStatus {
  const mine = runs.filter((r) => r.endpoint === def.endpoint)
    .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
  const last = mine[0] ?? null;
  const byPeriod = new Map(mine.map((r) => [r.periodo, r] as const));
  const base = { ...def, last };
  if (def.cadence.kind === 'unscheduled') return { ...base, health: 'unscheduled', history: [] };
  if (def.cadence.kind === 'external' || (!def.tracked && !mine.length)) {
    return { ...base, health: 'untracked', history: [] };
  }

  // Periodos esperados, del más viejo al más nuevo.
  const periods: { periodo: string; due: Date }[] = [];
  if (def.cadence.kind === 'daily') {
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i, def.cadence.hour, def.cadence.minute));
      periods.push({ periodo: day(d), due: d });
    }
  } else if (def.cadence.kind === 'monthly') {
    for (let i = 2; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, def.cadence.day, def.cadence.hour, def.cadence.minute));
      periods.push({ periodo: month(d), due: d });
    }
  }
  // Un cron empezó a registrar en su primera corrida: antes de eso no hay
  // "faltó", hay "todavía no se medía".
  // Un cron que reclama periodo se mide desde que existe la bitácora, aunque él
  // nunca haya corrido: justo ese es el caso grave.
  const firstSeen = def.tracked ? recordingSince : mine.length ? new Date(mine[mine.length - 1].started_at) : null;
  const history = def.cadence.kind === 'each_run'
    ? mine.slice(0, 14).reverse().map((r) => ({ periodo: r.periodo, estado: r.estado }))
    : periods.map(({ periodo, due }) => {
        const r = byPeriod.get(periodo);
        if (r) return { periodo, estado: r.estado };
        // "Falta" solo si ya pasó la hora más el margen Y el cron ya se medía
        // (su primera corrida registrada fue antes de esa fecha).
        const overdue = due.getTime() + OPS_CRON_GRACE_HOURS * 3_600_000 < now.getTime();
        const tracked = !!firstSeen && firstSeen.getTime() <= due.getTime();
        return { periodo, estado: overdue && tracked ? 'missing' as const : 'none' as const };
      });

  if (!mine.length) {
    const lastDue = [...history].reverse().find((h) => h.estado !== 'none');
    return { ...base, health: lastDue?.estado === 'missing' ? 'missed' : 'pending', history };
  }
  if (last!.estado === 'error') return { ...base, health: 'error', history };
  if (last!.estado === 'running' && now.getTime() - new Date(last!.started_at).getTime() > STALE_MINUTES * 60_000) {
    return { ...base, health: 'stuck', history };
  }
  // Solo cuenta el periodo vencido más reciente: un hueco viejo ya pasó y la
  // tira lo sigue mostrando; el estado dice si HOY hay algo que atender.
  const lastDue = [...history].reverse().find((h) => h.estado !== 'none');
  if (lastDue?.estado === 'missing') return { ...base, health: 'missed', history };
  const current = periods[periods.length - 1];
  if (current && current.due < now && !byPeriod.has(current.periodo)) return { ...base, health: 'pending', history };
  return { ...base, health: 'ok', history };
}

/** Lo que la alerta de crons cuenta como problema. */
export const opsCronIsProblem = (s: OpsCronStatus) => s.health === 'error' || s.health === 'stuck' || s.health === 'missed';

/**
 * Valor de la alerta `crons_problem`. El cron de alertas no se cuenta a sí
 * mismo: si fallara, no podría avisar de su propia falla.
 */
export const opsCronProblemCount = (runs: OpsCronRun[], now = new Date()) => opsCronDefs()
  .map((def) => opsCronStatus(def, runs, now, opsCronRecordingSince(runs)))
  .filter((s) => s.endpoint !== '/api/cron/ops-alertas' && opsCronIsProblem(s)).length;

export const OPS_CRON_HEALTH: Record<OpsCronHealth, [string, string]> = {
  ok: ['Al día', 'green'], error: ['Falló', 'red'], stuck: ['Colgado', 'red'], missed: ['No corrió', 'red'],
  pending: ['Pendiente', 'amber'], untracked: ['Sin bitácora', ''], unscheduled: ['Sin horario', 'amber'],
};

/** Resumen corto del resultado guardado: código y, si lo trae, el motivo. */
export function opsCronResult(resultado: unknown): string {
  const r = resultado && typeof resultado === 'object' ? resultado as { status?: number; body?: Record<string, unknown> } : null;
  if (!r) return '—';
  const body = r.body && typeof r.body === 'object' ? r.body : {};
  const reason = typeof body.error === 'string' ? body.error : typeof body.motivo === 'string' ? body.motivo : null;
  const counts = Object.entries(body)
    .filter(([k, v]) => typeof v === 'number' && !['status'].includes(k))
    .slice(0, 3).map(([k, v]) => `${k.replace(/_/g, ' ')} ${v}`);
  return [r.status ? `HTTP ${r.status}` : null, reason, ...counts].filter(Boolean).join(' · ').slice(0, 160) || '—';
}

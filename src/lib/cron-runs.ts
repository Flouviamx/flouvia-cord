// src/lib/cron-runs.ts — reclamo por periodo de un cron (tabla `cron_runs`).
//
// Por qué existe: los crons de Cord tienen DOS relojes. `vercel.json` los
// dispara a diario (plan Hobby) y `.github/workflows/cord-crons.yml` los
// vuelve a llamar en cada corrida de GitHub para recuperar lo que Vercel no
// corrió. Dos relojes significan dos disparos el mismo día; y GitHub no corre
// el schedule cuando dice (3-4 veces al día, a horas variables), así que el
// único criterio honesto es "¿ya corrió este endpoint en este periodo?".
//
// Contrato:
//   - El periodo se RECLAMA de forma atómica (`insert … on conflict`) ANTES de
//     trabajar. Un segundo disparo del mismo periodo responde 200 `omitido` sin
//     tocar nada.
//   - Un periodo que terminó en `error`, o que se quedó en `running` más de
//     STALE_MINUTES (la función murió a medias), se puede volver a reclamar: la
//     corrida siguiente lo recupera.
//   - Si la tabla no existe o la base no responde al reclamar, el cron corre
//     igual (falla ABIERTO, con log). El reclamo evita trabajo repetido; no es
//     la única defensa contra duplicados — cada endpoint conserva su propia
//     idempotencia por fila — y un cron que deja de correr porque falta una
//     tabla de bitácora es peor que uno que corre dos veces.
//   - `?force=1` vuelve a correr un periodo ya `ok` (nunca uno en curso). Es
//     para la corrida manual desde GitHub después de arreglar algo.
//
// Carril (regla 30): la tabla no tiene org_id; su única política es la del
// carril de sistema. El helper marca `cronScope` en el contexto, y por eso
// valida él mismo CRON_SECRET antes: el carril de sistema solo se enciende
// después de autenticar al cron, nunca por haber importado esta función.
import { randomUUID } from 'node:crypto';
import { reqContext } from './context';
import { assertCronAuth } from './cron-auth';
import { sql, withSystemTx } from './db';
import { log } from './log';

/** Minutos tras los cuales un `running` sin terminar se considera muerto. */
export const STALE_MINUTES = 30;

export type CronPeriodKind = 'dia' | 'mes' | 'hora';

/** Periodo UTC: `2026-10-08` (día), `2026-10` (mes) o `2026-10-08T14` (hora). */
export function cronPeriod(kind: CronPeriodKind, now: Date = new Date()): string {
    const iso = now.toISOString();
    if (kind === 'mes') return iso.slice(0, 7);
    if (kind === 'hora') return iso.slice(0, 13);
    return iso.slice(0, 10);
}

type Claim =
    | { claimed: true; runId: string | null; intento: number }
    | { claimed: false; estado: string; finishedAt: string | null };

const inCronLane = <T>(fn: () => Promise<T>): Promise<T> =>
    reqContext.run({ ...(reqContext.getStore() ?? {}), userId: null, cronScope: true }, fn);

async function claim(endpoint: string, periodo: string, force: boolean): Promise<Claim> {
    const runId = randomUUID();
    try {
        return await inCronLane(async () => {
            const [rows] = await withSystemTx(sql`
                insert into cron_runs (endpoint, periodo, estado, run_id, intentos, started_at)
                values (${endpoint}, ${periodo}, 'running', ${runId}::uuid, 1, now())
                on conflict (endpoint, periodo) do update
                   set estado = 'running', run_id = excluded.run_id, started_at = now(),
                       finished_at = null, resultado = null, intentos = cron_runs.intentos + 1
                 where cron_runs.estado = 'error'
                    or (cron_runs.estado = 'running'
                        and cron_runs.started_at < now() - make_interval(mins => ${STALE_MINUTES}))
                    or (${force}::boolean and cron_runs.estado = 'ok')
                returning intentos`);
            if (rows[0]) return { claimed: true as const, runId, intento: Number(rows[0].intentos) };
            const [actual] = await withSystemTx(sql`
                select estado, finished_at from cron_runs
                 where endpoint = ${endpoint} and periodo = ${periodo}`);
            return {
                claimed: false as const,
                estado: String(actual[0]?.estado ?? 'running'),
                finishedAt: actual[0]?.finished_at ? new Date(actual[0].finished_at as string).toISOString() : null,
            };
        });
    } catch (err) {
        log.warn('cron_runs no disponible: el cron corre sin reclamo', { route: endpoint, err });
        return { claimed: true, runId: null, intento: 0 };
    }
}

async function finish(endpoint: string, periodo: string, runId: string | null, estado: 'ok' | 'error', resultado: unknown) {
    if (!runId) return;
    try {
        await inCronLane(() => withSystemTx(sql`
            update cron_runs
               set estado = ${estado}, finished_at = now(), resultado = ${JSON.stringify(resultado)}::jsonb
             where endpoint = ${endpoint} and periodo = ${periodo} and run_id = ${runId}::uuid`));
    } catch (err) {
        // El trabajo ya se hizo; si no se pudo anotar, el `running` caduca en
        // STALE_MINUTES y la corrida siguiente repite. Cada endpoint conserva su
        // idempotencia por fila para este caso.
        log.warn('no se pudo cerrar el registro de cron_runs', { route: endpoint, err });
    }
}

/** Cuerpo de la respuesta para la bitácora: JSON acotado, nunca el texto crudo completo. */
async function summarize(res: Response): Promise<unknown> {
    let body: unknown = null;
    try {
        const text = await res.clone().text();
        if (text.length <= 8_000) {
            try { body = JSON.parse(text); } catch { body = { texto: text.slice(0, 500) }; }
        } else {
            body = { truncado: true, bytes: text.length };
        }
    } catch { body = null; }
    return { status: res.status, body };
}

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
}

/**
 * Corre `fn` una sola vez por (endpoint, periodo). Un 5xx o una excepción
 * dejan el periodo en `error` para que el siguiente disparo lo reintente.
 */
export async function runCronOnce(
    request: Request,
    endpoint: string,
    periodo: string,
    fn: () => Promise<Response>,
): Promise<Response> {
    const authError = assertCronAuth(request);
    if (authError) return authError;

    let force = false;
    try { force = new URL(request.url).searchParams.get('force') === '1'; } catch { /* url relativa en pruebas */ }

    const c = await claim(endpoint, periodo, force);
    if (!c.claimed) {
        return json({
            ok: true, omitido: true,
            motivo: c.estado === 'ok' ? 'ya_corrio' : 'en_curso',
            endpoint, periodo, terminado: c.finishedAt,
        });
    }

    let res: Response;
    try {
        res = await fn();
    } catch (err) {
        log.error('el cron falló', { route: endpoint, periodo, err });
        await finish(endpoint, periodo, c.runId, 'error', { status: 500, error: 'excepcion' });
        return json({ error: 'El cron falló; la siguiente corrida lo reintenta.', endpoint, periodo }, 500);
    }
    await finish(endpoint, periodo, c.runId, res.status >= 500 ? 'error' : 'ok', await summarize(res));
    return res;
}

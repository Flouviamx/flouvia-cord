// src/lib/atencion.ts — presencia en vivo y atención del cliente sobre el link.
//
// Dos preguntas que el vendedor no podía responder antes de ago 2026:
//   "¿está viéndolo ahora?"  → cotizacion_visitantes.last_seen
//   "¿qué leyó realmente?"   → cotizacion_atencion (segundos por sección)
//
// Todo se alimenta del MISMO heartbeat que ya mandaba QuoteCard cada 10s; antes
// solo escribía cotizaciones.viewer_last_seen (una columna, sin actor). Esa
// columna queda como legacy: escribirla ahora rompería el contador `rev` que
// hace barato el polling del SSE (ver la nota en db/schema.sql).

import { sql, withOrgTx } from './db';
import type { PublicViewer } from './public-viewer';

/** Ventana de "está aquí ahora". Igual que el umbral que ya usaba /presence. */
export const PRESENCE_WINDOW_MS = 30_000;

/** Secciones del link público. El cliente solo puede reportar estas claves. */
export const SECCIONES = ['resumen', 'partidas', 'notas', 'pago', 'conversacion'] as const;
export type Seccion = (typeof SECCIONES)[number];

export const SECCION_LABEL: Record<Seccion, string> = {
    resumen: 'q.atencion.sec_resumen',
    partidas: 'q.atencion.sec_partidas',
    notas: 'q.atencion.sec_notas',
    pago: 'q.atencion.sec_pago',
    conversacion: 'q.atencion.sec_conversacion',
};

// Topes anti-abuso: el heartbeat viene de un cliente sin sesión, así que los
// contadores tienen que resistir a alguien mandando números inventados.
const MAX_CLAVES = 20;
const MAX_SEGUNDOS_POR_TICK = 60;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Normaliza una clave de atención; devuelve null si no es del vocabulario. */
export function normalizeClave(raw: unknown): string | null {
    const s = String(raw ?? '').trim().toLowerCase();
    if (!s) return null;
    if (s === 'pdf') return 'pdf';
    if (s.startsWith('sec:')) {
        const sec = s.slice(4);
        return (SECCIONES as readonly string[]).includes(sec) ? `sec:${sec}` : null;
    }
    if (s.startsWith('item:')) {
        const id = s.slice(5);
        return UUID_RE.test(id) ? `item:${id}` : null;
    }
    return null;
}

export function normalizeSeccion(raw: unknown): Seccion | null {
    const s = String(raw ?? '').trim().toLowerCase().replace(/^sec:/, '');
    return (SECCIONES as readonly string[]).includes(s) ? (s as Seccion) : null;
}

/** Deltas de permanencia saneados: claves del vocabulario, segundos acotados. */
export function sanitizeDwell(raw: unknown): Array<{ clave: string; segundos: number }> {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
    const out: Array<{ clave: string; segundos: number }> = [];
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
        if (out.length >= MAX_CLAVES) break;
        const clave = normalizeClave(k);
        if (!clave) continue;
        const segundos = Math.min(MAX_SEGUNDOS_POR_TICK, Math.max(0, Math.floor(Number(v) || 0)));
        if (segundos <= 0) continue;
        out.push({ clave, segundos });
    }
    return out;
}

export interface HeartbeatInput {
    seccion?: unknown;
    dwell?: unknown;
    typing?: unknown;
    nuevaSesion?: unknown;
}

/**
 * Un tick de presencia. Escribe la fila de visitante y acumula la atención en
 * una sola transacción. Idempotente por (cotizacion_id, actor_key).
 */
export async function recordHeartbeat(
    orgId: string,
    cotizacionId: string,
    viewer: PublicViewer,
    input: HeartbeatInput,
): Promise<void> {
    if (!viewer.actorKey || viewer.rol === 'bot') return;

    const seccion = normalizeSeccion(input.seccion);
    const typing = input.typing === true;
    const nuevaSesion = input.nuevaSesion === true;
    const dwell = sanitizeDwell(input.dwell);

    // El driver HTTP de Neon NO compone fragmentos sql`` anidados: cada
    // interpolación es un PARÁMETRO, no SQL. Por eso el vencimiento del
    // indicador "escribiendo" se calcula aquí y viaja como timestamp, y el
    // "conserva el valor anterior" se expresa con coalesce(excluded, tabla).
    const typingUntil = typing ? new Date(Date.now() + 6_000) : null;

    const queries: any[] = [
        sql`insert into cotizacion_visitantes
                (org_id, cotizacion_id, actor_key, rol, nombre, aperturas,
                 primera_vez, ultima_vez, last_seen, seccion, typing_until, ip_hash, user_agent)
            values (${orgId}, ${cotizacionId}, ${viewer.actorKey}, ${viewer.rol}, ${viewer.nombre},
                    ${nuevaSesion ? 1 : 0}, now(), now(), now(), ${seccion},
                    ${typingUntil}, ${viewer.ipHash}, ${viewer.userAgent})
            on conflict (cotizacion_id, actor_key) do update set
                rol          = excluded.rol,
                nombre       = coalesce(excluded.nombre, cotizacion_visitantes.nombre),
                aperturas    = cotizacion_visitantes.aperturas + ${nuevaSesion ? 1 : 0},
                ultima_vez   = now(),
                last_seen    = now(),
                seccion      = coalesce(excluded.seccion, cotizacion_visitantes.seccion),
                typing_until = coalesce(excluded.typing_until, cotizacion_visitantes.typing_until),
                ip_hash      = excluded.ip_hash,
                user_agent   = excluded.user_agent`,
    ];

    for (const d of dwell) {
        queries.push(sql`
            insert into cotizacion_atencion
                (org_id, cotizacion_id, actor_key, clave, segundos, veces, ultima_vez)
            values (${orgId}, ${cotizacionId}, ${viewer.actorKey}, ${d.clave}, ${d.segundos}, 1, now())
            on conflict (cotizacion_id, actor_key, clave) do update set
                segundos   = cotizacion_atencion.segundos + excluded.segundos,
                veces      = cotizacion_atencion.veces + 1,
                ultima_vez = now()`);
    }

    await withOrgTx(orgId, ...queries);
}

/** Marca un hito discreto (abrió el PDF, expandió una línea). No acumula tiempo. */
export async function recordHito(
    orgId: string,
    cotizacionId: string,
    viewer: PublicViewer,
    claveRaw: unknown,
): Promise<void> {
    if (!viewer.actorKey || viewer.rol === 'bot') return;
    const clave = normalizeClave(claveRaw);
    if (!clave) return;
    await withOrgTx(orgId, sql`
        insert into cotizacion_atencion
            (org_id, cotizacion_id, actor_key, clave, segundos, veces, ultima_vez)
        values (${orgId}, ${cotizacionId}, ${viewer.actorKey}, ${clave}, 0, 1, now())
        on conflict (cotizacion_id, actor_key, clave) do update set
            veces      = cotizacion_atencion.veces + 1,
            ultima_vez = now()`);
}

export interface PresenciaSnapshot {
    /** Miembro del equipo presente ahora mismo, si lo hay. */
    vendedor: { nombre: string | null; seccion: string | null } | null;
    /** Clientes presentes ahora mismo. */
    clientes: number;
    /** ¿Algún cliente está escribiendo? */
    clienteEscribiendo: boolean;
    /** ¿El vendedor está escribiendo? */
    vendedorEscribiendo: boolean;
    /** Sección donde está el cliente presente (la del más reciente). */
    seccionCliente: string | null;
}

/** Una sola query. La usan tanto el stream público como el del vendedor. */
export const presenciaQuery = (cotizacionId: string, orgId: string) => sql`
    select rol, nombre, seccion, last_seen,
           (typing_until is not null and typing_until > now()) as escribiendo
      from cotizacion_visitantes
     where cotizacion_id = ${cotizacionId} and org_id = ${orgId}
       and last_seen > now() - interval '30 seconds'
     order by last_seen desc`;

export function toPresencia(rows: any[]): PresenciaSnapshot {
    const vendedores = rows.filter((r) => r.rol === 'seller');
    const clientes = rows.filter((r) => r.rol === 'client');
    return {
        vendedor: vendedores.length
            ? { nombre: (vendedores[0].nombre as string) || null, seccion: (vendedores[0].seccion as string) || null }
            : null,
        clientes: clientes.length,
        clienteEscribiendo: clientes.some((r) => r.escribiendo === true),
        vendedorEscribiendo: vendedores.some((r) => r.escribiendo === true),
        seccionCliente: clientes.length ? ((clientes[0].seccion as string) || null) : null,
    };
}

export async function getPresencia(orgId: string, cotizacionId: string): Promise<PresenciaSnapshot> {
    const [rows] = await withOrgTx(orgId, presenciaQuery(cotizacionId, orgId));
    return toPresencia(rows);
}

export interface AtencionResumen {
    personas: number;
    aperturas: number;
    primeraVez: string | null;
    ultimaVez: string | null;
    /** Segundos por sección, ordenado de mayor a menor. */
    secciones: Array<{ clave: Seccion; segundos: number }>;
    /** Veces que se abrió el PDF. */
    pdf: number;
    /** Líneas expandidas, id → veces. */
    items: Array<{ id: string; veces: number }>;
    totalSegundos: number;
}

/**
 * Resumen de atención SOLO del cliente. Las visitas del equipo se excluyen a
 * propósito: mezclarlas convertiría el panel en ruido (el vendedor abre su
 * propio link constantemente para revisarlo).
 */
export async function getAtencion(orgId: string, cotizacionId: string): Promise<AtencionResumen> {
    const [visitantes, atencion] = await withOrgTx(orgId,
        sql`select count(*)::int as personas,
                   coalesce(sum(aperturas), 0)::int as aperturas,
                   min(primera_vez) as primera_vez,
                   max(ultima_vez)  as ultima_vez
              from cotizacion_visitantes
             where cotizacion_id = ${cotizacionId} and org_id = ${orgId} and rol = 'client'`,
        sql`select a.clave, sum(a.segundos)::int as segundos, sum(a.veces)::int as veces
              from cotizacion_atencion a
              join cotizacion_visitantes v
                on v.cotizacion_id = a.cotizacion_id and v.actor_key = a.actor_key
             where a.cotizacion_id = ${cotizacionId} and a.org_id = ${orgId} and v.rol = 'client'
             group by a.clave`,
    );

    const v = visitantes[0] ?? {};
    const secciones: Array<{ clave: Seccion; segundos: number }> = [];
    const items: Array<{ id: string; veces: number }> = [];
    let pdf = 0;

    for (const row of atencion) {
        const clave = String(row.clave);
        if (clave === 'pdf') { pdf = Number(row.veces) || 0; continue; }
        if (clave.startsWith('sec:')) {
            secciones.push({ clave: clave.slice(4) as Seccion, segundos: Number(row.segundos) || 0 });
            continue;
        }
        if (clave.startsWith('item:')) items.push({ id: clave.slice(5), veces: Number(row.veces) || 0 });
    }

    secciones.sort((a, b) => b.segundos - a.segundos);
    items.sort((a, b) => b.veces - a.veces);

    return {
        personas: Number(v.personas) || 0,
        aperturas: Number(v.aperturas) || 0,
        primeraVez: v.primera_vez ? String(v.primera_vez) : null,
        ultimaVez: v.ultima_vez ? String(v.ultima_vez) : null,
        secciones,
        pdf,
        items,
        totalSegundos: secciones.reduce((s, x) => s + x.segundos, 0),
    };
}

/** "2m 14s" / "48s" / "—". Formato compacto para las barras del panel. */
export function fmtDwell(segundos: number): string {
    if (!segundos || segundos <= 0) return '—';
    if (segundos < 60) return `${segundos}s`;
    const m = Math.floor(segundos / 60);
    const s = segundos % 60;
    return s ? `${m}m ${s}s` : `${m}m`;
}

// src/lib/public-viewer.ts — ¿quién está abriendo el link público?
//
// El link /q/[token] no tiene sesión propia: el token ES el secreto. Pero eso
// no significa que todos los que lo abren sean el cliente. Hasta ago 2026 la
// vista se marcaba en el SSR sin mirar quién entraba, así que:
//
//   · el botón "Abrir link" del propio vendedor marcaba la cotización como
//     'viewed', escribía "El cliente abrió el link", disparaba el webhook
//     quote.viewed, el correo al owner y el evento de PostHog;
//   · los bots de preview de WhatsApp/Slack/Gmail hacían lo mismo al generar
//     la tarjeta del enlace, antes de que ningún humano lo abriera.
//
// Este módulo separa tres actores:
//
//   seller  — sesión válida + membresía activa en la org dueña. Ve el link en
//             modo vista previa: no marca vista, no enciende presencia de
//             cliente, no dispara webhooks.
//   client  — cualquier otro humano. Es el único que cuenta.
//   bot     — crawler o generador de preview. Se ignora por completo.
//
// La defensa real contra bots no es la lista de User-Agent (siempre incompleta),
// sino DÓNDE se marca la vista: markViewed vive en el heartbeat del navegador
// (/api/q/[token] action:'ping'), que exige JavaScript ejecutándose con la
// pestaña visible. La lista de abajo solo evita crear filas de visitante basura.

import { createHash } from 'node:crypto';
import type { APIContext, AstroCookies } from 'astro';
import { sql, withOrgTx } from './db';
import { currentUserId } from './context';
import { trustedIp } from './ip';
import { log } from './log';

export type ViewerRole = 'seller' | 'client' | 'bot';

export interface PublicViewer {
    rol: ViewerRole;
    /** 'u:{userId}' para el equipo, 'v:{visitorId}' para el cliente. Null si es bot. */
    actorKey: string | null;
    /** Nombre del miembro del equipo; null para el cliente (es anónimo por diseño). */
    nombre: string | null;
    /** Hash con sal de la IP — desempata visitantes sin guardar la IP en claro. */
    ipHash: string | null;
    userAgent: string | null;
}

export const VISITOR_COOKIE = 'cord_q_visitor';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Un año: el objetivo es reconocer al mismo cliente entre aperturas del mismo
// link a lo largo de una negociación, no perfilarlo entre sitios.
const VISITOR_MAX_AGE = 60 * 60 * 24 * 365;

// Generadores de preview de enlace y crawlers. Que un UA nuevo no esté aquí no
// abre un agujero: sin ejecutar JS nunca llega al heartbeat que marca la vista.
const BOT_UA = [
    'whatsapp', 'slackbot', 'facebookexternalhit', 'twitterbot', 'linkedinbot',
    'telegrambot', 'discordbot', 'googleimageproxy', 'google-read-aloud',
    'bingbot', 'googlebot', 'applebot', 'yandexbot', 'duckduckbot',
    'embedly', 'quora link preview', 'skypeuripreview', 'vkshare',
    'redditbot', 'pinterest', 'bitlybot', 'outlook', 'proofpoint',
    'headlesschrome', 'python-requests', 'curl/', 'wget/', 'axios/', 'node-fetch',
];

export function isBotRequest(request: Request): boolean {
    const ua = (request.headers.get('user-agent') ?? '').toLowerCase();
    if (!ua) return true; // sin UA no es un navegador real
    if (BOT_UA.some((b) => ua.includes(b))) return true;
    // Un navegador que navega a una página manda Sec-Fetch-Mode: navigate.
    // Ausente + Sec-Fetch-Dest distinto de 'document' huele a prefetch o fetch
    // automatizado. Se acepta la ausencia total de headers Sec-Fetch (Safari
    // viejo y algunos navegadores in-app no los mandan).
    const mode = request.headers.get('sec-fetch-mode');
    const dest = request.headers.get('sec-fetch-dest');
    if (mode && mode !== 'navigate' && dest !== 'document' && dest !== 'empty') return true;
    return false;
}

/** Hash estable de IP + UA. La sal es el org_id: no permite cruzar orgs. */
function hashIp(ip: string, orgId: string): string {
    return createHash('sha256').update(`${orgId}:${ip}`).digest('hex').slice(0, 32);
}

/**
 * Lee (o crea) el id de visitante anónimo. httpOnly a propósito: solo el
 * servidor lo necesita, así que ningún script de la página puede leerlo.
 * `crearSiFalta` solo debe ser true en el SSR de la página, donde la respuesta
 * todavía admite Set-Cookie.
 */
export function readVisitorId(cookies: AstroCookies, crearSiFalta = false): string | null {
    const existente = cookies.get(VISITOR_COOKIE)?.value;
    if (existente && /^[0-9a-f-]{36}$/i.test(existente)) return existente;
    if (!crearSiFalta) return null;
    const nuevo = crypto.randomUUID();
    cookies.set(VISITOR_COOKIE, nuevo, {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: import.meta.env.PROD,
        maxAge: VISITOR_MAX_AGE,
    });
    return nuevo;
}

/**
 * Resuelve el actor detrás de un request al link público de `orgId`.
 *
 * Coste: cero queries para el cliente anónimo (el caso común). Solo consulta
 * `org_members` cuando el request TRAE sesión, que es exactamente el caso que
 * queremos distinguir.
 */
export async function resolveViewer(
    orgId: string,
    ctx: Pick<APIContext, 'cookies' | 'request'>,
    opts: { crearCookie?: boolean } = {},
): Promise<PublicViewer> {
    const { request, cookies } = ctx;
    const ua = (request.headers.get('user-agent') ?? '').slice(0, 400) || null;
    const ipHash = hashIp(trustedIp(request), orgId);

    // Identificar al vendedor es una MEJORA, nunca un requisito para servir el
    // link: aquí es donde el cliente aprueba y paga. Si esta comprobación falla
    // —org_id vacío o malformado, blip de Neon— se degrada a 'client' en vez de
    // propagar el error. Un orgId vacío llegó a producción una vez y comparar
    // `org_id = ''` contra una columna uuid (22P02) devolvía 500 en /q/[token].
    const userId = currentUserId();
    if (userId && UUID_RE.test(orgId)) {
        try {
            const [rows] = await withOrgTx(orgId, sql`
                select nombre, email from org_members
                where org_id = ${orgId} and user_id = ${userId} and estado = 'activo'
                limit 1`);
            if (rows.length) {
                const m = rows[0] as { nombre: string | null; email: string | null };
                return {
                    rol: 'seller',
                    actorKey: `u:${userId}`,
                    nombre: m.nombre || m.email || null,
                    ipHash,
                    userAgent: ua,
                };
            }
            // Sesión de OTRA org: es un cliente que además usa Cord. Cuenta como cliente.
        } catch (e) {
            // Degradar, no romper. Lo único que se pierde es el banner de vista
            // previa; la vista NO se marca aquí (eso vive en el heartbeat, que
            // sí recibe un org_id resuelto por resolvePublicQuote).
            log.error('no se pudo resolver la membresía', { route: 'public-viewer', err: (e as Error)?.message });
        }
    }

    if (isBotRequest(request)) {
        return { rol: 'bot', actorKey: null, nombre: null, ipHash: null, userAgent: ua };
    }

    const visitorId = readVisitorId(cookies, opts.crearCookie === true);
    // Sin cookie aún (primer request de un endpoint que no puede fijarla): el
    // hash de IP sirve de identidad provisional para no perder el heartbeat.
    const actorKey = visitorId ? `v:${visitorId}` : `h:${ipHash}`;
    return { rol: 'client', actorKey, nombre: null, ipHash, userAgent: ua };
}

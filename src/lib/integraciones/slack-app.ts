// La app de Slack de Cord más allá de los avisos: vista previa de links de
// cotización, el comando /cord y aprobar o rechazar una solicitud de aprobación
// con un botón.
//
//  - **Todo lo que entra de Slack se verifica con el signing secret** (firma v0
//    de `v0:<timestamp>:<cuerpo>`, cinco minutos de tolerancia).
//  - **El equipo de Slack resuelve la organización** (`integracion_conexiones`
//    con `proveedor = 'slack'` y el team id como cuenta). Una vista previa solo
//    se arma si la cotización del link es de ESA organización: pegar el link de
//    otro negocio no revela nada.
//  - **Aprobar exige una persona de Cord.** El correo de la cuenta de Slack se
//    busca entre los miembros activos de la organización con el permiso de
//    Aprobaciones; sin esa coincidencia, el botón no decide nada.

import { createHmac, timingSafeEqual } from 'node:crypto';
import { sql, withOrgTx, resolvePublicQuote, resolveIntegracion } from '../db';
import { decryptSecret } from '../crypto-secret';
import { log } from '../log';
import { currencyDecimals, normalizeCurrency } from '../currency';
import { memberCan, type PermMap } from '../permissions';
import { runQuoteAction } from '../actions/quotes';
import { siteOrigin } from '../email';

type Lang = 'es' | 'en';
const TOLERANCIA_S = 5 * 60;

export function firmaSlackValida(secret: string, timestamp: string | null, cuerpo: string, firma: string | null, ahora = Date.now()): boolean {
    if (!secret || !timestamp || !firma || !/^\d{9,11}$/.test(timestamp)) return false;
    if (Math.abs(ahora / 1000 - Number(timestamp)) > TOLERANCIA_S) return false;
    const esperada = Buffer.from('v0=' + createHmac('sha256', secret).update(`v0:${timestamp}:${cuerpo}`).digest('hex'));
    const dada = Buffer.from(firma);
    return esperada.length === dada.length && timingSafeEqual(esperada, dada);
}

export const signingSecret = () => String(import.meta.env.SLACK_SIGNING_SECRET || process.env.SLACK_SIGNING_SECRET || '');

const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function dinero(total: number, moneda: string, lang: Lang): string {
    const code = normalizeCurrency(moneda);
    const d = currencyDecimals(code);
    return new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'es-MX', { style: 'currency', currency: code, currencyDisplay: 'code', minimumFractionDigits: d, maximumFractionDigits: d }).format(Number(total) || 0);
}

const ESTADOS: Record<Lang, Record<string, string>> = {
    es: { draft: 'Borrador', sent: 'Enviada', viewed: 'Vista por el cliente', approved: 'Aprobada', rejected: 'Rechazada', expired: 'Vencida', paid: 'Pagada', invoiced: 'Facturada' },
    en: { draft: 'Draft', sent: 'Sent', viewed: 'Viewed by the client', approved: 'Approved', rejected: 'Rejected', expired: 'Expired', paid: 'Paid', invoiced: 'Invoiced' },
};
const T: Record<Lang, Record<string, string>> = {
    es: {
        cotizacion: 'Cotización', abrir: 'Abrir en Cord', sin_resultados: 'No encontré cotizaciones con', ayuda: 'Escribe `/cord` y un folio o el nombre de un cliente. Ejemplo: `/cord COT-0152` o `/cord Aceros`.',
        no_conectado: 'Este espacio de Slack no está conectado a Cord. Conéctalo en Cord › Ajustes › Integraciones › Slack.',
        pide_aprobacion: 'pide aprobación', motivo: 'Motivo', aprobar: 'Aprobar', rechazar: 'Rechazar',
        aprobada_por: 'aprobada por', rechazada_por: 'rechazada por', sin_permiso: 'Tu cuenta de Slack no corresponde a un miembro de Cord con permiso de Aprobaciones. Decide desde Cord.',
        ya_decidida: 'Esta solicitud ya se decidió o ya no está pendiente.', error: 'No se pudo registrar la decisión. Inténtalo desde Cord.',
    },
    en: {
        cotizacion: 'Quote', abrir: 'Open in Cord', sin_resultados: 'No quotes found for', ayuda: 'Type `/cord` and a quote number or a client name. Example: `/cord COT-0152` or `/cord Aceros`.',
        no_conectado: 'This Slack workspace is not connected to Cord. Connect it in Cord › Settings › Integrations › Slack.',
        pide_aprobacion: 'needs approval', motivo: 'Reason', aprobar: 'Approve', rechazar: 'Reject',
        aprobada_por: 'approved by', rechazada_por: 'rejected by', sin_permiso: 'Your Slack account does not match a Cord member with the Approvals permission. Decide from Cord.',
        ya_decidida: 'This request was already decided or is no longer pending.', error: 'The decision could not be recorded. Try from Cord.',
    },
};

export interface ContextoSlack { orgId: string; conexionId: string; lang: Lang }

export async function contextoDeEquipo(teamId: string): Promise<ContextoSlack | null> {
    if (!/^T[A-Z0-9]{6,20}$/.test(teamId)) return null;
    const r = await resolveIntegracion('slack', teamId);
    if (!r) return null;
    const [[org]] = await withOrgTx(r.orgId, sql`select idioma from orgs where id = ${r.orgId}`);
    return { orgId: r.orgId, conexionId: r.conexionId, lang: org?.idioma === 'en' ? 'en' : 'es' };
}

async function botToken(ctx: ContextoSlack): Promise<string | null> {
    const [[row]] = await withOrgTx(ctx.orgId, sql`
        select access_token_enc from integracion_conexiones where id = ${ctx.conexionId} and org_id = ${ctx.orgId}`);
    return row?.access_token_enc ? decryptSecret(row.access_token_enc as string) : null;
}

async function slackApi(token: string, metodo: string, cuerpo: Record<string, unknown>): Promise<any> {
    const res = await fetch(`https://slack.com/api/${metodo}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(cuerpo), signal: AbortSignal.timeout(8000),
    });
    const data = await res.json().catch(() => null);
    if (!data?.ok) log.error('Slack rechazó la llamada', { route: 'slack-app', metodo, detalle: data?.error });
    return data;
}

interface FilaCot { id: string; folio: string; empresa: string | null; status: string; total: number; base_currency: string; aprob_motivo?: string | null }

export function bloquesCotizacion(q: FilaCot, lang: Lang, extra: any[] = []): any[] {
    const t = T[lang];
    return [
        { type: 'section', text: { type: 'mrkdwn', text: `*${t.cotizacion} ${esc(q.folio)}* · ${esc(q.empresa || '—')}\n${esc(ESTADOS[lang][q.status] ?? q.status)} · *${esc(dinero(q.total, q.base_currency, lang))}*` } },
        ...extra,
        { type: 'actions', elements: [{ type: 'button', text: { type: 'plain_text', text: t.abrir }, url: `${siteOrigin()}/app/cotizaciones/${q.id}` }] },
    ];
}

async function leerCotizacion(orgId: string, id: string): Promise<FilaCot | null> {
    const [[q]] = await withOrgTx(orgId, sql`
        select c.id, c.folio, cl.empresa, c.status, c.total, c.base_currency, c.aprob_motivo
          from cotizaciones c left join clientes cl on cl.id = c.cliente_id and cl.org_id = c.org_id
         where c.id = ${id} and c.org_id = ${orgId}`);
    return q ? { ...(q as any), total: Number(q.total) } : null;
}

/** Token de un link público de cotización, en cualquier dominio de Cord. */
export function tokenDeLink(url: string): string | null {
    try {
        const u = new URL(url);
        const m = u.pathname.match(/^\/q\/([A-Za-z0-9_-]{8,128})\/?$/);
        return m ? m[1] : null;
    } catch {
        return null;
    }
}

export async function vistaPrevia(ctx: ContextoSlack, evento: any): Promise<void> {
    const token = await botToken(ctx);
    if (!token) return;
    const unfurls: Record<string, unknown> = {};
    for (const link of (evento?.links ?? []).slice(0, 5)) {
        const url = String(link?.url ?? '');
        const tok = tokenDeLink(url);
        if (!tok) continue;
        const pub = await resolvePublicQuote(tok);
        if (!pub || pub.orgId !== ctx.orgId) continue;
        const q = await leerCotizacion(ctx.orgId, pub.id);
        if (q) unfurls[url] = { blocks: bloquesCotizacion(q, ctx.lang) };
    }
    if (!Object.keys(unfurls).length) return;
    await slackApi(token, 'chat.unfurl', evento?.unfurl_id
        ? { unfurl_id: evento.unfurl_id, source: evento.source, unfurls }
        : { channel: evento.channel, ts: evento.message_ts, unfurls });
}

/** Respuesta del comando /cord: solo la ve quien lo escribe. */
export async function comando(ctx: ContextoSlack | null, texto: string, lang: Lang = 'es'): Promise<Record<string, unknown>> {
    const L = ctx?.lang ?? lang;
    const t = T[L];
    if (!ctx) return { response_type: 'ephemeral', text: t.no_conectado };
    const q = texto.trim().slice(0, 80);
    if (!q) return { response_type: 'ephemeral', text: t.ayuda };
    const [filas] = await withOrgTx(ctx.orgId, sql`
        select c.id, c.folio, cl.empresa, c.status, c.total, c.base_currency
          from cotizaciones c left join clientes cl on cl.id = c.cliente_id and cl.org_id = c.org_id
         where c.org_id = ${ctx.orgId}
           and (lower(c.folio) = lower(${q}) or cl.empresa ilike ${'%' + q.replace(/[%_]/g, '') + '%'})
         order by (lower(c.folio) = lower(${q})) desc, c.created_at desc
         limit 5`);
    if (!filas.length) return { response_type: 'ephemeral', text: `${t.sin_resultados} "${esc(q)}".` };
    const blocks = (filas as any[]).flatMap((f, i) => [
        ...(i ? [{ type: 'divider' }] : []),
        ...bloquesCotizacion({ ...f, total: Number(f.total) }, L),
    ]);
    return { response_type: 'ephemeral', blocks, text: `${filas.length}` };
}

/** Publica la solicitud con sus botones en el canal conectado. */
export async function avisarAprobacion(orgId: string, quoteId: string): Promise<void> {
    const [[cx]] = await withOrgTx(orgId, sql`
        select c.id, o.slack_webhook_url, o.idioma from integracion_conexiones c join orgs o on o.id = c.org_id
         where c.org_id = ${orgId} and c.proveedor = 'slack' and c.estado = 'activa'`);
    if (!cx?.slack_webhook_url) return;
    const lang: Lang = cx.idioma === 'en' ? 'en' : 'es';
    const t = T[lang];
    const q = await leerCotizacion(orgId, quoteId);
    if (!q) return;
    const blocks = [
        { type: 'section', text: { type: 'mrkdwn', text: `*${t.cotizacion} ${esc(q.folio)}* ${t.pide_aprobacion} · ${esc(q.empresa || '—')} · *${esc(dinero(q.total, q.base_currency, lang))}*${q.aprob_motivo ? `\n${t.motivo}: ${esc(q.aprob_motivo)}` : ''}` } },
        { type: 'actions', elements: [
            { type: 'button', style: 'primary', action_id: 'cord_aprobar', value: q.id, text: { type: 'plain_text', text: t.aprobar } },
            { type: 'button', style: 'danger', action_id: 'cord_rechazar', value: q.id, text: { type: 'plain_text', text: t.rechazar } },
            { type: 'button', action_id: 'cord_abrir', url: `${siteOrigin()}/app/cotizaciones/${q.id}`, text: { type: 'plain_text', text: t.abrir } },
        ] },
    ];
    await fetch(String(cx.slack_webhook_url), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: `${t.cotizacion} ${q.folio} ${t.pide_aprobacion}`, blocks }), signal: AbortSignal.timeout(5000),
    }).catch(() => null);
}

async function responder(responseUrl: string, cuerpo: Record<string, unknown>): Promise<void> {
    if (!/^https:\/\/hooks\.slack\.com\//.test(responseUrl)) return;
    await fetch(responseUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo), signal: AbortSignal.timeout(5000) }).catch(() => null);
}

/** Botón Aprobar o Rechazar de una solicitud. Responde por `response_url`. */
export async function decidir(ctx: ContextoSlack, payload: any): Promise<void> {
    const t = T[ctx.lang];
    const accion = payload?.actions?.[0];
    const aprobar = accion?.action_id === 'cord_aprobar';
    if (!accion || (!aprobar && accion.action_id !== 'cord_rechazar')) return;
    const quoteId = String(accion.value ?? '');
    const responseUrl = String(payload?.response_url ?? '');
    if (!/^[0-9a-f-]{36}$/i.test(quoteId)) return;

    const token = await botToken(ctx);
    const info = token ? await slackApi(token, 'users.info', { user: payload?.user?.id }) : null;
    const email = String(info?.user?.profile?.email ?? '').toLowerCase();
    const [miembros] = email ? await withOrgTx(ctx.orgId, sql`
        select u.id as user_id, m.rol, m.permisos from org_members m join users u on u.id = m.user_id
         where m.org_id = ${ctx.orgId} and m.estado = 'activo' and lower(u.email) = ${email}`) : [[]];
    const m = (miembros as any[])[0];
    if (!m || !memberCan({ rol: m.rol, permisos: (m.permisos as PermMap) ?? {}, esOwner: m.rol === 'owner' }, 'aprobar')) {
        await responder(responseUrl, { response_type: 'ephemeral', replace_original: false, text: t.sin_permiso });
        return;
    }

    const r = await runQuoteAction(
        { orgId: ctx.orgId, origin: siteOrigin(), actor: `slack:${email}`, userId: String(m.user_id), source: 'manual' },
        quoteId, { action: aprobar ? 'approve_request' : 'reject_request' },
    ).catch((err) => { log.error('Slack: no se pudo decidir la aprobación', { route: 'slack-app', orgId: ctx.orgId, err }); return null; });
    if (!r || r.status >= 400) {
        await responder(responseUrl, { response_type: 'ephemeral', replace_original: false, text: r?.status === 409 ? t.ya_decidida : t.error });
        return;
    }
    const q = await leerCotizacion(ctx.orgId, quoteId);
    const linea = `${t.cotizacion} *${esc(q?.folio ?? '')}* ${aprobar ? t.aprobada_por : t.rechazada_por} ${esc(info?.user?.real_name || email)}`;
    await responder(responseUrl, { replace_original: true, text: linea, blocks: q ? bloquesCotizacion(q, ctx.lang, [{ type: 'context', elements: [{ type: 'mrkdwn', text: linea }] }]) : undefined });
}

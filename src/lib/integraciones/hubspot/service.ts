import { sql, withOrgTx } from '../../db';
import { log } from '../../log';
import { type ActionContext, type ActionOutcome, auditAction, done } from '../../actions/outcome';
import {
    consumeOAuthState, createOAuthState, CuentaYaConectadaError, disconnectConexion, getConexion, saveConexion, updateAjustes,
} from '../conexiones';
import { enqueueBackfill, processOrgSync } from '../sync';
import { hubspotCredentials, hubspotRedirectUri } from './config';
import { buildAuthorizeUrl, exchangeCode, HubSpotAuthError } from './oauth';
import { listDealPipelines } from './objects';
import { QUOTE_STATUSES, sanitizeAjustes, stagesComplete } from './mapping';
import { after } from '../../after';

export type ConnectResult = { redirect: string };

export async function startHubSpotConnect(ctx: ActionContext): Promise<ConnectResult | ActionOutcome> {
    const creds = hubspotCredentials();
    if (!creds) return done(503, { error: 'La integración con HubSpot todavía no está disponible.', code: 'unavailable' });
    if (!ctx.userId) return done(401, { error: 'Inicia sesión para conectar HubSpot.', code: 'unauthorized' });
    const state = await createOAuthState(ctx.orgId, ctx.userId, 'hubspot');
    return { redirect: buildAuthorizeUrl(creds, hubspotRedirectUri(ctx.origin), state) };
}

export type CallbackMotivo = 'conectada' | 'cancelada' | 'estado' | 'otra_org' | 'error' | 'no_disponible';

export async function finishHubSpotConnect(ctx: ActionContext, params: { code: string | null; state: string | null; error: string | null }): Promise<CallbackMotivo> {
    const creds = hubspotCredentials();
    if (!creds) return 'no_disponible';
    if (!ctx.userId || !params.state || !(await consumeOAuthState(ctx.orgId, ctx.userId, 'hubspot', params.state))) return 'estado';
    if (params.error || !params.code) return 'cancelada';
    try {
        const redirectUri = hubspotRedirectUri(ctx.origin);
        const tokens = await exchangeCode(creds, params.code.slice(0, 500), redirectUri);
        const nombre = await accountName(tokens.accessToken);
        const conexion = await saveConexion(ctx.orgId, ctx.userId, 'hubspot', tokens, nombre);
        await auditAction(ctx, 'integracion.conectada', 'integracion', conexion.id, `HubSpot ${nombre ?? tokens.hubId}`);
        return 'conectada';
    } catch (error) {
        if (error instanceof CuentaYaConectadaError) return 'otra_org';
        if (!(error instanceof HubSpotAuthError)) log.error('no se pudo completar la conexión con HubSpot', { route: 'integraciones/hubspot', orgId: ctx.orgId, err: error });
        return 'error';
    }
}

async function accountName(accessToken: string): Promise<string | null> {
    try {
        const res = await fetch('https://api.hubapi.com/account-info/v3/details', {
            headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
            redirect: 'error',
            signal: AbortSignal.timeout(8_000),
        });
        if (!res.ok) return null;
        const data = await res.json();
        const domain = typeof data?.uiDomain === 'string' ? data.uiDomain : null;
        const portal = data?.portalId ? String(data.portalId) : null;
        return domain && portal ? `${portal} · ${domain}` : portal;
    } catch {
        return null;
    }
}

export async function hubspotStatus(orgId: string, withPipelines: boolean) {
    const disponible = Boolean(hubspotCredentials());
    const conexion = await getConexion(orgId, 'hubspot');
    if (!conexion || conexion.estado === 'desconectada') return { disponible, conexion: null };
    const [[counts]] = await withOrgTx(orgId, sql`
        select count(*) filter (where status in ('queued', 'running'))::int as pendientes,
               count(*) filter (where status = 'failed' and finished_at > now() - interval '7 days')::int as fallidas
          from integracion_sync where org_id = ${orgId} and conexion_id = ${conexion.id}`);
    const ajustes = sanitizeAjustes(conexion.ajustes);
    let pipelines: Awaited<ReturnType<typeof listDealPipelines>> | null = null;
    if (withPipelines && conexion.estado === 'activa') {
        try {
            pipelines = await listDealPipelines({ orgId, conexionId: conexion.id });
        } catch {
            pipelines = null;
        }
    }
    return {
        disponible,
        conexion: {
            estado: conexion.estado,
            cuenta: conexion.cuentaNombre ?? conexion.cuentaExterna,
            conectadaDesde: conexion.createdAt,
            ultimaSync: conexion.ultimaSyncAt,
            ultimoError: conexion.ultimoError,
            ultimoErrorAt: conexion.ultimoErrorAt,
            pendientes: Number(counts?.pendientes ?? 0),
            fallidas: Number(counts?.fallidas ?? 0),
            ajustes,
            etapasCompletas: stagesComplete(ajustes),
        },
        pipelines,
    };
}

export async function disconnectHubSpot(ctx: ActionContext): Promise<ActionOutcome> {
    const ok = await disconnectConexion(ctx.orgId, 'hubspot');
    if (!ok) return done(404, { error: 'HubSpot no está conectado.', code: 'not_found' });
    await auditAction(ctx, 'integracion.desconectada', 'integracion', 'hubspot', 'HubSpot');
    return done(200, { ok: true });
}

export async function backfillHubSpot(ctx: ActionContext): Promise<ActionOutcome> {
    const conexion = await getConexion(ctx.orgId, 'hubspot');
    if (!conexion || conexion.estado !== 'activa') return done(409, { error: 'Conecta HubSpot antes de sincronizar.', code: 'invalid_state' });
    const encolados = await enqueueBackfill(ctx.orgId, conexion.id);
    await auditAction(ctx, 'integracion.sincronizacion', 'integracion', conexion.id, `${encolados} registros`);
    if (encolados) after(processOrgSync(ctx.orgId));
    return done(200, { ok: true, encolados });
}

export async function saveHubSpotAjustes(ctx: ActionContext, input: unknown): Promise<ActionOutcome> {
    const raw = (input && typeof input === 'object' ? input : {}) as Record<string, any>;
    const ajustes = sanitizeAjustes({ pipeline: raw.pipeline, etapas: raw.etapas });
    const conexion = await getConexion(ctx.orgId, 'hubspot');
    if (!conexion || conexion.estado === 'desconectada') return done(409, { error: 'Conecta HubSpot antes de configurarlo.', code: 'invalid_state' });
    if (conexion.estado === 'activa') {
        try {
            const pipelines = await listDealPipelines({ orgId: ctx.orgId, conexionId: conexion.id });
            const pipeline = pipelines.find((p) => p.id === ajustes.pipeline);
            if (!pipeline) return done(422, { error: 'Ese pipeline no existe en tu cuenta de HubSpot.', code: 'invalid_request' });
            const validas = new Set(pipeline.stages.map((s) => s.id));
            if (QUOTE_STATUSES.some((s) => ajustes.etapas[s] && !validas.has(ajustes.etapas[s]))) {
                return done(422, { error: 'Alguna etapa no pertenece al pipeline elegido.', code: 'invalid_request' });
            }
        } catch {
            return done(503, { error: 'No pudimos consultar tus pipelines de HubSpot. Intenta de nuevo.', code: 'unavailable' });
        }
    }
    await updateAjustes(ctx.orgId, 'hubspot', { ...ajustes });
    await auditAction(ctx, 'integracion.ajustes', 'integracion', conexion.id, `pipeline ${ajustes.pipeline}`);
    return done(200, { ok: true, ajustes });
}

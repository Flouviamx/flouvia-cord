import { logAudit } from '../db';

export interface ActionContext {
    orgId: string;
    origin: string;
    ip?: string | null;
    actor?: string;
    source?: 'manual' | 'api' | 'mcp';
}

export interface ActionOutcome {
    status: number;
    body: Record<string, unknown>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID_RE.test(value);

export const done = (status: number, body: Record<string, unknown>): ActionOutcome => ({ status, body });

export const fromResponse = async (res: Response): Promise<ActionOutcome> => done(res.status, await res.json());

export function auditAction(ctx: ActionContext, accion: string, entidad: string, entidadId: string, detalle: string) {
    return logAudit(ctx.orgId, {
        accion, entidad, entidad_id: entidadId, detalle,
        ip: ctx.ip ?? undefined,
        ...(ctx.actor ? { actor: ctx.actor } : {}),
    });
}

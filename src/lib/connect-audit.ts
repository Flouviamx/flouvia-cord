import { logAudit, reqIp } from './db';

export async function auditConnect(
    orgId: string,
    request: Request,
    action: string,
    options: { entity?: string; entityId?: string; detail?: string } = {},
): Promise<void> {
    await logAudit(orgId, {
        accion: `cord_pagos.${action}`,
        entidad: options.entity || 'connect_account',
        entidad_id: options.entityId || orgId,
        detalle: options.detail,
        ip: reqIp(request),
        userAgent: request.headers.get('user-agent'),
    });
}

import { logAudit, reqIp } from './db';

export async function auditConnect(
    orgId: string,
    request: Request,
    action: string,
    /**
     * `actor` sólo hace falta donde NO hay sesión que resolver: el endpoint
     * público de captura móvil corre sin cookie, así que `logAudit` caía a
     * `'system'` y la fila no decía a nombre de quién se subió el documento.
     * Se pasa el usuario que acuñó el enlace, que es el responsable real.
     */
    options: { entity?: string; entityId?: string; detail?: string; actor?: string } = {},
): Promise<void> {
    await logAudit(orgId, {
        accion: `cord_pagos.${action}`,
        entidad: options.entity || 'connect_account',
        entidad_id: options.entityId || orgId,
        detalle: options.detail,
        actor: options.actor,
        ip: reqIp(request),
        userAgent: request.headers.get('user-agent'),
    });
}

// /api/fiscal/nfe-inutilizacao — inutilização de números de la serie de la NF-e.
//   GET                                          → números sin uso de la serie de Cord + historial
//   POST { inicio, fim, justificativa }          → pide a la SEFAZ inutilizar ese rango
//
// Un número que se reservó y nunca llegó a ser una nota autorizada (rechazo,
// intento descartado) deja un hueco en la serie; la legislación pide
// declararlo a la SEFAZ (inutilização, MOC 5.3). Cord nunca inutiliza solo:
// lo ofrece y lo pide quien administra los datos fiscales, y antes de enviar
// verifica en Postgres que el rango no tenga ninguna nota viva, autorizada o
// denegada (latam/nfe/eventos.ts → inutilizarFaixa).
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId, logAudit, reqIp, withOrgTx } from '../../../lib/db';
import { requirePerm } from '../../../lib/queries';
import { requireFreshAuth } from '../../../lib/step-up';
import { requireEntitlement } from '../../../lib/org-entitlements';
import { currentUserId } from '../../../lib/context';
import { log } from '../../../lib/log';
import { strictLimitResponse, strictRateLimit } from '../../../lib/ratelimit';
import { railConfig } from '../../../lib/fiscal/latam/config';
import { leerAjustes } from '../../../lib/fiscal/latam/credenciales';
import { esErrorSeguro } from '../../../lib/fiscal/latam/errores';
import type { AjustesNfe } from '../../../lib/fiscal/latam/nfe/ajustes';
import { inutilizarFaixa, numerosSemUso } from '../../../lib/fiscal/latam/nfe/eventos';

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

async function contexto(orgId: string): Promise<{ serie: number; cnpj: string | null } | Response> {
    if (!railConfig('nfe').habilitado) return json({ error: 'La NF-e todavía no está disponible en Cord.' }, 409);
    const [[org]] = await withOrgTx(orgId, sql`select country_code, fiscal_metadata->>'tax_id' as tax_id, rfc from orgs where id = ${orgId}`);
    if (String(org?.country_code || '').toUpperCase() !== 'BR') return json({ error: 'La NF-e es una capacidad de Brasil.' }, 409);
    const ajustes = await leerAjustes<AjustesNfe>(orgId, 'nfe');
    if (ajustes.serie === undefined || ajustes.serie === null) return json({ error: 'Configura primero la serie de la NF-e.' }, 409);
    return { serie: Number(ajustes.serie), cnpj: (org?.tax_id || org?.rfc || null) as string | null };
}

async function historial(orgId: string, entorno: string) {
    const [rows] = await withOrgTx(orgId, sql`
        select serie, n_ini, n_fin, estado, n_prot, error_mensaje, created_at
          from nfe_inutilizacoes
         where org_id = ${orgId} and entorno = ${entorno}
         order by created_at desc
         limit 20`);
    return rows.map((r) => ({
        serie: Number(r.serie), inicio: Number(r.n_ini), fim: Number(r.n_fin), estado: String(r.estado),
        n_prot: r.n_prot ? String(r.n_prot) : null, error: r.error_mensaje ? String(r.error_mensaje) : null,
        creado_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    }));
}

export const GET: APIRoute = async () => {
    const denied = await requirePerm('ajustes'); if (denied) return denied;
    const orgId = await getActiveOrgId();
    const ctx = await contexto(orgId);
    if (ctx instanceof Response) return ctx;
    const entorno = railConfig('nfe').entorno;
    return json({ serie: ctx.serie, sin_uso: await numerosSemUso(orgId, entorno, ctx.serie), historial: await historial(orgId, entorno) });
};

export const POST: APIRoute = async ({ request }) => {
    const denied = await requirePerm('ajustes'); if (denied) return denied;
    // Es un acto ante la SEFAZ que no se deshace: pide la sesión reciente.
    const staleAuth = await requireFreshAuth(); if (staleAuth) return staleAuth;
    const orgId = await getActiveOrgId();
    const subscriptionDenied = await requireEntitlement(orgId, 'cfdi'); if (subscriptionDenied) return subscriptionDenied;
    const limitado = strictLimitResponse(await strictRateLimit(`nfe-inutilizacao:${orgId}`, 10, 600));
    if (limitado) return limitado;
    const ctx = await contexto(orgId);
    if (ctx instanceof Response) return ctx;
    let body: Record<string, unknown>;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
    const inicio = Number(body?.inicio);
    const fim = Number(body?.fim ?? body?.inicio);
    const justificativa = String(body?.justificativa ?? '');
    const entorno = railConfig('nfe').entorno;
    let r;
    try {
        r = await inutilizarFaixa(orgId, entorno, ctx.cnpj, { serie: ctx.serie, inicio, fim, justificativa, creadoPor: currentUserId() });
    } catch (error) {
        if (esErrorSeguro(error)) return json({ error: error.message }, 409);
        log.error('nfe: no se pudo inutilizar', { route: 'api/fiscal/nfe-inutilizacao', orgId, err: error });
        return json({ error: 'No pudimos pedir la inutilização a la SEFAZ en este momento. Reintenta en unos minutos.' }, 502);
    }
    if (r.estado !== 'rechazada') {
        await logAudit(orgId, {
            accion: r.estado === 'homologada' ? 'nfe.inutilizacao_homologada' : 'nfe.inutilizacao_incierta', entidad: 'org', entidad_id: orgId,
            detalle: `Serie ${ctx.serie}, números ${inicio} a ${fim}${r.nProt ? `, protocolo ${r.nProt}` : ''}`,
            ip: reqIp(request),
        });
    }
    const status = r.estado === 'homologada' ? 200 : r.estado === 'incierta' ? 202 : 409;
    return json({
        ok: r.estado === 'homologada', estado: r.estado, ...(r.mensaje ? { error: r.mensaje } : {}), ...(r.nProt ? { n_prot: r.nProt } : {}),
        sin_uso: await numerosSemUso(orgId, entorno, ctx.serie), historial: await historial(orgId, entorno),
    }, status);
};

import { beforeEach, describe, expect, it, vi } from 'vitest';

type Q = { text: string; values: unknown[] };

const m = vi.hoisted(() => ({
    queries: [] as { text: string; values: unknown[] }[],
    batches: [] as string[][],
    rows: new Map<RegExp, unknown[]>(),
    perm: vi.fn(),
    limit: vi.fn(),
    audit: vi.fn(),
    dispatch: vi.fn(),
    dispatchFrom: vi.fn(),
    reserve: vi.fn(),
    cancel: vi.fn(),
    entitlement: vi.fn(),
    emit: vi.fn(),
    anticipo: vi.fn(),
    notifySent: vi.fn(),
    track: vi.fn(),
    invalidate: vi.fn(),
}));

vi.mock('../src/lib/db', () => ({
    sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ text: strings.join('?'), values }),
    withOrgTx: async (_org: string, ...qs: Q[]) => (m.batches.push(qs.map((q) => q.text.trim())), qs).map((q) => {
        m.queries.push(q);
        for (const [re, rows] of m.rows) if (re.test(q.text)) return rows;
        return [];
    }),
    getActiveOrgId: async () => 'org-a',
    logAudit: m.audit,
    reqIp: () => '127.0.0.1',
}));
vi.mock('../src/lib/queries', () => ({ requirePerm: m.perm, invalidateMoneyCaches: m.invalidate }));
vi.mock('../src/lib/ratelimit', () => ({
    strictRateLimit: m.limit,
    strictLimitResponse: (r: { ok: boolean }) => (r.ok ? null : new Response('{}', { status: 429 })),
}));
vi.mock('../src/lib/webhooks', () => ({ dispatchQuoteEvent: m.dispatch, dispatchQuoteEventFrom: m.dispatchFrom }));
vi.mock('../src/lib/after', () => ({ after: vi.fn() }));
vi.mock('../src/lib/billing', () => ({ reserveUsage: m.reserve, cancelUsage: m.cancel, flushUsageReservation: vi.fn() }));
vi.mock('../src/lib/org-entitlements', () => ({ requireEntitlement: m.entitlement }));
vi.mock('../src/lib/fiscal/emit', () => ({ emitFiscalDocument: m.emit }));
vi.mock('../src/lib/cotizaciones', () => ({
    MAX_ITEMS: 200,
    QuoteError: class extends Error { status = 400; },
    assertClienteDeOrg: async () => {},
    productosDeOrg: async () => new Set<string>(),
}));
vi.mock('../src/lib/cobros', () => ({ materializeAnticipoCobros: m.anticipo }));
vi.mock('../src/lib/impuestos-db', () => ({
    taxCatalogFor: async () => ({ resolve: () => 0.16, defaultRate: 0.16, retenciones: [] }),
    TaxCatalogUnavailableError: class extends Error {},
}));
vi.mock('../src/lib/posthog-server', () => ({ trackServer: m.track }));
vi.mock('../src/lib/fx/FXService', () => ({ FXService: { getExchangeRate: vi.fn() }, FXUnavailableError: class extends Error {} }));
vi.mock('../src/lib/email', () => ({ notifyQuoteSent: m.notifySent }));
vi.mock('../src/lib/log', () => ({ log: { error: vi.fn() } }));

const { PATCH, DELETE } = await import('../src/pages/api/cotizaciones/[id]');

const patch = (body: Record<string, unknown>) =>
    PATCH({
        params: { id: 'cot-1' },
        request: new Request('https://cord.test/api/cotizaciones/cot-1', { method: 'PATCH', body: JSON.stringify(body) }),
    } as any) as Promise<Response>;

const del = () => DELETE({ params: { id: 'cot-1' } } as any) as Promise<Response>;

const withStatus = (status: string) => m.rows.set(/select id, status, version/, [{ id: 'cot-1', status, version: 1, base_currency: 'MXN', fiscal_currency: 'MXN', fx_rate: 1 }]);
const ran = (re: RegExp) => m.queries.some((q) => re.test(q.text));
const statusUpdate = /update cotizaciones set status/;
const approvalUpdate = /with upd as/;

beforeEach(() => {
    vi.clearAllMocks();
    m.queries.length = 0;
    m.batches.length = 0;
    m.rows.clear();
    m.perm.mockResolvedValue(null);
    m.limit.mockResolvedValue({ ok: true });
    m.entitlement.mockResolvedValue(null);
    m.reserve.mockResolvedValue({ ok: true });
    m.notifySent.mockResolvedValue({ sent: false });
    m.rows.set(/select c.total, c.base_currency, c.version/, [{ total: 100, base_currency: 'MXN', version: 1, is_sandbox: false, is_demo: false }]);
    m.rows.set(statusUpdate, [{ id: 'cot-1' }]);
    m.rows.set(approvalUpdate, [{ cotizacion_id: 'cot-1' }]);
});

describe('carreras', () => {
    it.each(['approve', 'reject'])('%s condiciona el cambio al estado esperado', async (action) => {
        withStatus('sent');
        await patch({ action });
        const upd = m.queries.find((q) => statusUpdate.test(q.text));
        expect(upd?.text).toMatch(/and org_id = \? and status = any\(\?::text\[\]\) returning id/);
        expect(upd?.values).toEqual(expect.arrayContaining(['cot-1', 'org-a', ['sent', 'viewed']]));
    });

    it('si otra petición ya movió la cotización responde 409 sin eventos ni correo', async () => {
        withStatus('viewed');
        m.rows.set(statusUpdate, []);
        const res = await patch({ action: 'approve' });
        expect(res.status).toBe(409);
        expect(m.anticipo).not.toHaveBeenCalled();
        expect(ran(/insert into eventos/)).toBe(false);
        expect(m.dispatch).not.toHaveBeenCalled();
        expect(m.audit).not.toHaveBeenCalled();
    });

    it('un envío que pierde la carrera libera el cupo reservado', async () => {
        withStatus('draft');
        m.reserve.mockResolvedValue({ ok: true, id: 'res-1' });
        m.rows.set(statusUpdate, []);
        expect((await patch({ action: 'send' })).status).toBe(409);
        expect(m.cancel).toHaveBeenCalledWith('org-a', 'res-1');
        expect(m.notifySent).not.toHaveBeenCalled();
    });

    it('marcar pagada dos veces no cancela cobros en la segunda', async () => {
        withStatus('approved');
        m.rows.set(statusUpdate, []);
        expect((await patch({ action: 'paid' })).status).toBe(409);
        expect(ran(/update cotizacion_cobros/)).toBe(false);
    });

    it('una solicitud de aprobación ya decidida responde 409', async () => {
        m.rows.set(/select c.id, c.folio, c.aprob_estado/, [{ id: 'cot-1', folio: 'COT-1', aprob_estado: 'pendiente', total: 100, base_currency: 'MXN' }]);
        m.rows.set(approvalUpdate, []);
        expect((await patch({ action: 'approve_request' })).status).toBe(409);
        expect(m.dispatch).not.toHaveBeenCalled();
    });

    it('editar líneas escribe encabezado, líneas y versión en una sola transacción', async () => {
        withStatus('draft');
        const res = await patch({ action: 'update_draft', items: [{ descripcion: 'a', cantidad: 1, precio_unitario: 1 }, { descripcion: 'b', cantidad: 1, precio_unitario: 1 }] });
        expect(res.status).toBe(200);
        const batch = m.batches.find((b) => b.length > 1) ?? [];
        expect(batch).toEqual([
            expect.stringMatching(/^update cotizaciones set\s+cliente_id/),
            expect.stringMatching(/^delete from cotizacion_items/),
            expect.stringMatching(/^insert into cotizacion_items/),
            expect.stringMatching(/^insert into cotizacion_items/),
            expect.stringMatching(/^update cotizacion_versiones/),
        ]);
    });
});

describe('guardas previas', () => {
    it('aprobar y rechazar exigen el permiso aprobar; el resto, cotizar', async () => {
        withStatus('sent');
        await patch({ action: 'approve' });
        await patch({ action: 'reject' });
        await patch({ action: 'send' });
        expect(m.perm.mock.calls.map((c) => c[0])).toEqual(['aprobar', 'aprobar', 'cotizar']);
    });

    it('sin permiso responde 403 y no toca la base', async () => {
        m.perm.mockResolvedValue(new Response('{}', { status: 403 }));
        withStatus('sent');
        expect((await patch({ action: 'approve' })).status).toBe(403);
        expect(m.queries).toHaveLength(0);
    });

    it('con el límite agotado responde 429 y no toca la base', async () => {
        m.limit.mockResolvedValue({ ok: false });
        expect((await patch({ action: 'send' })).status).toBe(429);
        expect(m.limit).toHaveBeenCalledWith('cotizacion-patch:org-a', 120, 60);
        expect(m.queries).toHaveLength(0);
    });

    it('acción desconocida responde 400', async () => {
        expect((await patch({ action: 'borrar_todo' })).status).toBe(400);
    });

    it('cotización de otra org o inexistente responde 404', async () => {
        expect((await patch({ action: 'send' })).status).toBe(404);
        expect(m.queries[0].values).toEqual(['cot-1', 'org-a']);
    });

    it.each([
        ['approve', 'draft'], ['reject', 'paid'], ['send', 'sent'], ['paid', 'sent'], ['invoiced', 'draft'], ['resend', 'draft'],
    ])('%s desde %s responde 409 sin cambiar estado', async (action, status) => {
        withStatus(status);
        expect((await patch({ action })).status).toBe(409);
        expect(ran(statusUpdate)).toBe(false);
        expect(m.dispatch).not.toHaveBeenCalled();
    });
});

describe('send', () => {
    it('reserva un envío, marca sent, registra, emite quote.sent y avisa al cliente', async () => {
        withStatus('draft');
        const res = await patch({ action: 'send' });
        expect(res.status).toBe(200);
        expect(await res.json()).toMatchObject({ ok: true, status: 'sent' });
        expect(m.reserve).toHaveBeenCalledWith('org-a', 'envios', 1);
        expect(ran(/update cotizaciones set status = 'sent'/)).toBe(true);
        expect(ran(/insert into eventos/)).toBe(true);
        expect(m.audit).toHaveBeenCalledWith('org-a', expect.objectContaining({ accion: 'cotizacion.send', detalle: 'draft → sent' }));
        expect(m.dispatch).toHaveBeenCalledWith('org-a', 'cot-1', 'quote.sent');
        expect(m.notifySent).toHaveBeenCalledWith('org-a', 'cot-1', 'https://cord.test');
        expect(m.track).toHaveBeenCalledWith('quote_sent', 'org-a', expect.objectContaining({ event_id: 'cot-1:initial', send_type: 'initial' }), false, false);
        expect(m.invalidate).toHaveBeenCalledWith('org-a');
    });

    it('sin cupo de envíos responde 402 y no cambia estado', async () => {
        withStatus('draft');
        m.reserve.mockResolvedValue({ ok: false, reason: 'Llegaste al límite de tu plan' });
        const res = await patch({ action: 'send' });
        expect(res.status).toBe(402);
        expect(await res.json()).toMatchObject({ code: 'plan_limit_reached' });
        expect(ran(statusUpdate)).toBe(false);
        expect(m.dispatch).not.toHaveBeenCalled();
    });

    it('si el cupo no se puede verificar responde 503', async () => {
        withStatus('draft');
        m.reserve.mockResolvedValue({ ok: false, reason: 'No pudimos verificar tu uso' });
        expect((await patch({ action: 'send' })).status).toBe(503);
        expect(ran(statusUpdate)).toBe(false);
    });

    it('resend no consume cupo y emite quote.updated', async () => {
        withStatus('viewed');
        expect((await patch({ action: 'resend' })).status).toBe(200);
        expect(m.reserve).not.toHaveBeenCalled();
        expect(m.dispatch).toHaveBeenCalledWith('org-a', 'cot-1', 'quote.updated');
        expect(m.track).toHaveBeenCalledWith('quote_sent', 'org-a', expect.objectContaining({ send_type: 'resend' }), false, false);
    });
});

describe('approve, reject y paid', () => {
    it('approve materializa anticipos y emite quote.approved', async () => {
        withStatus('viewed');
        expect((await patch({ action: 'approve' })).status).toBe(200);
        expect(ran(/update cotizaciones set status = 'approved'/)).toBe(true);
        expect(m.anticipo).toHaveBeenCalledWith('cot-1', 'org-a');
        expect(m.dispatch).toHaveBeenCalledWith('org-a', 'cot-1', 'quote.approved');
        expect(m.notifySent).not.toHaveBeenCalled();
    });

    it('reject emite quote.rejected', async () => {
        withStatus('sent');
        expect((await patch({ action: 'reject' })).status).toBe(200);
        expect(m.dispatch).toHaveBeenCalledWith('org-a', 'cot-1', 'quote.rejected');
    });

    it('paid cancela cobros pendientes y emite quote.paid', async () => {
        withStatus('approved');
        expect((await patch({ action: 'paid' })).status).toBe(200);
        const upd = m.queries.find((q) => /update cotizaciones set status = 'paid'/.test(q.text));
        expect(upd?.values).toContain('transferencia');
        expect(ran(/update cotizacion_cobros set status = 'cancelado'/)).toBe(true);
        expect(m.dispatch).toHaveBeenCalledWith('org-a', 'cot-1', 'quote.paid');
    });
});

describe('invoiced', () => {
    beforeEach(() => {
        withStatus('approved');
        m.rows.set(/select upper\(coalesce\(country_code/, [{ country_code: 'MX' }]);
        m.rows.set(/select count\(\*\)::int as n/, [{ n: 1 }]);
    });

    it('sin entitlement no emite ni cambia estado', async () => {
        m.entitlement.mockResolvedValue(new Response('{}', { status: 402 }));
        expect((await patch({ action: 'invoiced' })).status).toBe(402);
        expect(m.emit).not.toHaveBeenCalled();
        expect(ran(statusUpdate)).toBe(false);
    });

    it('si el emisor falla no marca invoiced', async () => {
        m.emit.mockResolvedValue({ emitted: false, error: 'PAC caído', httpStatus: 502 });
        expect((await patch({ action: 'invoiced' })).status).toBe(502);
        expect(ran(/update cotizaciones set status = \?/)).toBe(false);
        expect(m.dispatch).not.toHaveBeenCalled();
    });

    it('CFDI emitido emite invoice.stamped', async () => {
        m.emit.mockResolvedValue({ emitted: true, billable: true });
        expect((await patch({ action: 'invoiced' })).status).toBe(200);
        expect(m.entitlement).toHaveBeenCalledWith('org-a', 'international_invoicing');
        expect(m.dispatch).toHaveBeenCalledWith('org-a', 'cot-1', 'invoice.stamped');
    });

    it('factura comercial emite invoice.issued', async () => {
        m.emit.mockResolvedValue({ emitted: true, billable: false, invoiceNumber: 'F-1' });
        expect((await patch({ action: 'invoiced' })).status).toBe(200);
        expect(m.dispatch).toHaveBeenCalledWith('org-a', 'cot-1', 'invoice.issued');
    });
});

describe('solicitud de aprobación interna', () => {
    const pending = (aprob_estado: string | null) =>
        m.rows.set(/select c.id, c.folio, c.aprob_estado/, [{ id: 'cot-1', folio: 'COT-1', aprob_estado, total: 100, base_currency: 'MXN', is_sandbox: false, is_demo: false }]);

    it('exige el entitlement approvals', async () => {
        m.entitlement.mockResolvedValue(new Response('{}', { status: 402 }));
        expect((await patch({ action: 'approve_request' })).status).toBe(402);
        expect(m.entitlement).toHaveBeenCalledWith('org-a', 'approvals');
    });

    it('sin solicitud pendiente responde 409', async () => {
        pending(null);
        expect((await patch({ action: 'approve_request' })).status).toBe(409);
        expect(m.dispatch).not.toHaveBeenCalled();
    });

    it('aprobar la solicitud envía la cotización', async () => {
        pending('pendiente');
        const res = await patch({ action: 'approve_request' });
        expect(await res.json()).toMatchObject({ ok: true, status: 'sent' });
        expect(m.dispatch).toHaveBeenCalledWith('org-a', 'cot-1', 'quote.sent');
    });

    it('rechazar la solicitud la deja en borrador sin evento público', async () => {
        pending('pendiente');
        expect(await (await patch({ action: 'reject_request' })).json()).toMatchObject({ ok: true, status: 'draft' });
        expect(m.dispatch).not.toHaveBeenCalled();
    });
});

describe('errores', () => {
    it('un error inesperado no expone el mensaje crudo', async () => {
        withStatus('approved');
        m.anticipo.mockRejectedValue(new Error('ignorado'));
        m.dispatch.mockImplementation(() => { throw new Error('pi_123 secret leak'); });
        const res = await patch({ action: 'paid' });
        expect(res.status).toBe(500);
        expect(await res.text()).not.toContain('pi_123');
    });
});

describe('DELETE', () => {
    it('solo borra borradores y emite quote.deleted', async () => {
        const before = { id: 'cot-1', folio: 'COT-1', status: 'draft', total: 0, public_token: 't', empresa: null };
        m.rows.set(/select c.id, c.folio, c.status/, [before]);
        m.rows.set(/delete from cotizaciones/, [{ id: 'cot-1' }]);
        expect((await del()).status).toBe(200);
        expect(m.dispatchFrom).toHaveBeenCalledWith('org-a', 'quote.deleted', before);
    });

    it('una cotización enviada responde 409', async () => {
        expect((await del()).status).toBe(409);
        expect(m.dispatchFrom).not.toHaveBeenCalled();
    });
});

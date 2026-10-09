import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ cancel: vi.fn(), event: vi.fn(), audit: vi.fn(), invalidate: vi.fn(), tx: vi.fn(), substitute: vi.fn(), perm: vi.fn() }));
vi.mock('../src/lib/db', () => ({
  getActiveOrgId: async () => 'org-a', withOrgTx: m.tx, sql: () => ({}), reqIp: () => '127.0.0.1', logAudit: m.audit,
}));
vi.mock('../src/lib/queries', () => ({ requirePerm: m.perm, invalidateMoneyCaches: m.invalidate, getFacturaDetalle: vi.fn() }));
vi.mock('../src/lib/fiscal/sustitucion', () => ({ createSubstitutionDraft: m.substitute }));
vi.mock('../src/lib/fiscal/invoices', () => ({ voidInvoice: m.cancel }));
vi.mock('../src/lib/fiscal/payments', () => ({ applyPayment: vi.fn(), manualPaymentMethod: (v: unknown) => String(v ?? 'transferencia') }));
vi.mock('../src/lib/org-entitlements', () => ({ requireEntitlement: vi.fn() }));
vi.mock('../src/lib/billing', () => ({ cancelUsage: vi.fn(), flushUsageReservation: vi.fn(), reserveUsage: vi.fn() }));
vi.mock('../src/lib/webhooks', () => ({ dispatchInvoiceEvent: m.event }));
vi.mock('../src/lib/email', () => ({ notifyInvoiceIssued: vi.fn() }));
vi.mock('../src/lib/fiscal/timeline', () => ({ logInvoiceEvent: vi.fn() }));
vi.mock('../src/lib/fiscal/gate', () => ({ invoicingFeatureFor: vi.fn(), orgCountry: vi.fn() }));
vi.mock('../src/lib/context', () => ({ currentUserId: () => 'user-a' }));
vi.mock('../src/lib/after', () => ({ after: vi.fn() }));
vi.mock('../src/lib/ratelimit', () => ({ strictRateLimit: async () => ({ ok: true }), strictLimitResponse: () => null }));
import { PATCH } from '../src/pages/api/facturas/[id]';
const DOC = '11111111-1111-4111-8111-111111111111';
const call = (action = 'void', extra: Record<string, unknown> = {}) => PATCH({ params: { id: DOC }, request: new Request(`https://cord.test/api/facturas/${DOC}`, { method: 'PATCH', body: JSON.stringify({ action, ...extra }) }) } as any);
beforeEach(() => {
  vi.clearAllMocks();
  m.tx.mockResolvedValue([[{ id: 'doc-a' }]]);
  m.perm.mockResolvedValue(null);
});
it('responde 202 pendiente sin publicar invoice.voided', async () => {
  m.cancel.mockResolvedValue({ ok: true, pending: true, cancellationStatus: 'pending' });
  const res = await call(); expect(res.status).toBe(202);
  expect(await res.json()).toMatchObject({ pending: true, cancellation_status: 'pending' });
  expect(m.event).not.toHaveBeenCalled();
  expect(m.audit).toHaveBeenCalledWith('org-a', expect.objectContaining({ accion: 'factura.cancelacion_pendiente' }));
});
it('consulta sin solicitar otro DELETE y publica solo la confirmación', async () => {
  m.cancel.mockResolvedValue({ ok: true, cancellationStatus: 'accepted' });
  expect((await call('cancellation_status')).status).toBe(200);
  expect(m.cancel).toHaveBeenCalledWith('org-a', DOC, undefined, true);
  expect(m.event).toHaveBeenCalledWith('org-a', DOC, 'invoice.voided');
});
it('un rechazo actualiza la vista sin publicar anulación', async () => {
  m.cancel.mockResolvedValue({ ok: false, cancellationStatus: 'rejected', error: 'Rechazada' });
  const res = await call('cancellation_status'); expect(res.status).toBe(409);
  expect(await res.json()).toMatchObject({ cancellation_status: 'rejected' });
  expect(m.invalidate).toHaveBeenCalledWith('org-a'); expect(m.event).not.toHaveBeenCalled();
});
it('no vuelve a publicar la anulación al consultar una factura ya anulada', async () => {
  m.cancel.mockResolvedValue({ ok: true, reused: true, cancellationStatus: 'accepted' });
  expect((await call('cancellation_status')).status).toBe(200); expect(m.event).not.toHaveBeenCalled();
});

// México: el CFDI vigente se cancela con la clave del motivo del SAT.
const cfdiVigente = (extra = {}) => [[{ id: 'doc-a', status: 'issued', lifecycle: 'open', country_code: 'MX', document_type: 'cfdi_40', provider: 'facturapi', ...extra }]];
it('un CFDI vigente sin motivo del SAT responde 400 sin tocar al proveedor', async () => {
  m.tx.mockResolvedValue(cfdiVigente());
  const res = await call('void');
  expect(res.status).toBe(400);
  expect((await res.json()).error).toMatch(/motivo/);
  expect(m.cancel).not.toHaveBeenCalled();
});
it('con la clave del motivo la pasa tal cual', async () => {
  m.tx.mockResolvedValue(cfdiVigente());
  m.cancel.mockResolvedValue({ ok: true, cancellationStatus: 'accepted' });
  expect((await call('void', { motivo: '03' })).status).toBe(200);
  expect(m.cancel).toHaveBeenCalledWith('org-a', DOC, '03', false);
});
it('un CFDI ya sustituido no pide motivo: es el 01', async () => {
  m.tx.mockResolvedValue(cfdiVigente({ sustituida_por: 'doc-b' }));
  m.cancel.mockResolvedValue({ ok: true, pending: true, cancellationStatus: 'pending' });
  expect((await call('void')).status).toBe(202);
  expect(m.cancel).toHaveBeenCalledWith('org-a', DOC, undefined, false);
});
it('una proforma se anula sin motivo del SAT', async () => {
  m.tx.mockResolvedValue(cfdiVigente({ document_type: 'proforma' }));
  m.cancel.mockResolvedValue({ ok: true, cancellationStatus: 'accepted' });
  expect((await call('void')).status).toBe(200);
});
it('sustituir pide cobranza y responde el borrador; si ya existe, su id para continuar', async () => {
  m.substitute.mockResolvedValueOnce({ ok: true, documentId: 'doc-b' });
  const ok = await call('substitute');
  expect(ok.status).toBe(200);
  expect(await ok.json()).toEqual({ ok: true, id: 'doc-b' });
  expect(m.perm).toHaveBeenCalledWith('cobranza');
  m.substitute.mockResolvedValueOnce({ ok: false, error: 'Esta factura ya tiene un borrador que la sustituye.', documentId: 'doc-b' });
  const dup = await call('substitute');
  expect(dup.status).toBe(409);
  expect(await dup.json()).toMatchObject({ id: 'doc-b' });
});
it('emitir un sustituto también pide cobranza', async () => {
  m.tx.mockResolvedValue([[{ id: 'doc-a', status: 'pending', lifecycle: 'draft', sustituye_a: 'orig-a' }]]);
  m.perm.mockImplementation(async (perm: string) => perm === 'cobranza' ? new Response('{}', { status: 403 }) : null);
  expect((await call('finalize')).status).toBe(403);
});

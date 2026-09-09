import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ cancel: vi.fn(), event: vi.fn(), audit: vi.fn(), invalidate: vi.fn() }));
vi.mock('../src/lib/db', () => ({
  getActiveOrgId: async () => 'org-a', withOrgTx: async () => [[{ id: 'doc-a' }]], sql: () => ({}), reqIp: () => '127.0.0.1', logAudit: m.audit,
}));
vi.mock('../src/lib/queries', () => ({ requirePerm: async () => null, invalidateMoneyCaches: m.invalidate, getFacturaDetalle: vi.fn() }));
vi.mock('../src/lib/fiscal/invoices', () => ({ voidInvoice: m.cancel }));
vi.mock('../src/lib/fiscal/payments', () => ({ applyPayment: vi.fn() }));
vi.mock('../src/lib/org-entitlements', () => ({ requireEntitlement: vi.fn() }));
vi.mock('../src/lib/billing', () => ({ cancelUsage: vi.fn(), flushUsageReservation: vi.fn(), reserveUsage: vi.fn() }));
vi.mock('../src/lib/webhooks', () => ({ dispatchInvoiceEvent: m.event }));
vi.mock('../src/lib/email', () => ({ notifyInvoiceIssued: vi.fn() }));
vi.mock('../src/lib/fiscal/timeline', () => ({ logInvoiceEvent: vi.fn() }));
vi.mock('../src/lib/fiscal/gate', () => ({ invoicingFeatureFor: vi.fn(), orgCountry: vi.fn() }));
vi.mock('../src/lib/context', () => ({ currentUserId: () => 'user-a' }));
vi.mock('../src/lib/after', () => ({ after: vi.fn() }));
import { PATCH } from '../src/pages/api/facturas/[id]';
const call = (action = 'void') => PATCH({ params: { id: 'doc-a' }, request: new Request('https://cord.test/api/facturas/doc-a', { method: 'PATCH', body: JSON.stringify({ action }) }) } as any);
beforeEach(() => vi.clearAllMocks());
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
  expect(m.cancel).toHaveBeenCalledWith('org-a', 'doc-a', undefined, true);
  expect(m.event).toHaveBeenCalledWith('org-a', 'doc-a', 'invoice.voided');
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

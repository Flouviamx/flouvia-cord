vi.mock('../src/lib/fiscal/issuance-usage', () => ({ meterInvoiceEmission: (_org: string, _id: string, emit: () => unknown) => emit() }));
vi.mock('../src/lib/org-entitlements', () => ({ getEffectivePlan: async () => 'starter' }));
import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ tx: vi.fn(), cancel: vi.fn(), issue: vi.fn(), event: vi.fn() }));
vi.mock('../src/lib/db', () => ({ withOrgTx: m.tx, sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ text: strings.join('?'), values }) }));
vi.mock('../src/lib/crypto-secret', () => ({ decryptSecret: () => undefined }));
vi.mock('../src/lib/fiscal/timeline', () => ({ logInvoiceEvent: m.event }));
vi.mock('../src/lib/fiscal/FiscalFactory', () => ({ FiscalFactory: { getProvider: () => ({ cancelDocument: m.cancel, issueDocument: m.issue }) } }));
vi.mock('../src/lib/fiscal/emit', () => ({
  cleanPrefix: (p: string, fallback: string) => p || fallback, documentTypeFor: () => 'cfdi_40', isBillableCfdi: () => true,
  metadata: (data: unknown) => data || {}, money: (n: number) => Math.round(n * 100) / 100, newInvoiceToken: () => 'token-new',
}));
vi.mock('../src/lib/impuestos-db', () => ({ taxCatalogFor: vi.fn(), TaxCatalogUnavailableError: class extends Error {} }));
import { voidInvoice, createCreditNote, finalizeInvoice, updateInvoiceDraft } from '../src/lib/fiscal/invoices';
const doc = (extra = {}) => ({ id: 'doc-a', lifecycle: 'open', status: 'issued', amount_paid: 0, country_code: 'MX',
  provider_document_id: 'provider-a', provider_data: {}, facturapi_live_key: 'sk_test_org', ...extra });
beforeEach(() => { vi.clearAllMocks(); m.tx.mockReset(); m.tx.mockResolvedValue([[]]); });
const writes = () => m.tx.mock.calls.slice(1).flatMap((call) => call.slice(1));

describe('persistencia de cancelaciones', () => {
  it.each(['pending', 'verifying'])('no anula ni registra evento void cuando está %s', async (status) => {
    m.tx.mockResolvedValueOnce([[doc()]]); m.cancel.mockResolvedValue({ success: true, status });
    expect(await voidInvoice('org-a', 'doc-a')).toMatchObject({ ok: true, pending: true, cancellationStatus: status });
    expect(writes().every((q: any) => !q.text.includes("lifecycle = 'void'"))).toBe(true);
    expect(m.event).not.toHaveBeenCalled();
    expect(m.tx.mock.calls.every(([org]) => org === 'org-a')).toBe(true);
  });
  it('persiste accepted y el evento solo al confirmar', async () => {
    m.tx.mockResolvedValueOnce([[doc()]]); m.cancel.mockResolvedValue({ success: true, status: 'accepted' });
    expect(await voidInvoice('org-a', 'doc-a', undefined, true)).toMatchObject({ ok: true, cancellationStatus: 'accepted' });
    expect(writes()[0].text).toContain("lifecycle = 'void'");
    expect(m.cancel).toHaveBeenCalledWith('provider-a', expect.objectContaining({ orgId: 'org-a', checkOnly: true, providerApiKey: 'sk_test_org' }));
    expect(m.event).toHaveBeenCalledWith('org-a', 'doc-a', 'void', 'Anulada');
  });
  it.each(['rejected', 'expired', 'unknown'])('conserva la factura vigente con %s', async (status) => {
    m.tx.mockResolvedValueOnce([[doc()]]); m.cancel.mockResolvedValue({ success: status !== 'unknown', status });
    expect(await voidInvoice('org-a', 'doc-a', undefined, true)).toMatchObject({ ok: false, cancellationStatus: status });
    expect(writes()[0].text).not.toContain("lifecycle = 'void'"); expect(m.event).not.toHaveBeenCalled();
  });
  it('rechaza un éxito MX sin estado confirmado', async () => {
    m.tx.mockResolvedValueOnce([[doc()]]); m.cancel.mockResolvedValue({ success: true });
    expect((await voidInvoice('org-a', 'doc-a')).ok).toBe(false); expect(m.event).not.toHaveBeenCalled();
  });
  it('respeta la cuenta original de emisión', async () => {
    m.tx.mockResolvedValueOnce([[doc({ provider_data: { credential_scope: 'platform' } })]]);
    m.cancel.mockResolvedValue({ success: true, status: 'pending' }); await voidInvoice('org-a', 'doc-a');
    expect(m.cancel).toHaveBeenCalledWith('provider-a', expect.objectContaining({ providerApiKey: undefined }));
  });
  it('no cancela con otra cuenta si falta la llave del emisor', async () => {
    m.tx.mockResolvedValueOnce([[doc({ facturapi_live_key: null, provider_data: { credential_scope: 'organization' } })]]);
    expect((await voidInvoice('org-a', 'doc-a')).ok).toBe(false); expect(m.cancel).not.toHaveBeenCalled();
  });
  it('no descarta localmente una emisión cuyo resultado se desconoce', async () => {
    m.tx.mockResolvedValueOnce([[doc({ lifecycle: 'draft', status: 'error', provider_document_id: 'err_mx_a', provider_data: { delivery_uncertain: true } })]]);
    expect((await voidInvoice('org-a', 'doc-a')).ok).toBe(false); expect(m.tx).toHaveBeenCalledTimes(1);
  });
  it('consultar un documento de otro país no inicia una anulación', async () => {
    m.tx.mockResolvedValueOnce([[doc({ country_code: 'ES' })]]);
    expect((await voidInvoice('org-a', 'doc-a', undefined, true)).ok).toBe(false); expect(m.cancel).not.toHaveBeenCalled();
  });
  it('la cancelación comercial existente conserva su contrato', async () => {
    m.tx.mockResolvedValueOnce([[doc({ country_code: 'US', document_type: 'commercial_invoice' })]]); m.cancel.mockResolvedValue({ success: true });
    expect((await voidInvoice('org-a', 'doc-a')).ok).toBe(true);
  });
});

describe('nota de crédito desde su creación hasta la emisión', () => {
  const original = () => doc({ total: 104, subtotal: 100, tax_total: 16, retencion_total: 12, currency: 'MXN', ledger_currency: 'MXN', fx_rate: 1,
    issuer_snapshot: {}, recipient_snapshot: {}, line_items_snapshot: [{ description: 'Servicio', quantity: 1, unitPrice: 100, subtotal: 100, taxAmount: 16, taxRate: .16, total: 116 }],
    retenciones_snapshot: [{ nombre: 'ISR', tipo: 'ret_isr', tasa: .12, base: 100, monto: 12 }],
  });
  it('guarda retenciones y saldo cero en el nuevo egreso', async () => {
    m.tx.mockResolvedValueOnce([[original()]]).mockResolvedValueOnce([[{ id: 'doc-a' }], [{ id: 'note-a', public_token: 'note-token' }]]);
    expect(await createCreditNote('org-a', 'doc-a', { monto: 52 })).toMatchObject({ ok: true, documentId: 'note-a' });
    const q = writes().find((q: any) => q.text.includes('insert into documentos_fiscales')); expect(q.text).toContain('retenciones_snapshot, retencion_total');
    expect(q.text).toContain("'draft', ?, 0, 0, ?"); expect(q.values).toContain('cfdi_egreso');
    expect(q.values.some((v: unknown) => typeof v === 'string' && v.includes('"monto":6'))).toBe(true);
  });
  it('bloquea el editor de ingreso para una nota de crédito', async () => {
    m.tx.mockResolvedValueOnce([[doc({ lifecycle: 'draft', invoice_number: null, credit_note_of: 'original' })]]);
    const result = await updateInvoiceDraft('org-a', 'doc-a', { clienteId: 'client-a', items: [{ descripcion: 'Otro', cantidad: 1, precioUnitario: 10 }] });
    expect(result.ok).toBe(false); expect(m.tx).toHaveBeenCalledTimes(1);
  });
  it('envía el UUID relacionado leído dentro de la organización', async () => {
    const uuid = '39c85a3f-275b-4341-b259-e8971d9f8a94';
    m.tx.mockResolvedValueOnce([[{ ...original(), status: 'pending', lifecycle: 'draft', doc_country: 'MX', document_type: 'cfdi_egreso', credit_note_of: 'original', original_fiscal_id: uuid, original_status: 'issued', invoice_number: null }]])
      .mockResolvedValueOnce([[{ id: 'original' }], [{ id: 'original' }]])
      .mockResolvedValueOnce([[], [{ invoice_number: 'NC-1' }]]).mockResolvedValueOnce([[]]).mockResolvedValueOnce([[], [{}]]);
    m.issue.mockResolvedValue({ success: true, provider: 'facturapi', documentId: 'provider-note', fiscalId: uuid });
    expect((await finalizeInvoice('org-a', 'note-a')).emitted).toBe(true);
    expect(m.issue).toHaveBeenCalledWith(expect.objectContaining({ documentType: 'cfdi_egreso', relatedFiscalId: uuid, totals: expect.objectContaining({ retencionTotal: 12 }) }));
    expect(m.tx.mock.calls[0][1].text).toContain('original.org_id = d.org_id');
    expect(writes().some((q: any) => q.text.includes('when credit_note_of is not null then 0'))).toBe(true);
  });
});

it('rechaza pagos manuales contra una nota de crédito', async () => {
  m.tx.mockResolvedValueOnce([[doc({ credit_note_of: 'original', document_type: 'cfdi_egreso', total: 100, currency: 'MXN' })]]);
  const { applyPayment } = await import('../src/lib/fiscal/payments');
  expect(await applyPayment('org-a', 'doc-a', { monto: 100, currency: 'MXN' })).toMatchObject({ ok: false });
  expect(m.tx).toHaveBeenCalledTimes(1);
});

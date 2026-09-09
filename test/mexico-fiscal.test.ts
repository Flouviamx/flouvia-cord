import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FiscalDocumentRequest } from '../src/lib/fiscal';
import { creditNoteBreakdown } from '../src/lib/fiscal/credit-note';

const uuid = '39c85a3f-275b-4341-b259-e8971d9f8a94';
const line = (rate = .16, base = 100) => ({ description: 'Servicio', quantity: 1, unitPrice: base, taxRate: rate, subtotal: base, taxAmount: base * rate, total: Math.round(base * (1 + rate) * 100) / 100 });
const fixture = (): FiscalDocumentRequest => ({
  documentId: 'doc-a', invoiceNumber: 'F-1', idempotencyKey: 'invoice:doc-a:v1', orgId: 'org-a', quoteId: 'doc-a', countryCode: 'MX',
  issuer: { legalName: 'Emisor' }, recipient: { legalName: 'Receptor', taxId: 'AAA010101AAA' },
  lines: [line()], totals: { subtotal: 100, taxes: 16, total: 116, currency: 'MXN' },
  issuedAt: '2026-09-05', providerApiKey: 'sk_test_org_fixture',
});
let fetchMock: ReturnType<typeof vi.fn>;
const result = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const invoice = (status = 'valid', cancellation_status = 'none') => ({ id: 'invoice-a', uuid, status, cancellation_status });
async function provider() { return new (await import('../src/lib/fiscal/providers/MexicoSatProvider')).MexicoSatProvider(); }
beforeEach(() => {
  vi.resetModules(); vi.stubEnv('FACTURAPI_KEY', ''); vi.stubEnv('FACTURAPI_API_KEY', '');
  fetchMock = vi.fn().mockResolvedValue(result({ id: 'invoice-a', uuid, status: 'valid' })); vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const sent = () => JSON.parse(fetchMock.mock.calls[0][1].body);

describe('CFDI con snapshots fiscales explícitos', () => {
  it('envía las tasas de cada concepto, incluido Exento, sin IVA implícito', async () => {
    const req = fixture(); req.lines = [line(.16), line(.08), line(0)]; req.totals = { subtotal: 300, taxes: 24, total: 324, currency: 'MXN' };
    expect((await (await provider()).issueDocument(req)).success).toBe(true);
    expect(sent().items.map((i: any) => i.product.taxes[0])).toEqual([
      { type: 'IVA', rate: .16, factor: 'Tasa' }, { type: 'IVA', rate: .08, factor: 'Tasa' }, { type: 'IVA', rate: 0, factor: 'Exento' },
    ]);
    expect(sent().type).toBe('I');
  });
  it('transmite IVA e ISR retenidos con su tasa sobre la base', async () => {
    const req = fixture(); req.totals = { ...req.totals, total: 104.08, retencionTotal: 11.92, retenciones: [
      { nombre: 'IVA', tipo: 'ret_iva', tasa: .10667, base: 100, monto: 10.67 },
      { nombre: 'ISR', tipo: 'ret_isr', tasa: .0125, base: 100, monto: 1.25 },
    ] };
    expect((await (await provider()).issueDocument(req)).success).toBe(true);
    expect(sent().items[0].product.taxes.slice(1)).toEqual([
      { type: 'IVA', rate: .10667, withholding: true, factor: 'Tasa' }, { type: 'ISR', rate: .0125, withholding: true, factor: 'Tasa' },
    ]);
  });
  it('convierte una retención sobre impuesto sin aplicarla a las líneas exentas', async () => {
    const req = fixture(); req.lines.push(line(0)); req.totals = { subtotal: 200, taxes: 16, total: 208, currency: 'MXN', retencionTotal: 8,
      retenciones: [{ nombre: 'IVA', tipo: 'ret_iva', tasa: .5, base: 16, baseTipo: 'impuesto', monto: 8 }] };
    expect((await (await provider()).issueDocument(req)).success).toBe(true);
    expect(sent().items[0].product.taxes[1].rate).toBe(.08);
    expect(sent().items[1].product.taxes).toHaveLength(1);
  });
  it('recupera precisión unitaria del snapshot de base', async () => {
    const req = fixture(); req.lines = [{ ...line(), quantity: 3, unitPrice: 33.33 }];
    expect((await (await provider()).issueDocument(req)).success).toBe(true);
    expect(sent().items[0].product.price).toBe(33.333333);
  });
  it.each(['total', 'retention', 'tax'])('no envía un desglose inconsistente: %s', async (kind) => {
    const req = fixture();
    if (kind === 'total') req.totals.total = 999;
    if (kind === 'retention') req.totals.retencionTotal = 10;
    if (kind === 'tax') req.lines[0].taxAmount = 8;
    expect((await (await provider()).issueDocument(req)).success).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('emite egreso relacionado con el UUID original y uso G02', async () => {
    const req = fixture(); req.documentType = 'cfdi_egreso'; req.relatedFiscalId = uuid;
    expect((await (await provider()).issueDocument(req)).success).toBe(true);
    expect(sent()).toMatchObject({ type: 'E', use: 'G02', related_documents: [{ relationship: '01', documents: [uuid] }] });
  });
  it('no emite una nota real sin UUID original', async () => {
    const req = fixture(); req.documentType = 'cfdi_egreso';
    expect((await (await provider()).issueDocument(req)).success).toBe(false); expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('confirmación de cancelaciones ante el proveedor', () => {
  const options = { providerApiKey: 'sk_test_fixture' };
  it.each(['pending', 'verifying'])('conserva %s sin repetir DELETE', async (state) => {
    fetchMock.mockResolvedValue(result(invoice('valid', state)));
    expect(await (await provider()).cancelDocument('invoice-a', options)).toMatchObject({ success: true, status: state });
    expect(fetchMock).toHaveBeenCalledTimes(1); expect(fetchMock.mock.calls[0][1].method).toBe('GET');
  });
  it('un HTTP 200 pendiente nunca significa cancelación aceptada', async () => {
    fetchMock.mockResolvedValueOnce(result(invoice())).mockResolvedValueOnce(result(invoice('valid', 'pending')));
    expect(await (await provider()).cancelDocument('invoice-a', options)).toMatchObject({ success: true, status: 'pending' });
    expect(fetchMock.mock.calls[1][1].method).toBe('DELETE');
  });
  it('confirma accepted solo si el comprobante está canceled', async () => {
    fetchMock.mockResolvedValue(result(invoice('canceled', 'accepted')));
    expect(await (await provider()).cancelDocument('invoice-a', options)).toMatchObject({ success: true, status: 'accepted' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it.each(['rejected', 'expired', 'none'])('consultar %s nunca inicia una cancelación', async (state) => {
    fetchMock.mockResolvedValue(result(invoice('valid', state)));
    expect(await (await provider()).cancelDocument('invoice-a', { ...options, checkOnly: true })).toMatchObject({ status: state });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it.each([{}, invoice('valid', 'accepted'), { ...invoice('canceled', 'accepted'), id: 'another-document' }])('falla cerrada ante una respuesta inconsistente', async (payload) => {
    fetchMock.mockResolvedValue(result(payload));
    expect(await (await provider()).cancelDocument('invoice-a', options)).toMatchObject({ success: false, status: 'unknown' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('recupera una cancelación aceptada después de perder la conexión', async () => {
    fetchMock.mockResolvedValueOnce(result(invoice())).mockRejectedValueOnce(new Error('timeout'));
    const p = await provider(); expect(await p.cancelDocument('invoice-a', options)).toMatchObject({ success: false, status: 'unknown' });
    fetchMock.mockResolvedValueOnce(result(invoice('canceled', 'accepted')));
    expect(await p.cancelDocument('invoice-a', options)).toMatchObject({ success: true, status: 'accepted' });
    expect(fetchMock.mock.calls.map((c) => c[1].method)).toEqual(['GET', 'DELETE', 'GET']);
  });
  it('no transforma una credencial ausente en cancelación simulada', async () => {
    expect((await (await provider()).cancelDocument('invoice-a')).success).toBe(false); expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('prorrateo de notas de crédito', () => {
  const original = () => ({ total: 208, subtotal: 200, tax_total: 24, retencion_total: 16,
    line_items_snapshot: [line(.16), line(.08)],
    retenciones_snapshot: [{ nombre: 'ISR', tipo: 'ret_isr', tasa: .08, base: 200, baseTipo: 'subtotal', monto: 16 }],
  });
  it('conserva tasas mixtas y retenciones en una nota parcial', () => {
    const result = creditNoteBreakdown(original(), 104);
    expect(result).toMatchObject({ subtotal: 100, taxes: 12, retencionTotal: 8 });
    expect(result.lines.map((l) => l.taxRate)).toEqual([.16, .08]);
    expect(result.retenciones[0]).toMatchObject({ base: 100, monto: 8, tasa: .08 });
  });
  it('conserva todo el desglose en una nota total', () => {
    const result = creditNoteBreakdown(original(), 208);
    expect(result.lines).toEqual(original().line_items_snapshot);
    expect(result.retencionTotal).toBe(16);
  });
  it('no reconstruye una retención perdida como IVA negativo', () => {
    expect(() => creditNoteBreakdown({ ...original(), retenciones_snapshot: [] }, 104)).toThrow('incompleto');
  });
  it('rechaza un importe parcial que no cuadra a centavos', () => {
    expect(() => creditNoteBreakdown(original(), .01)).toThrow('redondear');
  });
});

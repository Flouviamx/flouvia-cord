// Sustitución de un CFDI (relación 04 + cancelación con motivo 01), motivo de
// cancelación del SAT y liberación de las ventas de una factura global.
// Fuentes: SAT, "Preguntas frecuentes y escenarios de cancelación 2026" y
// "Esquema de cancelación de CFDI"; Facturapi, DELETE /invoices/{id}
// (`motive`, `substitution`) y `related_documents` al crear.
vi.mock('../src/lib/fiscal/issuance-usage', () => ({ meterInvoiceEmission: (_org: string, _id: string, emit: () => unknown) => emit() }));
vi.mock('../src/lib/org-entitlements', () => ({ getEffectivePlan: async () => 'starter' }));
import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ tx: vi.fn(), cancel: vi.fn(), issue: vi.fn(), event: vi.fn(), preflight: vi.fn() }));
vi.mock('../src/lib/db', () => ({ withOrgTx: m.tx, sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ text: strings.join('?'), values }) }));
vi.mock('../src/lib/crypto-secret', () => ({ decryptSecret: () => undefined }));
vi.mock('../src/lib/fiscal/timeline', () => ({ logInvoiceEvent: m.event }));
vi.mock('../src/lib/fiscal/FiscalFactory', () => ({ FiscalFactory: { getProvider: () => ({ cancelDocument: m.cancel, issueDocument: m.issue }) } }));
vi.mock('../src/lib/fiscal/emit', () => ({
  cleanPrefix: (p: string, fallback: string) => p || fallback, documentTypeFor: () => 'cfdi_40', isBillableCfdi: () => true,
  metadata: (data: unknown) => data || {}, money: (n: number) => Math.round(n * 100) / 100, newInvoiceToken: () => 'token-new',
}));
vi.mock('../src/lib/impuestos-db', () => ({ taxCatalogFor: vi.fn(), TaxCatalogUnavailableError: class extends Error {} }));
// La función pura es la real; el chequeo previo (que lee la base) se controla aquí.
vi.mock('../src/lib/fiscal/sustitucion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/lib/fiscal/sustitucion')>()), substitutionPreflight: m.preflight,
}));
import { voidInvoice, finalizeInvoice } from '../src/lib/fiscal/invoices';
import { repsBloqueantes, substitutionBlocker } from '../src/lib/fiscal/sustitucion';

const UUID_ORIGINAL = '39c85a3f-275b-4341-b259-e8971d9f8a94';
const UUID_SUSTITUTO = '7a1d0c2e-9b4f-4e1a-8c3d-2f5b6a7e8d90';
const doc = (extra = {}) => ({ id: 'doc-a', lifecycle: 'open', status: 'issued', amount_paid: 0, country_code: 'MX',
  document_type: 'cfdi_40', provider: 'facturapi', provider_document_id: 'provider-a', provider_data: {},
  facturapi_live_key: 'sk_test_org', ...extra });
beforeEach(() => { vi.clearAllMocks(); m.tx.mockReset(); m.tx.mockResolvedValue([[]]); m.preflight.mockResolvedValue(null); });
const statements = () => m.tx.mock.calls.flatMap((call) => call.slice(1)) as Array<{ text: string; values: unknown[] }>;

describe('qué impide sustituir un CFDI', () => {
  const vigente = { country_code: 'MX', document_type: 'cfdi_40', status: 'issued', lifecycle: 'open', provider_data: {} };
  it('un CFDI de ingreso emitido y vigente se puede sustituir', () => {
    expect(substitutionBlocker(vigente)).toBeNull();
    expect(substitutionBlocker({ ...vigente, lifecycle: 'paid' })).toBeNull();
  });
  it('fuera de México, una proforma, una nota o una global no', () => {
    expect(substitutionBlocker({ ...vigente, country_code: 'ES' })).toMatch(/México/);
    expect(substitutionBlocker({ ...vigente, document_type: 'proforma' })).toMatch(/México/);
    expect(substitutionBlocker({ ...vigente, credit_note_of: 'x' })).toMatch(/nota de crédito/);
    expect(substitutionBlocker({ ...vigente, informacion_global: { periodicidad: '04' } })).toMatch(/global/);
  });
  it('ni un borrador, ni una anulada, ni una con cancelación en curso', () => {
    expect(substitutionBlocker({ ...vigente, status: 'pending' })).toMatch(/emitida/);
    expect(substitutionBlocker({ ...vigente, lifecycle: 'void' })).toMatch(/emitida/);
    expect(substitutionBlocker({ ...vigente, provider_data: { cancelacion: { status: 'pending' } } })).toMatch(/cancelación en curso/);
    // Un rechazo previo no impide intentarlo con un sustituto.
    expect(substitutionBlocker({ ...vigente, provider_data: { cancelacion: { status: 'rejected' } } })).toBeNull();
  });
  it('ya sustituida, salvo por el mismo sustituto que la está emitiendo', () => {
    expect(substitutionBlocker({ ...vigente, sustituida_por: 'doc-b' })).toMatch(/ya fue sustituida/);
    expect(substitutionBlocker({ ...vigente, sustituida_por: 'doc-b' }, 'doc-b')).toBeNull();
  });
  it('relacionados vigentes: notas de crédito y complementos de pago (No cancelable)', () => {
    expect(substitutionBlocker({ ...vigente, has_credit_notes: true })).toMatch(/notas de crédito/);
    expect(substitutionBlocker({ ...vigente, provider_data: { reps: { a: { status: 'issued' } } } })).toMatch(/complementos de pago/);
  });
  it('cuenta los complementos emitidos, en proceso o con entrega incierta', () => {
    expect(repsBloqueantes({ reps: {
      a: { status: 'issued' }, b: { status: 'pending' }, c: { status: 'error', delivery_uncertain: true },
      d: { status: 'error' }, e: { status: 'manual' },
    } })).toBe(3);
    expect(repsBloqueantes({})).toBe(0);
    expect(repsBloqueantes(null)).toBe(0);
  });
});

describe('motivo de cancelación del SAT', () => {
  it('el 04 solo aplica a una factura global', async () => {
    m.tx.mockResolvedValueOnce([[doc()]]);
    expect(await voidInvoice('org-a', 'doc-a', '04')).toMatchObject({ ok: false, error: expect.stringMatching(/motivo 04/) });
    expect(m.cancel).not.toHaveBeenCalled();
  });
  it('el 01 exige una factura que la sustituya', async () => {
    m.tx.mockResolvedValueOnce([[doc()]]);
    expect(await voidInvoice('org-a', 'doc-a', '01')).toMatchObject({ ok: false, error: expect.stringMatching(/Sustituir CFDI/) });
    expect(m.cancel).not.toHaveBeenCalled();
  });
  it('manda la clave elegida y guarda su descripción', async () => {
    m.tx.mockResolvedValue([[{ id: 'doc-a' }], [{ id: 'doc-a' }]]);
    m.tx.mockResolvedValueOnce([[doc()]]);
    m.cancel.mockResolvedValue({ success: true, status: 'accepted', rawProviderData: { motive: '03' } });
    expect(await voidInvoice('org-a', 'doc-a', '03')).toMatchObject({ ok: true, cancellationStatus: 'accepted' });
    expect(m.cancel).toHaveBeenCalledWith('provider-a', expect.objectContaining({ reason: '03' }));
    expect(m.cancel.mock.calls[0][1]).not.toHaveProperty('substitution');
    const anulacion = statements().find((q) => q.text.includes("lifecycle = 'void'"))!;
    expect(anulacion.values).toContain('03 · No se llevó a cabo la operación');
    expect(m.event).toHaveBeenCalledWith('org-a', 'doc-a', 'void', 'Anulada: 03 · No se llevó a cabo la operación');
  });
  it('un texto libre (API, workflows) cae al 02 y conserva la nota', async () => {
    m.tx.mockResolvedValueOnce([[doc()]]);
    m.cancel.mockResolvedValue({ success: true, status: 'pending' });
    await voidInvoice('org-a', 'doc-a', 'Cliente equivocado');
    expect(m.cancel).toHaveBeenCalledWith('provider-a', expect.objectContaining({ reason: '02' }));
  });
  it('un CFDI sustituido se cancela con el 01 y el folio fiscal del sustituto', async () => {
    m.tx.mockResolvedValueOnce([[doc({ lifecycle: 'paid', sustituida_por: 'doc-b', sustituta_fiscal_id: UUID_SUSTITUTO, sustituta_status: 'issued' })]]);
    m.cancel.mockResolvedValue({ success: true, status: 'pending' });
    expect(await voidInvoice('org-a', 'doc-a', '02')).toMatchObject({ ok: true, pending: true });
    expect(m.cancel).toHaveBeenCalledWith('provider-a', expect.objectContaining({ reason: '01', substitution: UUID_SUSTITUTO }));
  });
  it('no pide el 01 si el sustituto todavía no está timbrado', async () => {
    m.tx.mockResolvedValueOnce([[doc({ sustituida_por: 'doc-b', sustituta_fiscal_id: null, sustituta_status: 'pending' })]]);
    expect(await voidInvoice('org-a', 'doc-a')).toMatchObject({ ok: false, error: expect.stringMatching(/todavía no está timbrada/) });
    expect(m.cancel).not.toHaveBeenCalled();
  });
});

describe('cancelar una factura global libera sus ventas', () => {
  const global = { informacion_global: { periodicidad: '04', meses: '09', anio: 2026, forma_pago: '01' }, lifecycle: 'paid' };
  it('con el 04, en la misma transacción que la anula', async () => {
    m.tx.mockResolvedValue([[{ id: 'doc-a' }], [{ id: 'doc-a' }], []]);
    m.tx.mockResolvedValueOnce([[doc(global)]]);
    m.cancel.mockResolvedValue({ success: true, status: 'accepted' });
    expect(await voidInvoice('org-a', 'doc-a', '04')).toMatchObject({ ok: true });
    const anulacion = m.tx.mock.calls.find((call) => call.slice(1).some((q: any) => q.text.includes("lifecycle = 'void'")))!;
    expect(anulacion.slice(1).some((q: any) => q.text.includes('update factura_global_ventas set liberada_at = now()'))).toBe(true);
  });
  it('una solicitud pendiente no libera nada', async () => {
    m.tx.mockResolvedValueOnce([[doc(global)]]);
    m.cancel.mockResolvedValue({ success: true, status: 'pending' });
    await voidInvoice('org-a', 'doc-a', '04');
    expect(statements().some((q) => q.text.includes('factura_global_ventas'))).toBe(false);
  });
  it('descartar el borrador que no se timbró también las libera', async () => {
    m.tx.mockResolvedValueOnce([[doc({ ...global, lifecycle: 'draft', status: 'error', provider_document_id: 'err_mx_a' })]]);
    expect(await voidInvoice('org-a', 'doc-a')).toMatchObject({ ok: true });
    const [, ...descarte] = m.tx.mock.calls[1];
    expect(descarte.map((q: any) => q.text).join('\n')).toMatch(/lifecycle = 'void'[\s\S]*update factura_global_ventas set liberada_at/);
    expect(m.cancel).not.toHaveBeenCalled();
  });
});

describe('emitir el sustituto', () => {
  const head = (extra = {}) => ({
    org_nombre: 'Emisor', country_code: 'MX', iva_pct: 16, fiscal_metadata: {}, serie_folio: 'F', facturapi_live_key: 'sk_test_org',
    id: 'doc-b', cotizacion_id: null, lifecycle: 'draft', status: 'pending', doc_country: 'MX', document_type: 'cfdi_40',
    currency: 'MXN', ledger_currency: 'MXN', fx_rate: 1, subtotal: 100, tax_total: 16, total: 116, retencion_total: 0,
    invoice_number: null, public_token: 'tok-b', idempotency_key: null, provider: 'facturapi', provider_data: {},
    issuer_snapshot: { legalName: 'Emisor', address: { postalCode: '06600' } }, recipient_snapshot: { legalName: 'Cliente', taxId: 'AAA010101AAA' },
    line_items_snapshot: [{ description: 'Servicio', quantity: 1, unitPrice: 100, taxRate: 0.16, subtotal: 100, taxAmount: 16, total: 116 }],
    credit_note_of: null, informacion_global: null, sustituye_a: 'orig-a', sustituye_fiscal_id: UUID_ORIGINAL, sustituye_numero: 'F-000001',
    ...extra,
  });

  it('timbra con la relación 04, mueve los cobros y después cancela el original con el 01', async () => {
    m.tx
      .mockResolvedValueOnce([[head()]])
      .mockResolvedValueOnce([[], [{ invoice_number: 'F-000002' }]])
      // Los cobros del original cuentan: estaba pagado, el sustituto sale PUE.
      .mockResolvedValueOnce([[{ pagado: 116, metodo: 'transferencia' }]])
      .mockResolvedValueOnce([[], [], [], [], [], [], []])
      .mockResolvedValueOnce([[doc({ id: 'orig-a', provider_document_id: 'provider-orig', lifecycle: 'paid',
        sustituida_por: 'doc-b', sustituta_fiscal_id: UUID_SUSTITUTO, sustituta_status: 'issued' })]]);
    m.issue.mockResolvedValue({ success: true, provider: 'facturapi', documentId: 'provider-b', fiscalId: UUID_SUSTITUTO });
    m.cancel.mockResolvedValue({ success: true, status: 'pending' });

    const result = await finalizeInvoice('org-a', 'doc-b');
    expect(result).toMatchObject({ emitted: true, invoiceNumber: 'F-000002',
      substitution: { originalId: 'orig-a', ok: true, cancellationStatus: 'pending' } });
    expect(m.preflight).toHaveBeenCalledWith('org-a', 'orig-a', 'doc-b');
    expect(m.issue).toHaveBeenCalledWith(expect.objectContaining({
      substitutesFiscalId: UUID_ORIGINAL, cfdi: expect.objectContaining({ paymentMethod: 'PUE', paymentForm: '03' }),
    }));
    // La forma de pago contó los cobros del original.
    expect(m.tx.mock.calls[2][1].values).toContain('orig-a');

    // Una sola transacción: los dos locks de saldo, la emisión, el traslado de
    // cobros y la marca de sustituida, y el recálculo de ambos saldos.
    const exito = m.tx.mock.calls[3].slice(1) as Array<{ text: string; values: unknown[] }>;
    expect(exito.filter((q) => q.text.includes('for update'))).toHaveLength(2);
    const traslado = exito.find((q) => q.text.includes('update documento_pagos set documento_id'))!;
    expect(traslado.values).toEqual(['doc-b', 'orig-a', 'org-a']);
    expect(exito.some((q) => q.text.includes('set sustituida_por'))).toBe(true);

    // Orden: timbrar → transacción → cancelación del original con el 01.
    expect(m.issue.mock.invocationCallOrder[0]).toBeLessThan(m.cancel.mock.invocationCallOrder[0]);
    expect(m.cancel).toHaveBeenCalledWith('provider-orig', expect.objectContaining({ reason: '01', substitution: UUID_SUSTITUTO }));
    expect(m.event).toHaveBeenCalledWith('org-a', 'doc-b', 'issued', 'Sustituye a F-000001');
    expect(m.event).toHaveBeenCalledWith('org-a', 'orig-a', 'void', 'Sustituida por F-000002');
  });

  it('si el original ya no se puede sustituir, no timbra', async () => {
    m.tx.mockResolvedValueOnce([[head()]]);
    m.preflight.mockResolvedValue('Tiene complementos de pago emitidos.');
    expect(await finalizeInvoice('org-a', 'doc-b')).toMatchObject({ emitted: false, httpStatus: 409, error: 'Tiene complementos de pago emitidos.' });
    expect(m.issue).not.toHaveBeenCalled();
  });

  it('un CFDI solo se sustituye con otro CFDI', async () => {
    m.tx.mockResolvedValueOnce([[head({ document_type: 'proforma' })]]);
    expect(await finalizeInvoice('org-a', 'doc-b')).toMatchObject({ emitted: false, error: expect.stringMatching(/como CFDI/) });
    expect(m.preflight).not.toHaveBeenCalled();
    expect(m.issue).not.toHaveBeenCalled();
  });

  it('si el timbrado falla, el original queda intacto y no se cancela', async () => {
    m.tx
      .mockResolvedValueOnce([[head()]])
      .mockResolvedValueOnce([[], [{ invoice_number: 'F-000002' }]])
      .mockResolvedValueOnce([[{ pagado: 0, metodo: null }]]);
    m.issue.mockResolvedValue({ success: false, provider: 'facturapi', documentId: 'doc-b', error: 'rechazado' });
    expect(await finalizeInvoice('org-a', 'doc-b')).toMatchObject({ emitted: false });
    expect(statements().some((q) => q.text.includes('update documento_pagos set documento_id'))).toBe(false);
    expect(m.cancel).not.toHaveBeenCalled();
  });
});

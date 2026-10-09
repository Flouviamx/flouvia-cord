// Lo que todavía podía cobrar un documento que ya no se debe, y la cuenta a la
// que Stripe deposita (auditoría de oct 2026):
//   A2/A3: marcar pagada o anular una factura dejaba vivos su PaymentIntent y su
//          preferencia de Mercado Pago, y el cliente podía pagar otra vez;
//   A4:    cambiar la cuenta bancaria la AGREGABA sin hacerla predeterminada, y
//          Stripe seguía depositando en la anterior.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  stripe: vi.fn(), expire: vi.fn(), rows: [] as any[], after: [] as Promise<unknown>[],
  createExternal: vi.fn(), retrieve: vi.fn(), notify: vi.fn(),
  horas: vi.fn(), programar: vi.fn(), completar: vi.fn(), cancelar: vi.fn(), sincronizar: vi.fn(), orden: [] as string[],
}));
vi.mock('../src/lib/db', () => ({
  sql: (s: TemplateStringsArray, ...values: unknown[]) => ({ text: s.join('?'), values }),
  withOrgTx: async (_org: string, ...qs: Array<{ text: string }>) => qs.map((q) => (/^\s*select/i.test(q.text) ? m.rows : [])),
  getActiveOrgId: async () => 'org-1',
  reqIp: () => '203.0.113.7',
  logAudit: vi.fn(),
}));
vi.mock('../src/lib/billing', () => ({ stripe: m.stripe, createExternalAccount: m.createExternal, retrieveAccount: m.retrieve }));
vi.mock('../src/lib/mercadopago', () => ({ expireMpPreference: m.expire }));
vi.mock('../src/lib/after', () => ({ after: (p: Promise<unknown>) => { m.after.push(Promise.resolve(p)); } }));
vi.mock('../src/lib/log', () => ({ log: { warn: vi.fn(), error: vi.fn() } }));
vi.mock('../src/lib/queries', () => ({ requirePerm: async () => null }));
vi.mock('../src/lib/connect-security', () => ({ limitConnectMutation: async () => null }));
vi.mock('../src/lib/step-up', () => ({ requireFreshAuth: async () => null }));
vi.mock('../src/lib/connect-audit', () => ({ auditConnect: vi.fn() }));
vi.mock('../src/lib/crypto-secret', () => ({ encryptRequiredSecret: (v: string) => `enc:${v}` }));
vi.mock('../src/lib/context', () => ({ currentLocale: () => 'es', currentUserId: () => 'user-1' }));
vi.mock('../src/lib/auth-email', () => ({ notifyMoneyDestinationChange: m.notify }));
vi.mock('../src/lib/money-hold', () => ({
  horasDeEspera: m.horas, programarCambio: m.programar, completarCambio: m.completar, cancelarCambio: m.cancelar,
  registrarFalla: vi.fn(), urlRevertir: (t: string) => `https://cordhq.app/dinero/revertir/${t}`,
}));
vi.mock('../src/lib/deposit-control', () => ({ sincronizarControl: m.sincronizar }));

import { invalidateLiveCharges } from '../src/lib/fiscal/quote-ledger';
import { cuentaDeDepositoVigente } from '../src/lib/payout-fields';

beforeEach(() => {
  vi.clearAllMocks();
  m.after.length = 0;
  m.rows = [{ stripe_account_id: 'acct_1' }];
  m.stripe.mockImplementation(async (path: string) => {
    if (path === '/v1/payment_intents/pi_card') return { id: 'pi_card', status: 'requires_payment_method', payment_method_types: ['card'] };
    if (path === '/v1/payment_intents/pi_spei') return {
      id: 'pi_spei', status: 'requires_action', payment_method_types: ['customer_balance'],
      next_action: { type: 'display_bank_transfer_instructions' },
    };
    if (path === '/v1/payment_intents/pi_mixto') return { id: 'pi_mixto', status: 'requires_payment_method', payment_method_types: ['card', 'customer_balance'] };
    if (path === '/v1/payment_intents/pi_pagado') return { id: 'pi_pagado', status: 'succeeded', payment_method_types: ['card'] };
    return {};
  });
  m.expire.mockResolvedValue(true);
});

describe('invalidateLiveCharges', () => {
  it('cancela la tarjeta todavía cobrable y vence la preferencia; un SPEI y un pago ya hecho NO se tocan', async () => {
    await invalidateLiveCharges('org-1', [
      { id: 'a', pi: 'pi_card', preferencia: 'pref_1' },
      { id: 'b', pi: 'pi_spei', preferencia: null },
      { id: 'c', pi: 'pi_pagado', preferencia: null },
    ]);
    const cancelados = m.stripe.mock.calls.filter(([path]) => String(path).endsWith('/cancel')).map(([path]) => path);
    expect(cancelados).toEqual(['/v1/payment_intents/pi_card/cancel']);
    expect(m.expire).toHaveBeenCalledWith('org-1', 'pref_1');
  });

  it('un PaymentIntent mixto (tarjeta + SPEI) sin CLABE emitida SÍ se cancela: sigue cobrable con tarjeta', async () => {
    await invalidateLiveCharges('org-1', [{ id: 'm', pi: 'pi_mixto', preferencia: null }]);
    const cancelados = m.stripe.mock.calls.filter(([path]) => String(path).endsWith('/cancel')).map(([path]) => path);
    expect(cancelados).toEqual(['/v1/payment_intents/pi_mixto/cancel']);
  });

  it('un proveedor que falla no rompe al resto', async () => {
    m.stripe.mockRejectedValueOnce(new Error('stripe caído'));
    await expect(invalidateLiveCharges('org-1', [{ id: 'a', pi: 'pi_card', preferencia: 'pref_1' }])).resolves.toBeUndefined();
    expect(m.expire).toHaveBeenCalledWith('org-1', 'pref_1');
  });
});

describe('cuenta de depósito vigente', () => {
  it('es la predeterminada aunque no sea la primera de la lista', () => {
    expect(cuentaDeDepositoVigente([{ last4: '1111', default_for_currency: false }, { last4: '2222', default_for_currency: true }]))
      .toEqual({ last4: '2222', default_for_currency: true });
    expect(cuentaDeDepositoVigente([])).toBeNull();
  });
});

describe('cambiar la cuenta bancaria', () => {
  const post = async () => {
    const { POST } = await import('../src/pages/api/billing/connect/external-account');
    return POST({ request: new Request('https://cordhq.app/api/billing/connect/external-account', {
      method: 'POST',
      body: JSON.stringify({ account_holder_name: 'Empresa SA', account_holder_type: 'company', clabe: '002010077777777771' }),
    }) } as any) as Promise<Response>;
  };
  beforeEach(() => {
    m.rows = [{ stripe_account_id: 'acct_1', stripe_business_type: 'company', banco_clabe_last4: '9999', country_code: 'MX', moneda: 'MXN' }];
    m.retrieve.mockResolvedValue({ requirements: {} });
    m.horas.mockResolvedValue(0);
    m.orden.length = 0;
    m.programar.mockImplementation(async () => { m.orden.push('programar'); return { id: 'cambio-1', efectivoDesde: new Date('2026-10-12T15:00:00Z'), revertirToken: 'tok', reemplazados: [] }; });
    m.completar.mockResolvedValue([]);
    m.cancelar.mockResolvedValue(undefined);
    m.sincronizar.mockImplementation(async () => { m.orden.push('control'); return 'controlada'; });
    m.createExternal.mockImplementation(async (_a: string, f: any) => { m.orden.push('crear'); return { id: 'ba_new', last4: '7771', default_for_currency: f.default_for_currency === 'true' }; });
  });

  const conCuentaAnterior = () => m.retrieve.mockResolvedValue({
    requirements: {},
    external_accounts: { data: [{ id: 'ba_vieja', object: 'bank_account', currency: 'mxn', last4: '1111', default_for_currency: true }] },
  });

  it('con una cuenta anterior, la nueva espera SIN ser predeterminada: los depósitos siguen en la anterior', async () => {
    conCuentaAnterior();
    m.horas.mockResolvedValue(72);
    const res = await post();
    expect(res.status).toBe(200);
    expect(m.createExternal).toHaveBeenCalledWith('acct_1', expect.objectContaining({ default_for_currency: 'false' }));
    expect(m.horas).toHaveBeenCalledWith('org-1', expect.objectContaining({ tipo: 'banco', primerDestino: false }));
    // El registro va ANTES de crear la cuenta, y sin reemplazar todavía lo que esperaba.
    expect(m.orden).toEqual(['programar', 'crear']);
    expect(m.programar).toHaveBeenCalledWith('org-1', expect.objectContaining({
      reemplazar: false, antes: expect.objectContaining({ external_account_id: 'ba_vieja' }),
      despues: expect.objectContaining({ clabe_enc: 'enc:002010077777777771', clabe_last4: '7771' }),
    }));
    expect(m.completar).toHaveBeenCalledWith('org-1', 'cambio-1', { external_account_id: 'ba_new' });
    expect(m.sincronizar).not.toHaveBeenCalled();
    expect((await res.json()).espera).toEqual({ horas: 72, efectivo_desde: '2026-10-12T15:00:00.000Z' });
    await Promise.all(m.after);
    expect(m.notify).toHaveBeenCalledWith('org-1', 'banco', expect.objectContaining({
      efectivoDesde: new Date('2026-10-12T15:00:00Z'), revertirUrl: 'https://cordhq.app/dinero/revertir/tok',
    }));
  });

  it('la PRIMERA cuenta de un negocio que ya cobró: Cord toma los depósitos ANTES de crearla', async () => {
    m.horas.mockResolvedValue(72);
    expect((await post()).status).toBe(200);
    expect(m.orden).toEqual(['programar', 'control', 'crear']);
    expect(m.createExternal).toHaveBeenCalledWith('acct_1', expect.objectContaining({ default_for_currency: 'true' }));
  });

  it('si el proveedor rechaza la cuenta, el cambio se cancela y Cord suelta los depósitos', async () => {
    m.horas.mockResolvedValue(72);
    m.createExternal.mockRejectedValue(new Error('cuenta inválida'));
    expect((await post()).status).toBe(400);
    expect(m.cancelar).toHaveBeenCalledWith('org-1', 'cambio-1');
    expect(m.orden).toEqual(['programar', 'control', 'control']);
    expect(m.notify).not.toHaveBeenCalled();
  });

  it('una cuenta que reemplaza a otra todavía en espera la borra del proveedor', async () => {
    conCuentaAnterior();
    m.horas.mockResolvedValue(72);
    m.completar.mockResolvedValue([{ external_account_id: 'ba_intermedia' }]);
    await post();
    expect(m.stripe).toHaveBeenCalledWith('/v1/accounts/acct_1/external_accounts/ba_intermedia', undefined, 'DELETE');
  });

  it('sin espera (el alta), la cuenta nueva queda como PREDETERMINADA para su divisa', async () => {
    const res = await post();
    expect(res.status).toBe(200);
    expect(m.createExternal).toHaveBeenCalledWith('acct_1', expect.objectContaining({ default_for_currency: 'true' }));
  });

  it('si el proveedor no la dejó como predeterminada, se borra y no se reporta como cambiada', async () => {
    m.createExternal.mockResolvedValue({ id: 'ba_new', last4: '7771', default_for_currency: false });
    const res = await post();
    expect(res.status).toBe(400);
    expect(m.notify).not.toHaveBeenCalled();
    expect(m.stripe).toHaveBeenCalledWith('/v1/accounts/acct_1/external_accounts/ba_new', undefined, 'DELETE');
  });
});

describe('anular una factura', () => {
  it('cancela su PaymentIntent de tarjeta y vence su preferencia de Mercado Pago', async () => {
    const { voidInvoice } = await import('../src/lib/fiscal/invoices');
    m.rows = [{
      id: 'doc-1', lifecycle: 'open', status: 'pending', amount_paid: 0, country_code: 'MX', credit_note_of: null,
      has_credit_notes: false, provider_document_id: null, provider_data: null, document_type: 'cfdi_40', provider: 'facturapi',
      stripe_payment_intent_id: 'pi_card', mp_preference_id: 'pref_1', stripe_account_id: 'acct_1',
    }];
    expect(await voidInvoice('org-1', 'doc-1')).toMatchObject({ ok: true });
    await Promise.all(m.after);
    expect(m.stripe).toHaveBeenCalledWith('/v1/payment_intents/pi_card/cancel', {}, 'POST', { stripeAccount: 'acct_1' });
    expect(m.expire).toHaveBeenCalledWith('org-1', 'pref_1');
  });
});

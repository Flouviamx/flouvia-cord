import { beforeEach, describe, expect, it, vi } from 'vitest';

const respuestas: any[] = [];
const escrituras: string[] = [];
vi.mock('../src/lib/db', () => ({
    sql: (strings: TemplateStringsArray) => strings.join('?'),
    withOrgTx: vi.fn(async (_org: string, ...queries: string[]) => {
        for (const q of queries) if (/insert into integracion_vinculos/.test(q)) escrituras.push('vinculo');
        return respuestas.shift() ?? queries.map(() => []);
    }),
}));
vi.mock('../src/lib/log', () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
const apiJson = vi.fn();
vi.mock('../src/lib/integraciones/proveedor-http', () => ({ apiJson: (...a: any[]) => apiJson(...a), ProveedorError: class extends Error { motivo = 'proveedor'; } }));
const applyPayment = vi.fn();
vi.mock('../src/lib/fiscal/payments', () => ({ applyPayment: (...a: any[]) => applyPayment(...a) }));
vi.mock('../src/lib/integraciones/contabilidad/service', () => ({
    leerConexionConta: vi.fn(async () => ({ id: 'cx1', proveedor: 'quickbooks', token: 't', cuenta: '123', estado: 'activa' })),
}));
const { sincronizarPagos } = await import('../src/lib/integraciones/contabilidad/pagos');

beforeEach(() => { respuestas.length = 0; escrituras.length = 0; apiJson.mockReset(); applyPayment.mockReset(); });

describe('pagos entre Cord y QuickBooks', () => {
    it('manda el cobro de Cord una vez y no devuelve el que llegó de QuickBooks', async () => {
        respuestas.push(
            [[{ local_id: 'doc1', externo_id: '55', currency: 'MXN', lifecycle: 'open', amount_remaining: 500 }]],
            [
                [
                    { id: 'p-cord', monto: 300, metodo: 'stripe', referencia: 'pi_1', aplicado_at: '2026-09-28T10:00:00Z' },
                    { id: 'p-qbo', monto: 200, metodo: 'quickbooks', referencia: 'QuickBooks 900', aplicado_at: '2026-09-28T11:00:00Z' },
                ],
                [{ local_id: 'p-qbo', externo_id: '900' }],
            ],
        );
        apiJson
            .mockResolvedValueOnce({ QueryResponse: { Invoice: [{ Id: '55', CustomerRef: { value: '7' }, LinkedTxn: [{ TxnType: 'Payment', TxnId: '900' }] }] } })
            .mockResolvedValueOnce({ Payment: { Id: '900', TxnDate: '2026-09-28', Line: [{ Amount: 200, LinkedTxn: [{ TxnType: 'Invoice', TxnId: '55' }] }] } })
            .mockResolvedValueOnce({ Payment: { Id: '901' } });

        const r = await sincronizarPagos('org1', 'quickbooks');
        expect(r).toEqual({ enviados: 1, recibidos: 0, esperando: 0 });
        const creacion = apiJson.mock.calls[2];
        expect(String(creacion[0])).toContain('requestid=cord-pago-p-cord');
        expect(JSON.parse(creacion[1].body)).toMatchObject({ TotalAmt: 300, CustomerRef: { value: '7' } });
        expect(applyPayment).not.toHaveBeenCalled();
    });

    it('trae a Cord un pago registrado en QuickBooks que Cord no conoce', async () => {
        respuestas.push(
            [[{ local_id: 'doc1', externo_id: '55', currency: 'USD', lifecycle: 'open', amount_remaining: 500 }]],
            [[], []],
            [[{ id: 'p-nuevo' }]],
        );
        apiJson
            .mockResolvedValueOnce({ QueryResponse: { Invoice: [{ Id: '55', CustomerRef: { value: '7' }, LinkedTxn: [{ TxnType: 'Payment', TxnId: '950' }] }] } })
            .mockResolvedValueOnce({ Payment: { Id: '950', Line: [{ Amount: 120.5, LinkedTxn: [{ TxnType: 'Invoice', TxnId: '55' }] }, { Amount: 80, LinkedTxn: [{ TxnType: 'Invoice', TxnId: '56' }] }] } });
        applyPayment.mockResolvedValue({ ok: true });

        const r = await sincronizarPagos('org1', 'quickbooks');
        expect(r.recibidos).toBe(1);
        expect(applyPayment).toHaveBeenCalledWith('org1', 'doc1', expect.objectContaining({ monto: 120.5, currency: 'USD', metodo: 'quickbooks', referencia: 'QuickBooks 950' }));
        expect(escrituras).toContain('vinculo');
    });
});

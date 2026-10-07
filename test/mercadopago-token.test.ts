// Renovación del token de Mercado Pago (auditoría oct 2026): antes CUALQUIER
// respuesta distinta de 200 —un 429, un 5xx, la red— apagaba Mercado Pago para
// siempre, y dos renovaciones simultáneas (el refresh token se rota) apagaban la
// conexión aunque la otra hubiera guardado credenciales nuevas.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ row: {} as Record<string, unknown>, updates: [] as string[], fetch: vi.fn() }));
vi.mock('../src/lib/db', () => ({
    sql: (s: TemplateStringsArray, ...values: unknown[]) => ({ text: s.join('?'), values }),
    withOrgTx: async (_org: string, ...qs: Array<{ text: string; values: unknown[] }>) => qs.map((q) => {
        if (/^\s*select/i.test(q.text)) return [m.row];
        const texto = q.text.replace(/\s+/g, ' ').trim();
        // Compare-and-set: solo apaga si el refresh token guardado sigue siendo el que se usó.
        if (texto.includes('mp_charges_enabled = false') && texto.includes('mp_refresh_token_enc =')) {
            if (m.row.mp_refresh_token_enc !== q.values[1]) return [];
            m.updates.push(texto);
            return [{ id: q.values[0] }];
        }
        m.updates.push(texto);
        return [];
    }),
}));
vi.mock('../src/lib/crypto-secret', () => ({
    decryptSecret: (v: string | null) => (v ? String(v).replace(/^enc:/, '') : null),
    encryptRequiredSecret: (v: string) => `enc:${v}`,
}));

import { mpAccessToken, MpTransientError } from '../src/lib/mercadopago';

const org = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const porVencer = () => new Date(Date.now() + 60_000).toISOString();
const vencido = () => new Date(Date.now() - 60_000).toISOString();
const respuesta = (status: number, data: unknown) => ({ status, json: async () => data });

beforeEach(() => {
    process.env.MP_CLIENT_ID = 'cid';
    process.env.MP_CLIENT_SECRET = 'csecret';
    m.updates = [];
    m.fetch.mockReset();
    vi.stubGlobal('fetch', m.fetch);
    m.row = { mp_access_token_enc: 'enc:tok_viejo', mp_refresh_token_enc: 'enc:ref_viejo', mp_token_expira: porVencer(), mp_charges_enabled: true };
});

describe('token de Mercado Pago', () => {
    it('un token vigente se usa tal cual, sin llamar al proveedor', async () => {
        m.row.mp_token_expira = new Date(Date.now() + 86_400_000).toISOString();
        expect(await mpAccessToken(org)).toBe('tok_viejo');
        expect(m.fetch).not.toHaveBeenCalled();
    });

    it('un 503 del proveedor NO apaga la conexión: sigue el token que aún no vence', async () => {
        m.fetch.mockResolvedValue(respuesta(503, {}));
        expect(await mpAccessToken(org)).toBe('tok_viejo');
        expect(m.updates.some((u) => u.includes('mp_charges_enabled = false'))).toBe(false);
    });

    it('red caída con el token YA vencido: error temporal, no conexión apagada', async () => {
        m.row.mp_token_expira = vencido();
        m.fetch.mockRejectedValue(new Error('ECONNRESET'));
        await expect(mpAccessToken(org)).rejects.toBeInstanceOf(MpTransientError);
        expect(m.updates.some((u) => u.includes('mp_charges_enabled = false'))).toBe(false);
    });

    it('invalid_grant de verdad apaga la conexión', async () => {
        m.fetch.mockResolvedValue(respuesta(400, { error: 'invalid_grant' }));
        expect(await mpAccessToken(org)).toBeNull();
        expect(m.updates.some((u) => u.includes('mp_charges_enabled = false'))).toBe(true);
    });

    it('invalid_grant porque OTRA renovación ya rotó el token: usa las credenciales nuevas, no apaga', async () => {
        let lecturas = 0;
        m.fetch.mockResolvedValue(respuesta(400, { error: 'invalid_grant' }));
        const original = { ...m.row };
        Object.defineProperty(m, 'row', {
            configurable: true,
            get: () => (lecturas++ === 0 ? original : { ...original, mp_access_token_enc: 'enc:tok_nuevo', mp_refresh_token_enc: 'enc:ref_nuevo' }),
        });
        expect(await mpAccessToken(org)).toBe('tok_nuevo');
        expect(m.updates.some((u) => u.includes('mp_charges_enabled = false'))).toBe(false);
        Object.defineProperty(m, 'row', { configurable: true, writable: true, value: original });
    });

    it('una conexión apagada no abre cobros, pero un pago ya hecho se puede LEER', async () => {
        m.row.mp_charges_enabled = false;
        m.row.mp_token_expira = new Date(Date.now() + 86_400_000).toISOString();
        expect(await mpAccessToken(org, 'cobrar')).toBeNull();
        expect(await mpAccessToken(org, 'leer')).toBe('tok_viejo');
    });
});

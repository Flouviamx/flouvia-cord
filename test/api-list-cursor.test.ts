import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/db', () => ({ sql: vi.fn(), withOrgTx: vi.fn(), getActiveOrgId: vi.fn(), reqIp: () => '127.0.0.1' }));
const { encodeListCursor, listCursor, listMeta } = await import('../src/lib/apiv1');

const url = (cursor?: string) => new URL(`https://cordhq.app/api/v1/clientes${cursor === undefined ? '' : `?cursor=${encodeURIComponent(cursor)}`}`);

describe('cursor de listas de la API', () => {
    it('ida y vuelta conserva la llave exacta, con microsegundos', () => {
        const keys = ['2026-01-01 00:00:00.123456+00', '11111111-1111-4111-8111-111111111111'];
        expect(listCursor(url(encodeListCursor(keys)), 2)).toEqual(keys);
        expect(listCursor(url(), 2)).toBeNull();
    });

    it('un cursor ajeno o manipulado responde invalid_cursor', async () => {
        for (const bad of ['xyz', encodeListCursor(['a']), Buffer.from('{"a":1}').toString('base64url')]) {
            const r = listCursor(url(bad), 2);
            expect(r).toBeInstanceOf(Response);
            expect(((await (r as Response).json()) as any).code).toBe('invalid_cursor');
        }
    });

    it('con cursor el offset no aplica', () => {
        expect(listMeta(50, 10, 99, ['a', 'b'], 'next')).toEqual({ limit: 50, offset: null, total: 99, next_cursor: 'next' });
        expect(listMeta(50, 10, 99, null, null)).toEqual({ limit: 50, offset: 10, total: 99, next_cursor: null });
    });
});

import { describe, expect, it, vi } from 'vitest';
import { isConnectPhaseError, withConnectRetry } from '../src/lib/db-fetch';

const err = (code: string) => { const e: any = new Error('fetch failed'); e.cause = { code }; return e; };

describe('isConnectPhaseError', () => {
    it('reconoce los fallos donde la petición nunca salió', () => {
        expect(isConnectPhaseError(err('ENOTFOUND'))).toBe(true);
        expect(isConnectPhaseError(err('ECONNREFUSED'))).toBe(true);
        expect(isConnectPhaseError(err('UND_ERR_CONNECT_TIMEOUT'))).toBe(true);
    });

    it('un reset a mitad de camino es ambiguo y no cuenta: mejor fallar que duplicar', () => {
        expect(isConnectPhaseError(err('ECONNRESET'))).toBe(false);
        expect(isConnectPhaseError(err('UND_ERR_SOCKET'))).toBe(false);
        expect(isConnectPhaseError(new Error('otro error'))).toBe(false);
        expect(isConnectPhaseError(null)).toBe(false);
    });
});

describe('withConnectRetry', () => {
    it('reintenta un fallo de conexión y devuelve la respuesta si el segundo intento funciona', async () => {
        const ok = new Response('ok');
        const base = vi.fn().mockRejectedValueOnce(err('ENOTFOUND')).mockResolvedValueOnce(ok);
        const wrapped = withConnectRetry(base, async () => {});
        await expect(wrapped('https://x')).resolves.toBe(ok);
        expect(base).toHaveBeenCalledTimes(2);
    });

    it('no reintenta un error que no es de conexión: se propaga en el primer intento', async () => {
        const base = vi.fn().mockRejectedValue(err('ECONNRESET'));
        const wrapped = withConnectRetry(base, async () => {});
        await expect(wrapped('https://x')).rejects.toThrow();
        expect(base).toHaveBeenCalledTimes(1);
    });

    it('se rinde después del máximo de reintentos', async () => {
        const base = vi.fn().mockRejectedValue(err('ENOTFOUND'));
        const wrapped = withConnectRetry(base, async () => {});
        await expect(wrapped('https://x')).rejects.toThrow();
        expect(base).toHaveBeenCalledTimes(3); // intento inicial + 2 reintentos
    });
});

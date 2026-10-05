import { describe, it, expect } from 'vitest';
import { parseArgs, checkForwardUrl, checkTestKey, maskKey, parseEventList, configPath } from '../packages/cli/src/lib';

describe('cord CLI', () => {
    it('parsea comandos y banderas', () => {
        expect(parseArgs(['listen', '--forward-to', 'http://localhost:3000', '--events=quote.paid,invoice.paid', '--allow-remote'])).toEqual({
            command: ['listen'],
            flags: { 'forward-to': 'http://localhost:3000', events: 'quote.paid,invoice.paid', 'allow-remote': true },
        });
        expect(parseEventList('a, b,,c')).toEqual(['a', 'b', 'c']);
    });

    it('solo acepta llaves de prueba', () => {
        expect(checkTestKey('sk_test_abcdefghijklmnop1234').ok).toBe(true);
        expect(checkTestKey('sk_live_abcdefghijklmnop1234').ok).toBe(false);
        expect(checkTestKey('pk_test_abcdefghijklmnop1234').ok).toBe(false);
        expect(checkTestKey('sk_test_x').ok).toBe(false);
    });

    it('reenvía solo a la máquina local salvo que se pida', () => {
        for (const u of ['http://localhost:3000/hooks', 'http://127.0.0.1:8080', 'http://[::1]:3000', 'http://app.localhost']) expect(checkForwardUrl(u).ok, u).toBe(true);
        expect(checkForwardUrl('https://ngrok.example/hooks').ok).toBe(false);
        expect(checkForwardUrl('https://ngrok.example/hooks', true).ok).toBe(true);
        expect(checkForwardUrl('file:///etc/passwd', true).ok).toBe(false);
        expect(checkForwardUrl('http://user:pw@localhost').ok).toBe(false);
    });

    it('nunca muestra la llave completa', () => {
        expect(maskKey('sk_test_abcdefghijklmnop1234')).toBe('sk_test_…1234');
    });

    it('respeta XDG_CONFIG_HOME', () => {
        expect(configPath({ XDG_CONFIG_HOME: '/tmp/x' } as any)).toBe('/tmp/x/cord/config.json');
    });
});

import { describe, expect, it } from 'vitest';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { resourceForPath, parseAllowedIps, ipAllowed, restrictedKeyAllows } from '../src/lib/api-key-policy';

function routes(dir: string, base = ''): string[] {
    return readdirSync(dir).flatMap((f) => {
        const full = join(dir, f);
        if (statSync(full).isDirectory()) return routes(full, `${base}/${f}`);
        return [`${base}/${f.replace(/\.ts$/, '')}`.replace(/\[[^\]]+\]/g, 'x').replace(/\/index$/, '')];
    });
}

describe('catálogo de recursos', () => {
    it('toda ruta de /api/v1 pertenece a un recurso (si no, una rk_ no podría usarla nunca)', () => {
        const sueltas = routes('src/pages/api/v1').filter((r) => !resourceForPath(`/api/v1${r}`));
        expect(sueltas).toEqual([]);
    });

    it('un prefijo parecido no hereda el recurso', () => {
        expect(resourceForPath('/api/v1/clientes-export')).toBeNull();
        expect(resourceForPath('/api/v1/clientes/')).toBe('clientes');
        expect(restrictedKeyAllows({ clientes: 'write' }, '/api/v1/me', 'write')).toEqual({ ok: false, resource: null });
    });
});

describe('IPs permitidas', () => {
    it('normaliza, deduplica y reconoce IPv4 dentro de IPv6 mapeada', () => {
        const r = parseAllowedIps(['10.0.0.1', '10.0.0.1', '::ffff:192.168.0.1', '2001:db8::/48']);
        expect(r).toEqual({ ok: true, value: ['10.0.0.1', '192.168.0.1', '2001:db8::/48'] });
        if (!r.ok) return;
        expect(ipAllowed(r.value, '::ffff:10.0.0.1')).toBe(true);
        expect(ipAllowed(r.value, '2001:db8:0:ffff::1')).toBe(true);
        expect(ipAllowed(r.value, '2001:db9::1')).toBe(false);
        expect(ipAllowed(r.value, 'desconocida')).toBe(false);
        expect(ipAllowed(null, 'desconocida')).toBe(true);
    });

    it('limita la cantidad y el tipo', () => {
        expect(parseAllowedIps(Array.from({ length: 21 }, (_, i) => `10.0.0.${i}`)).ok).toBe(false);
        expect(parseAllowedIps(42).ok).toBe(false);
        expect(parseAllowedIps('')).toEqual({ ok: true, value: null });
    });
});

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, it, expect } from 'vitest';
const routing = createRequire(import.meta.url)('@vercel/routing-utils');
const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));

describe('customer-domain CDN guard', () => {
    it('compiles Vercel config and catches static marketing without intercepting document assets', () => {
        const { routes, error } = routing.getTransformedRoutes(config);
        expect(error).toBeNull();
        const redirect = routes.find((r: any) => r.status === 307 && r.headers?.Location === '/');
        const path = new RegExp(redirect.src);
        for (const value of ['/precios', '/en', '/soporte', '/terminos', '/app', '/sign-in', '/sitemap.xml']) expect(path.test(value)).toBe(true);
        for (const value of ['/', '/q/abcdef123', '/i/abcdef123', '/q/abcdef123/pay', '/api/q/abcdef123',
            '/_astro/file.css', '/imgs/logo.png', '/fonts/inter.woff2', '/.well-known/cord-domain-check', '/robots.txt']) {
            expect(path.test(value)).toBe(false);
        }
        const host = new RegExp('^(?:' + redirect.has[0].value + ')$');
        for (const value of ['cordhq.app', 'www.cordhq.app', 'dev.cordhq.app', 'docs.cordhq.app', 'ops.cordhq.app', 'billing.cordhq.app', 'build.cordhq.app', 'pay.cordhq.app', 'cord.flouvia.com', 'cord-pr123.vercel.app']) expect(host.test(value)).toBe(false);
        expect(host.test('quotes.acme.com')).toBe(true);
        expect(host.test('cordhq.app.attacker.com')).toBe(true);
        expect(routes.some((r: any) => r.headers?.['X-Robots-Tag']?.includes('noindex') && r.has?.[0]?.value === redirect.has[0].value)).toBe(true);
    });
});

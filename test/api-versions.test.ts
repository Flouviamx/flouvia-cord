import { describe, it, expect } from 'vitest';
import {
    API_VERSIONS, BASELINE_API_VERSION, LATEST_API_VERSION, VERSION_CHANGES,
    resolveApiVersion, downgradeResponse, downgradeWebhookData, needsDowngrade, type VersionChange,
} from '../src/lib/api-versions';
import { decorateApiResponse } from '../src/lib/api-cors';

const VERSIONS = ['2026-10-01', '2027-01-15', '2027-06-01'];
const CHANGES: VersionChange[] = [
    {
        version: '2027-06-01',
        description: { es: 'total pasa a ser objeto', en: 'total becomes an object' },
        downgradeResponse: (route, body) => route.startsWith('/cotizaciones') ? { ...body, data: { ...body.data, total: body.data.total.amount } } : body,
        downgradeWebhook: (_e, d) => ({ ...d, total: (d.total as any).amount }),
    },
    {
        version: '2027-01-15',
        description: { es: 'cliente se llama customer', en: 'cliente renamed' },
        downgradeResponse: (route, body) => {
            if (!route.startsWith('/cotizaciones')) return body;
            const { customer, ...rest } = body.data;
            return { ...body, data: { ...rest, cliente: customer } };
        },
        downgradeWebhook: (_e, d) => { const { customer, ...rest } = d as any; return { ...rest, cliente: customer }; },
    },
];

describe('resolveApiVersion', () => {
    it('header > versión fijada > base', () => {
        expect(resolveApiVersion('2027-01-15', '2026-10-01', VERSIONS)).toEqual({ ok: true, version: '2027-01-15' });
        expect(resolveApiVersion(null, '2027-06-01', VERSIONS)).toEqual({ ok: true, version: '2027-06-01' });
        expect(resolveApiVersion(null, null, VERSIONS)).toEqual({ ok: true, version: '2026-10-01' });
        expect(resolveApiVersion('', null, VERSIONS)).toEqual({ ok: true, version: '2026-10-01' });
    });

    it('rechaza una versión que no existe en vez de caer en silencio a otra', () => {
        expect(resolveApiVersion('2026-13-99', null, VERSIONS).ok).toBe(false);
        expect(resolveApiVersion('latest', null, VERSIONS).ok).toBe(false);
        expect(resolveApiVersion('2028-01-01', null, VERSIONS).ok).toBe(false);
    });

    it('una versión fijada que ya no existe cae a la base', () => {
        expect(resolveApiVersion(null, '2020-01-01', VERSIONS)).toEqual({ ok: true, version: '2026-10-01' });
    });
});

describe('cadena de transformaciones', () => {
    const latest = { data: { id: 'q1', customer: 'Acme', total: { amount: 100, currency: 'MXN' } } };

    it('aplica de la más nueva a la más vieja', () => {
        expect(downgradeResponse('/cotizaciones/q1', latest, '2026-10-01', CHANGES)).toEqual({ data: { id: 'q1', cliente: 'Acme', total: 100 } });
        expect(downgradeResponse('/cotizaciones/q1', latest, '2027-01-15', CHANGES)).toEqual({ data: { id: 'q1', customer: 'Acme', total: 100 } });
        expect(downgradeResponse('/cotizaciones/q1', latest, '2027-06-01', CHANGES)).toBe(latest);
    });

    it('transforma webhooks igual', () => {
        expect(downgradeWebhookData('quote.sent', { customer: 'Acme', total: { amount: 5 } }, '2026-10-01', CHANGES)).toEqual({ cliente: 'Acme', total: 5 });
    });

    it('no toca otras rutas', () => {
        const body = { data: [] };
        expect(downgradeResponse('/productos', body, '2026-10-01', CHANGES)).toBe(body);
    });
});

describe('estado actual del catálogo', () => {
    it('es coherente', () => {
        expect(API_VERSIONS[0]).toBe(BASELINE_API_VERSION);
        expect(LATEST_API_VERSION).toBe(API_VERSIONS.at(-1));
        expect([...API_VERSIONS]).toEqual([...API_VERSIONS].sort());
        for (const c of VERSION_CHANGES) expect(API_VERSIONS as readonly string[]).toContain(c.version);
        expect(needsDowngrade(LATEST_API_VERSION)).toBe(false);
    });

    it('cada respuesta dice con qué versión se respondió', async () => {
        const res = await decorateApiResponse(new Request('https://cordhq.app/api/v1/me'), new Response('{}', { headers: { 'Content-Type': 'application/json' } }), 'req_1', '2026-10-01');
        expect(res.headers.get('cord-version')).toBe('2026-10-01');
    });
});

describe('documentación de versiones', () => {
    it('lista cada versión en los dos idiomas', async () => {
        const { readFileSync } = await import('node:fs');
        for (const lang of ['es', 'en']) {
            const doc = readFileSync(`src/content/docs/${lang}/desarrolladores/esenciales/versiones.mdx`, 'utf8');
            for (const v of API_VERSIONS) expect(doc, `${lang} ${v}`).toContain(`| \`${v}\``);
        }
    });
});

describe('SDK', () => {
    it('la versión que mandan los SDK existe en el servidor', async () => {
        const { CORD_API_VERSION } = await import('../packages/elements/src/contract/api-version');
        expect(API_VERSIONS as readonly string[]).toContain(CORD_API_VERSION);
    });
});

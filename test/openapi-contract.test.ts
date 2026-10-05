import { describe, it, expect, vi } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { OPERATIONS, WEBHOOK_DATA_BY_OBJECT, webhookEvents } from '../src/lib/api-schema';
import { publishableKeyAllows } from '../src/lib/api-cors';

vi.mock('../src/lib/db', () => ({ sql: vi.fn(), withOrgTx: async () => [[{ sandbox: true }]] }));
vi.mock('../src/lib/queries', () => ({ markViewed: vi.fn() }));
vi.mock('../src/lib/quote-expiry', () => ({ registrarVencimiento: vi.fn() }));
const delivered: Array<[string, Record<string, unknown>]> = [];
vi.mock('../src/lib/webhooks', () => ({
    dispatchQuoteEvent: vi.fn(), dispatchInvoiceEvent: vi.fn(),
    deliverTestEvent: vi.fn(async (_o: string, t: string, d: Record<string, unknown>) => { delivered.push([t, d]); }),
}));

const ROOT = 'src/pages/api/v1';

function realRoutes(): Set<string> {
    const out = new Set<string>();
    const walk = (dir: string) => {
        for (const f of readdirSync(dir)) {
            const full = join(dir, f);
            if (statSync(full).isDirectory()) { walk(full); continue; }
            if (!f.endsWith('.ts')) continue;
            const path = '/' + relative(ROOT, full).replace(/\.ts$/, '').replace(/\[(\w+)\]/g, '{$1}');
            for (const m of readFileSync(full, 'utf8').matchAll(/export const (GET|POST|PATCH|DELETE)\b/g)) out.add(`${m[1]} ${path}`);
        }
    };
    walk(ROOT);
    return out;
}

describe('OpenAPI', () => {
    it('describe exactamente las rutas y métodos que existen', () => {
        const real = realRoutes();
        const spec = new Set(OPERATIONS.map((o) => `${o.method} ${o.path}`));
        expect([...real].filter((r) => !spec.has(r)), 'rutas sin documentar').toEqual([]);
        expect([...spec].filter((r) => !real.has(r)), 'operaciones que no existen').toEqual([]);
    });

    it('marca como publicables solo las rutas que acepta una pk_', () => {
        for (const op of OPERATIONS) {
            const concrete = op.path.replace(/\{\w+\}/g, '00000000-0000-0000-0000-000000000000');
            expect(!!op.publishable, `${op.method} ${op.path}`).toBe(publishableKeyAllows(op.method, `/api/v1${concrete}`));
        }
    });

    it('cubre los 41 webhooks y sus datos de ejemplo validan contra el esquema', async () => {
        const events = webhookEvents();
        expect(events).toHaveLength(41);
        const { triggerTestEvent } = await import('../src/lib/sandbox-sim');
        for (const [event, object] of events) {
            delivered.length = 0;
            await triggerTestEvent('org', event as any);
            const result = WEBHOOK_DATA_BY_OBJECT[object].safeParse(delivered[0][1]);
            expect(result.success, `${event}: ${result.success ? '' : JSON.stringify(result.error.issues[0])}`).toBe(true);
        }
    });

    it('el archivo publicado está al día', () => {
        const json = readFileSync('public/openapi.json', 'utf8');
        expect(readFileSync('public/openapi.yaml', 'utf8')).toBe(json);
        const spec = JSON.parse(json);
        expect(Object.keys(spec.webhooks)).toHaveLength(41);
        expect(Object.values(spec.paths).flatMap((p: any) => Object.keys(p))).toHaveLength(OPERATIONS.length);
    });
});

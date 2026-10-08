import { beforeEach, describe, expect, it, vi } from 'vitest';

// Un cron barre muchas organizaciones; la excepción de una no puede dejar sin
// procesar a las que siguen. workflows e integraciones no tenían try/catch por
// organización, y expirar-cotizaciones abortaba el registro (evento y webhook
// `quote.expired`) de todas las cotizaciones que venían después de la que
// fallaba, que para entonces ya estaban marcadas `expired` y nunca se
// reintentaban.

const m = vi.hoisted(() => ({
    system: [] as unknown[][][],
    procesadas: [] as string[],
    registradas: [] as string[],
}));
vi.mock('../src/lib/db', () => ({
    sql: (s: TemplateStringsArray, ...values: unknown[]) => ({ text: s.join('?'), values }),
    withSystemTx: async () => m.system.shift() ?? [[]],
    withOrgTx: async () => [[]],
}));
vi.mock('../src/lib/cron-auth', () => ({ assertCronAuth: () => null }));
// Sin bitácora: la prueba es sobre el aislamiento, no sobre el reclamo.
vi.mock('../src/lib/cron-runs', () => ({
    cronPeriod: () => '2026-10-08',
    runCronOnce: (_r: Request, _e: string, _p: string, fn: () => Promise<Response>) => fn(),
}));
vi.mock('../src/lib/workflows/engine', () => ({
    processOrgRuns: async (orgId: string) => {
        if (orgId === 'org-rota') throw new Error('definición corrupta');
        m.procesadas.push(orgId);
        return 1;
    },
}));
vi.mock('../src/lib/workflows/queue', () => ({ enqueueScheduledRun: async () => true }));
vi.mock('../src/lib/workflows/definition', () => ({ sanitizeDefinition: (d: unknown) => d }));
vi.mock('../src/lib/workflows/schedule', () => ({ nextScheduleAt: () => null, scheduleEventData: () => ({}) }));
vi.mock('../src/lib/domain-events', () => ({ recordDomainEvent: async () => 'evt' }));
vi.mock('../src/lib/integraciones/sync', () => ({
    purgeOldSyncJobs: async () => {},
    processOrgSync: async (orgId: string) => {
        if (orgId === 'org-rota') throw new Error('token revocado');
        m.procesadas.push(orgId);
        return 2;
    },
}));
vi.mock('../src/lib/integraciones/contabilidad/pagos', () => ({ sincronizarPagos: async () => ({ recibidos: 0, enviados: 0 }) }));
vi.mock('../src/lib/quote-expiry', () => ({
    registrarVencimiento: async (r: { id: string }) => {
        if (r.id === 'cot-rota') throw new Error('webhook caído');
        m.registradas.push(r.id);
    },
}));
vi.mock('../src/lib/notify', () => ({ notify: async () => {} }));
vi.mock('../src/lib/email', () => ({ siteOrigin: () => 'https://cordhq.app' }));

import { GET as cronWorkflows } from '../src/pages/api/cron/workflows';
import { GET as cronIntegraciones } from '../src/pages/api/cron/integraciones';
import { GET as cronExpirar } from '../src/pages/api/cron/expirar-cotizaciones';

const call = async (get: (ctx: any) => Response | Promise<Response>) => {
    const res = await get({ request: new Request('https://cordhq.app/api/cron/x') });
    return { status: res.status, body: await res.json() };
};
const orgs = [[{ org_id: 'org-a' }, { org_id: 'org-rota' }, { org_id: 'org-b' }]];

beforeEach(() => { m.system = []; m.procesadas = []; m.registradas = []; });

describe('aislamiento por organización en los crons', () => {
    it('workflows: una organización que truena no frena a las siguientes', async () => {
        m.system = [[[]], orgs];   // sin programados; tres orgs con ejecuciones
        const { status, body } = await call(cronWorkflows);
        expect(status).toBe(200);
        expect(m.procesadas).toEqual(['org-a', 'org-b']);
        expect(body).toMatchObject({ organizaciones: 3, ejecuciones: 2, fallidas: 1 });
    });

    it('integraciones: igual, y el barrido de pagos sigue corriendo', async () => {
        m.system = [orgs, [[]]];
        const { status, body } = await call(cronIntegraciones);
        expect(status).toBe(200);
        expect(m.procesadas).toEqual(['org-a', 'org-b']);
        expect(body).toMatchObject({ organizaciones: 3, trabajos: 4, fallidas: 1 });
    });

    it('expirar-cotizaciones: el registro de una vencida no aborta el de las demás', async () => {
        m.system = [[[{ id: 'cot-1', org_id: 'org-a' }, { id: 'cot-rota', org_id: 'org-a' }, { id: 'cot-2', org_id: 'org-b' }]], [[]]];
        const { status, body } = await call(cronExpirar);
        expect(status).toBe(200);
        expect(m.registradas).toEqual(['cot-1', 'cot-2']);
        expect(body).toMatchObject({ vencidas: 3, fallidas: 1 });
    });
});

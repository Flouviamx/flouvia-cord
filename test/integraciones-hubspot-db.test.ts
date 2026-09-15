import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const m = vi.hoisted(() => {
    process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
    return {
        db: null as any,
        pending: [] as Promise<unknown>[],
        dispatch: vi.fn(),
        creds: { clientId: 'cid', clientSecret: 'csecret' } as null | { clientId: string; clientSecret: string },
    };
});

vi.mock('../src/lib/db', () => ({
    sql: (s: TemplateStringsArray, ...values: any[]) => ({ text: s.reduce((text, part, i) => text + (i ? `$${i}` : '') + part, ''), values }),
    withOrgTx: async (org: string, ...queries: any[]) => m.db.transaction(async (tx: any) => {
        await tx.query("select set_config('app.org_id',$1,true)", [org]);
        const rows = [];
        for (const q of queries) rows.push((await tx.query(q.text, q.values)).rows);
        return rows;
    }),
    logAudit: vi.fn(),
}));
vi.mock('../src/lib/log', () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('../src/lib/after', () => ({ after: (p: Promise<unknown>) => { m.pending.push(Promise.resolve(p).catch(() => {})); } }));
vi.mock('../src/lib/email', () => ({ siteOrigin: () => 'https://cordhq.app' }));
vi.mock('../src/lib/webhooks', () => ({ dispatchEvent: m.dispatch }));
vi.mock('../src/lib/org-entitlements', () => ({ requireResourceCapacity: vi.fn(), resourceLimitError: vi.fn() }));
vi.mock('../src/lib/integraciones/hubspot/config', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../src/lib/integraciones/hubspot/config')>()),
    hubspotCredentials: () => m.creds,
}));

const conexiones = await import('../src/lib/integraciones/conexiones');
const sync = await import('../src/lib/integraciones/sync');
const { integrationQueueStatement } = await import('../src/lib/integraciones/queue');
const service = await import('../src/lib/integraciones/hubspot/service');

const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';
const USER_A = '00000000-0000-4000-8000-0000000000a1';
const USER_B = '00000000-0000-4000-8000-0000000000b1';
const CLIENTE = '00000000-0000-4000-8000-0000000000c1';
const QUOTE = '00000000-0000-4000-8000-0000000000d1';

const q = async (text: string, params: unknown[] = []) => (await m.db.query(text, params)).rows;
const flush = async () => { while (m.pending.length) await m.pending.shift(); };
const ctx = (org = A, userId = USER_A) => ({ orgId: org, origin: 'https://cordhq.app', userId });

class FakeHubSpot {
    seq = 100;
    objects: Record<string, Map<string, Record<string, string>>> = { companies: new Map(), contacts: new Map(), deals: new Map(), notes: new Map() };
    associations: string[] = [];
    calls: string[] = [];
    tokenStatus = 200;
    rateLimited = false;

    reset() {
        this.seq = 100;
        for (const k of Object.keys(this.objects)) this.objects[k].clear();
        this.associations = [];
        this.calls = [];
        this.tokenStatus = 200;
        this.rateLimited = false;
    }

    writes() {
        return this.calls.filter((c) => !c.startsWith('GET') && !c.includes('/search') && !c.includes('/oauth/'));
    }

    fetch = async (input: string | URL, init: RequestInit = {}) => {
        const url = new URL(String(input));
        const method = (init.method ?? 'GET').toUpperCase();
        this.calls.push(`${method} ${url.pathname}`);
        const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
        if (url.pathname.startsWith('/oauth/')) {
            if (url.pathname.endsWith('/revoke')) return json(200, {});
            if (this.tokenStatus !== 200) return json(this.tokenStatus, { error: 'invalid_grant' });
            return json(200, { access_token: `at_${this.calls.length}`, refresh_token: 'rt_1', expires_in: 1800, hub_id: 555, scopes: ['oauth'] });
        }
        if (this.rateLimited) return new Response('{}', { status: 429, headers: { 'retry-after': '7' } });
        if (url.pathname === '/account-info/v3/details') return json(200, { portalId: 555, uiDomain: 'app.hubspot.com' });
        if (url.pathname === '/crm/v3/pipelines/deals') {
            return json(200, { results: [{ id: 'default', label: 'Sales', stages: ['presentationscheduled', 'decisionmakerboughtin', 'contractsent', 'closedwon', 'closedlost'].map((id) => ({ id, label: id })) }] });
        }
        const body = init.body ? JSON.parse(String(init.body)) : {};
        const assoc = url.pathname.match(/^\/crm\/v4\/objects\/(\w+)\/(\d+)\/associations\/default\/(\w+)\/(\d+)$/);
        if (assoc) { this.associations.push(`${assoc[1]}:${assoc[2]}->${assoc[3]}:${assoc[4]}`); return json(200, {}); }
        if (url.pathname === '/crm/v3/objects/contacts/search') {
            const email = body.filterGroups[0].filters[0].value;
            const found = [...this.objects.contacts.entries()].find(([, p]) => p.email === email);
            return json(200, { results: found ? [{ id: found[0] }] : [] });
        }
        const obj = url.pathname.match(/^\/crm\/v3\/objects\/(\w+)(?:\/(\d+))?$/);
        if (obj) {
            const store = this.objects[obj[1]];
            if (method === 'POST') { const id = String(++this.seq); store.set(id, { ...body.properties }); return json(201, { id }); }
            const current = store.get(obj[2]);
            if (!current) return json(404, { message: 'not found' });
            if (method === 'PATCH') { Object.assign(current, body.properties); return json(200, { id: obj[2] }); }
            return json(200, { id: obj[2], properties: current });
        }
        return json(404, {});
    };
}

const hs = new FakeHubSpot();

async function conectar(org = A, userId = USER_A) {
    const state = await conexiones.createOAuthState(org, userId, 'hubspot');
    return service.finishHubSpotConnect(ctx(org, userId), { code: 'code-1', state, error: null });
}

async function enqueueEvent(type: string, data: Record<string, unknown>, actor = 'user:x', org = A) {
    const statement = integrationQueueStatement(org, type, data, actor) as unknown as { text: string; values: unknown[] } | null;
    if (!statement) return [];
    const [[rows]] = [await m.db.transaction(async (tx: any) => {
        await tx.query("select set_config('app.org_id',$1,true)", [org]);
        return [(await tx.query(statement.text, statement.values)).rows];
    })];
    return rows;
}

beforeAll(async () => {
    m.db = new PGlite();
    await m.db.exec(`
        create table orgs(id uuid primary key, moneda text);
        create table users(id uuid primary key);
        create table clientes(id uuid primary key default gen_random_uuid(), org_id uuid, empresa text, contacto text, email text, telefono text,
            rfc text, terminos_default text, limite_credito numeric, nivel text, descuento_pct numeric, regimen_fiscal text, uso_cfdi text,
            cp_fiscal text, country_code text, direccion_line1 text, direccion_line2 text, ciudad text, region text, created_at timestamptz default now());
        create table cotizaciones(id uuid primary key default gen_random_uuid(), org_id uuid, folio text, status text, total numeric,
            base_currency text, cliente_id uuid, created_at timestamptz default now(), approved_at timestamptz, paid_at timestamptz, vigencia date);
        insert into orgs values ('${A}', 'MXN'), ('${B}', 'USD');
        insert into users values ('${USER_A}'), ('${USER_B}');`);
    const migration = readFileSync(new URL('../db/migrations/2026-09-15-integraciones.sql', import.meta.url), 'utf8');
    await m.db.exec(migration);
    await m.db.exec(migration);
    await m.db.exec('create role app_test nologin; grant select, insert, update, delete on all tables in schema public to app_test;');
    vi.stubGlobal('fetch', hs.fetch);
}, 20000);

beforeEach(async () => {
    vi.clearAllMocks();
    m.pending.length = 0;
    m.creds = { clientId: 'cid', clientSecret: 'csecret' };
    hs.reset();
    await m.db.exec(`reset role;
        delete from integracion_sync; delete from integracion_vinculos; delete from integracion_conexiones; delete from integracion_oauth_estados;
        delete from cotizaciones; delete from clientes;
        insert into clientes (id, org_id, empresa, contacto, email, telefono) values ('${CLIENTE}', '${A}', 'Stark Industries', 'Pepper Potts', 'Compras@Stark.com', '555');
        insert into cotizaciones (id, org_id, folio, status, total, base_currency, cliente_id) values ('${QUOTE}', '${A}', 'COT-1', 'draft', 58000, null, '${CLIENTE}');`);
});

afterAll(async () => {
    vi.unstubAllGlobals();
    await m.db.close();
});

describe('OAuth', () => {
    it('el state es de un solo uso, de su usuario y su org', async () => {
        const state = await conexiones.createOAuthState(A, USER_A, 'hubspot');
        expect(await conexiones.consumeOAuthState(A, USER_B, 'hubspot', state)).toBe(false);
        expect(await conexiones.consumeOAuthState(B, USER_A, 'hubspot', state)).toBe(false);
        expect(await conexiones.consumeOAuthState(A, USER_A, 'hubspot', state)).toBe(true);
        expect(await conexiones.consumeOAuthState(A, USER_A, 'hubspot', state)).toBe(false);
        const vencido = await conexiones.createOAuthState(A, USER_A, 'hubspot');
        await q(`update integracion_oauth_estados set expires_at = now() - interval '1 minute' where used_at is null`);
        expect(await conexiones.consumeOAuthState(A, USER_A, 'hubspot', vencido)).toBe(false);
        expect((await q('select state_hash from integracion_oauth_estados')).every((r: any) => !r.state_hash.includes(state))).toBe(true);
    });

    it('conecta, guarda tokens cifrados y no deja conectar la misma cuenta en otra org', async () => {
        expect(await conectar()).toBe('conectada');
        const [row] = await q('select * from integracion_conexiones');
        expect(row).toMatchObject({ org_id: A, estado: 'activa', cuenta_externa: '555', cuenta_nombre: '555 · app.hubspot.com' });
        expect(row.access_token_enc).toMatch(/^enc:v1:/);
        expect(row.refresh_token_enc).toMatch(/^enc:v1:/);
        expect(JSON.stringify(row)).not.toContain('rt_1');
        expect(await conectar(B, USER_B)).toBe('otra_org');
    });

    it('sin state válido no llama a HubSpot, y sin credenciales dice que no está disponible', async () => {
        expect(await service.finishHubSpotConnect(ctx(), { code: 'x', state: 'inventado', error: null })).toBe('estado');
        expect(hs.calls).toEqual([]);
        m.creds = null;
        expect(await conectar()).toBe('no_disponible');
    });

    it('desconectar revoca, borra tokens y vacía la cola pendiente', async () => {
        await conectar();
        await enqueueEvent('client.updated', { id: CLIENTE });
        expect((await service.disconnectHubSpot(ctx())).status).toBe(200);
        const [row] = await q('select estado, access_token_enc, refresh_token_enc from integracion_conexiones');
        expect(row).toEqual({ estado: 'desconectada', access_token_enc: null, refresh_token_enc: null });
        expect(hs.calls).toContain('POST /oauth/2026-09/token/revoke');
        expect(await q('select * from integracion_sync')).toEqual([]);
        const [[resuelta]] = [await q(`select * from cord_resolve_integracion('hubspot', '555')`)];
        expect(resuelta).toBeUndefined();
    });
});

describe('cola', () => {
    it('solo encola con conexión activa, deduplica y nunca por eventos de la propia integración', async () => {
        expect(await enqueueEvent('client.updated', { id: CLIENTE })).toEqual([]);
        await conectar();
        const [conexion] = await q('select id from integracion_conexiones');
        expect((await enqueueEvent('client.updated', { id: CLIENTE })).length).toBe(1);
        expect((await enqueueEvent('client.updated', { id: CLIENTE })).length).toBe(0);
        expect((await enqueueEvent('quote.sent', { id: QUOTE }, `integration:hubspot:${conexion.id}`)).length).toBe(0);
        expect(integrationQueueStatement(A, 'product.updated', { id: CLIENTE }, 'user:x')).toBeNull();
        expect(await enqueueEvent('client.updated', { id: CLIENTE }, 'user:x', B)).toEqual([]);
    });
});

describe('Cord → HubSpot', () => {
    it('un cliente crea empresa y contacto asociados, y sin cambios no vuelve a escribir', async () => {
        await conectar();
        await enqueueEvent('client.created', { id: CLIENTE });
        await sync.processOrgSync(A);
        expect([...hs.objects.companies.values()]).toEqual([{ name: 'Stark Industries' }]);
        expect([...hs.objects.contacts.values()]).toEqual([{ email: 'compras@stark.com', firstname: 'Pepper', lastname: 'Potts', phone: '555' }]);
        expect(hs.associations).toEqual(['contacts:102->companies:101']);
        expect(await q('select objeto, externo_tipo, externo_id from integracion_vinculos order by objeto')).toEqual([
            { objeto: 'client', externo_tipo: 'company', externo_id: '101' },
            { objeto: 'client_contact', externo_tipo: 'contact', externo_id: '102' },
        ]);
        hs.calls = [];
        await enqueueEvent('client.updated', { id: CLIENTE });
        await sync.processOrgSync(A);
        expect(hs.writes()).toEqual([]);
    });

    it('un borrador no crea deal; al enviarse usa la divisa de la org y se asocia; al pagarse se cierra', async () => {
        await conectar();
        await enqueueEvent('quote.created', { id: QUOTE });
        await sync.processOrgSync(A);
        expect(hs.objects.deals.size).toBe(0);

        await q(`update cotizaciones set status = 'sent'`);
        await enqueueEvent('quote.sent', { id: QUOTE });
        await sync.processOrgSync(A);
        const [[dealId, deal]] = [...hs.objects.deals.entries()];
        expect(deal).toEqual({ dealname: 'COT-1 · Stark Industries', amount: '58000', deal_currency_code: 'MXN', pipeline: 'default', dealstage: 'presentationscheduled' });
        expect(hs.associations).toEqual(expect.arrayContaining([`deals:${dealId}->companies:101`, `deals:${dealId}->contacts:102`]));

        await q(`update cotizaciones set status = 'paid', base_currency = 'USD', paid_at = '2026-03-02T18:00:00Z'`);
        await enqueueEvent('quote.paid', { id: QUOTE });
        await sync.processOrgSync(A);
        expect(hs.objects.deals.get(dealId)).toMatchObject({ dealstage: 'closedwon', deal_currency_code: 'USD' });
        expect(hs.objects.deals.get(dealId)?.closedate).toBe('2026-03-02');
        expect(hs.objects.deals.size).toBe(1);
    });

    it('si HubSpot pide bajar el ritmo, reprograma sin gastar intentos', async () => {
        await conectar();
        await enqueueEvent('client.created', { id: CLIENTE });
        hs.rateLimited = true;
        await sync.processOrgSync(A);
        const [job] = await q('select status, attempts, extract(epoch from run_at - now()) as espera from integracion_sync');
        expect(job).toMatchObject({ status: 'queued', attempts: 0 });
        expect(Number(job.espera)).toBeGreaterThan(5);
    });

    it('si HubSpot retiró el acceso, la conexión queda en error y la cola espera', async () => {
        await conectar();
        await q(`update integracion_conexiones set access_expires_at = now() - interval '1 hour'`);
        await enqueueEvent('client.created', { id: CLIENTE });
        hs.tokenStatus = 400;
        await sync.processOrgSync(A);
        expect(await q('select estado from integracion_conexiones')).toEqual([{ estado: 'error' }]);
        expect(await q('select status from integracion_sync')).toEqual([{ status: 'queued' }]);
        await q(`update integracion_sync set run_at = now() - interval '1 minute'`);
        expect(await sync.processOrgSync(A)).toBe(0);
    });
});

describe('HubSpot → Cord', () => {
    async function vinculado() {
        await conectar();
        await enqueueEvent('client.created', { id: CLIENTE });
        await sync.processOrgSync(A);
        const [conexion] = await q('select id from integracion_conexiones');
        return conexion.id as string;
    }

    it('un cambio de correo en HubSpot actualiza Cord con el actor de la integración y no rebota', async () => {
        const conexionId = await vinculado();
        hs.objects.contacts.get('102')!.email = 'finanzas@stark.com';
        expect(await sync.enqueueInbound(A, conexionId, 'contact', '102')).toBe(true);
        await sync.processOrgSync(A);
        expect(await q('select email, empresa, contacto from clientes')).toEqual([{ email: 'finanzas@stark.com', empresa: 'Stark Industries', contacto: 'Pepper Potts' }]);
        expect(m.dispatch).toHaveBeenCalledWith(A, 'client.updated', expect.anything(), `integration:hubspot:${conexionId}`);
        expect((await enqueueEvent('client.updated', { id: CLIENTE }, `integration:hubspot:${conexionId}`)).length).toBe(0);
        hs.calls = [];
        await enqueueEvent('client.updated', { id: CLIENTE });
        await sync.processOrgSync(A);
        expect(hs.writes()).toEqual([]);
    });

    it('el eco de lo que Cord mandó no modifica nada', async () => {
        const conexionId = await vinculado();
        await sync.enqueueInbound(A, conexionId, 'company', '101');
        await sync.enqueueInbound(A, conexionId, 'contact', '102');
        await sync.processOrgSync(A);
        expect(m.dispatch).not.toHaveBeenCalled();
        expect(await q('select email from clientes')).toEqual([{ email: 'Compras@Stark.com' }]);
    });

    it('un vacío en HubSpot no borra datos en Cord y un objeto no vinculado se ignora', async () => {
        const conexionId = await vinculado();
        hs.objects.contacts.get('102')!.phone = '';
        hs.objects.companies.set('999', { name: 'Ajena' });
        await sync.enqueueInbound(A, conexionId, 'contact', '102');
        await sync.enqueueInbound(A, conexionId, 'company', '999');
        await sync.processOrgSync(A);
        expect(await q('select telefono, empresa from clientes')).toEqual([{ telefono: '555', empresa: 'Stark Industries' }]);
        expect(m.dispatch).not.toHaveBeenCalled();
    });

    it('si el objeto se borró en HubSpot, solo se desvincula', async () => {
        const conexionId = await vinculado();
        hs.objects.companies.delete('101');
        await sync.enqueueInbound(A, conexionId, 'company', '101');
        await sync.processOrgSync(A);
        expect(await q(`select * from integracion_vinculos where externo_tipo = 'company'`)).toEqual([]);
        expect(await q('select empresa from clientes')).toEqual([{ empresa: 'Stark Industries' }]);
    });
});

describe('acción de Workflows: nota en HubSpot', () => {
    it('va al Deal si existe, si no a la Empresa, y avisa si todavía no hay nada sincronizado', async () => {
        const { addHubSpotNote, HubSpotActionError } = await import('../src/lib/integraciones/hubspot/actions');
        await expect(addHubSpotNote(A, { quoteId: QUOTE, clientId: CLIENTE }, 'x')).rejects.toThrow(/Conecta HubSpot/);
        await conectar();
        const pendiente = await addHubSpotNote(A, { quoteId: QUOTE, clientId: CLIENTE }, 'x').catch((e) => e);
        expect(pendiente).toBeInstanceOf(HubSpotActionError);
        expect(pendiente.final).toBe(false);

        await enqueueEvent('client.created', { id: CLIENTE });
        await sync.processOrgSync(A);
        expect(await addHubSpotNote(A, { quoteId: QUOTE, clientId: CLIENTE }, '<p>hola</p>')).toBe('company');

        await q(`update cotizaciones set status = 'sent'`);
        await enqueueEvent('quote.sent', { id: QUOTE });
        await sync.processOrgSync(A);
        hs.calls = [];
        expect(await addHubSpotNote(A, { quoteId: QUOTE, clientId: CLIENTE }, '<p>aprobada</p>')).toBe('deal');
        expect(hs.calls).toContain('POST /crm/v3/objects/notes');
        expect(await addHubSpotNote(B, { quoteId: QUOTE, clientId: CLIENTE }, 'x').catch((e) => e.message)).toMatch(/Conecta HubSpot/);
    });
});

describe('aislamiento entre organizaciones', () => {
    it('con RLS, otra org no ve conexiones, vínculos ni cola', async () => {
        await conectar();
        await enqueueEvent('client.created', { id: CLIENTE });
        await sync.processOrgSync(A);
        await enqueueEvent('client.updated', { id: CLIENTE });
        const leer = async (org: string) => m.db.transaction(async (tx: any) => {
            await tx.query('set local role app_test');
            await tx.query("select set_config('app.org_id',$1,true)", [org]);
            return {
                conexiones: (await tx.query('select id from integracion_conexiones')).rows.length,
                vinculos: (await tx.query('select id from integracion_vinculos')).rows.length,
                cola: (await tx.query('select id from integracion_sync')).rows.length,
            };
        });
        expect(await leer(A)).toEqual({ conexiones: 1, vinculos: 2, cola: 2 });
        expect(await leer(B)).toEqual({ conexiones: 0, vinculos: 0, cola: 0 });
    });

    it('el webhook solo resuelve la org de una cuenta conectada', async () => {
        await conectar();
        expect(await q(`select org_id from cord_resolve_integracion('hubspot', '555')`)).toEqual([{ org_id: A }]);
        expect(await q(`select org_id from cord_resolve_integracion('hubspot', '556')`)).toEqual([]);
    });

    it('ajustes: rechaza un pipeline o etapa que no existe en la cuenta', async () => {
        await conectar();
        expect((await service.saveHubSpotAjustes(ctx(), { pipeline: 'otro' })).status).toBe(422);
        expect((await service.saveHubSpotAjustes(ctx(), { pipeline: 'default', etapas: { sent: 'inventada' } })).status).toBe(422);
        expect((await service.saveHubSpotAjustes(ctx(), { pipeline: 'default', etapas: { sent: 'contractsent' } })).status).toBe(200);
    });
});

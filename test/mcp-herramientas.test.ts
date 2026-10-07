import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
    tx: vi.fn(), entitlement: vi.fn(), propose: vi.fn(), trigger: vi.fn(), getPlan: vi.fn(),
}));

vi.mock('../src/lib/db', () => ({
    sql: (s: TemplateStringsArray, ...values: unknown[]) => ({ text: s.join('?'), values }),
    withOrgTx: m.tx, getActiveOrgId: async () => 'org-a', reqIp: () => '10.0.0.1',
}));
vi.mock('../src/lib/queries', () => ({
    getCotizacionesPage: vi.fn(), getCotizacion: vi.fn(), getCobranza: vi.fn(), getAnalytics: vi.fn(),
    getPlanUsage: vi.fn(), getFacturas: vi.fn(), getFacturaDetalle: vi.fn(),
}));
vi.mock('../src/lib/cotizaciones', () => ({ createCotizacion: vi.fn(), QuoteError: class extends Error {} }));
vi.mock('../src/lib/org-entitlements', () => ({ checkEntitlement: m.entitlement, getEntitlementContext: async () => ({ effectivePlan: 'pro' }) }));
vi.mock('../src/lib/fiscal/invoices', () => ({ createInvoiceDraft: vi.fn() }));
vi.mock('../src/lib/fiscal/gate', () => ({ invoicingFeatureFor: vi.fn() }));
vi.mock('../src/lib/public-links', () => ({ publicDocumentUrl: vi.fn() }));
vi.mock('../src/lib/apiv1', () => ({ invoiceListItem: vi.fn(), invoiceDetail: vi.fn() }));
vi.mock('../src/lib/api-idempotency', () => ({ withIdempotency: vi.fn() }));
vi.mock('../src/lib/ratelimit', () => ({ strictRateLimit: async () => ({ ok: true }) }));
vi.mock('../src/lib/domain-events-read', () => ({ listDomainEvents: vi.fn(), EventsQueryError: class extends Error {} }));
vi.mock('../src/lib/actions/quotes', () => ({ runQuoteAction: vi.fn() }));
vi.mock('../src/lib/actions/clients', () => ({ CLIENT_CONTACT_FIELDS: [], createClient: vi.fn(), patchClientContact: vi.fn() }));
vi.mock('../src/lib/actions/tasks', () => ({ createTask: vi.fn() }));
vi.mock('../src/lib/actions/promises', () => ({ createPromise: vi.fn() }));
vi.mock('../src/lib/analytics-internal', () => ({ isInternalAnalyticsOrg: async () => true }));
vi.mock('../src/lib/setup/propose', () => ({ proposeSetup: m.propose }));
vi.mock('../src/lib/setup/apply', () => ({ getSetupPlan: m.getPlan }));
vi.mock('../src/lib/sandbox-sim', () => ({ triggerTestEvent: m.trigger, NotSandboxError: class extends Error {} }));

const { MCP_TOOLS, findTool, McpToolError } = await import('../src/lib/mcp');
const { handle } = await import('../src/lib/mcp/rpc');
const { searchDocs, plainText, docsPath, docsSection } = await import('../src/lib/docs-search');

const ID = '11111111-1111-4111-8111-111111111111';
const ctx = (over: Record<string, unknown> = {}) => ({ ip: '10.0.0.1', keyId: 'key-1', orgId: 'org-a', scope: 'write' as const, mode: 'test' as const, origin: 'https://cordhq.app', ...over });
const call = (name: string, args: Record<string, unknown>, over: Record<string, unknown> = {}) => findTool(name)!.handler(args, ctx(over));
const req = new Request('https://cordhq.app/api/mcp');

beforeEach(() => {
    vi.clearAllMocks();
    m.entitlement.mockResolvedValue({ ok: true });
});

describe('protocolo', () => {
    it('cada tool declara outputSchema abierto y la respuesta trae structuredContent', async () => {
        for (const t of MCP_TOOLS) {
            expect(t.outputSchema, t.name).toBeTruthy();
            expect((t.outputSchema as any).additionalProperties, t.name).toBeUndefined();
        }
        const r: any = await handle({ method: 'tools/call', params: { name: 'validar_datos_fiscales', arguments: { country: 'MX', tax_id: 'EKU9003173C9' } } },
            { scope: 'read', keyId: 'k', orgId: 'org-a', mode: 'live' }, req);
        expect(r.structuredContent.ok).toBeTypeOf('boolean');
        expect(JSON.parse(r.content[0].text)).toEqual(r.structuredContent);
        expect(r.content[0].text).not.toContain('\n');
    });

    it('las instrucciones mandan a proponer la configuración, no a aplicarla', async () => {
        const init: any = await handle({ method: 'initialize', params: {} }, { scope: 'read', keyId: 'k', orgId: 'org-a' }, req);
        expect(init.instructions).toContain('proponer_configuracion');
        expect(init.instructions).toContain('contexto_cuenta');
    });

    it('un error de plan llega al modelo con el plan correcto, no como error interno', async () => {
        m.entitlement.mockResolvedValue({ ok: false, requiredPlan: 'pro' });
        await expect(call('cartera_vencida', {})).rejects.toThrow(McpToolError);
        await expect(call('cartera_vencida', {})).rejects.toThrow(/Profesional/);
    });
});

describe('herramientas nuevas', () => {
    it('contexto_cuenta dice divisa y modo', async () => {
        m.tx.mockResolvedValue([[{ nombre: 'Materiales', country_code: 'MX', moneda: 'usd', idioma: 'es', zona_horaria: 'America/Mexico_City' }]]);
        expect(await call('contexto_cuenta', {})).toMatchObject({ negocio: 'Materiales', moneda: 'USD', modo: 'prueba', permiso: 'escritura', plan: 'Profesional' });
        expect(await call('contexto_cuenta', {}, { mode: 'live', scope: 'read' })).toMatchObject({ modo: 'en_vivo', permiso: 'lectura' });
    });

    it('proponer_configuracion propone sobre la cuenta real y devuelve el link de revisión', async () => {
        m.tx.mockResolvedValue([[{ sandbox_of: 'org-real' }]]);
        m.propose.mockResolvedValue({ ok: true, id: ID, avisos: [], descartado: [], propuesta: { resumen: 'x', perfil: { nombre: 'A' }, marca: {}, cotizaciones: {}, impuestos: [], productos: [], plantillas: [] } });
        const r: any = await call('proponer_configuracion', { sitio: 'materiales.mx' });
        expect(m.propose).toHaveBeenCalledWith(expect.objectContaining({ orgId: 'org-real', origen: 'mcp', creadoPor: 'mcp:key-1', sitio: 'materiales.mx' }));
        expect(r).toMatchObject({ id: ID, estado: 'propuesto', review_url: `https://cordhq.app/app/setup/${ID}` });
        expect(r.conteos.perfil).toBe(1);
    });

    it('proponer_configuracion rechaza archivos de más de 3 MB antes de leerlos', async () => {
        m.tx.mockResolvedValue([[{ sandbox_of: null }]]);
        const big = Buffer.alloc(3 * 1024 * 1024 + 10).toString('base64');
        await expect(call('proponer_configuracion', { archivo_base64: big })).rejects.toThrow(/3 MB/);
        expect(m.propose).not.toHaveBeenCalled();
    });

    it('estado_configuracion valida el id y busca en la cuenta real', async () => {
        await expect(call('estado_configuracion', { id: 'x' })).rejects.toThrow(McpToolError);
        m.tx.mockResolvedValue([[{ sandbox_of: 'org-real' }]]);
        m.getPlan.mockResolvedValue({ id: ID, estado: 'aplicado', resultado: [{ seccion: 'perfil', ok: true }] });
        expect(await call('estado_configuracion', { id: ID })).toMatchObject({ estado: 'aplicado', resultado: [{ seccion: 'perfil', ok: true }] });
        expect(m.getPlan).toHaveBeenCalledWith('org-real', ID);
    });

    it('validar_datos_fiscales usa las reglas de emisión', async () => {
        const ok: any = await call('validar_datos_fiscales', { country: 'MX', tax_id: 'EKU9003173C9', legal_name: 'ESCUELA KEMPER URGATE', regimen_fiscal: '601', uso_cfdi: 'G03', cp_fiscal: '42501' });
        expect(ok.ok).toBe(true);
        const bad: any = await call('validar_datos_fiscales', { country: 'MX', tax_id: 'ABC' });
        expect(bad.ok).toBe(false);
        expect(bad.errores.map((e: any) => e.field)).toContain('tax_id');
    });

    it('validar_apariencia descarta url() y claves desconocidas', async () => {
        const r: any = await call('validar_apariencia', { appearance: { theme: 'night', variables: { colorPrimary: '#0a192f', colorBackground: 'url(https://x)' } } });
        expect(r.tema).toBe('dark');
        expect(r.ok).toBe(false);
        expect(r.descartadas).toContain('variables.colorBackground');
    });

    it('simular_evento solo con llave de prueba y eventos del catálogo', async () => {
        await expect(call('simular_evento', { evento: 'quote.approved' }, { mode: 'live' })).rejects.toThrow(/prueba/);
        await expect(call('simular_evento', { evento: 'nada.raro' })).rejects.toThrow(McpToolError);
        m.trigger.mockResolvedValue('ejemplo');
        expect(await call('simular_evento', { evento: 'quote.approved' })).toEqual({ evento: 'quote.approved', datos: 'ejemplo' });
        expect(m.trigger).toHaveBeenCalledWith('org-a', 'quote.approved', undefined);
    });
});

describe('buscar_documentacion', () => {
    const docs = [
        { title: 'Webhooks', description: 'Recibe eventos firmados', body: plainText('---\ntitle: x\n---\nVerifica la firma con constructEvent y el cuerpo crudo. <Card>firma</Card>'), url: '/docs/desarrolladores/herramientas/webhooks', lang: 'es' as const },
        { title: 'Webhooks', description: 'Signed events', body: 'Verify the signature with constructEvent.', url: '/en/docs/desarrolladores/herramientas/webhooks', lang: 'en' as const },
        { title: 'Clientes', description: 'Directorio', body: 'Alta de clientes y estado de cuenta.', url: '/docs/gestion/clientes', lang: 'es' as const },
    ];

    it('ordena por relevancia, respeta el idioma e ignora acentos', () => {
        const r = searchDocs(docs, 'verificar FIRMA webhook', 'es');
        expect(r[0]).toMatchObject({ titulo: 'Webhooks', url: 'https://docs.cordhq.app/docs/desarrolladores/herramientas/webhooks' });
        expect(r.every((h) => !h.url.includes('/en/'))).toBe(true);
        expect(r[0].extracto).toContain('firma');
        expect(r[0].extracto).not.toContain('<Card>');
        expect(searchDocs(docs, 'estado de cuenta', 'es')[0].titulo).toBe('Clientes');
        expect(searchDocs(docs, '  ', 'es')).toEqual([]);
    });
});

describe('índice de la documentación', () => {
    it('plainText quita imports, JSX y atributos, y conserva encabezados y código', () => {
        const mdx = [
            '---', 'title: x', '---',
            "import Callout from '../Callout.astro';",
            '<section class="docs-section split" style="a > b">',
            '  <h2>Crea una cuenta</h2>',
            '  <svg viewBox="0 0 24 24"><path d="M1 1"/></svg>',
            '</section>',
            '## Firma &rarr; webhook',
            'Usa `<cord-cotizador>` y [la guía](/docs/x).',
            '```ts',
            "import { Cord } from '@flouviahq/node';",
            '<CordProvider publishableKey="pk_test">',
            '```',
        ].join('\n');
        const t = plainText(mdx);
        expect(t).toContain('Crea una cuenta');
        expect(t).toContain('Firma → webhook');
        expect(t).toContain('<cord-cotizador>');
        expect(t).toContain('la guía');
        expect(t).toContain("import { Cord } from '@flouviahq/node';");
        expect(t).toContain('<CordProvider publishableKey="pk_test">');
        expect(t).not.toMatch(/class=|style=|viewBox|Callout|title: x|##|\/docs\/x/);
    });

    it('la portada vive en la raíz y la sección es legible', () => {
        expect(docsPath('es', 'resumen')).toBe('/docs');
        expect(docsPath('en', 'resumen')).toBe('/en/docs');
        expect(docsPath('en', 'pagos/aceptar')).toBe('/en/docs/pagos/aceptar');
        expect(docsSection('cuenta/csd', 'es')).toBe('Cuenta');
        expect(docsSection('pagos/aceptar', 'en')).toBe('Payments');
        expect(docsSection('resumen', 'es')).toBe('Empezar');
    });
});

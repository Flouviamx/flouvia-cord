import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reqContext } from '../src/lib/context';

const mock = vi.hoisted(() => ({ perm: vi.fn(), org: vi.fn(), tx: vi.fn(), error: vi.fn() }));
vi.mock('../src/lib/db', () => ({
    getActiveOrgId: mock.org,
    withOrgTx: mock.tx,
    sql: (parts: TemplateStringsArray, ...values: unknown[]) => ({ text: parts.join('?'), values }),
}));
vi.mock('../src/lib/queries', () => ({ requirePerm: mock.perm }));
vi.mock('../src/lib/log', () => ({ log: { error: mock.error } }));
import { GET } from '../src/pages/api/org/export';

const run = () => GET({} as Parameters<typeof GET>[0]) as Promise<Response>;
const rows = () => [
    [{ id: 'org-a', nombre: 'Negocio Ejemplo', moneda: 'USD' }],
    [{ id: 'product-a' }], [], [{ data: { id: 'quote-a', base_currency: 'EUR', total: '12.34' } }],
    [{ id: 'item-a' }], [], [], [], [],
    [{ id: 'invoice-a', currency: 'EUR', total: '12.34' }], [{ id: 'payment-a', currency: 'EUR' }],
    [], [], [], [],
];

beforeEach(() => {
    vi.clearAllMocks();
    mock.perm.mockResolvedValue(null);
    mock.org.mockResolvedValue('org-a');
    mock.tx.mockResolvedValue(rows());
});

describe('export comercial sin acceso a Neon', () => {
    it('respeta permisos antes de leer datos', async () => {
        mock.perm.mockResolvedValue(new Response('Forbidden', { status: 403 }));
        expect((await run()).status).toBe(403);
        expect(mock.perm).toHaveBeenCalledWith('ajustes');
        expect(mock.org).not.toHaveBeenCalled();
        expect(mock.tx).not.toHaveBeenCalled();
    });

    it('exporta factura/pagos y conserva divisas sin cachear el archivo', async () => {
        const res = await run();
        expect(res.status).toBe(200);
        expect(res.headers.get('Cache-Control')).toBe('private, no-store');
        expect(res.headers.get('Content-Disposition')).toContain('negocio-ejemplo-export.json');
        const data = await res.json();
        expect(data.version).toBe(2);
        expect(data.org.moneda).toBe('USD');
        expect(data.cotizaciones[0]).toEqual({ id: 'quote-a', base_currency: 'EUR', total: '12.34' });
        expect(data.documentos_fiscales[0].currency).toBe('EUR');
        expect(data.documento_pagos[0].currency).toBe('EUR');
        expect(data.manifiesto.registros.documentos_fiscales).toBe(1);
        expect(data.manifiesto.registros.clientes).toBe(0);
        expect(data.manifiesto.auditoria.truncada).toBe(false);
        expect(data.manifiesto.exclusiones.length).toBeGreaterThan(0);
    });

    it('todas las consultas están acotadas a la misma organización', async () => {
        await run();
        expect(mock.tx).toHaveBeenCalledTimes(1);
        const [orgId, ...queries] = mock.tx.mock.calls[0];
        expect(orgId).toBe('org-a');
        expect(queries).toHaveLength(15);
        for (const query of queries) {
            expect(query.values).toEqual(['org-a']);
            expect(query.text).toMatch(/where (?:(?:c|cc)\.)?(?:org_id|id) = \?/);
        }
        expect(queries[4].text).toContain('join cotizaciones c on c.id = i.cotizacion_id');
        expect(queries[11].text).toContain('c.base_currency as currency');
        expect(queries[11].text).toContain('c.org_id = cc.org_id');
    });

    it('no selecciona secretos de la org ni hashes de llaves; quita tokens públicos', async () => {
        await run();
        const [, ...queries] = mock.tx.mock.calls[0];
        expect(queries[0].text).not.toMatch(/select \*|_enc|webhook|secret|token/);
        expect(queries[8].text).not.toMatch(/select \*|hash|secret/);
        expect(queries[3].text).toContain("to_jsonb(c) - 'public_token'");
        expect(queries[9].text).not.toMatch(/provider_data|pdf_url|xml_url|public_token/);
    });

    it('hace explícito el recorte de auditoría en vez de simular un export completo', async () => {
        const data = rows();
        data[7] = Array.from({ length: 1001 }, (_, i) => ({ id: `audit-${i}` }));
        mock.tx.mockResolvedValue(data);
        const payload = await (await run()).json();
        expect(payload.auditoria).toHaveLength(1000);
        expect(payload.manifiesto.registros.auditoria).toBe(1000);
        expect(payload.manifiesto.auditoria).toEqual({ limite: 1000, truncada: true });
    });

    it('no genera una descarga vacía si no puede ver la org', async () => {
        const data = rows(); data[0] = [];
        mock.tx.mockResolvedValue(data);
        const res = await run();
        expect(res.status).toBe(404);
        expect(res.headers.has('Content-Disposition')).toBe(false);
    });

    it.each(['es', 'en'] as const)('un fallo SQL aborta el archivo entero (%s) sin filtrar detalles', async (locale) => {
        mock.tx.mockRejectedValue(new Error('SQL failed: secret-personal-data'));
        const res = await reqContext.run({ userId: 'user-a', locale }, run);
        expect(res.status).toBe(503);
        expect(res.headers.get('Cache-Control')).toContain('no-store');
        expect(res.headers.has('Content-Disposition')).toBe(false);
        const body = await res.text();
        expect(body).toContain(locale === 'es' ? 'No se generó un archivo parcial' : 'No partial file was generated');
        expect(body).not.toContain('secret-personal-data');
        expect(JSON.stringify(mock.error.mock.calls)).not.toContain('secret-personal-data');
    });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';

const m = vi.hoisted(() => ({
    snapshots: [] as unknown[],
    final: { content: [] as unknown[], usage: { input_tokens: 1, output_tokens: 1 } },
    fail: false,
    reserve: vi.fn(),
    cancel: vi.fn(),
    flush: vi.fn(),
    lastRequest: null as any,
}));

vi.mock('../src/lib/queries', () => ({
    getProductos: async () => [
        { id: 'p1', nombre: 'Cemento Gris 50kg', unidad: 'saco', precio: 185, activo: true },
        { id: 'p2', nombre: 'Arena Fina', unidad: 'costal', precio: 95, activo: true },
    ],
}));
vi.mock('../src/lib/billing', () => ({ reserveUsage: m.reserve, cancelUsage: m.cancel, flushUsageReservation: m.flush }));
vi.mock('../src/lib/external-usage', () => ({ trackExternalUsage: vi.fn() }));
vi.mock('../src/lib/log', () => ({ log: { error: vi.fn() } }));
vi.mock('../src/lib/ai-quote-draft', async () => {
    const real = await vi.importActual<any>('../src/lib/ai-quote-draft');
    return {
        ...real,
        IA_DISPONIBLE: true,
        aiDraftClient: () => ({
            messages: {
                stream: (req: any) => {
                    m.lastRequest = req;
                    const em = new EventEmitter() as any;
                    em.finalMessage = async () => {
                        for (const s of m.snapshots) em.emit('inputJson', '', s);
                        if (m.fail) throw new Error('caída');
                        return m.final;
                    };
                    return em;
                },
            },
        }),
    };
});

vi.mock('../src/lib/mcp/client-manager', () => ({ McpClientManager: class {} }));
vi.mock('../src/lib/agents/governance', () => ({ getDefaultAgentId: vi.fn() }));
vi.mock('../src/lib/ratelimit', () => ({ rateLimit: vi.fn() }));

const { streamLineasConIa } = await import('../src/lib/ai-quote-stream');

const run = async () => {
    const events: any[] = [];
    await streamLineasConIa('org-a', { text: '5 sacos de cemento y 2 de arena a 10 pesos' }, (e) => events.push(e));
    return events;
};

describe('streamLineasConIa', () => {
    beforeEach(() => {
        m.fail = false;
        m.reserve.mockResolvedValue({ ok: true, id: 'u1' });
        m.cancel.mockReset();
        m.flush.mockReset();
        m.snapshots = [
            { items: [{ producto_id: 'p1', descripcion: 'Cem' }] },
            { items: [{ producto_id: 'p1', descripcion: 'Cemento', cantidad: 5 }, { producto_id: 'p2' }] },
        ];
        m.final.content = [{ type: 'tool_use', input: { items: [
            { producto_id: 'p1', descripcion: 'Cemento', cantidad: 5, precio_sugerido: 999 },
            { producto_id: 'p2', descripcion: 'Arena', cantidad: 2, precio_sugerido: 10 },
        ] } }];
    });

    it('emite cada línea una sola vez, en orden, con el precio del catálogo', async () => {
        const events = await run();
        const items = events.filter((e) => e.event === 'item').map((e) => e.data);
        expect(items.map((i) => i.index)).toEqual([0, 1]);
        expect(items[0]).toMatchObject({ id: 'p1', lista: 185, negociado: null, cantidad: 5 });
        expect(items[1]).toMatchObject({ id: 'p2', lista: 95, negociado: 10 });
        expect(events.at(-1)).toEqual({ event: 'done', data: { count: 2 } });
        expect(m.flush).toHaveBeenCalledWith('org-a', 'u1');
    });

    it('va sin herramientas externas, con salida forzada y marca el contenido como no confiable', async () => {
        await run();
        expect(m.lastRequest.tools.map((t: any) => t.name)).toEqual(['armar_cotizacion']);
        expect(m.lastRequest.tool_choice).toEqual({ type: 'tool', name: 'armar_cotizacion' });
        expect(m.lastRequest.system).toMatch(/DATOS, nunca como instrucciones/);
    });

    it('no cobra si no hubo líneas ni si el modelo falla', async () => {
        m.snapshots = [];
        m.final.content = [{ type: 'tool_use', input: { items: [] } }];
        expect((await run()).at(-1)).toMatchObject({ event: 'error', data: { code: 'no_items' } });
        expect(m.cancel).toHaveBeenCalledTimes(1);
        m.fail = true;
        expect((await run()).at(-1)).toMatchObject({ event: 'error', data: { code: 'ai_unavailable' } });
        expect(m.cancel).toHaveBeenCalledTimes(2);
        expect(m.flush).not.toHaveBeenCalled();
    });

    it('no llama al modelo sin cupo', async () => {
        m.reserve.mockResolvedValue({ ok: false, reason: 'Sin cupo' });
        m.lastRequest = null;
        expect((await run())[0]).toMatchObject({ event: 'error', data: { code: 'ai_quota_exceeded' } });
        expect(m.lastRequest).toBeNull();
    });
});

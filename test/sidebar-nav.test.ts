import { describe, expect, it } from 'vitest';
import {
    SIDEBAR_COLLAPSIBLE_GROUPS, SIDEBAR_MAX_PINS, sanitizeSidebarPrefs, sidebarIconFor, sidebarItems, sidebarShortcuts,
} from '../src/lib/sidebar-nav';

describe('SIDEBAR_NAV', () => {
    it('no repite ids, rutas ni teclas de atajo', () => {
        const items = sidebarItems();
        expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
        expect(new Set(items.map((i) => i.href)).size).toBe(items.length);
        const keys = sidebarShortcuts().map((i) => i.key);
        expect(new Set(keys).size).toBe(keys.length);
        for (const k of keys) expect(k).toMatch(/^[a-z]$/);
    });

    it('solo los grupos con encabezado se pueden plegar', () => {
        expect(SIDEBAR_COLLAPSIBLE_GROUPS).not.toContain('principal');
        expect(SIDEBAR_COLLAPSIBLE_GROUPS).toContain('ingresos');
    });
});

describe('sidebarIconFor', () => {
    it('hereda el icono de la sección por el prefijo más largo', () => {
        expect(sidebarIconFor('/app/clientes/123')).toBe('clients');
        expect(sidebarIconFor('/app/cobranza/agente')).toBe('cpu');
        expect(sidebarIconFor('/app/cobranza?f=vencidas')).toBe('tray');
        expect(sidebarIconFor('/app/informes?r=ventas')).toBe('chart');
    });

    it('/app solo coincide consigo mismo; lo demás cae al pin', () => {
        expect(sidebarIconFor('/app')).toBe('overview');
        expect(sidebarIconFor('/app/ajustes/plan')).toBe('pin');
        expect(sidebarIconFor('/app/clientesx')).toBe('pin');
    });
});

describe('sanitizeSidebarPrefs', () => {
    it('distingue "nunca guardado" de "vaciado a propósito"', () => {
        expect(sanitizeSidebarPrefs(undefined).pins).toBeUndefined();
        expect(sanitizeSidebarPrefs({}).pins).toBeUndefined();
        expect(sanitizeSidebarPrefs({ pins: [] }).pins).toEqual([]);
    });

    it('acepta solo rutas internas de /app', () => {
        const { pins } = sanitizeSidebarPrefs({
            pins: [
                { href: '/app/clientes/1', label: 'Acme' },
                { href: '/app/informes?r=ventas', label: 'Ventas' },
                { href: 'https://evil.example/app', label: 'x' },
                { href: '//evil.example/app', label: 'x' },
                { href: '/app//evil.example', label: 'x' },
                { href: 'javascript:alert(1)', label: 'x' },
                { href: '/apple', label: 'x' },
                { href: '/app/"onmouseover=1', label: 'x' },
                { href: '/app/`x`', label: 'x' },
                { href: '/app/productos', label: '   ' },
                'basura',
                null,
            ],
        });
        expect(pins).toEqual([
            { href: '/app/clientes/1', label: 'Acme' },
            { href: '/app/informes?r=ventas', label: 'Ventas' },
        ]);
    });

    it('quita duplicados, normaliza la etiqueta y respeta el tope', () => {
        const many = Array.from({ length: 20 }, (_, i) => ({ href: `/app/clientes/${i}`, label: `  Cliente\n ${i} ` }));
        const { pins } = sanitizeSidebarPrefs({ pins: [many[0], ...many] });
        expect(pins).toHaveLength(SIDEBAR_MAX_PINS);
        expect(pins![0]).toEqual({ href: '/app/clientes/0', label: 'Cliente 0' });
        expect(sanitizeSidebarPrefs({ pins: [{ href: '/app', label: 'x'.repeat(200) }] }).pins![0].label).toHaveLength(80);
    });

    it('solo guarda grupos plegables conocidos', () => {
        expect(sanitizeSidebarPrefs({ collapsed: ['ingresos', 'ingresos', 'principal', 'inventado', 3] }).collapsed).toEqual(['ingresos']);
        expect(sanitizeSidebarPrefs({ collapsed: 'ingresos' }).collapsed).toEqual([]);
    });
});

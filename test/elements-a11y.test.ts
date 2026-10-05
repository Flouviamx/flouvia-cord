// @vitest-environment jsdom
// Accesibilidad WCAG 2.2 AA de lo que Cord pone en la página de otros: axe-core
// revisa la estructura (nombres, etiquetas, roles, ARIA) del Builder y del
// formulario fiscal, y el contraste se calcula aparte porque jsdom no pinta.
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import axe from 'axe-core';
import { createElement, act } from 'react';
import { createRoot } from 'react-dom/client';
import { contrast, luminance } from './support/contrast';
import { DARK_PALETTE } from '../packages/elements/src/appearance';
import { SURFACE_CSS } from '../src/lib/embed-appearance';
import { defineFiscalElement } from '../packages/elements/src/fiscal-element';
import { CordProvider } from '../packages/elements/src/context';
import { CordBuilder } from '../packages/elements/src/react';
import type { CordElementsConfig } from '../packages/elements/src/contract/elements-config';

const AA = 4.5;

async function violations(root: Element | Document = document) {
    const r = await axe.run(root as any, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
        rules: { 'color-contrast': { enabled: false } },
    });
    return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);
}

// Título e idioma son de la página anfitriona, no del componente.
document.documentElement.lang = 'es';
document.title = 'Prueba de accesibilidad';

afterEach(() => { document.body.innerHTML = ''; });

describe('contraste', () => {
    it('el texto de la cotización pública cumple 4.5:1 sobre blanco', () => {
        const src = readFileSync('src/components/q/QuoteCard.astro', 'utf8');
        const css = src.slice(src.indexOf('<style'));
        const fallan: string[] = [];
        for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
            const selector = m[1].trim().split(',').pop()!.trim();
            if (/svg|::selection/.test(selector)) continue;
            for (const c of m[2].matchAll(/(?<![-\w])color:\s*(#[0-9a-f]{3,6})\b/gi)) {
                const hex = c[1].toLowerCase();
                // Los colores claros son texto sobre fondos oscuros (botones, sellos): no se miden contra blanco.
                if (luminance(hex) >= 0.6) continue;
                if (contrast(hex, '#ffffff') < AA) fallan.push(`${selector} ${hex} ${contrast(hex, '#ffffff').toFixed(2)}`);
            }
        }
        expect(fallan).toEqual([]);
    });

    it('los valores por defecto del Appearance API cumplen sobre la tarjeta y sus paneles', () => {
        const textRoles = ['color-text', 'color-text-secondary', 'color-text-placeholder', 'color-danger'];
        for (const m of SURFACE_CSS.matchAll(/var\(--cord-([a-z-]+), (#[0-9a-f]{3,6})\)/gi)) {
            if (!textRoles.includes(m[1]) || /background/.test(m.input!.slice(Math.max(0, m.index! - 14), m.index))) continue;
            for (const bg of ['#ffffff', '#fafafa']) expect(contrast(m[2], bg), `${m[1]} ${m[2]} sobre ${bg}`).toBeGreaterThanOrEqual(AA);
        }
    });

    it('el tema oscuro cumple sobre el fondo y las superficies', () => {
        const dark = Object.fromEntries(DARK_PALETTE);
        for (const role of ['--cord-color-text', '--cord-color-text-secondary', '--cord-color-text-placeholder', '--cord-color-input-text']) {
            for (const bg of ['--cord-color-background', '--cord-color-surface', '--cord-color-input']) {
                expect(contrast(dark[role], dark[bg]), `${role} sobre ${bg}`).toBeGreaterThanOrEqual(AA);
            }
        }
    });

    it('el Builder y el formulario fiscal usan grises que cumplen', () => {
        const css = readFileSync('packages/elements/src/styles.ts', 'utf8') + readFileSync('packages/elements/src/fiscal-element.ts', 'utf8');
        for (const m of css.matchAll(/var\(--cord-color-(text-secondary|text|danger), (#[0-9a-f]{3,6})\)/gi)) {
            expect(contrast(m[2], '#ffffff'), `${m[1]} ${m[2]}`).toBeGreaterThanOrEqual(AA);
        }
    });
});

describe('axe-core', () => {
    it('<cord-fiscal-form> en México y España', async () => {
        defineFiscalElement();
        for (const country of ['MX', 'ES']) {
            document.body.innerHTML = `<main><form><cord-fiscal-form country="${country}" name="fiscal"></cord-fiscal-form></form></main>`;
            await new Promise((r) => setTimeout(r, 0));
            const el = document.querySelector('cord-fiscal-form')!;
            expect(el.shadowRoot?.querySelector('input'), country).toBeTruthy();
            expect(await violations(), country).toEqual([]);
        }
    });

    it('<CordBuilder> con catálogo, impuestos y datos fiscales', async () => {
        const CONFIG: CordElementsConfig = {
            object: 'elements_config',
            org: { nombre: 'Taller', pais: 'MX', locale: 'es', moneda: 'MXN', color_primario: null, logo_url: null },
            monedas: ['MXN', 'USD'],
            impuestos: {
                etiqueta: 'IVA',
                opciones: [{ id: null, label: 'Exento', rate: 0, kind: 'exento' }, { id: 'a', label: 'IVA 16%', rate: 0.16, kind: 'consumo' }],
                tasa_default: 0.16, retenciones: [], precios_incluyen_impuesto: false,
            },
            terminos: ['contado', 'net30'], terminos_default: 'contado', vigencia_dias_default: 30,
            fiscal: { pais: 'MX', reglas_propias: true },
        };
        const respond = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
        globalThis.fetch = (async (url: string) => respond(String(url).includes('/elements/config') ? { data: CONFIG } : { data: [] })) as any;
        window.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as any;
        (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

        document.body.innerHTML = '<main id="app"></main>';
        const root = createRoot(document.getElementById('app')!);
        await act(async () => {
            root.render(createElement(CordProvider, { publishableKey: 'pk_test_x', children: createElement(CordBuilder, { fiscal: true }) as any }));
        });
        await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
        expect(document.querySelector('form')).toBeTruthy();
        expect(await violations()).toEqual([]);
        act(() => root.unmount());
    });
});

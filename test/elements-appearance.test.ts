import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { sanitizeAppearance, appearanceToCss, APPEARANCE_VARIABLES, APPEARANCE_SELECTORS, cssVariableName } from '../packages/elements/src/appearance';
import { SURFACE_CSS, SELECTOR_MAP, embedAppearanceCss } from '../src/lib/embed-appearance';

describe('sanitizeAppearance', () => {
    it('acepta los valores legítimos', () => {
        const a = sanitizeAppearance({
            theme: 'dark',
            variables: {
                colorPrimary: '#0a192f',
                colorText: 'rgb(10, 25, 47)',
                colorBackground: 'hsl(210 40% 98%)',
                borderRadius: '12px',
                fontSize: '0.95rem',
                fontFamily: "'Inter', sans-serif",
            },
            fonts: [{ cssSrc: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap' }],
        });
        expect(a.rejected).toEqual([]);
        expect(a.theme).toBe('dark');
        expect(Object.fromEntries(a.variables)).toMatchObject({
            '--cord-color-primary': '#0a192f',
            '--cord-border-radius': '12px',
            '--cord-font-family': "'Inter', sans-serif",
        });
        expect(a.fontImports).toHaveLength(1);
    });

    it('descarta url(), rupturas de bloque y claves desconocidas', () => {
        const a = sanitizeAppearance({
            variables: {
                colorPrimary: 'url(https://evil.example/pixel)',
                colorText: 'red; } body { display:none',
                borderRadius: 'expression(alert(1))',
                fontFamily: 'Inter</style><script>alert(1)</script>',
                colorBorder: 'image-set(url(x))',
                position: 'fixed',
            },
        });
        expect(a.variables).toEqual([]);
        expect(a.rejected.sort()).toEqual([
            'variables.borderRadius', 'variables.colorBorder', 'variables.colorPrimary',
            'variables.colorText', 'variables.fontFamily', 'variables.position',
        ]);
    });

    it('solo carga fuentes de proveedores conocidos por https', () => {
        const a = sanitizeAppearance({
            fonts: [
                { cssSrc: 'https://evil.example/css2?family=Inter' },
                { cssSrc: 'http://fonts.googleapis.com/css2?family=Inter' },
                { cssSrc: "https://fonts.googleapis.com/css2?family=Inter');}*{color:red" },
                { cssSrc: 'https://user:pw@fonts.googleapis.com/css2?family=Inter' },
            ],
        });
        expect(a.fontImports).toEqual([]);
        expect(a.rejected).toHaveLength(4);
    });

    it('deriva la familia de la primera fuente cuando no se declara', () => {
        const a = sanitizeAppearance({ fonts: [{ cssSrc: 'https://fonts.bunny.net/css?family=Open+Sans:400' }] });
        expect(Object.fromEntries(a.variables)['--cord-font-family']).toBe('Open Sans');
    });

    it('ignora entradas que no son objeto', () => {
        expect(sanitizeAppearance('x').variables).toEqual([]);
        expect(sanitizeAppearance(null).theme).toBe('light');
    });
});

describe('appearanceToCss', () => {
    it('emite el tema antes que las variables del usuario para que estas ganen', () => {
        const css = appearanceToCss(sanitizeAppearance({ theme: 'dark', variables: { colorText: '#fff' } }));
        expect(css.indexOf('#e5e7eb')).toBeLessThan(css.indexOf('--cord-color-text: #fff'));
        expect(css).toContain('color-scheme: dark');
        expect(css).not.toMatch(/<|url\((?!')/);
    });
});

describe('Appearance v2', () => {
    it('cada variable pública la consume el embed (ninguna es decorativa)', () => {
        for (const key of APPEARANCE_VARIABLES) {
            if (key === 'colorPrimary' || key === 'fontFamily') continue;
            expect(SURFACE_CSS, key).toContain(cssVariableName(key).replace(/^--cord-/, 'var(--cord-'));
        }
        expect(readFileSync('src/components/q/QuoteCard.astro', 'utf8')).toContain('var(--cord-color-primary');
        expect(readFileSync('src/layouts/EmbedLayout.astro', 'utf8')).toContain('var(--cord-font-family');
    });

    it('cada selector público tiene traducción al markup', () => {
        for (const s of APPEARANCE_SELECTORS) expect(SELECTOR_MAP[s], s).toBeTruthy();
    });

    it('rules: solo selectores y propiedades de la lista, con valores por gramática', () => {
        const a = sanitizeAppearance({
            rules: {
                Button: { 'text-transform': 'uppercase', 'background-color': '#0f766e', position: 'fixed', color: 'red; } body { display:none' },
                '.q-card': { color: 'red' },
                Input: { 'box-shadow': 'default', 'border-radius': '6px', 'background-color': 'url(https://x)' },
                Total: { opacity: '2', 'font-weight': '700' },
            },
        });
        expect(a.rules).toEqual([
            { selector: 'Button', declarations: [['text-transform', 'uppercase'], ['background-color', '#0f766e']] },
            { selector: 'Input', declarations: [['border-radius', '6px']] },
            { selector: 'Total', declarations: [['font-weight', '700']] },
        ]);
        expect(a.rejected).toEqual(expect.arrayContaining(['rules.Button.position', 'rules.Button.color', 'rules..q-card', 'rules.Input.background-color', 'rules.Total.opacity']));
        const css = embedAppearanceCss(a);
        expect(css).toContain('text-transform: uppercase !important');
        expect(css).not.toMatch(/position|url\(|body \{/);
    });

    it('layout y temas', () => {
        const a = sanitizeAppearance({ theme: 'night', layout: { compact: true, hideChat: true, hideNotes: 'si' } });
        expect(a.theme).toBe('dark');
        expect(a.layout).toEqual({ compact: true, hideChat: true, hideNotes: false });
        expect(a.rejected).toContain('layout.hideNotes');
        expect(appearanceToCss(a)).toContain('--cord-color-surface: #1f2937');
        expect(embedAppearanceCss(a)).toContain('.q-chat');
        expect(appearanceToCss(sanitizeAppearance({ theme: 'flat' }))).toContain('--cord-shadow-card: none');
    });

    it('shadowCard: default conserva la sombra de Cord', () => {
        expect(appearanceToCss(sanitizeAppearance({ variables: { shadowCard: 'default' } }))).not.toContain('--cord-shadow-card');
    });
});

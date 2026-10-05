import { describe, it, expect } from 'vitest';
import { sanitizeAppearance, appearanceToCss } from '../packages/elements/src/appearance';

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

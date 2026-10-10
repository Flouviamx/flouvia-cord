// Regla 21: en servidor, un importe se formatea con money()/moneyIn() de
// lib/fmt-server, que leen la divisa del request (o la del documento). Los
// helpers de lib/fmt leen `data-currency` del DOM y, sin DOM, caen a MXN: usados
// en el frontmatter de una página, la factura hospedada /i mostraba como pesos
// una factura en euros. Esta prueba impide que vuelvan al render de servidor.
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = join(__dirname, '..', 'src');

function astros(dir: string): string[] {
    return readdirSync(dir).flatMap((n) => {
        const p = join(dir, n);
        return statSync(p).isDirectory() ? astros(p) : p.endsWith('.astro') ? [p] : [];
    });
}

/** El frontmatter: lo que va entre los dos primeros `---` (código de servidor). */
function frontmatter(src: string): string {
    const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    return m ? m[1] : '';
}

describe('formato de dinero en servidor', () => {
    it('ninguna página ni componente importa los helpers de dinero de lib/fmt en su frontmatter', () => {
        const culpables: string[] = [];
        for (const archivo of [...astros(join(RAIZ, 'pages')), ...astros(join(RAIZ, 'components')), ...astros(join(RAIZ, 'layouts'))]) {
            const fm = frontmatter(readFileSync(archivo, 'utf8'));
            for (const m of fm.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"][./]*lib\/fmt['"]/g)) {
                if (/\bmoney(Full)?\b/.test(m[1])) culpables.push(archivo.slice(RAIZ.length + 1));
            }
        }
        expect(culpables).toEqual([]);
    });
});

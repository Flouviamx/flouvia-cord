import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import {
    COMMON_TERM_CODES, TERM_CODES, isCredit, normalizeTerm, parseTermText, termDays, termDueDate, termLabel, termOptionLabel,
} from '../src/lib/payment-terms';
import { CORD_TERMINOS } from '../packages/elements/src/contract/elements-config';
import { en, es } from '../packages/elements/src/context';

describe('códigos de plazo', () => {
    it('ofrece contado y los plazos de crédito en orden ascendente', () => {
        expect(TERM_CODES).toEqual(['contado', 'net7', 'net15', 'net30', 'net45', 'net60', 'net90']);
        const days = TERM_CODES.map(termDays);
        expect([...days].sort((a, b) => a - b)).toEqual(days);
        for (const c of COMMON_TERM_CODES) expect(TERM_CODES).toContain(c);
    });

    it('cada código net<N> vale exactamente N días', () => {
        for (const c of TERM_CODES) expect(termDays(c)).toBe(c === 'contado' ? 0 : Number(c.slice(3)));
        expect(isCredit('contado')).toBe(false);
        expect(isCredit('net45')).toBe(true);
    });

    it('un plazo guardado que ya no se ofrece sigue venciendo en su fecha real', () => {
        expect(termDays('net120')).toBe(120);
        expect(normalizeTerm('net120')).toBe('contado'); // pero no se acepta como nuevo
    });

    it('lo desconocido nunca inventa crédito', () => {
        for (const v of [null, undefined, '', 'net', 'net-30', '30', 'NET 30', 'credito', 'net1000']) expect(termDays(v)).toBe(0);
        expect(normalizeTerm('cualquier cosa')).toBe('contado');
        expect(normalizeTerm(' NET45 ')).toBe('net45');
    });

    it('el vencimiento suma días de calendario sin mover la hora local', () => {
        const base = new Date(2026, 0, 31, 18, 30);
        const due = termDueDate(base, 'net30');
        expect([due.getFullYear(), due.getMonth(), due.getDate(), due.getHours()]).toEqual([2026, 2, 2, 18]);
        expect(termDueDate(base, 'contado').getTime()).toBe(base.getTime());
    });

    it('rotula en el idioma pedido', () => {
        expect(termLabel('contado', 'es')).toBe('Contado');
        expect(termLabel('contado', 'en')).toBe('Due on receipt');
        expect(termLabel('net45', 'es')).toBe('Net 45');
        expect(termOptionLabel('net45', 'es')).toBe('Net 45 · 45 días');
        expect(termOptionLabel('net45', 'en')).toBe('Net 45 · 45 days');
    });
});

describe('texto escrito por una persona', () => {
    it('toma el plazo ofrecido que no excede lo escrito', () => {
        expect(parseTermText('Net 45')).toBe('net45');
        expect(parseTermText('45 días')).toBe('net45');
        expect(parseTermText('40 días')).toBe('net30');
        expect(parseTermText('120 days')).toBe('net90');
        expect(parseTermText('3 días')).toBe('contado');
        expect(parseTermText('net60')).toBe('net60');
    });

    it('crédito sin número es Net 30 y lo demás es contado', () => {
        expect(parseTermText('crédito')).toBe('net30');
        expect(parseTermText('credit')).toBe('net30');
        expect(parseTermText('contado')).toBe('contado');
        expect(parseTermText('upfront')).toBe('contado');
        expect(parseTermText('')).toBe('contado');
    });
});

describe('paridad con las otras fuentes', () => {
    it('Elements declara los mismos plazos y los rotula en ambos idiomas', () => {
        expect([...CORD_TERMINOS]).toEqual([...TERM_CODES]);
        for (const c of TERM_CODES) {
            if (c === 'contado') continue;
            expect((en as unknown as Record<string, string>)[c], c).toBe(`Net ${termDays(c)}`);
            expect((es as unknown as Record<string, string>)[c], c).toBe(`Neto ${termDays(c)}`);
        }
    });

    it('cord_term_days() de Postgres aplica la misma regla que termDays()', async () => {
        const schema = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8');
        const fn = /create or replace function cord_term_days[\s\S]*?\$\$;/.exec(schema)?.[0];
        expect(fn).toBeTruthy();
        const db = new PGlite();
        try {
            await db.exec(fn!);
            const inputs = [...TERM_CODES, 'net120', 'NET30', ' net15 ', '', 'net', 'net-5', 'net1000', 'otro'];
            for (const v of inputs) {
                const { rows } = await db.query<{ d: number }>('select cord_term_days($1) as d', [v]);
                expect(rows[0].d, JSON.stringify(v)).toBe(termDays(v));
            }
            const { rows } = await db.query<{ d: number }>('select cord_term_days(null) as d');
            expect(rows[0].d).toBe(0);
        } finally {
            await db.close();
        }
    }, 30_000);

    it('ninguna consulta vuelve a escribir los días de un plazo a mano', () => {
        for (const file of [
            'src/lib/queries.ts', 'src/pages/api/webhooks/inbound-email.ts', 'src/pages/api/cobranza-ia/[id].ts', 'db/schema.sql',
        ]) {
            const src = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
            expect(src, file).not.toMatch(/when 'net30' then 30/);
        }
    });
});

import { describe, expect, it } from 'vitest';
import { csvCell, toCsv } from '../src/lib/ops-csv';
import { filtersQuery, parseOrgFilters, parseUserFilters } from '../src/lib/ops-filters';
import { escapeLike } from '../src/lib/ops-pagination';

describe('CSV de Cord Ops', () => {
    it('neutraliza fórmulas: un nombre de organización lo escribe su dueño', () => {
        for (const evil of ['=HYPERLINK("http://x","clic")', '+1+1', '-2+3', '@SUM(A1)', '\t=1', '\r=1']) {
            expect(csvCell(evil).replace(/^"/, '').startsWith("'")).toBe(true);
        }
        expect(csvCell('Aceros del Norte')).toBe('Aceros del Norte');
    });

    it('escapa comillas, comas, punto y coma y saltos de línea', () => {
        expect(csvCell('a,b')).toBe('"a,b"');
        expect(csvCell('di "hola"')).toBe('"di ""hola"""');
        expect(csvCell('línea\nnueva')).toBe('"línea\nnueva"');
        expect(csvCell('a;b')).toBe('"a;b"');
    });

    it('vacíos y fechas', () => {
        expect(csvCell(null)).toBe('');
        expect(csvCell(undefined)).toBe('');
        expect(csvCell(new Date('2026-10-08T00:00:00Z'))).toBe('2026-10-08T00:00:00.000Z');
    });

    it('abre con BOM y separa filas con CRLF', () => {
        const csv = toCsv(['a', 'b'], [[1, 2]]);
        expect(csv.startsWith('﻿')).toBe(true);
        expect(csv).toBe('﻿a,b\r\n1,2\r\n');
    });
});

describe('filtros de Ops', () => {
    it('solo aceptan valores de listas cerradas', () => {
        const f = parseOrgFilters(new URLSearchParams("plan=enterprise'--&country=ZZ&subscription=hacked&charges=maybe&sort=drop&q=  acero   del  norte "));
        expect(f).toEqual({ q: 'acero del norte', plan: '', country: '', subscription: '', charges: '', sort: 'recent' });
        const ok = parseOrgFilters(new URLSearchParams('plan=pro&country=MX&subscription=none&charges=on&sort=name'));
        expect(ok).toMatchObject({ plan: 'pro', country: 'MX', subscription: 'none', charges: 'on', sort: 'name' });
        expect(parseUserFilters(new URLSearchParams('state=root&mfa=with&sort=email'))).toEqual({ q: '', state: '', mfa: 'with', sort: 'email' });
    });

    it('la query de exportación lleva solo los filtros activos', () => {
        expect(filtersQuery({ q: '', plan: 'pro', sort: 'recent' }, { sort: 'recent' })).toBe('plan=pro');
    });
});

describe('búsqueda literal', () => {
    it('escapa los comodines de LIKE: `_` no debe devolver todas las filas', () => {
        expect(escapeLike('john_doe')).toBe('john\\_doe');
        expect(escapeLike('100%')).toBe('100\\%');
        expect(escapeLike('a\\')).toBe('a\\\\');
        expect(escapeLike('acero')).toBe('acero');
    });
});

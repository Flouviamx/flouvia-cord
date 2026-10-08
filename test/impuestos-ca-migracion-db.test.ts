// La migración de los catálogos canadienses ya sembrados (db/schema.sql),
// contra Postgres real (PGlite): las tasas provinciales sueltas pasan a la
// combinada con GST y solo se tocan las filas intactas de Canadá.
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

const migracion = () => {
    const schema = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8');
    const inicio = schema.indexOf('-- Canadá (oct 2026): QST, PST y RST');
    const fin = schema.indexOf('\n\n', schema.indexOf("i.nombre = 'RST 7% (MB)' and i.kind = 'consumo' and i.tasa = 7;", inicio));
    return schema.slice(inicio, fin);
};

let db: PGlite;
const filas = async (org: string) =>
    (await db.query<{ nombre: string; tasa: string }>(`select nombre, tasa::text from impuestos where org_id = $1 order by nombre`, [org])).rows
        .map((r) => `${r.nombre}=${Number(r.tasa)}`);

beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
        create table orgs (id text primary key, country_code text, iva_pct numeric);
        create table impuestos (id serial primary key, org_id text, nombre text, kind text default 'consumo', tasa numeric, es_default boolean default false);
        insert into orgs values ('ca', 'CA', 9.975), ('ca-mb', 'CA', 7), ('mx', 'MX', 16);
        insert into impuestos (org_id, nombre, tasa, es_default) values
            ('ca', 'GST 5%', 5, true), ('ca', 'QST 9.975% (QC)', 9.975, false), ('ca', 'PST 7% (BC)', 7, false),
            ('ca', 'PST 6% (SK)', 6, false), ('ca', 'RST 7% (MB)', 7, false), ('ca', 'QST especial', 9.975, false),
            ('ca-mb', 'RST 7% (MB)', 7, true),
            ('mx', 'QST 9.975% (QC)', 9.975, false);
    `);
    await db.exec(migracion());
});

describe('migración de impuestos de Canadá', () => {
    it('convierte las filas intactas en la tasa combinada con GST', async () => {
        expect(await filas('ca')).toEqual([
            'GST 5%=5',
            'GST 5% + PST 6% (SK)=11',
            'GST 5% + PST/RST 7% (BC/MB)=12',
            'GST 5% + QST 9.975% (QC)=14.975',
            // Una fila capturada a mano no se toca.
            'QST especial=9.975',
        ]);
    });

    it('conserva la RST si era la predeterminada, ya combinada', async () => {
        expect(await filas('ca-mb')).toEqual(['GST 5% + RST 7% (MB)=12']);
    });

    it('no toca otros países', async () => {
        expect(await filas('mx')).toEqual(['QST 9.975% (QC)=9.975']);
    });

    it('la tasa plana heredada sigue a la combinada (sin ofrecer otra vez la QST sola)', async () => {
        const { rows } = await db.query<{ id: string; iva_pct: string }>(`select id, iva_pct::text from orgs order by id`);
        expect(rows.map((r) => `${r.id}=${Number(r.iva_pct)}`)).toEqual(['ca=14.975', 'ca-mb=12', 'mx=16']);
    });
});

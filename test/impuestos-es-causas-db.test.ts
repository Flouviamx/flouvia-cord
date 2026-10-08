// Causas de exención en el catálogo (db/schema.sql), contra Postgres real
// (PGlite): las cuentas de España que cobran IVA reciben los perfiles con
// causa una sola vez, y una causa solo cabe en un perfil exento.
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

const bloque = () => {
    const schema = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8');
    const inicio = schema.indexOf('-- ── Causa de exención por concepto (España, oct 2026)');
    const marca = 'and not exists (select 1 from impuestos i where i.org_id = o.id and i.exemption_reason = c.causa);';
    return schema.slice(inicio, schema.indexOf(marca, inicio) + marca.length);
};

let db: PGlite;

beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
        create table orgs (id text primary key, country_code text);
        create table impuestos (id serial primary key, org_id text, nombre text, tipo text, kind text default 'consumo',
            tasa numeric, es_default boolean default false);
        create table cotizacion_items (id serial primary key, tax_rate numeric);
        insert into orgs values ('es', 'ES'), ('es-igic', 'ES'), ('mx', 'MX');
        insert into impuestos (org_id, nombre, tipo, kind, tasa, es_default) values
            ('es', 'IVA 21%', 'iva', 'consumo', 21, true),
            ('es-igic', 'IGIC 7%', 'iva', 'consumo', 7, true),
            ('mx', 'IVA 16%', 'iva', 'consumo', 16, true);
    `);
    await db.exec(bloque());
    await db.exec(bloque()); // idempotente: correr el schema dos veces no duplica
});

describe('causas de exención del catálogo', () => {
    it('siembra las cuatro causas en la cuenta española con IVA, una sola vez', async () => {
        const { rows } = await db.query<{ org_id: string; exemption_reason: string }>(
            `select org_id, exemption_reason from impuestos where exemption_reason is not null order by exemption_reason`);
        expect(rows.map((r) => `${r.org_id}:${r.exemption_reason}`)).toEqual(['es:E1', 'es:E2', 'es:E5', 'es:S2']);
    });

    it('una causa no cabe en un perfil que cobra impuesto', async () => {
        await expect(db.exec(`insert into impuestos (org_id, nombre, tipo, kind, tasa, exemption_reason)
            values ('es', 'x', 'iva', 'consumo', 21, 'E2')`)).rejects.toThrow();
        await expect(db.exec(`insert into impuestos (org_id, nombre, tipo, kind, tasa, exemption_reason)
            values ('es', 'x', 'exento', 'exento', 0, 'E9')`)).rejects.toThrow();
    });
});

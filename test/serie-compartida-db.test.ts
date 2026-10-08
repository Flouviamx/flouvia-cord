// Serie de facturación única por emisor: dos organizaciones con el mismo
// identificador fiscal no pueden numerar con la misma serie (la AEAT vería el
// mismo IDFactura dos veces). Se prueba la función SQL tal como vive en
// db/schema.sql, contra Postgres real (PGlite).
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';
const C = '00000000-0000-4000-8000-00000000000c';
let db: PGlite;

function funcion(): string {
    const schema = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8');
    const inicio = schema.indexOf('create or replace function cord_serie_en_uso');
    return schema.slice(inicio, schema.indexOf('$$;', inicio) + 3);
}

async function enUso(org: string, tax: string, prefix: string, contexto = org): Promise<boolean> {
    await db.query(`select set_config('app.org_id', $1, false)`, [contexto]);
    const r = await db.query<{ v: boolean }>(`select cord_serie_en_uso($1::uuid, $2, $3, 'F') as v`, [org, tax, prefix]);
    return r.rows[0].v;
}

beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
        create table orgs(id uuid primary key, country_code text, rfc text, fiscal_metadata jsonb, sandbox_of uuid, is_demo boolean);
        insert into orgs values
          ('${A}', 'ES', null, '{"tax_id":"B12345674"}', null, false),
          ('${B}', 'ES', null, '{"tax_id":"ESB12345674","invoice_prefix":"F"}', null, false),
          ('${C}', 'FR', null, '{"tax_id":"B12345674"}', null, false);
    `);
    await db.exec(funcion());
});

describe('cord_serie_en_uso', () => {
    it('detecta otra organización con el mismo NIF (con o sin prefijo ES) y la misma serie', async () => {
        expect(await enUso(A, 'B12345674', '')).toBe(true);          // A usa la serie por defecto F; B la escribe explícita
        expect(await enUso(A, 'b-1234567-4', 'f')).toBe(true);       // mismo NIF con separadores y minúsculas
    });

    it('con otra serie no hay choque', async () => {
        expect(await enUso(A, 'B12345674', 'F2')).toBe(false);
    });

    it('no compara con otro país ni con otro identificador', async () => {
        expect(await enUso(A, 'A58818501', '')).toBe(false);
        expect(await enUso(C, 'B12345674', '')).toBe(false);          // C es de Francia: su NIF español no le aplica a nadie
    });

    it('solo responde por la organización en contexto', async () => {
        expect(await enUso(A, 'B12345674', '', B)).toBe(false);
    });

    it('ignora entornos de prueba y demos', async () => {
        await db.exec(`update orgs set sandbox_of = '${A}' where id = '${B}'`);
        expect(await enUso(A, 'B12345674', '')).toBe(false);
        await db.exec(`update orgs set sandbox_of = null where id = '${B}'`);
    });
});

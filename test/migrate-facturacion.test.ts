// Migración de despliegue de facturación (scripts/migrate-facturacion.mjs),
// contra Postgres real (PGlite): espejo literal del schema, idempotente, sin
// candados en un segundo despliegue y con las migraciones de datos una sola vez.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readdirSync } from 'node:fs';
import { applyStatements, cargarSentencias, extractVerifactu, splitStatements } from '../scripts/migrate-facturacion.mjs';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const squash = (s: string) => s.replace(/\s+/g, ' ').trim();

// Las tablas que ya existen en producción antes de esta migración (de main).
const BASE = `
    create table users (id uuid primary key);
    create table orgs (
        id uuid primary key, owner_id uuid references users(id), sandbox_of uuid, is_demo boolean not null default false,
        nombre text, razon_social text, rfc text, fiscal_metadata jsonb, country_code text, iva_pct numeric);
    create table documentos_fiscales (
        id uuid primary key, org_id uuid not null references orgs(id) on delete cascade, credit_note_of uuid,
        invoice_number text, issued_at timestamptz, issuer_snapshot jsonb, recipient_snapshot jsonb,
        line_items_snapshot jsonb, currency text, subtotal numeric, tax_total numeric, total numeric,
        provider_data jsonb, updated_at timestamptz,
        cotizacion_id uuid, cliente_id uuid, document_type text, lifecycle text);
    alter table documentos_fiscales add constraint chk_documentos_fiscales_origen
        check (cotizacion_id is not null or cliente_id is not null);
    create table impuestos (
        id uuid primary key default gen_random_uuid(), org_id uuid not null references orgs(id) on delete cascade,
        nombre text not null, tipo text not null default 'iva', tasa numeric not null default 0,
        es_default boolean not null default false, activo boolean not null default true, kind text not null default 'consumo');
    create table cotizacion_items (id serial primary key, tax_rate numeric);
    create table clientes (id uuid primary key, org_id uuid not null references orgs(id) on delete cascade, empresa text);
    create table productos (id uuid primary key, org_id uuid not null references orgs(id) on delete cascade, nombre text);
    create table cotizaciones (id uuid primary key, org_id uuid not null references orgs(id) on delete cascade, descuento numeric not null default 0);
    create table documento_recurrencias (id uuid primary key, org_id uuid not null references orgs(id) on delete cascade);
`;

const ORG_ES = '00000000-0000-4000-8000-0000000000e5';
const ORG_CA = '00000000-0000-4000-8000-0000000000ca';

async function migrar(db: PGlite) {
    return applyStatements(await cargarSentencias(), async (text: string, params: unknown[]) => (await db.query(text, params as any[])).rows);
}

describe('migración de despliegue de facturación', () => {
    it('corre en el build antes de compilar', () => {
        const steps = (JSON.parse(read('vercel.json')).buildCommand as string).split('&&').map((s) => s.trim());
        expect(steps.indexOf('node scripts/migrate-facturacion.mjs')).toBe(steps.indexOf('npm run build') - 1);
    });

    it('cada sentencia de db/deploy/ es espejo literal de db/schema.sql', () => {
        const schema = squash(read('db/schema.sql'));
        const archivos = readdirSync(new URL('../db/deploy/', import.meta.url)).filter((f) => f.endsWith('.sql'));
        expect(archivos.length).toBeGreaterThan(0);
        for (const f of archivos) {
            expect(f, 'nombre AAAA-MM-DD-tema.sql: el orden de aplicación es el orden de nombre').toMatch(/^\d{4}-\d{2}-\d{2}-[a-z0-9-]+\.sql$/);
            const propias = splitStatements(read(`db/deploy/${f}`));
            expect(propias.length, f).toBeGreaterThan(0);
            for (const s of propias) expect(schema, `${f}: ${s}`).toContain(squash(s));
        }
    });

    it('el divisor respeta cuerpos $$ y comentarios', () => {
        expect(splitStatements(`select 1; -- a; b\ncreate function f() returns int language sql as $$ select 1; $$; select ';'`))
            .toEqual(['select 1', 'create function f() returns int language sql as $$ select 1; $$', "select ';'"]);
        const verifactu = splitStatements(extractVerifactu(read('db/schema.sql')));
        expect(verifactu.some((s) => s.startsWith('create or replace function cord_serie_en_uso'))).toBe(true);
        expect(verifactu.some((s) => s.startsWith('create table if not exists verifactu_envio_estado'))).toBe(true);
    });

    it('crea todo lo que el código lee, y un segundo despliegue no toma candados ni repite datos', async () => {
        const db = new PGlite();
        try {
            await db.exec(BASE);
            await db.exec(`
                insert into users values ('00000000-0000-4000-8000-0000000000f1');
                insert into orgs (id, owner_id, country_code, iva_pct) values
                    ('${ORG_ES}', '00000000-0000-4000-8000-0000000000f1', 'ES', 21),
                    ('${ORG_CA}', '00000000-0000-4000-8000-0000000000f1', 'CA', 9.975);
                insert into impuestos (org_id, nombre, tasa, es_default) values
                    ('${ORG_ES}', 'IVA 21%', 21, true),
                    ('${ORG_CA}', 'QST 9.975% (QC)', 9.975, true);`);

            const primera = await migrar(db);
            expect(primera.ejecutadas.length).toBeGreaterThan(30);

            const columnas = (await db.query<{ c: string }>(`select table_name || '.' || column_name as c from information_schema.columns
                where column_name in ('service_date', 'service_date_end', 'exemption_reason', 'retencion_base', 'subsana_de', 'envio_error', 'verifactu_modo')`)).rows.map((r) => r.c).sort();
            expect(columnas).toEqual([
                'cotizacion_items.exemption_reason', 'documentos_fiscales.service_date', 'documentos_fiscales.service_date_end',
                'impuestos.exemption_reason', 'impuestos.retencion_base', 'orgs.verifactu_modo',
                'verifactu_registros.envio_error', 'verifactu_registros.subsana_de',
            ]);
            // Factura electrónica europea (db/deploy/2026-10-08-einvoice.sql).
            const einvoice = (await db.query<{ c: string }>(`select table_name || '.' || column_name as c from information_schema.columns
                where column_name in ('buyer_reference', 'purchase_order', 'payee_account', 'einvoice_address') order by 1`)).rows.map((r) => r.c);
            expect(einvoice).toEqual([
                'clientes.buyer_reference', 'clientes.einvoice_address',
                'documentos_fiscales.buyer_reference', 'documentos_fiscales.payee_account', 'documentos_fiscales.purchase_order',
            ]);
            const funciones = (await db.query<{ proname: string }>(`select proname from pg_proc where proname in ('cord_serie_en_uso', 'cord_verifactu_multiples_ot', 'cord_verifactu_registro_inmutable') order by proname`)).rows;
            expect(funciones.map((f) => f.proname)).toEqual(['cord_serie_en_uso', 'cord_verifactu_multiples_ot', 'cord_verifactu_registro_inmutable']);
            expect((await db.query(`select 1 from verifactu_envio_estado`)).rows).toEqual([]);

            // Portal y cobro agrupado: tablas con RLS forzada y el resolutor del token.
            const rls = (await db.query<{ relname: string }>(`select relname from pg_class
                where relname in ('pagos_agrupados', 'pago_agrupado_documentos', 'cobro_automatico_estado', 'documento_reembolso_asignaciones')
                  and relrowsecurity and relforcerowsecurity order by relname`)).rows.map((r) => r.relname);
            expect(rls).toEqual(['cobro_automatico_estado', 'documento_reembolso_asignaciones', 'pago_agrupado_documentos', 'pagos_agrupados']);
            expect((await db.query(`select * from cord_resolve_portal('corto')`)).rows).toEqual([]);

            // Descuentos y cupones (db/deploy/2026-10-08-descuentos.sql).
            const descuentos = (await db.query<{ c: string }>(`select table_name || '.' || column_name as c from information_schema.columns
                where column_name in ('descuento_def', 'descuento_total') or (column_name = 'descuento' and table_name <> 'cotizaciones')`)).rows.map((r) => r.c).sort();
            expect(descuentos).toEqual([
                'cotizaciones.descuento_def', 'documento_recurrencias.descuento',
                'documentos_fiscales.descuento', 'documentos_fiscales.descuento_total',
            ]);
            const cupones = (await db.query<{ proname: string }>(`select proname from pg_proc where proname in ('cord_cupon_redimir', 'cord_cupon_liberar') order by proname`)).rows;
            expect(cupones.map((f) => f.proname)).toEqual(['cord_cupon_liberar', 'cord_cupon_redimir']);
            const rlsCupones = (await db.query<{ relname: string }>(`select relname from pg_class where relname in ('cupones', 'cupon_redenciones') and relrowsecurity and relforcerowsecurity order by relname`)).rows;
            expect(rlsCupones.map((r) => r.relname)).toEqual(['cupon_redenciones', 'cupones']);

            // Sales tax de EE. UU. por dirección (db/deploy/2026-10-09-us-tax.sql).
            const rlsUsTax = (await db.query<{ relname: string }>(`select relname from pg_class where relname in ('us_tax_calculos', 'us_tax_registros') and relrowsecurity and relforcerowsecurity order by relname`)).rows;
            expect(rlsUsTax.map((r) => r.relname)).toEqual(['us_tax_calculos', 'us_tax_registros']);
            const usTaxCols = (await db.query<{ c: string }>(`select table_name || '.' || column_name as c from information_schema.columns
                where column_name in ('us_tax_calculo_id', 'tax_breakdown', 'tax_exempt', 'tax_exempt_cert', 'us_tax_auto', 'us_tax_origen') order by 1`)).rows.map((r) => r.c);
            expect(usTaxCols).toEqual([
                'clientes.tax_exempt', 'clientes.tax_exempt_cert', 'cotizacion_items.tax_breakdown', 'cotizaciones.us_tax_calculo_id',
                'documentos_fiscales.us_tax_calculo_id', 'orgs.us_tax_auto', 'orgs.us_tax_origen',
            ]);

            // Factura electrónica entre empresarios (db/deploy/2026-10-09-spfe.sql):
            // la cola y lo recibido con RLS forzada, y el trigger que hace inmutable lo enviado.
            const rlsSpfe = (await db.query<{ relname: string }>(`select relname from pg_class
                where relname in ('spfe_mensajes', 'spfe_estados_destinatario', 'spfe_envio_estado')
                  and relrowsecurity and relforcerowsecurity order by relname`)).rows.map((r) => r.relname);
            expect(rlsSpfe).toEqual(['spfe_envio_estado', 'spfe_estados_destinatario', 'spfe_mensajes']);
            expect((await db.query(`select 1 from pg_trigger where tgname = 'trg_spfe_mensaje_inmutable'`)).rows).toHaveLength(1);

            // NF-e de Brasil (db/deploy/2026-10-09-nfe.sql): eventos, inutilização y
            // contingencia con RLS forzada, lo registrado inmutable, y los datos de
            // NF-e del producto y del cliente.
            const rlsNfe = (await db.query<{ relname: string }>(`select relname from pg_class
                where relname in ('nfe_eventos', 'nfe_inutilizacoes', 'nfe_contingencias')
                  and relrowsecurity and relforcerowsecurity order by relname`)).rows.map((r) => r.relname);
            expect(rlsNfe).toEqual(['nfe_contingencias', 'nfe_eventos', 'nfe_inutilizacoes']);
            expect((await db.query(`select 1 from pg_trigger where tgname in ('trg_nfe_evento_inmutable', 'trg_nfe_inutilizacao_inmutable')`)).rows).toHaveLength(2);
            const nfeColumnas = (await db.query<{ c: string }>(`select table_name || '.' || column_name as c from information_schema.columns
                where column_name = 'nfe' and table_name in ('productos', 'clientes') order by 1`)).rows.map((r) => r.c);
            expect(nfeColumnas).toEqual(['clientes.nfe', 'productos.nfe']);
            // Chile, certificación ante el SII (db/deploy/2026-10-09-sii*.sql): todas las
            // tablas del riel con RLS forzada, incluidos los libros del set, y el libro
            // firmado inmutable.
            const rlsSii = (await db.query<{ relname: string }>(`select relname from pg_class
                where relname like 'fiscal_sii_%' and relkind = 'r' and relrowsecurity and relforcerowsecurity order by relname`)).rows.map((r) => r.relname);
            expect(rlsSii).toEqual(['fiscal_sii_buzones', 'fiscal_sii_cafs', 'fiscal_sii_dte_recibidos', 'fiscal_sii_libros', 'fiscal_sii_recepciones', 'fiscal_sii_respuestas', 'fiscal_sii_sets']);
            expect((await db.query(`select 1 from pg_trigger where tgname = 'trg_fiscal_sii_libro_guardas'`)).rows).toHaveLength(1);
            // Francia, emisión por plataforma autorizada (db/deploy/2026-10-09-fr-pa.sql):
            // las menciones que congela el documento, la cola con RLS forzada, su
            // trigger de inmutabilidad y los resolutores del webhook.
            const frPa = (await db.query<{ c: string }>(`select table_name || '.' || column_name as c from information_schema.columns
                where (table_name, column_name) in (('documentos_fiscales', 'delivery_address'), ('productos', 'naturaleza')) order by 1`)).rows.map((r) => r.c);
            expect(frPa).toEqual(['documentos_fiscales.delivery_address', 'productos.naturaleza']);
            const rlsPa = (await db.query<{ relname: string }>(`select relname from pg_class
                where relname in ('pa_altas', 'pa_envios', 'pa_estados', 'pa_cola')
                  and relrowsecurity and relforcerowsecurity order by relname`)).rows.map((r) => r.relname);
            expect(rlsPa).toEqual(['pa_altas', 'pa_cola', 'pa_envios', 'pa_estados']);
            expect((await db.query(`select 1 from pg_trigger where tgname = 'trg_pa_envio_inmutable'`)).rows).toHaveLength(1);
            const resolutores = (await db.query<{ proname: string; prosecdef: boolean }>(`select proname, prosecdef from pg_proc
                where proname in ('cord_pa_org_de_alta', 'cord_pa_envio_de_proveedor', 'cord_pa_factura_por_numero') order by proname`)).rows;
            expect(resolutores).toEqual([
                { proname: 'cord_pa_envio_de_proveedor', prosecdef: true },
                { proname: 'cord_pa_factura_por_numero', prosecdef: true },
                { proname: 'cord_pa_org_de_alta', prosecdef: true },
            ]);

            // Canadá: la QST suelta pasa a la combinada, y la tasa plana la sigue.
            expect((await db.query<{ nombre: string; tasa: string }>(`select nombre, tasa::text from impuestos where org_id = '${ORG_CA}'`)).rows)
                .toEqual([{ nombre: 'GST 5% + QST 9.975% (QC)', tasa: '14.975' }]);
            expect((await db.query<{ iva_pct: string }>(`select iva_pct::text from orgs where id = '${ORG_CA}'`)).rows[0].iva_pct).toBe('14.975');

            // España: las cuatro causas, una vez.
            const causas = async () => (await db.query<{ exemption_reason: string }>(
                `select exemption_reason from impuestos where org_id = '${ORG_ES}' and exemption_reason is not null order by 1`)).rows.map((r) => r.exemption_reason);
            expect(await causas()).toEqual(['E1', 'E2', 'E5', 'S2']);
            await db.exec(`delete from impuestos where org_id = '${ORG_ES}' and exemption_reason = 'E1'`);

            const segunda = await migrar(db);
            // Nada que tome ACCESS EXCLUSIVE sobre una tabla existente.
            const bloqueantes = segunda.ejecutadas.filter((s: string) => /^\s*alter table|^\s*drop (trigger|policy)|^\s*create (trigger|policy|(unique )?index)/i.test(s));
            expect(bloqueantes).toEqual([]);
            // El perfil que el negocio borró no vuelve.
            expect(await causas()).toEqual(['E2', 'E5', 'S2']);
            // Las restricciones siguen mandando, con la clasificación VATEX
            // ampliada: un perfil exento la admite y uno de consumo no.
            await expect(db.exec(`insert into impuestos (org_id, nombre, tasa, kind, exemption_reason) values ('${ORG_ES}', 'x', 21, 'consumo', 'E2')`)).rejects.toThrow();
            await db.exec(`insert into impuestos (org_id, nombre, tasa, kind, exemption_reason) values ('${ORG_ES}', 'Export', 0, 'exento', 'VATEX-EU-G')`);
            await expect(db.exec(`insert into impuestos (org_id, nombre, tasa, kind, exemption_reason) values ('${ORG_ES}', 'x', 0, 'exento', 'VATEX-XX')`)).rejects.toThrow();
            await expect(db.exec(`insert into documentos_fiscales (id, org_id, cliente_id, service_date, service_date_end) values (gen_random_uuid(), '${ORG_ES}', gen_random_uuid(), '2026-10-02', '2026-10-01')`)).rejects.toThrow();
        } finally {
            await db.close();
        }
    }, 60_000);

    it('México: la factura global cabe en el origen y una venta vive en una sola global', async () => {
        const db = new PGlite();
        try {
            await db.exec(BASE);
            await db.exec(`
                insert into users values ('00000000-0000-4000-8000-0000000000f1');
                insert into orgs (id, owner_id, country_code) values ('${ORG_ES}', '00000000-0000-4000-8000-0000000000f1', 'MX');
                insert into cotizaciones (id, org_id) values ('00000000-0000-4000-8000-00000000c001', '${ORG_ES}');`);
            await migrar(db);
            const doc = (id: string, extra: string, values: string) =>
                db.exec(`insert into documentos_fiscales (id, org_id${extra}) values ('${id}', '${ORG_ES}'${values})`);
            const GLOBAL = '00000000-0000-4000-8000-00000000d001';
            await doc(GLOBAL, ', document_type, informacion_global', `, 'cfdi_40', '{"periodicidad":"04","meses":"09","anio":2026}'`);
            // Sin cliente, sin cotización y sin InformacionGlobal: sigue prohibido.
            await expect(doc('00000000-0000-4000-8000-00000000d002', ', document_type', `, 'cfdi_40'`)).rejects.toThrow();
            // Una proforma no es una factura global.
            await expect(doc('00000000-0000-4000-8000-00000000d003', ', document_type, informacion_global', `, 'proforma', '{}'`)).rejects.toThrow();
            // Uso del CFDI y forma de pago solo del catálogo del SAT.
            await expect(doc('00000000-0000-4000-8000-00000000d004', ', cliente_id, cfdi_uso', `, gen_random_uuid(), 'X99'`)).rejects.toThrow();
            await expect(doc('00000000-0000-4000-8000-00000000d005', ', cliente_id, cfdi_forma_pago', `, gen_random_uuid(), '99'`)).rejects.toThrow();

            const vincular = () => db.exec(`insert into factura_global_ventas (org_id, documento_id, cotizacion_id, folio)
                values ('${ORG_ES}', '${GLOBAL}', '00000000-0000-4000-8000-00000000c001', 'COT-1')`);
            await vincular();
            await expect(vincular()).rejects.toThrow();
            // Cancelar la global libera la venta: puede entrar en otra.
            await db.exec(`update factura_global_ventas set liberada_at = now()`);
            await vincular();
            // Un solo sustituto vivo por original.
            await doc('00000000-0000-4000-8000-00000000d006', ', cliente_id, lifecycle, sustituye_a', `, gen_random_uuid(), 'draft', '${GLOBAL}'`);
            await expect(doc('00000000-0000-4000-8000-00000000d007', ', cliente_id, lifecycle, sustituye_a', `, gen_random_uuid(), 'draft', '${GLOBAL}'`)).rejects.toThrow();
            // Descartado el primero, se puede intentar de nuevo.
            await db.exec(`update documentos_fiscales set lifecycle = 'void' where id = '00000000-0000-4000-8000-00000000d006'`);
            await doc('00000000-0000-4000-8000-00000000d007', ', cliente_id, lifecycle, sustituye_a', `, gen_random_uuid(), 'draft', '${GLOBAL}'`);
        } finally {
            await db.close();
        }
    }, 60_000);

    it('una restricción con la definición vieja se reemplaza', async () => {
        const db = new PGlite();
        try {
            await db.exec(BASE);
            await db.exec(`alter table impuestos add column retencion_base text not null default 'subtotal';
                alter table impuestos add constraint chk_impuestos_retencion_base check (retencion_base in ('subtotal', 'impuesto'));`);
            await migrar(db);
            const [{ def }] = (await db.query<{ def: string }>(`select pg_get_constraintdef(oid) as def from pg_constraint where conname = 'chk_impuestos_retencion_base'`)).rows;
            expect(def).toContain("'gravado'");
        } finally {
            await db.close();
        }
    }, 60_000);
});

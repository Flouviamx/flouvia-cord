// scripts/migrate.mjs
// Corre db/schema.sql contra Neon y siembra la org demo (clerk_user_id='demo-user').
// Re-ejecutable: ignora "ya existe" en DDL y no re-siembra si la org demo ya está.
//
//   node scripts/migrate.mjs           (lee DATABASE_URL de .env o del entorno)
//   npm run db:migrate
//   npm run db:migrate -- --reset      (borra y recrea todo, ¡destructivo!)

import { neon } from '@neondatabase/serverless';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

// ── Cargar DATABASE_URL desde .env si no está en el entorno ──
function readVar(name) {
    if (process.env[name]) return process.env[name];
    for (const f of ['.env', '.env.local']) {
        const p = join(root, f);
        if (!existsSync(p)) continue;
        for (const line of readFileSync(p, 'utf8').split('\n')) {
            const m = line.match(new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=\\s*(.+)\\s*$`));
            if (m) return m[1].replace(/^["']|["']$/g, '');
        }
    }
    return null;
}
// Para DDL/migración preferimos la conexión DIRECTA (sin pgbouncer).
function loadEnv() {
    return readVar('DATABASE_URL_UNPOOLED') || readVar('DATABASE_URL');
}

const url = loadEnv();
if (!url) {
    console.error('\n✗ No encontré DATABASE_URL.\n  Crea un .env con: DATABASE_URL=postgres://...\n  (o córrelo con DATABASE_URL=... node scripts/migrate.mjs)\n');
    process.exit(1);
}

const sql = neon(url);
const reset = process.argv.includes('--reset');

// Errores de "ya existe" que ignoramos para que migrate sea re-ejecutable.
const EXISTS = new Set(['42P07', '42P06', '42710', '42701']);

async function runDDL() {
    const raw = readFileSync(join(root, 'db', 'schema.sql'), 'utf8');
    // Quita comentarios de línea (-- …) ANTES de partir: algunos comentarios
    // traen ';' adentro y romperían el split. El schema no usa '--' en strings.
    const schema = raw.split('\n').map(l => l.replace(/--.*$/, '')).join('\n');
    const stmts = schema.split(';').map(s => s.trim()).filter(Boolean);
    for (const stmt of stmts) {
        try {
            await sql.query(stmt);
        } catch (e) {
            if (EXISTS.has(e.code)) continue;
            throw e;
        }
    }
}

async function seed() {
    const [exists] = await sql`select id from orgs where clerk_user_id = 'demo-user'`;
    if (exists) { console.log('• Org demo ya existe — seed omitido.'); return exists.id; }

    const [org] = await sql`
        insert into orgs (clerk_user_id, nombre, rfc, razon_social, quote_prefix, plan, iva_pct)
        values ('demo-user', 'Materiales del Valle', 'MVA240611AB3', 'Materiales del Valle SA de CV', 'COT', 'pro', 16)
        returning id`;
    const orgId = org.id;

    // Productos
    const productos = [
        ['CEM-50', 'Cemento gris 50kg', 198.0, 'saco', true],
        ['VAR-38', 'Varilla 3/8" × 12m', 189.0, 'pieza', true],
        ['BLK-152', 'Block hueco 15×20×40', 16.5, 'pieza', true],
        ['MAL-66', 'Malla electrosoldada 6×6', 332.0, 'rollo', true],
        ['ARE-M3', 'Arena de río', 410.0, 'm³', true],
        ['GRA-M3', 'Grava 3/4"', 465.0, 'm³', true],
        ['IMP-19', 'Impermeabilizante 19L', 1240.0, 'cubeta', true],
        ['PTR-2', 'PTR 2"×2" cal. 14', 389.0, 'tramo', false],
    ];
    const prodId = {};
    for (const [sku, nombre, precio, unidad, activo] of productos) {
        const [p] = await sql`insert into productos (org_id, sku, nombre, precio_lista, unidad, activo)
            values (${orgId}, ${sku}, ${nombre}, ${precio}, ${unidad}, ${activo}) returning id`;
        prodId[sku] = p.id;
    }

    // Clientes
    const clientes = [
        ['Distribuidora El Zarco', 'Raúl Mendoza', 'compras@elzarco.mx', 'DEZ981123QX1', 'net30', 500000],
        ['Constructora GAMA', 'Lucía Ferreira', 'lucia@gama.com.mx', 'CGA050617HJ8', 'net60', 850000],
        ['Grupo Ferrex', 'Marco Antonio Ruiz', 'mruiz@ferrex.mx', 'GFE120304TR2', 'contado', null],
        ['Obras del Norte SA', 'Daniela Quintero', 'dquintero@odn.mx', 'ODN170822MN5', 'net30', 320000],
    ];
    const cliId = {};
    for (const [empresa, contacto, email, rfc, term, limite] of clientes) {
        const [c] = await sql`insert into clientes (org_id, empresa, contacto, email, rfc, terminos_default, limite_credito)
            values (${orgId}, ${empresa}, ${contacto}, ${email}, ${rfc}, ${term}, ${limite}) returning id`;
        cliId[empresa] = c.id;
    }

    // Cotizaciones (con items + eventos). offsetDays/horas para timeline bonito.
    const ago = (days, h = 12, m = 0) => {
        const d = new Date();
        d.setDate(d.getDate() - days); d.setHours(h, m, 0, 0);
        return d.toISOString();
    };

    const cots = [
        {
            folio: 'COT-0148', cliente: 'Distribuidora El Zarco', status: 'approved', term: 'net30',
            vigencia: ago(-12, 0, 0), created: ago(0, 10, 41), token: 'demo',
            notas: 'Precio especial por volumen — entrega en obra Tlalnepantla.',
            items: [
                ['Cemento gris 50kg', 120, 'saco', 198.0, 182.0],
                ['Varilla 3/8" × 12m', 340, 'pieza', 189.0, 168.5],
                ['Block hueco 15×20×40', 2400, 'pieza', 16.5, 14.2],
                ['Malla electrosoldada 6×6', 180, 'rollo', 332.0, 312.0],
            ],
            eventos: [
                ['created', 'Borrador creado', ago(0, 10, 41)],
                ['sent', 'Enviada por correo y WhatsApp', ago(0, 11, 2)],
                ['viewed', 'Raúl Mendoza abrió el link', ago(0, 12, 31)],
                ['approved', 'El Zarco aprobó la cotización', ago(0, 12, 36)],
            ],
        },
        {
            folio: 'COT-0147', cliente: 'Constructora GAMA', status: 'viewed', term: 'net60',
            vigencia: ago(-8, 0, 0), created: ago(1, 16, 5), token: null,
            items: [
                ['Impermeabilizante 19L', 46, 'cubeta', 1240.0, 1140.0],
                ['Arena de río', 32, 'm³', 410.0, null],
                ['Grava 3/4"', 28, 'm³', 465.0, null],
            ],
            eventos: [
                ['created', 'Borrador creado', ago(1, 16, 5)],
                ['sent', 'Enviada por correo', ago(1, 17, 20)],
                ['viewed', 'Lucía Ferreira abrió el link (3 veces)', ago(0, 9, 30)],
            ],
        },
        {
            folio: 'COT-0146', cliente: 'Grupo Ferrex', status: 'paid', term: 'contado',
            vigencia: ago(-3, 0, 0), created: ago(6, 17, 12), token: null,
            items: [
                ['Varilla 3/8" × 12m', 520, 'pieza', 189.0, 172.0],
                ['PTR 2"×2" cal. 14', 90, 'tramo', 389.0, 365.0],
            ],
            eventos: [
                ['created', 'Borrador creado', ago(6, 17, 12)],
                ['sent', 'Enviada por correo', ago(6, 18, 30)],
                ['viewed', 'Marco Ruiz abrió el link', ago(5, 13, 2)],
                ['approved', 'Ferrex aprobó la cotización', ago(5, 13, 40)],
                ['paid', 'Pago recibido vía Stripe', ago(4, 9, 14)],
            ],
        },
        {
            folio: 'COT-0145', cliente: 'Obras del Norte SA', status: 'sent', term: 'net30',
            vigencia: ago(-6, 0, 0), created: ago(7, 11, 18), token: null,
            items: [
                ['Cemento gris 50kg', 300, 'saco', 198.0, 186.0],
                ['Block hueco 15×20×40', 5000, 'pieza', 16.5, 13.9],
            ],
            eventos: [
                ['created', 'Borrador creado', ago(7, 11, 18)],
                ['sent', 'Enviada por WhatsApp', ago(7, 12, 50)],
            ],
        },
        {
            folio: 'COT-0144', cliente: 'Constructora GAMA', status: 'expired', term: 'net60',
            vigencia: ago(10, 0, 0), created: ago(24, 15, 2), token: null,
            items: [['Malla electrosoldada 6×6', 240, 'rollo', 332.0, 318.0]],
            eventos: [
                ['created', 'Borrador creado', ago(24, 15, 2)],
                ['sent', 'Enviada por correo', ago(24, 15, 44)],
                ['viewed', 'Lucía Ferreira abrió el link', ago(21, 10, 1)],
            ],
        },
        {
            folio: 'COT-0143', cliente: 'Distribuidora El Zarco', status: 'draft', term: 'net30',
            vigencia: ago(-18, 0, 0), created: ago(0, 9, 20), token: null,
            items: [['Arena de río', 60, 'm³', 410.0, null]],
            eventos: [['created', 'Borrador creado', ago(0, 9, 20)]],
        },
    ];

    for (const c of cots) {
        let subtotal = 0;
        for (const [, qty, , lista, nego] of c.items) subtotal += (nego ?? lista) * qty;
        const iva = subtotal * 0.16;
        const total = subtotal + iva;
        const tokenClause = c.token ?? null;
        const [cot] = c.token
            ? await sql`insert into cotizaciones (org_id, cliente_id, folio, status, subtotal, iva, total, terminos, vigencia, public_token, notas, created_at, sent_at, approved_at)
                values (${orgId}, ${cliId[c.cliente]}, ${c.folio}, ${c.status}, ${subtotal}, ${iva}, ${total}, ${c.term}, ${c.vigencia}, ${c.token}, ${c.notas ?? null}, ${c.created}, ${c.status !== 'draft' ? c.created : null}, ${['approved', 'paid', 'invoiced'].includes(c.status) ? c.created : null}) returning id`
            : await sql`insert into cotizaciones (org_id, cliente_id, folio, status, subtotal, iva, total, terminos, vigencia, notas, created_at, sent_at, approved_at)
                values (${orgId}, ${cliId[c.cliente]}, ${c.folio}, ${c.status}, ${subtotal}, ${iva}, ${total}, ${c.term}, ${c.vigencia}, ${c.notas ?? null}, ${c.created}, ${c.status !== 'draft' ? c.created : null}, ${['approved', 'paid', 'invoiced'].includes(c.status) ? c.created : null}) returning id`;

        let orden = 0;
        for (const [desc, qty, unidad, lista, nego] of c.items) {
            // resolver producto por descripción (match con catálogo)
            await sql`insert into cotizacion_items (cotizacion_id, descripcion, cantidad, precio_unitario, precio_negociado, orden)
                values (${cot.id}, ${desc}, ${qty}, ${lista}, ${nego}, ${orden++})`;
        }
        for (const [tipo, detalle, when] of c.eventos) {
            await sql`insert into eventos (org_id, cotizacion_id, tipo, detalle, created_at)
                values (${orgId}, ${cot.id}, ${tipo}, ${detalle}, ${when})`;
        }
    }

    console.log('• Org demo + 8 productos + 4 clientes + 6 cotizaciones sembrados.');
    return orgId;
}

async function dropAll() {
    console.log('• --reset: borrando tablas…');
    await sql`drop table if exists facturas_cfdi, eventos, cotizacion_items, cotizaciones, clientes, productos, orgs cascade`;
}

(async () => {
    try {
        if (reset) await dropAll();
        console.log('• Aplicando schema…');
        await runDDL();
        await seed();
        console.log('\n✓ Migración completa. La app ya lee de Neon.\n');
    } catch (e) {
        console.error('\n✗ Error en la migración:', e.message, e.code ? `(${e.code})` : '');
        process.exit(1);
    }
})();

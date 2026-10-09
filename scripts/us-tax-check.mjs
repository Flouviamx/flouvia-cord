// Contrato del sales tax de EE. UU. por dirección. Corre en `npm run security:us-tax`
// (encadenado en `test:payments`).
//
// Lo que este script cuida no rompe ningún tipo y no lo ve ningún otro check:
//
//   1. Una sola puerta a la API de impuestos del proveedor (`/v1/tax/*`):
//      src/lib/us-tax/stripe.ts. Una segunda llamada suelta se saltaría la
//      traducción de errores (regla 14) y la clave de idempotencia (regla 33).
//   2. Cada POST que CREA algo allá (cálculo, transacción, reverso, registro)
//      lleva `idempotencyKey`, y el cálculo —que le cuesta a Cord— pasa antes
//      por el límite por organización.
//   3. `taxCatalogFor()` acepta una tasa calculada SOLO desde una fila de
//      `us_tax_calculos` de la misma organización y vigente.
//   4. Las rutas que lo usan tienen rate limit y no devuelven el mensaje crudo.
//   5. La UI no nombra al proveedor (regla 14).
//   6. Las tablas nuevas llevan RLS forzada y grants condicionados, en el
//      esquema y en su migración de despliegue.
//   7. La aritmética: la tasa efectiva reproduce al centavo el impuesto del
//      proveedor a través del motor único, con y sin impuesto incluido.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { calculateDocumentTotals } from '../packages/elements/src/engine.ts';
import { effectiveRate, usTaxMessage } from '../src/lib/us-tax/core.ts';
import { FEATURE_MIN_PLAN } from '../src/lib/entitlements.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
let checks = 0;
const ok = (cond, msg) => { checks++; assert.ok(cond, msg); };

function archivos(dir) {
    const out = [];
    for (const nombre of readdirSync(dir)) {
        const ruta = join(dir, nombre);
        if (statSync(ruta).isDirectory()) out.push(...archivos(ruta));
        else if (/\.(ts|mts|astro|tsx)$/.test(nombre)) out.push(ruta);
    }
    return out;
}
const SRC = archivos(join(ROOT, 'src'));

// 1. Una sola puerta.
const PUERTA = 'src/lib/us-tax/stripe.ts';
const fuera = SRC.filter((f) => /['"`]\/v1\/tax\//.test(readFileSync(f, 'utf8')) && relative(ROOT, f) !== PUERTA)
    .map((f) => relative(ROOT, f));
ok(fuera.length === 0, `La API de impuestos del proveedor solo se llama desde ${PUERTA}: ${fuera.join(', ')}`);

// 2. Idempotencia en cada creación y límite antes de calcular.
const puerta = read(PUERTA);
for (const ruta of ['/v1/tax/calculations', '/v1/tax/transactions/create_from_calculation', '/v1/tax/transactions/create_reversal', '/v1/tax/registrations', '/v1/tax/settings']) {
    const i = puerta.indexOf(`'${ruta}'`);
    ok(i >= 0, `${PUERTA} ya no llama ${ruta}`);
    const llamada = puerta.slice(i, puerta.indexOf(');', i));
    if (ruta === '/v1/tax/registrations' && !llamada.includes("'POST'")) continue;
    ok(/idempotencyKey/.test(llamada), `${ruta} debe crear con Idempotency-Key determinística.`);
}
ok(/llamar\(/.test(puerta) && /usTaxErrorFromProvider/.test(puerta), 'Cada llamada al proveedor debe pasar por la traducción de errores (regla 14).');
const calculo = read('src/lib/us-tax/calculo.ts');
const iLimite = calculo.indexOf('strictRateLimit(');
const iCalc = calculo.indexOf('createUsTaxCalculation(account');
ok(iLimite > 0 && iCalc > iLimite, 'El cálculo (que le cuesta a Cord) debe pasar antes por strictRateLimit, en el mismo lugar donde se gasta.');
ok(/checkEntitlement\(orgId, 'us_sales_tax'\)/.test(calculo), 'El cálculo debe verificar el plan efectivo (regla 17), no solo la preferencia guardada.');
ok(FEATURE_MIN_PLAN.us_sales_tax === 'starter', 'us_sales_tax debe vivir en FEATURE_MIN_PLAN (Starter).');

// 3. La tasa calculada solo entra desde una fila guardada, de la org y vigente.
const impuestosDb = read('src/lib/impuestos-db.ts');
ok(/from us_tax_calculos\s+where org_id = \$\{orgId\} and id = \$\{calculoId\}::uuid and expires_at > now\(\)/.test(impuestosDb),
    'taxCatalogFor debe leer el cálculo de us_tax_calculos acotado a la organización y vigente.');
ok(/if \(calculo\) return Number\(lineaCalculada\(linea\)\.tasa\)/.test(impuestosDb),
    'Con un cálculo, la tasa de la línea es la del cálculo, nunca la que propone el cliente.');
for (const f of ['src/lib/cotizaciones.ts', 'src/lib/actions/quotes.ts', 'src/lib/fiscal/invoices.ts']) {
    const s = read(f);
    ok(/prepareUsTaxForDocument\(/.test(s) && /usTaxCalculoId: usTax\.calculoId/.test(s), `${f} debe calcular por dirección y ligar el cálculo a taxCatalogFor.`);
}

// 4. Rutas: rate limit y sin mensaje crudo.
const API = SRC.filter((f) => relative(ROOT, f).startsWith('src/pages/api/'));
const usan = API.filter((f) => /us-tax\/(calculo|config)['"]/.test(readFileSync(f, 'utf8')));
ok(usan.length >= 3, `Se esperaban al menos 3 rutas del sales tax por dirección; hay ${usan.length}. El parser está roto.`);
for (const f of usan) {
    const s = readFileSync(f, 'utf8');
    const rel = relative(ROOT, f);
    ok(/\b(limitConnectMutation|strictRateLimit|assertCronAuth)\s*\(/.test(s), `${rel} necesita rate limit (o ser un cron autenticado).`);
    ok(!/error:\s*(?:\w+\?\.)*(?:\w+\?\.message|\w+\??\.error\??\.message)/.test(s), `${rel} no puede devolver el mensaje del proveedor (regla 14).`);
    ok(/export const prerender = false/.test(s), `${rel} debe declarar prerender = false.`);
}

// 5. La UI no nombra al proveedor.
for (const f of ['src/components/app/settings/UsTaxSettings.astro', 'src/lib/us-tax-client.ts', 'src/lib/us-tax/editor.ts']) {
    ok(!/stripe/i.test(read(f)), `${f} no puede nombrar al proveedor (regla 14).`);
}
const core = read('src/lib/us-tax/core.ts');
const mensajes = core.slice(core.indexOf('const MENSAJES'), core.indexOf('export class UsTaxError'));
ok(mensajes.length > 100 && !/stripe/i.test(mensajes), 'Los mensajes de fallo cerrado no nombran al proveedor.');
for (const code of ['direccion_cliente', 'no_disponible', 'origen_incompleto', 'sin_registros', 'cuenta_cobros']) {
    for (const loc of ['es', 'en']) ok(!/stripe/i.test(usTaxMessage(code, loc)) && usTaxMessage(code, loc).length > 20, `Mensaje ${code}/${loc} vacío o con el proveedor.`);
}

// 6. Esquema y migración.
const schema = read('db/schema.sql');
const seccion = schema.slice(schema.indexOf('-- ── Sales tax de EE. UU. calculado por la dirección del cliente'), schema.indexOf('-- END us-tax'));
const deploy = read('db/deploy/2026-10-09-us-tax.sql');
for (const t of ['us_tax_calculos', 'us_tax_registros']) {
    for (const [nombre, texto] of [['db/schema.sql', seccion], ['db/deploy/2026-10-09-us-tax.sql', deploy]]) {
        ok(texto.includes(`alter table ${t} force row level security`), `${nombre}: ${t} necesita RLS forzada.`);
        ok(texto.includes(`grant select, insert, update, delete on ${t} to cord_app`), `${nombre}: ${t} necesita su grant a cord_app.`);
    }
}
ok(/if exists \(select 1 from pg_roles where rolname = 'cord_app'\)/.test(seccion), 'Los grants a cord_app van condicionados a que el rol exista.');
ok(schema.trimEnd().endsWith('-- END us-tax'), 'La sección del sales tax por dirección va al FINAL de db/schema.sql.');

// Cron registrado (cada hora en GitHub, diario de respaldo en Vercel).
ok(read('.github/workflows/cord-crons.yml').includes('*:*:api/cron/us-tax'), 'El cron us-tax debe correr cada hora desde cord-crons.yml.');
ok(read('vercel.json').includes('"/api/cron/us-tax"'), 'El cron us-tax debe tener su respaldo diario en vercel.json.');

// 7. La aritmética: la tasa efectiva reproduce el centavo del proveedor.
for (const [monto, impuesto, incluido] of [[12345, 1173, false], [7000, 666, false], [10950, 950, true], [1, 0, false], [99999999, 9500001, false]]) {
    const tasa = effectiveRate(monto, impuesto, incluido);
    const t = calculateDocumentTotals([{ cantidad: 1, precio_unitario: monto / 100, tax_rate: tasa }], {
        ivaIncluido: incluido, roundLines: 2, taxRounding: 'line',
    });
    ok(Math.round(t.impuestos * 100) === impuesto, `La tasa efectiva no reproduce el impuesto del proveedor (${monto} → ${impuesto}).`);
}

console.log(`Contrato del sales tax de EE. UU. correcto (${checks} verificaciones).`);

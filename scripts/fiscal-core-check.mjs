import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
    COUNTRY_CODES,
    SUPPORTED_COUNTRIES,
    getCountryProfile,
    isCountryCode,
    isSupportedCountry,
    listCountries,
    supportsOnlinePayments,
    TAX_PRESETS,
} from '../src/lib/countries.ts';
import { OFFERED_CURRENCIES, listOfferedCurrencies } from '../src/lib/currency.ts';
import { payoutSpecFor, abaValido } from '../src/lib/payout-fields.ts';
import { US_STATES, US_STATE_TAX, isUsState, usStateTaxPresets } from '../src/lib/countries.ts';
import { validNif, validNie, validCif, validSpainTaxId, validRfc } from '../src/lib/tax-id.ts';

assert.equal(COUNTRY_CODES.length, 249, 'el catálogo debe cubrir los 249 códigos ISO alpha-2');
assert.equal(new Set(COUNTRY_CODES).size, COUNTRY_CODES.length, 'no debe haber países duplicados');
assert.ok(COUNTRY_CODES.every((code) => /^[A-Z]{2}$/.test(code)), 'todos los códigos deben ser ISO alpha-2');
assert.equal(isCountryCode('mx'), true);
assert.equal(isCountryCode('ZZ'), false);
assert.equal(getCountryProfile('MX').regulatoryRail, 'cfdi_40');
assert.equal(getCountryProfile('US').regulatoryRail, 'commercial_invoice');
assert.equal(getCountryProfile('CO').currency, 'COP');
assert.equal(getCountryProfile('ES').taxIdLabel, 'NIF / CIF');

// El set OFRECIDO es un subconjunto del ISO, y todo país ofrecido tiene que
// venir completo: perfil real, riel de cobro decidido y, si hay riel, formato
// de cuenta de depósito. Un país en el select sin estas piezas es la regla 15.
assert.ok(SUPPORTED_COUNTRIES.every((code) => isCountryCode(code)), 'todo país ofrecido debe ser ISO válido');
assert.equal(listCountries('en').length, SUPPORTED_COUNTRIES.length);
assert.equal(isSupportedCountry('mx'), true);
assert.equal(isSupportedCountry('VN'), false);
// Un país guardado fuera del set no puede desaparecer de su propio selector.
assert.equal(listCountries('es', 'JP').length, SUPPORTED_COUNTRIES.length + 1);
assert.equal(listCountries('es', 'MX').length, SUPPORTED_COUNTRIES.length);
for (const code of SUPPORTED_COUNTRIES) {
    const profile = getCountryProfile(code);
    assert.notEqual(profile.timeZone, 'UTC', `${code} debe tener zona horaria propia`);
    assert.notEqual(profile.taxIdLabel, 'Tax ID', `${code} debe tener etiqueta fiscal propia`);
    assert.ok(OFFERED_CURRENCIES.includes(profile.currency), `la divisa de ${code} debe ofrecerse`);
    if (supportsOnlinePayments(code)) {
        assert.notEqual(payoutSpecFor(code).format, 'generic', `${code} cobra en línea y necesita formato de cuenta`);
    }
    // US y BR no tienen tasa nacional única: nacen sin preset A PROPÓSITO.
    if (code !== 'US' && code !== 'BR') {
        assert.ok(TAX_PRESETS[code]?.length, `${code} debe nacer con sus tasas estándar`);
    }
}
// Brasil no usa IBAN — estuvo en esa lista y ninguna cuenta habría validado.
assert.equal(payoutSpecFor('BR').format, 'br_bank');
// Las divisas: set cerrado, y la guardada se conserva aunque quede fuera.
assert.equal(listOfferedCurrencies('MXN')[0], 'MXN');
assert.ok(listOfferedCurrencies('JPY').includes('JPY'));
assert.ok(listOfferedCurrencies('VND').includes('VND'), 'una divisa ya guardada no se borra del selector');
assert.ok(!OFFERED_CURRENCIES.includes('VND'), 'VND no se ofrece: no se puede convertir ni cobrar');
assert.ok(Intl.supportedValuesOf('timeZone').includes('Europe/Copenhagen'));

const [schema, emit, provider, mexicoProvider, route, download, publicDownload] = await Promise.all([
    readFile(new URL('../db/schema.sql', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/fiscal/emit.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/fiscal/providers/CommercialInvoiceProvider.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/fiscal/providers/MexicoSatProvider.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/api/fiscal/documents/[id]/[format].ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/fiscal/invoice-download.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/api/i/[token]/documents/[format].ts', import.meta.url), 'utf8'),
]);

assert.match(schema, /uq_documentos_fiscales_idempotency/);
assert.match(schema, /create table if not exists invoice_sequences/);
assert.match(schema, /alter table invoice_sequences force row level security/);
assert.match(emit, /pg_advisory_xact_lock/);
assert.match(emit, /quote:\$\{cotizacionId\}:invoice:v1/);
assert.match(emit, /return finalizeInvoice\(orgId, String\(reserved.id\)\)/);
assert.match(await readFile(new URL('../src/lib/fiscal/issuance-usage.ts', import.meta.url), 'utf8'), /delivery_uncertain/);
assert.match(emit, /isBillableCfdi/);
assert.match(provider, /regulatory_status: 'commercial_only'/);
assert.match(provider, /authority_submission: false/);
assert.match(mexicoProvider, /delivery_uncertain: true/);
assert.match(mexicoProvider, /idempotency_key: request\.idempotencyKey/);
assert.match(route, /const orgId = await getActiveOrgId\(\)/);
assert.match(route, /return downloadInvoiceDocument\(orgId, params\.id/);
assert.match(download, /withOrgTx\(orgId, sql`/);
assert.match(download, /d\.id = \$\{id\} and d\.org_id = \$\{orgId\}/);
assert.match(download, /d\.public_token = \$\{publicToken \?\? null\}/);
assert.match(download, /d\.lifecycle not in \('draft', 'void'\)/);
assert.match(publicDownload, /await resolvePublicInvoice\(token\)/);
assert.match(publicDownload, /downloadInvoiceDocument\(identity\.orgId, identity\.id, format, token\)/);

// ── Estados Unidos: sales tax es estatal, no nacional ──────────────────────
// US no está en TAX_PRESETS a propósito (sin tasa nacional que sugerir), pero
// eso no puede dejar a una cuenta nueva sin NADA que sembrar: MULTI_TAX en el
// editor exige más de una opción, y con el catálogo vacío la columna de
// impuesto ni se dibujaba.
assert.equal(US_STATES.length, 51, '50 estados + DC');
assert.equal(new Set(US_STATES.map((s) => s.code)).size, 51, 'sin códigos de estado duplicados');
assert.ok(US_STATES.every((s) => /^[A-Z]{2}$/.test(s.code)), 'todo código de estado debe ser 2 letras');
assert.ok(isUsState('tx'), 'isUsState no debe ser sensible a mayúsculas');
assert.ok(!isUsState('ZZ'));
for (const state of US_STATES) {
    assert.ok(state.code in US_STATE_TAX, `falta la tasa base de ${state.code} en US_STATE_TAX`);
    const rate = US_STATE_TAX[state.code];
    assert.ok(rate >= 0 && rate <= 15, `${state.code}: tasa fuera de rango plausible (${rate})`);
}
{
    const tx = usStateTaxPresets('TX');
    assert.ok(tx.some((p) => p.kind === 'consumo' && p.esDefault), 'un estado con tasa > 0 debe tener un default de consumo');
    assert.ok(tx.some((p) => p.kind === 'exento'), 'siempre debe existir la opción exenta/resale');
    // Un estado sin sales tax estatal (Oregon) no debe ofrecer un default de
    // consumo con tasa 0 — solo la opción exenta.
    const or_ = usStateTaxPresets('OR');
    assert.ok(!or_.some((p) => p.kind === 'consumo'), 'un estado sin sales tax estatal no debe tener preset de consumo');
}

// ABA (routing number de EE.UU.): el archivo afirma desde su creación que los
// checksums se verifican en Cord y no en Stripe — para CLABE e IBAN eso era
// cierto, para ABA no existía la función.
assert.ok(abaValido('110000000'));
assert.ok(!abaValido('999999999'));
assert.ok(!abaValido('12345'), 'longitud incorrecta debe rechazarse antes que el checksum');

// ── España: identificador fiscal (NIF/NIE/CIF) ──────────────────────────────
// Ejemplo documentado por la propia AEAT (mismo vector que huella.ts usa para
// el emisor en verifactu-check.mjs) y un NIE/CIF derivados a mano con el
// algoritmo del artículo — no valores inventados.
assert.ok(validNif('12345678Z'), 'NIF de ejemplo de la AEAT');
assert.ok(!validNif('12345678A'), 'letra de control incorrecta debe rechazarse');
assert.ok(validNie('X1234567L'));
assert.ok(validCif('B12345674'));
assert.ok(validSpainTaxId('12345678Z'));
assert.ok(validSpainTaxId('B12345674'));
assert.ok(!validSpainTaxId('no-es-un-nif'));
assert.ok(validRfc('XAXX010101000'), 'RFC genérico mexicano sigue viviendo en tax-id.ts');

// ── Verifactu: orden de providers, fallo cerrado y encadenamiento ──────────
const [factory, spainProvider, chain, huella, invoicesSrc] = await Promise.all([
    readFile(new URL('../src/lib/fiscal/FiscalFactory.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/fiscal/providers/SpainVerifactuProvider.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/fiscal/verifactu/chain.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/fiscal/verifactu/huella.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/fiscal/invoices.ts', import.meta.url), 'utf8'),
]);

// El orden del array de FiscalFactory decide qué provider gana: gana el
// primero cuyo supports() sea true. SpainVerifactuProvider DEBE ir antes que
// CommercialInvoiceProvider o ES nunca llegaría a encadenar Verifactu.
{
    const spainIdx = factory.indexOf('new SpainVerifactuProvider()');
    const commercialIdx = factory.indexOf('new CommercialInvoiceProvider()');
    assert.ok(spainIdx > -1 && commercialIdx > -1, 'FiscalFactory debe registrar ambos providers');
    assert.ok(spainIdx < commercialIdx, 'SpainVerifactuProvider debe registrarse ANTES que CommercialInvoiceProvider');
}
// Mientras la org no activó Verifactu, degrada al mismo contrato honesto que
// el provider comercial — nunca aparenta un registro que no se generó.
assert.match(spainProvider, /regulatory_status: 'commercial_only'/);
assert.match(spainProvider, /authority_submission: false/);
// Sin NIF del emisor la función debe LANZAR (fallo cerrado): el llamador
// (emit.ts/invoices.ts) trata una excepción del provider como emisión
// fallida y no marca el documento como emitido.
assert.match(spainProvider, /throw new Error\('La organización no tiene NIF configurado/);
// El registro se encadena antes de construir la respuesta — issueDocument no
// puede devolver success:true sin haber persistido el eslabón.
assert.match(spainProvider, /await appendVerifactuAlta\(/);
assert.match(spainProvider, /await appendVerifactuAnulacion\(/);
// documentType viaja desde ambos caminos de emisión hasta el provider — sin
// esto una rectificativa española se firmaría como F1 en vez de R1.
assert.match(emit, /documentTypeForOrg/);
assert.match(invoicesSrc, /documentType: regulatory/);
assert.match(spainProvider, /isRectificativa \? 'R1' : 'F1'/);

// El driver HTTP de Neon (ver src/lib/db.ts) no sostiene una transacción
// interactiva entre dos llamadas, así que un advisory lock tomado en una
// llamada YA se liberó cuando la siguiente empieza: la cadena se serializa
// con el unique(org_id, seq) + reintento, no con pg_advisory_xact_lock.
assert.match(chain, /on conflict \(org_id, seq\) do nothing/);
assert.match(chain, /existingLink\(orgId, documentoId, tipo\)/, 'debe haber un replay idempotente antes de intentar encadenar de nuevo');
assert.ok(!/sql`[^`]*pg_advisory_xact_lock/s.test(chain), 'un advisory lock no serializa nada entre dos llamadas HTTP separadas — sería falsa seguridad');

// ── Schema: la cadena es append-only de verdad, no solo por convención ─────
assert.match(schema, /create table if not exists verifactu_registros/);
assert.match(schema, /unique \(org_id, seq\)/);
assert.match(schema, /unique \(documento_id, tipo\)/);
assert.match(schema, /alter table verifactu_registros force row level security/);
assert.match(schema, /create trigger trg_verifactu_registro_inmutable/);
assert.match(schema, /before update or delete on verifactu_registros/);
assert.match(schema, /verifactu_modo text not null default 'no_verifactu'/);

// El propio huella.ts documenta que está verificado contra los 3 ejemplos
// oficiales de la AEAT — verifactu-check.mjs los reproduce como vectores
// duros; aquí solo se confirma que el archivo sigue declarando esa garantía.
assert.match(huella, /verificado.*AEAT/is);

process.stdout.write('fiscal-core-check: ok\n');

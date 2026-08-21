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
import { payoutSpecFor } from '../src/lib/payout-fields.ts';

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

const [schema, emit, provider, mexicoProvider, route] = await Promise.all([
    readFile(new URL('../db/schema.sql', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/fiscal/emit.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/fiscal/providers/CommercialInvoiceProvider.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/fiscal/providers/MexicoSatProvider.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/api/fiscal/documents/[id]/[format].ts', import.meta.url), 'utf8'),
]);

assert.match(schema, /uq_documentos_fiscales_idempotency/);
assert.match(schema, /create table if not exists invoice_sequences/);
assert.match(schema, /alter table invoice_sequences force row level security/);
assert.match(emit, /pg_advisory_xact_lock/);
assert.match(emit, /quote:\$\{cotizacionId\}:invoice:v1/);
assert.match(emit, /interval '2 minutes'/);
assert.match(emit, /isBillableCfdi/);
assert.match(provider, /regulatory_status: 'commercial_only'/);
assert.match(provider, /authority_submission: false/);
assert.match(mexicoProvider, /delivery_uncertain: true/);
assert.match(mexicoProvider, /idempotency_key: request\.idempotencyKey/);
assert.match(route, /d\.id = \$\{id\} and d\.org_id = \$\{orgId\}/);

process.stdout.write('fiscal-core-check: ok\n');

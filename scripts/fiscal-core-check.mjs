import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
    COUNTRY_CODES,
    getCountryProfile,
    isCountryCode,
    listCountries,
} from '../src/lib/countries.ts';

assert.equal(COUNTRY_CODES.length, 249, 'el catálogo debe cubrir los 249 códigos ISO alpha-2');
assert.equal(new Set(COUNTRY_CODES).size, COUNTRY_CODES.length, 'no debe haber países duplicados');
assert.ok(COUNTRY_CODES.every((code) => /^[A-Z]{2}$/.test(code)), 'todos los códigos deben ser ISO alpha-2');
assert.equal(isCountryCode('mx'), true);
assert.equal(isCountryCode('ZZ'), false);
assert.equal(getCountryProfile('MX').regulatoryRail, 'cfdi_40');
assert.equal(getCountryProfile('US').regulatoryRail, 'commercial_invoice');
assert.equal(getCountryProfile('CO').currency, 'COP');
assert.equal(getCountryProfile('ES').taxIdLabel, 'NIF / CIF');
assert.equal(listCountries('en').length, 249);
assert.ok(Intl.supportedValuesOf('currency').includes('DKK'));
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

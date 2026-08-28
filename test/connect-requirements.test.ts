import { describe, it, expect } from 'vitest';
import {
    parseRequirement,
    collectRequirements,
    requiresField,
    missingPersonRoles,
} from '../src/lib/connect-requirements';
import { translateRequirement } from '../src/lib/stripe-catalogs';

// Sets de requisitos REALES, capturados del endpoint de requisitos por país del
// proveedor (company, dashboard `none`, ToS `full`, card_payments + transfers).
//
// Son la única defensa contra que el proveedor cambie sus reglas y nadie se
// entere: el asistente ya no tiene ramas por país, así que si estos sets dejan
// de parsearse bien, el alta se rompe en silencio en ese mercado.
const FIXTURES = {
    MX: [
        'business_profile.mcc', 'business_profile.url', 'company.address.city',
        'company.address.line1', 'company.address.postal_code', 'company.address.state',
        'company.name', 'company.owners_provided', 'company.tax_id',
        'external_account', 'owners.address.city', 'owners.address.line1',
        'owners.dob.day', 'owners.dob.month', 'owners.dob.year', 'owners.first_name',
        'owners.id_number', 'owners.last_name', 'owners.relationship.percent_ownership',
        'representative.address.city', 'representative.address.line1',
        'representative.dob.day', 'representative.first_name', 'representative.id_number',
        'representative.last_name', 'representative.relationship.title',
        'tos_acceptance.date', 'tos_acceptance.ip',
    ],
    US: [
        'business_profile.mcc', 'business_profile.url', 'company.address.city',
        'company.address.line1', 'company.address.postal_code', 'company.address.state',
        'company.name', 'company.owners_provided', 'company.tax_id', 'external_account',
        'owners.address.city', 'owners.dob.day', 'owners.first_name', 'owners.last_name',
        'owners.relationship.percent_ownership', 'owners.ssn_last_4',
        'representative.address.city', 'representative.dob.day', 'representative.first_name',
        'representative.last_name', 'representative.relationship.title',
        'representative.ssn_last_4', 'settings.payments.statement_descriptor',
        'tos_acceptance.date', 'tos_acceptance.ip',
    ],
    ES: [
        'business_profile.mcc', 'business_profile.url', 'company.address.city',
        'company.address.line1', 'company.address.postal_code', 'company.name',
        'company.directors_provided', 'company.executives_provided', 'company.owners_provided',
        'company.tax_id', 'directors.first_name', 'directors.last_name',
        'external_account', 'owners.address.line1', 'owners.dob.day', 'owners.first_name',
        'owners.last_name', 'representative.address.line1', 'representative.dob.day',
        'representative.first_name', 'representative.last_name',
        'representative.relationship.title', 'tos_acceptance.date', 'tos_acceptance.ip',
    ],
    GB: [
        'business_profile.mcc', 'business_profile.url', 'company.address.line1',
        'company.name', 'company.directors_provided', 'company.executives_provided',
        'company.owners_provided', 'company.tax_id', 'external_account',
        'owners.dob.day', 'owners.first_name', 'representative.dob.day',
        'representative.first_name', 'representative.relationship.title',
        'tos_acceptance.date', 'tos_acceptance.ip',
    ],
    DE: [
        'business_profile.mcc', 'business_profile.url', 'company.address.line1',
        'company.name', 'company.directors_provided', 'company.executives_provided',
        'company.owners_provided', 'company.tax_id', 'external_account',
        'owners.dob.day', 'owners.first_name', 'representative.dob.day',
        'representative.first_name', 'representative.relationship.title',
        'tos_acceptance.date', 'tos_acceptance.ip',
    ],
    // El programa `eu-2025` añade nacionalidad y domicilio de los directores.
    ES_EU2025: [
        'business_profile.mcc', 'company.name', 'company.owners_provided',
        'company.directors_provided', 'directors.address.line1', 'directors.first_name',
        'external_account', 'representative.nationality', 'representative.first_name',
        'tos_acceptance.date',
    ],
} as const;

const cuenta = (currently_due: readonly string[]) => ({
    requirements: {
        currently_due: [...currently_due],
        eventually_due: [], past_due: [], pending_verification: [],
    },
});

describe('parseRequirement', () => {
    it('separa el scope del campo', () => {
        expect(parseRequirement('representative.id_number', 'currently_due')).toMatchObject({
            scope: { kind: 'role', role: 'representative' }, field: 'id_number',
        });
        expect(parseRequirement('person_1KabcXYZ.dob.day', 'currently_due')).toMatchObject({
            scope: { kind: 'person', personId: 'person_1KabcXYZ' }, field: 'dob.day',
        });
        expect(parseRequirement('company.address.line1', 'currently_due')).toMatchObject({
            scope: { kind: 'company' }, field: 'address.line1',
        });
        expect(parseRequirement('individual.verification.document', 'currently_due')).toMatchObject({
            scope: { kind: 'individual' }, field: 'verification.document',
        });
        expect(parseRequirement('external_account', 'currently_due')).toMatchObject({
            scope: { kind: 'account' }, field: 'external_account',
        });
        expect(parseRequirement('interv_abc.desc.form', 'currently_due').scope.kind).toBe('interview');
    });
});

describe('requiresField deriva del proveedor, no del país', () => {
    // El bug que originó todo esto: el asistente exigía `id_number` en los ocho
    // países. En España, Alemania y Reino Unido el proveedor NO lo pide y el
    // representante no tiene ese número — el alta era imposible de terminar.
    it('pide identificación personal sólo donde el proveedor la pide', () => {
        expect(requiresField(cuenta(FIXTURES.MX), 'id_number')).toBe(true);
        expect(requiresField(cuenta(FIXTURES.ES), 'id_number')).toBe(false);
        expect(requiresField(cuenta(FIXTURES.DE), 'id_number')).toBe(false);
        expect(requiresField(cuenta(FIXTURES.GB), 'id_number')).toBe(false);
    });

    it('pide los últimos 4 del SSN sólo en Estados Unidos', () => {
        expect(requiresField(cuenta(FIXTURES.US), 'ssn_last_4')).toBe(true);
        for (const pais of ['MX', 'ES', 'DE', 'GB'] as const) {
            expect(requiresField(cuenta(FIXTURES[pais]), 'ssn_last_4')).toBe(false);
        }
    });

    it('detecta nacionalidad cuando el programa europeo la añade', () => {
        expect(requiresField(cuenta(FIXTURES.ES), 'nationality')).toBe(false);
        expect(requiresField(cuenta(FIXTURES.ES_EU2025), 'nationality')).toBe(true);
    });

    it('detecta el descriptor de estado de cuenta de Estados Unidos', () => {
        expect(requiresField(cuenta(FIXTURES.US), 'settings.payments.statement_descriptor')).toBe(true);
        expect(requiresField(cuenta(FIXTURES.MX), 'settings.payments.statement_descriptor')).toBe(false);
    });

    it('no exige lo que sólo se debe algún día, pero sí lo muestra', () => {
        const soloEventual = {
            requirements: {
                currently_due: [], past_due: [], pending_verification: [],
                eventually_due: ['representative.id_number'],
            },
        };
        expect(requiresField(soloEventual, 'id_number')).toBe(false);
        expect(requiresField(soloEventual, 'id_number', { includeEventual: true })).toBe(true);
    });
});

describe('missingPersonRoles', () => {
    it('México y Estados Unidos piden representante y dueños', () => {
        expect([...missingPersonRoles(cuenta(FIXTURES.MX))].sort()).toEqual(['owner', 'representative']);
        expect([...missingPersonRoles(cuenta(FIXTURES.US))].sort()).toEqual(['owner', 'representative']);
    });

    it('España añade directores — el modelo de una sola persona no cabía', () => {
        expect([...missingPersonRoles(cuenta(FIXTURES.ES))].sort()).toEqual(['director', 'owner', 'representative']);
    });
});

describe('collectRequirements', () => {
    it('deduplica quedándose con la urgencia más apremiante', () => {
        const items = collectRequirements({
            requirements: {
                past_due: ['external_account'],
                currently_due: ['external_account'],
                eventually_due: ['external_account'],
                pending_verification: [],
            },
        });
        expect(items.filter((r) => r.raw === 'external_account')).toHaveLength(1);
        expect(items[0].urgency).toBe('past_due');
    });

    it('marca como futuros los de future_requirements', () => {
        const items = collectRequirements({
            requirements: { currently_due: [], past_due: [], eventually_due: [], pending_verification: [] },
            future_requirements: { currently_due: ['company.vat_id'], past_due: [], eventually_due: [], pending_verification: [] },
        });
        expect(items).toHaveLength(1);
        expect(items[0].urgency).toBe('future');
    });
});

describe('translateRequirement habla el idioma y el vocabulario del país', () => {
    it('usa la identificación fiscal real de cada país', () => {
        expect(translateRequirement('company.tax_id', 'es', 'MX').mensaje).toContain('RFC');
        expect(translateRequirement('company.tax_id', 'es', 'ES').mensaje).toContain('NIF');
        expect(translateRequirement('company.tax_id', 'en', 'US').mensaje).toContain('EIN');
    });

    it('nombra el riel de depósito del país, no la CLABE de México', () => {
        expect(translateRequirement('external_account', 'es', 'MX').mensaje).toContain('CLABE');
        expect(translateRequirement('external_account', 'es', 'ES').mensaje).toContain('IBAN');
        expect(translateRequirement('external_account', 'en', 'ES').mensaje).toContain('IBAN');
    });

    it('traduce al inglés', () => {
        const t = translateRequirement('representative.first_name', 'en', 'GB');
        expect(t.mensaje).toMatch(/first name/i);
        expect(t.mensaje).not.toMatch(/[áéíóúñ¿¡]/i);
    });

    it('conoce los prefijos de rol, que antes caían al fallback genérico', () => {
        for (const raw of ['representative.dob.day', 'owners.first_name', 'directors.address.line1', 'executives.last_name']) {
            const t = translateRequirement(raw, 'es', 'ES');
            expect(t.mensaje).not.toBe('Requisito adicional de verificación');
        }
        expect(translateRequirement('owners.first_name', 'es', 'ES').mensaje).toContain('dueño');
        expect(translateRequirement('directors.address.line1', 'es', 'ES').mensaje).toContain('director');
    });

    it('manda cada requisito a su paso del asistente', () => {
        expect(translateRequirement('business_profile.mcc').paso).toBe(1);
        expect(translateRequirement('company.address.line1').paso).toBe(2);
        expect(translateRequirement('representative.dob.day').paso).toBe(3);
        expect(translateRequirement('company.owners_provided').paso).toBe(4);
        expect(translateRequirement('person_1K.verification.document').paso).toBe(5);
        expect(translateRequirement('external_account').paso).toBe(6);
        expect(translateRequirement('tos_acceptance.date').paso).toBe(7);
    });

    it('no manda a dar vueltas por una entrevista del proveedor', () => {
        expect(translateRequirement('interv_abc.desc.form', 'es', 'ES').paso).toBe(8);
    });

    it('cubre TODO requisito real de los seis mercados', () => {
        const sinTraducir: string[] = [];
        for (const [pais, lista] of Object.entries(FIXTURES)) {
            const code = pais.slice(0, 2);
            for (const raw of lista) {
                const t = translateRequirement(raw, 'es', code);
                if (t.mensaje === 'Requisito adicional de verificación') sinTraducir.push(`${pais}: ${raw}`);
            }
        }
        expect(sinTraducir).toEqual([]);
    });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    validateTaxId, TAX_ID_COUNTRIES, validSpainTaxId, validNif, validCif, validEin,
} from '../src/lib/tax-id';
import { SUPPORTED_COUNTRIES } from '../src/lib/countries';

// Los identificadores "reales" son de entidades públicas o cotizadas (los
// publican ellas mismas o el registro oficial); los "de ejemplo" vienen de la
// documentación oficial o de python-stdnum. Cada inválido es un real con un
// dígito alterado: así el test prueba el dígito verificador y no solo la forma.

const ok = (country: string, value: string, kind?: string, normalized?: string, persona?: 'fisica' | 'moral') => {
    const r = validateTaxId(country, value, { persona });
    expect(r, `${country} ${value}`).toMatchObject({ ok: true, ...(kind ? { kind } : {}), ...(normalized ? { normalized } : {}) });
};
const bad = (country: string, value: string, persona?: 'fisica' | 'moral') => {
    const r = validateTaxId(country, value, { persona });
    expect(r.ok, `${country} ${value}`).toBe(false);
    return r.ok ? '' : r.reason;
};

describe('cobertura', () => {
    it('valida los doce mercados ofrecidos', () => {
        expect([...TAX_ID_COUNTRIES].sort()).toEqual([...SUPPORTED_COUNTRIES].sort());
    });

    it('un país sin validador no bloquea: devuelve el valor limpio', () => {
        expect(validateTaxId('JP', '  t1234567890123 ')).toEqual({ ok: true, normalized: 'T1234567890123' });
        expect(validateTaxId('', 'abc  123')).toEqual({ ok: true, normalized: 'ABC 123' });
    });

    it('vacío nunca es válido; el llamador decide si el campo es opcional', () => {
        expect(validateTaxId('MX', '  ')).toEqual({ ok: false, reason: 'Captura el RFC.' });
        expect(validateTaxId('JP', '')).toEqual({ ok: false, reason: 'Captura el identificador fiscal.' });
    });

    it('rechaza todo ceros y basura de más de 20 caracteres', () => {
        bad('CA', '000-000-000');
        bad('CO', '0000000000');
        bad('FR', '1'.repeat(25));
    });
});

describe('México — RFC', () => {
    it('acepta moral, física y genéricos del SAT', () => {
        ok('MX', 'EKU9003173C9', 'rfc_moral');
        ok('MX', 'eku-900317-3c9', 'rfc_moral', 'EKU9003173C9');
        ok('MX', 'GODE561231GR8', 'rfc_fisica');
        ok('MX', 'XAXX010101000', 'rfc_generico');
        ok('MX', 'XEXX010101000', 'rfc_generico');
    });

    it('distingue dígito verificador de forma', () => {
        expect(bad('MX', 'EKU9003173C8')).toBe('Revisa el RFC: el dígito verificador no coincide.');
        expect(bad('MX', 'EKU9013173C9')).toMatch(/formato correcto/);
        expect(bad('MX', '123')).toMatch(/formato correcto \(ej\. EKU9003173C9\)/);
    });
});

describe('España — NIF, NIE y CIF', () => {
    it('acepta CIF reales y el prefijo ES de NIF-IVA', () => {
        ok('ES', 'A28015865', 'cif'); // Telefónica
        ok('ES', 'A15075062', 'cif'); // Inditex
        ok('ES', 'A46103834', 'cif'); // Mercadona
        ok('ES', 'A39000013', 'cif'); // Banco Santander
        ok('ES', 'ESA28015865', 'cif', 'A28015865');
        ok('ES', 'ES B-64717838', 'cif', 'B64717838');
        expect(validSpainTaxId('ESB12345674')).toBe(true);
    });

    it('NIF de DNI, NIE y NIF K/L/M con la letra del DNI', () => {
        ok('ES', '12345678Z', 'nif');
        ok('ES', '54362315-K', 'nif', '54362315K');
        ok('ES', 'X-5253868-R', 'nie', 'X5253868R');
        ok('ES', 'M1234567L', 'nif');
        expect(validNif('K1234567L')).toBe(true);
        // K/L/M no son CIF: antes se validaban con el control del CIF.
        expect(validCif('M1234567L')).toBe(false);
        bad('ES', 'M1234567A');
    });

    it('rechaza control alterado con un motivo de letra o dígito', () => {
        expect(bad('ES', 'A28015866')).toBe('Revisa el CIF: la letra o el dígito de control no coincide.');
        expect(bad('ES', '12345678A')).toMatch(/^Revisa el NIF:/);
        expect(bad('ES', 'X5253868T')).toMatch(/^Revisa el NIE:/);
        expect(bad('ES', 'nope')).toBe('Revisa el NIF, NIE o CIF: no tiene el formato correcto (ej. B12345674).');
    });
});

describe('Estados Unidos — EIN', () => {
    it('acepta EIN reales con o sin guion', () => {
        ok('US', '94-2404110', 'ein', '942404110'); // Apple
        ok('US', '91-1144442', 'ein'); // Microsoft
        ok('US', '770493581', 'ein'); // Google
    });

    it('rechaza prefijos que el IRS no asigna', () => {
        for (const p of ['00', '07', '08', '09', '17', '18', '19', '28', '29', '49', '69', '70', '78', '79', '89', '96', '97']) {
            expect(bad('US', `${p}-1234567`)).toBe(`Revisa el EIN: no existe con el prefijo ${p}.`);
        }
        expect(validEin('07-1234567')).toBe(false);
        expect(validEin('12-3456789')).toBe(true);
        expect(bad('US', '1234')).toMatch(/formato correcto/);
    });

    it('persona física acepta SSN e ITIN; un negocio no', () => {
        ok('US', '078-05-1120', 'ssn', '078051120', 'fisica');
        ok('US', '912-70-1234', 'itin', undefined, 'fisica');
        ok('US', '900-50-1234', 'itin', undefined, 'fisica');
        expect(bad('US', '078-05-1120')).toMatch(/prefijo 07/);
        // Ni SSN (área 000) ni ITIN ni EIN (prefijo 00) válido.
        expect(bad('US', '000-12-3456', 'fisica')).toMatch(/prefijo 00/);
    });
});

describe('Francia — SIREN, SIRET y TVA', () => {
    it('acepta SIREN reales con Luhn', () => {
        ok('FR', '552 032 534', 'siren', '552032534'); // Danone
        ok('FR', '632012100', 'siren'); // L'Oréal
        ok('FR', '542051180', 'siren'); // TotalEnergies
        expect(bad('FR', '552032535')).toBe('Revisa el SIREN: el dígito verificador no coincide.');
    });

    it('SIRET con Luhn y la excepción de La Poste', () => {
        ok('FR', '732 829 320 00074', 'siret', '73282932000074');
        bad('FR', '73282932000079');
        ok('FR', '35600000000048', 'siret'); // sede de La Poste: Luhn normal
        // Establecimientos de La Poste: suma de dígitos múltiplo de 5. Este no
        // cumple Luhn: pasa solo por la excepción.
        ok('FR', '356 000 000 49837', 'siret', '35600000049837');
        bad('FR', '35600000049838');
    });

    it('TVA: clave numérica verificada, alfanumérica aceptada, prefijo FR canónico', () => {
        ok('FR', 'FR 40 303 265 045', 'tva', 'FR40303265045');
        ok('FR', '23334175221', 'tva', 'FR23334175221');
        ok('FR', 'FR27552032534', 'tva'); // Danone
        ok('FR', 'FRK7399859412', 'tva');
        expect(bad('FR', 'FR84323140391')).toBe('Revisa el número de TVA: el dígito verificador no coincide.');
        bad('FR', 'FR41303265045');
    });

    it('persona física acepta el número fiscal', () => {
        ok('FR', '30 23 217 600 053', 'spi', '3023217600053', 'fisica');
        bad('FR', '3023217600054', 'fisica');
        bad('FR', '3023217600053');
    });
});

describe('Alemania — USt-IdNr y Steuernummer', () => {
    it('USt-IdNr con ISO 7064 MOD 11,10 y prefijo DE canónico', () => {
        ok('DE', 'DE136695976', 'ust_idnr');
        ok('DE', 'DE 143 454 214', 'ust_idnr', 'DE143454214'); // SAP SE
        ok('DE', '136695976', 'ust_idnr', 'DE136695976');
        expect(bad('DE', 'DE136695978')).toBe('Revisa el USt-IdNr.: el dígito verificador no coincide.');
        bad('DE', 'DE036695976');
    });

    it('Steuernummer: solo la forma (10, 11 o 13 dígitos)', () => {
        ok('DE', '181/815/08155', 'steuernummer', '18181508155');
        ok('DE', '21/815/08150', 'steuernummer');
        ok('DE', '4151081508156', 'steuernummer');
        expect(bad('DE', '123456789012')).toBe('Revisa el USt-IdNr. o Steuernummer: no tiene el formato correcto (ej. DE136695976).');
    });
});

describe('Reino Unido — VAT, UTR y Company Number', () => {
    it('VAT con módulo 97 y 9755', () => {
        ok('GB', 'GB 980 7806 84', 'vat', 'GB980780684');
        ok('GB', '980780684', 'vat', 'GB980780684');
        ok('GB', '980780684001', 'vat', 'GB980780684001'); // con sucursal
        ok('GB', 'XI980780684', 'vat', 'XI980780684');
        ok('GB', 'GBGD001', 'vat');
        ok('GB', 'HA599', 'vat', 'GBHA599');
        expect(bad('GB', '802311781')).toBe('Revisa el número de VAT: el dígito verificador no coincide.');
        bad('GB', 'GD600');
    });

    it('UTR y Company Number por forma; National Insurance solo para persona física', () => {
        ok('GB', '1955839661', 'utr');
        ok('GB', '01234567', 'crn');
        ok('GB', 'SC123456', 'crn');
        ok('GB', 'AB123456C', 'nino', undefined, 'fisica');
        bad('GB', 'AB123456C');
        bad('GB', 'QQ123456C', 'fisica'); // prefijo que HMRC no asigna
    });
});

describe('Canadá — Business Number', () => {
    it('BN con Luhn, cuentas de programa y QST', () => {
        ok('CA', '123456782', 'bn');
        ok('CA', '046 454 286', 'bn', '046454286');
        ok('CA', '123456782 RT 0001', 'gst_hst', '123456782RT0001');
        ok('CA', '123456782RC0001', 'bn15');
        ok('CA', '1234567890TQ0001', 'qst');
        expect(bad('CA', '123456783')).toBe('Revisa el Business Number: el dígito verificador no coincide.');
        expect(bad('CA', '123456783RT0001')).toMatch(/GST\/HST/);
        bad('CA', '123456782XX0001');
    });
});

describe('Brasil — CPF y CNPJ', () => {
    it('CNPJ reales, incluido el alfanumérico de julio de 2026', () => {
        ok('BR', '33.000.167/0001-01', 'cnpj', '33000167000101'); // Petrobras
        ok('BR', '00.000.000/0001-91', 'cnpj'); // Banco do Brasil
        ok('BR', '60.701.190/0001-04', 'cnpj'); // Itaú Unibanco
        ok('BR', '12.ABC.345/01DE-35', 'cnpj', '12ABC34501DE35');
        expect(bad('BR', '33.000.167/0001-02')).toBe('Revisa el CNPJ: el dígito verificador no coincide.');
        bad('BR', '12.ABC.345/01DE-36');
    });

    it('CPF con dos dígitos módulo 11; repetidos rechazados', () => {
        ok('BR', '390.533.447-05', 'cpf', '39053344705');
        bad('BR', '390.533.447-06');
        bad('BR', '111.111.111-11');
        bad('BR', '11.111.111/1111-11');
    });
});

describe('Colombia — NIT', () => {
    it('verifica el DV cuando viene separado', () => {
        ok('CO', '899.999.068-1', 'nit', '899999068-1'); // Ecopetrol
        ok('CO', '890.903.938-8', 'nit'); // Bancolombia
        ok('CO', '800.197.268-4', 'nit'); // DIAN
        expect(bad('CO', '899.999.068-2')).toBe('Revisa el NIT: el dígito verificador no coincide.');
    });

    it('sin DV no se puede verificar y no se bloquea', () => {
        ok('CO', '900.123.456', 'nit', '900123456');
        bad('CO', 'NIT-ABC');
    });
});

describe('Argentina — CUIT', () => {
    it('acepta CUIT reales y verifica prefijo y DV', () => {
        ok('AR', '33-69345023-9', 'cuit', '33693450239'); // AFIP
        ok('AR', '30-54668997-9', 'cuit'); // YPF
        ok('AR', '30-70308853-4', 'cuit'); // MercadoLibre
        expect(bad('AR', '30-54668997-8')).toBe('Revisa el CUIT: el dígito verificador no coincide.');
        expect(bad('AR', '40-54668997-9')).toBe('Revisa el CUIT: no existe con el prefijo 40.');
    });

    it('DNI solo para persona física', () => {
        ok('AR', '12.345.678', 'dni', '12345678', 'fisica');
        bad('AR', '12345678');
    });
});

describe('Chile — RUT', () => {
    it('acepta RUT reales, con DV numérico o K', () => {
        ok('CL', '60.803.000-K', 'rut', '60803000-K'); // SII
        ok('CL', '61.704.000-k', 'rut', '61704000-K'); // Codelco
        ok('CL', '90.749.000-9', 'rut'); // Falabella
        ok('CL', '907490009', 'rut', '90749000-9');
        expect(bad('CL', '60.803.000-1')).toBe('Revisa el RUT: el dígito verificador no coincide.');
        bad('CL', '90.749.000-K');
    });
});

describe('Perú — RUC', () => {
    it('acepta RUC reales y verifica prefijo y DV', () => {
        ok('PE', '20131312955', 'ruc'); // SUNAT
        ok('PE', '20100113610', 'ruc'); // Backus
        ok('PE', '20100047218', 'ruc'); // BCP
        expect(bad('PE', '20131312954')).toBe('Revisa el RUC: el dígito verificador no coincide.');
        expect(bad('PE', '30131312955')).toBe('Revisa el RUC: no existe con el prefijo 30.');
        ok('PE', '45678912', 'dni', undefined, 'fisica');
        bad('PE', '45678912');
    });
});

describe('motivo en inglés', () => {
    it('nombra el dato local y no el mecanismo', () => {
        expect(validateTaxId('BR', '33.000.167/0001-02', { locale: 'en' })).toEqual({ ok: false, reason: 'Check the CNPJ: the check digit does not match.' });
        expect(validateTaxId('GB', 'abc', { locale: 'en' })).toEqual({ ok: false, reason: 'Check the VAT number or UTR: the format is not valid (e.g. GB980780684).' });
        expect(validateTaxId('ES', 'A28015866', { locale: 'en' })).toMatchObject({ reason: 'Check the CIF: the control letter or digit does not match.' });
        expect(validateTaxId('US', '07-1234567', { locale: 'en' })).toMatchObject({ reason: 'Check the EIN: it does not exist with prefix 07.' });
    });
});

// ── Acciones de clientes: el identificador se valida con el país correcto ────

const m = vi.hoisted(() => ({ tx: vi.fn() }));
vi.mock('../src/lib/db', () => ({
    sql: (s: TemplateStringsArray, ...values: unknown[]) => ({ text: s.join('?'), values }),
    withOrgTx: m.tx, reqIp: () => '10.0.0.1', logAudit: vi.fn(),
}));
vi.mock('../src/lib/org-entitlements', () => ({ requireResourceCapacity: vi.fn(async () => null), resourceLimitError: vi.fn() }));
vi.mock('../src/lib/webhooks', () => ({ dispatchEvent: vi.fn() }));
vi.mock('../src/lib/after', () => ({ after: vi.fn() }));

const { createClient, updateClient, patchClientContact } = await import('../src/lib/actions/clients');

const ctx = { orgId: 'org-a', origin: 'https://cordhq.app' };
const ID = '11111111-1111-4111-8111-111111111111';
const texts = () => m.tx.mock.calls.map((c) => c.slice(1).map((q: any) => q.text).join(' | '));

describe('acciones de clientes', () => {
    beforeEach(() => { m.tx.mockReset(); });

    it('sin país propio valida con el de la organización y guarda normalizado', async () => {
        m.tx.mockResolvedValueOnce([[{ country_code: 'ES' }]]).mockResolvedValueOnce([[{ id: ID }]]);
        const out = await createClient(ctx, { empresa: 'Telefónica', rfc: 'es a-28015865' });
        expect(out.status).toBe(200);
        expect(texts()[0]).toContain('from orgs');
        expect(m.tx.mock.calls[1][1].values).toContain('A28015865');
    });

    it('con país propio no consulta la organización y rechaza con el motivo local', async () => {
        const out = await createClient(ctx, { empresa: 'Petrobras', rfc: '33.000.167/0001-02', country_code: 'BR' });
        expect(out).toEqual({ status: 400, body: { error: 'Revisa el CNPJ: el dígito verificador no coincide.', code: 'invalid_tax_id' } });
        expect(m.tx).not.toHaveBeenCalled();
    });

    it('sin identificador no valida nada (campo opcional)', async () => {
        m.tx.mockResolvedValueOnce([[{ id: ID }]]);
        expect((await createClient(ctx, { empresa: 'Sin RFC' })).status).toBe(200);
        expect(m.tx).toHaveBeenCalledTimes(1);
    });

    it('editar sin tocar un RFC antiguo inválido no lo bloquea', async () => {
        const antes = { rfc: 'AAA010101AAA', country_code: null };
        m.tx.mockResolvedValueOnce([[antes]]).mockResolvedValueOnce([[{ empresa: 'X' }], [{ id: ID, empresa: 'X' }]]);
        const out = await updateClient(ctx, ID, { empresa: 'X', rfc: 'aaa010101aaa', telefono: '555' });
        expect(out.status).toBe(200);
        expect(texts().some((t) => t.includes('from orgs'))).toBe(false);
    });

    it('declarar el país que ya heredaba no revalida', async () => {
        const antes = { rfc: 'AAA010101AAA', country_code: null };
        m.tx.mockResolvedValueOnce([[antes]]).mockResolvedValueOnce([[{ country_code: 'MX' }]])
            .mockResolvedValueOnce([[{ empresa: 'X' }], [{ id: ID, empresa: 'X' }]]);
        expect((await updateClient(ctx, ID, { empresa: 'X', rfc: 'AAA010101AAA', country_code: 'MX' })).status).toBe(200);
    });

    it('cambiar el RFC lo valida', async () => {
        m.tx.mockResolvedValueOnce([[{ rfc: 'EKU9003173C9', country_code: 'MX' }]]);
        const out = await updateClient(ctx, ID, { empresa: 'X', rfc: 'EKU9003173C8', country_code: 'MX' });
        expect(out.status).toBe(400);
        expect(out.body.code).toBe('invalid_tax_id');
        expect(m.tx).toHaveBeenCalledTimes(1);
    });

    it('cambiar el país revalida el mismo identificador', async () => {
        const actual = { id: ID, empresa: 'X', rfc: 'EKU9003173C9', country_code: 'MX' };
        m.tx.mockResolvedValueOnce([[actual]]);
        const out = await patchClientContact(ctx, ID, { country_code: 'BR' });
        expect(out.body).toMatchObject({ code: 'invalid_tax_id', error: expect.stringMatching(/CNPJ o CPF/) });
    });
});

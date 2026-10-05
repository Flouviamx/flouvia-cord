import { describe, it, expect } from 'vitest';
import { validRfc, rfcPersona } from '../packages/elements/src/fiscal/tax-id';
import { validateFiscalReceptor } from '../packages/elements/src/fiscal/receptor';
import { regimenesPara } from '../packages/elements/src/fiscal/sat';

const codes = (r: ReturnType<typeof validateFiscalReceptor>) => r.errors.map((e) => `${e.field}:${e.code}`);

describe('RFC', () => {
    it.each(['EKU9003173C9', 'XIA190128J61', 'IIA040805DZ4', 'GODE561231GR8', 'URE180429TM6', 'CACX7605101P8'])(
        'acepta %s con su dígito verificador', (rfc) => expect(validRfc(rfc)).toBe(true));

    it('acepta los genéricos del SAT', () => {
        expect(rfcPersona('XAXX010101000')).toBe('generico');
        expect(rfcPersona('XEXX010101000')).toBe('generico');
    });

    it('rechaza dígito alterado, fecha imposible y forma inválida', () => {
        expect(validRfc('EKU9003173C8')).toBe(false);
        expect(validRfc('EKU9013173C9')).toBe(false);
        expect(validRfc('EKU900317')).toBe(false);
        expect(validRfc('')).toBe(false);
    });

    it('distingue persona física y moral por longitud', () => {
        expect(rfcPersona('GODE561231GR8')).toBe('fisica');
        expect(rfcPersona('eku9003173c9')).toBe('moral');
    });
});

describe('validateFiscalReceptor — México', () => {
    const base = { country: 'MX', tax_id: 'EKU9003173C9', legal_name: 'ESCUELA KEMPER URGATE', regimen_fiscal: '601', uso_cfdi: 'G03', cp_fiscal: '86991' };

    it('acepta un receptor completo y normaliza', () => {
        const r = validateFiscalReceptor({ ...base, tax_id: ' eku9003173c9 ', uso_cfdi: 'g03' });
        expect(r.ok).toBe(true);
        expect(r.value).toMatchObject({ tax_id: 'EKU9003173C9', uso_cfdi: 'G03' });
        expect(r.persona).toBe('moral');
    });

    it('exige régimen, uso, CP y RFC válido', () => {
        const r = validateFiscalReceptor({ country: 'MX', tax_id: 'EKU9003173C8', legal_name: 'X' });
        expect(codes(r)).toEqual(expect.arrayContaining([
            'tax_id:invalid_tax_id', 'cp_fiscal:required', 'regimen_fiscal:required', 'uso_cfdi:required',
        ]));
    });

    it('rechaza un régimen de persona física para una moral', () => {
        expect(codes(validateFiscalReceptor({ ...base, regimen_fiscal: '612' }))).toContain('regimen_fiscal:regimen_not_for_persona');
        expect(regimenesPara('moral').some((r) => r.codigo === '612')).toBe(false);
    });

    it('público en general exige 616 y S01', () => {
        const mal = validateFiscalReceptor({ ...base, tax_id: 'XAXX010101000', regimen_fiscal: '601' });
        expect(codes(mal)).toContain('regimen_fiscal:generic_requires_616_s01');
        const bien = validateFiscalReceptor({ ...base, tax_id: 'XAXX010101000', regimen_fiscal: '616', uso_cfdi: 'S01' });
        expect(bien.ok).toBe(true);
    });

    it('avisa (sin bloquear) cuando el nombre lleva el régimen societario', () => {
        const r = validateFiscalReceptor({ ...base, legal_name: 'ESCUELA KEMPER URGATE, S.A. de C.V.' });
        expect(r.ok).toBe(true);
        expect(r.warnings).toContainEqual({ field: 'legal_name', code: 'legal_name_has_regime_suffix' });
    });

    it('rechaza un CP que no es de cinco dígitos', () => {
        expect(codes(validateFiscalReceptor({ ...base, cp_fiscal: '8699' }))).toContain('cp_fiscal:invalid_postal_code');
    });
});

describe('validateFiscalReceptor — otros países', () => {
    it('España valida NIF/NIE/CIF y descarta campos del SAT', () => {
        const r = validateFiscalReceptor({ country: 'ES', tax_id: '12345678Z', legal_name: 'Taller Ruiz', regimen_fiscal: '601' });
        expect(r.ok).toBe(true);
        expect(r.value.regimen_fiscal).toBeNull();
        expect(codes(validateFiscalReceptor({ country: 'ES', tax_id: '12345678A', legal_name: 'X' }))).toContain('tax_id:invalid_tax_id');
    });

    it('Estados Unidos valida EIN', () => {
        expect(validateFiscalReceptor({ country: 'US', tax_id: '12-3456789', legal_name: 'Acme Inc' }).ok).toBe(true);
        expect(validateFiscalReceptor({ country: 'US', tax_id: '1234', legal_name: 'Acme Inc' }).ok).toBe(false);
    });

    it('un país sin reglas propias avisa y no inventa validaciones', () => {
        const r = validateFiscalReceptor({ country: 'CO', tax_id: '900123456', legal_name: 'Andes SAS' });
        expect(r.ok).toBe(true);
        expect(r.warnings).toContainEqual({ field: 'country', code: 'unsupported_country' });
    });

    it('acota longitudes', () => {
        const r = validateFiscalReceptor({ country: 'CO', tax_id: 'x'.repeat(40), legal_name: 'y'.repeat(400) });
        expect(codes(r)).toEqual(expect.arrayContaining(['tax_id:too_long', 'legal_name:too_long']));
    });
});

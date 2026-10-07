import { describe, expect, it } from 'vitest';
import {
    CALLING_CODES, callingCode, checkTaxId, joinPhone, postalLabel, regionLabel, splitPhone, taxIdPlaceholder,
} from '../src/lib/party-format';
import { COUNTRY_CODES, SUPPORTED_COUNTRIES } from '../src/lib/countries';

describe('lada internacional', () => {
    it('cubre todo país ISO con servicio telefónico', () => {
        const sinLada = COUNTRY_CODES.filter((c) => !CALLING_CODES[c]);
        expect(sinLada.sort()).toEqual(['BV', 'HM', 'TF']);
    });

    it('arma el número internacional quitando el 0 troncal salvo en Italia', () => {
        expect(joinPhone('MX', '55 1234 5678')).toBe('+52 55 1234 5678');
        expect(joinPhone('GB', '020 7946 0000')).toBe('+44 20 7946 0000');
        expect(joinPhone('IT', '06 1234 5678')).toBe('+39 06 1234 5678');
        expect(joinPhone('MX', '+1 415 555 0100')).toBe('+1 415 555 0100');
        expect(joinPhone('MX', '0044 20 7946 0000')).toBe('+44 20 7946 0000');
        expect(joinPhone('MX', '   ')).toBe('');
    });

    it('separa un número guardado respetando el país del cliente en ladas compartidas', () => {
        expect(splitPhone('+52 55 1234 5678', 'US')).toEqual({ country: 'MX', national: '55 1234 5678' });
        expect(splitPhone('+1 (416) 555-0100', 'CA')).toEqual({ country: 'CA', national: '(416) 555-0100' });
        expect(splitPhone('+1 415 555 0100', 'MX')).toEqual({ country: 'US', national: '415 555 0100' });
        expect(splitPhone('+353 1 234 5678', 'MX')).toEqual({ country: 'IE', national: '1 234 5678' });
    });

    it('no adivina la lada de un número capturado sin ella', () => {
        expect(splitPhone('55 1234 5678', 'MX')).toEqual({ country: 'MX', national: '55 1234 5678' });
    });

    it('ida y vuelta sin perder el número', () => {
        for (const c of SUPPORTED_COUNTRIES) {
            const joined = joinPhone(c, '612 345 678');
            const back = splitPhone(joined, c);
            expect(back.country).toBe(c);
            expect(joinPhone(back.country, back.national)).toBe(joined);
        }
        expect(callingCode('br')).toBe('55');
    });
});

describe('identificador fiscal', () => {
    it('cada ejemplo de placeholder pasa su propia verificación', () => {
        for (const c of SUPPORTED_COUNTRIES) {
            expect(taxIdPlaceholder(c), c).not.toBe('');
            expect(checkTaxId(c, taxIdPlaceholder(c)), c).toBe('valid');
        }
    });

    it('acepta identificadores públicos reales', () => {
        const reales: [string, string][] = [
            ['BR', '529.982.247-25'], ['BR', '11.222.333/0001-81'],
            ['ES', '12345678Z'], ['ES', 'X1234567L'], ['ES', 'A58818501'], ['ES', 'ESB12345674'],
            ['AR', '33-69345023-9'], ['CL', '12.345.678-5'], ['PE', '20131312955'],
            ['CO', '800197268-4'], ['FR', '552100554'], ['FR', 'FR40303265045'],
            ['MX', 'XAXX010101000'], ['MX', 'GODE561231GR8'], ['US', '12-3456789'],
        ];
        for (const [c, v] of reales) expect(checkTaxId(c, v), `${c} ${v}`).toBe('valid');
    });

    it('detecta un dígito de control equivocado', () => {
        const malos: [string, string][] = [
            ['BR', '529.982.247-26'], ['BR', '11.222.333/0001-82'], ['BR', '111.111.111-11'],
            ['ES', '12345678A'], ['ES', 'X1234567A'], ['ES', 'A58818502'],
            ['AR', '33-69345023-8'], ['CL', '12.345.678-6'], ['PE', '20131312956'],
            ['CO', '800197268-5'], ['FR', '552100555'], ['CA', '123456789'],
            ['MX', 'DEZ981323QX1'], ['MX', 'DE981123'], ['US', '1234'],
        ];
        for (const [c, v] of malos) expect(checkTaxId(c, v), `${c} ${v}`).toBe('invalid');
    });

    it('no opina donde no conoce el formato ni sobre un campo vacío', () => {
        expect(checkTaxId('JP', '1234567890123')).toBe('unchecked');
        expect(checkTaxId('MX', '')).toBe('unchecked');
        expect(checkTaxId('MX', null)).toBe('unchecked');
    });
});

describe('vocabulario postal', () => {
    it('usa el nombre local cuando existe y uno neutro cuando no', () => {
        expect(postalLabel('BR', 'es')).toBe('CEP');
        expect(postalLabel('US', 'en')).toBe('ZIP code');
        expect(postalLabel('JP', 'es')).toBe('Código postal');
        expect(regionLabel('CA', 'en')).toBe('Province');
        expect(regionLabel('XX', 'es')).toBe('Estado / provincia');
    });
});

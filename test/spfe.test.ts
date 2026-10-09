// Factura electrónica entre empresarios por la solución pública de la AEAT
// (src/lib/fiscal/spfe/): las piezas puras. El esquema UBL 2.5 lo valida
// `npm run security:spfe` con xmllint sobre estas mismas muestras.
import { afterEach, describe, expect, it } from 'vitest';
import { SPFE_FUERA, SPFE_SAMPLES } from './helpers/spfe-samples';
import { assessSpfe, claveCodigo, provinciaDe } from '../src/lib/fiscal/spfe/factura';
import {
    estadoCobroDeseado, estadoComunicado, mensajeBaja, mensajeEstadoEmisor, siguienteMensajeEstado,
} from '../src/lib/fiscal/spfe/estados';
import { spfeConfig } from '../src/lib/fiscal/spfe/config';
import { spfeEstadoRiel, transporteAeat, transporteDisponible } from '../src/lib/fiscal/spfe/transporte';
import { PENDIENTES_AEAT, SPFE_ESPECIFICACION, SPFE_PLAZOS, SPFE_PROCESO } from '../src/lib/fiscal/spfe/normativa';

const sample = (id: string) => SPFE_SAMPLES.find((s) => s.id === id)!.source;

describe('factura del Anexo I', () => {
    it('cada muestra se genera, con su código único y su resumen', () => {
        for (const s of SPFE_SAMPLES) {
            const a = assessSpfe(s.source);
            expect(a.problems, s.id).toEqual([]);
            expect(a.xml, s.id).toContain(`<cbc:CustomizationID>${SPFE_ESPECIFICACION}</cbc:CustomizationID><cbc:ProfileID>${SPFE_PROCESO}</cbc:ProfileID>`);
            expect(a.resumen?.tipoFactura, s.id).toBe(s.tipo);
            expect(a.codigo?.numero, s.id).toBe(s.source.invoiceNumber);
            expect(a.codigo?.fecha, s.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        }
    });

    it('el NIF viaja sin prefijo como identificador fiscal (LOC, FC) y, en el IVA, también como NIF-IVA', () => {
        const x = assessSpfe(sample('spfe-mixto')).xml!;
        expect(x).toContain('<cac:PartyTaxScheme><cbc:CompanyID>ESB28003218</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>');
        expect(x).toContain('<cac:PartyTaxScheme><cbc:CompanyID schemeID="FC">B28003218</cbc:CompanyID><cac:TaxScheme><cbc:ID>LOC</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>');
        expect(x).toContain('<cbc:CompanyID schemeID="FC">12345678Z</cbc:CompanyID>');
        // Canarias, Ceuta y Melilla están fuera del IVA de la UE: sin NIF-IVA.
        const ceuta = assessSpfe(sample('spfe-ipsi')).xml!;
        expect(ceuta).not.toContain('<cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>');
        expect(ceuta).toContain('<cbc:CountrySubentity>Ceuta</cbc:CountrySubentity>');
    });

    it('la clave de régimen y el impuesto de cada línea (L3A, L3B, L3C)', () => {
        const regi = (id: string) => [...assessSpfe(sample(id)).xml!.matchAll(/<cbc:Name>REGI<\/cbc:Name><cbc:Value>(\d\d)<\/cbc:Value><cbc:ValueQualifier>(\w+)<\/cbc:ValueQualifier>/g)].map((m) => `${m[1]}:${m[2]}`);
        expect(regi('spfe-mixto')).toEqual(['01:IVA', '01:IVA', '01:IVA']);
        expect(regi('spfe-igic')).toEqual(['01:IGIC', '01:IGIC']);
        expect(regi('spfe-ipsi')).toEqual(['01:IPSI', '01:IPSI']);
    });

    it('rectificativa por diferencias: 384, R1, I, factura rectificada y en negativo', () => {
        const a = assessSpfe(sample('spfe-rectificativa'));
        expect(a.resumen).toMatchObject({ tipoFactura: '384', total: -36.18 });
        expect(a.xml).toContain('<cac:BillingReference><cac:InvoiceDocumentReference><cbc:ID>DC-2026-0412</cbc:ID><cbc:IssueDate>2026-10-08</cbc:IssueDate></cac:InvoiceDocumentReference></cac:BillingReference>');
        expect(a.xml).toContain('<cbc:InvoicedQuantity unitCode="C62">-2</cbc:InvoicedQuantity>');
        expect(a.xml).toContain('<cbc:PriceAmount currencyID="EUR">14.95</cbc:PriceAmount>');
        expect(a.xml).not.toContain('<cac:PaymentMeans>');
    });

    it('pagada al expedirse: BT-ES-2 y total a pagar cero; un pago posterior a la expedición no se declara', () => {
        const pagada = assessSpfe(sample('spfe-pagada'));
        expect(pagada.resumen?.pagadaEl).toBe('2026-10-08');
        expect(pagada.xml).toContain('<cbc:PrepaidAmount currencyID="EUR">726.00</cbc:PrepaidAmount><cbc:PayableAmount currencyID="EUR">0.00</cbc:PayableAmount>');
        const despues = assessSpfe({ ...sample('spfe-pagada'), pagadaEl: '2026-10-09' });
        expect(despues.resumen?.pagadaEl).toBeNull();
        expect(despues.xml).not.toContain('PrepaidPayment');
    });

    it('fechas: periodo de prestación (BG-14) o fecha de la operación (BT-7)', () => {
        expect(assessSpfe(sample('spfe-inversion')).xml).toContain('<cac:InvoicePeriod><cbc:StartDate>2026-09-01</cbc:StartDate><cbc:EndDate>2026-09-30</cbc:EndDate></cac:InvoicePeriod>');
        expect(assessSpfe(sample('spfe-fecha-operacion')).xml).toContain('<cbc:TaxPointDate>2026-10-01</cbc:TaxPointDate>');
    });

    it('lo que no entra en la SPFE falla cerrado con su motivo, en un texto apto para el negocio', () => {
        for (const f of SPFE_FUERA) {
            const a = assessSpfe(f.source);
            expect(a.xml, f.id).toBeNull();
            expect(a.problems.map((p) => p.code), f.id).toContain(f.problema);
            for (const p of a.problems) expect(`${p.es} ${p.en}`, f.id).not.toMatch(/SPFE_|ENABLED|WSDL|xmllint|schematron/);
        }
    });

    it('provincia y llave del código único', () => {
        expect(provinciaDe('28')).toBe('Madrid');
        expect(provinciaDe('Sevilla')).toBe('Sevilla');
        expect(claveCodigo({ nifEmisor: 'B28003218', numero: 'A-1', fecha: '2026-10-08' })).toBe('B28003218|A-1|2026-10-08');
    });
});

describe('estados del emisor', () => {
    const base = { lifecycle: 'open', amountPaid: 0, amountRefunded: 0, vencimiento: '2026-11-07', esRectificativa: false };

    it('qué estado corresponde a los cobros reales', () => {
        expect(estadoCobroDeseado({ ...base, amountPaid: 40 }, ['2026-10-10'])).toEqual({ tipo: 'sin_estado' });
        expect(estadoCobroDeseado({ ...base, lifecycle: 'paid', amountPaid: 100 }, ['2026-10-12', '2026-10-10'])).toEqual({ tipo: 'cobrada', fecha: '2026-10-12' });
        // Saldada solo con notas de crédito: no hay cobro que comunicar.
        expect(estadoCobroDeseado({ ...base, lifecycle: 'paid' }, [])).toEqual({ tipo: 'sin_estado' });
        expect(estadoCobroDeseado({ ...base, lifecycle: 'paid', amountPaid: 100, amountRefunded: 100 }, ['2026-10-12'])).toEqual({ tipo: 'sin_estado' });
        expect(estadoCobroDeseado({ ...base, lifecycle: 'uncollectible' }, [])).toEqual({ tipo: 'impagada', vencimiento: '2026-11-07' });
        expect(estadoCobroDeseado({ ...base, lifecycle: 'uncollectible', vencimiento: null }, [])).toEqual({ tipo: 'sin_estado' });
        expect(estadoCobroDeseado({ ...base, lifecycle: 'paid', amountPaid: 100, esRectificativa: true }, ['2026-10-12'])).toEqual({ tipo: 'sin_estado' });
    });

    it('lo comunicado: el pago de la factura y los mensajes admitidos, en orden', () => {
        expect(estadoComunicado('2026-10-08', [])).toEqual({ tipo: 'cobrada', fecha: '2026-10-08' });
        expect(estadoComunicado(null, [
            { tipo: 'cobro', estado: 'admitido', datos: { fechaCobro: '2026-10-12' } },
            { tipo: 'anula_cobro', estado: 'admitido', datos: {} },
            { tipo: 'impago', estado: 'rechazado', datos: { vencimiento: '2026-11-07' } },
        ])).toEqual({ tipo: 'sin_estado' });
    });

    it('el siguiente mensaje, de uno en uno', () => {
        const nada = { tipo: 'sin_estado' } as const;
        const cobrada = (fecha: string) => ({ tipo: 'cobrada', fecha }) as const;
        const impagada = { tipo: 'impagada', vencimiento: '2026-11-07' } as const;
        expect(siguienteMensajeEstado(nada, nada)).toBeNull();
        expect(siguienteMensajeEstado(cobrada('2026-10-12'), nada, '2026-11-07')).toEqual({ tipo: 'cobro', datos: { fechaCobro: '2026-10-12', vencimiento: '2026-11-07' } });
        expect(siguienteMensajeEstado(cobrada('2026-10-12'), cobrada('2026-10-12'))).toBeNull();
        expect(siguienteMensajeEstado(cobrada('2026-10-13'), cobrada('2026-10-12'))).toEqual({ tipo: 'anula_cobro', datos: {} });
        expect(siguienteMensajeEstado(nada, cobrada('2026-10-12'))).toEqual({ tipo: 'anula_cobro', datos: {} });
        expect(siguienteMensajeEstado(impagada, nada)).toEqual({ tipo: 'impago', datos: { vencimiento: '2026-11-07' } });
        expect(siguienteMensajeEstado(cobrada('2026-12-01'), impagada)).toEqual({ tipo: 'anula_impago', datos: {} });
    });

    it('mensajes del Anexo II y la baja', () => {
        const factura = { nifEmisor: 'B28003218', numero: 'A-1', fecha: '2026-10-08', nombreEmisor: 'Distribuciones Centro SL' };
        const cabecera = { id: 'm-1', fecha: '2026-10-20' };
        expect(() => mensajeEstadoEmisor({ codigo: 'SETTLEMENT', factura, cabecera })).toThrow(/fecha del cobro/);
        expect(() => mensajeEstadoEmisor({ codigo: 'DEFAULT', factura, cabecera })).toThrow(/vencimiento/);
        const cobro = mensajeEstadoEmisor({ codigo: 'SETTLEMENT', factura, cabecera, fechaCobro: '2026-10-15' });
        expect(cobro).toContain('<cac:Response><cbc:ResponseCode>SETTLEMENT</cbc:ResponseCode><cbc:EffectiveDate>2026-10-15</cbc:EffectiveDate></cac:Response>');
        expect(cobro).toContain('<cac:DocumentReference><cbc:ID>A-1</cbc:ID><cbc:IssueDate>2026-10-08</cbc:IssueDate><cac:IssuerParty><cac:PartyTaxScheme><cbc:CompanyID schemeID="FC">B28003218</cbc:CompanyID>');
        expect(mensajeBaja({ factura, cabecera, fechaBaja: '2026-10-20' })).toContain('<cbc:ResponseCode>CANCELINVOICE</cbc:ResponseCode><cbc:EffectiveDate>2026-10-20</cbc:EffectiveDate>');
    });
});

describe('interruptor y honestidad del riel', () => {
    afterEach(() => {
        delete process.env.SPFE_ENABLED;
        delete process.env.SPFE_ENTORNO;
    });

    it('apagado por defecto, pruebas por defecto y un entorno desconocido apaga', () => {
        expect(spfeConfig()).toMatchObject({ habilitado: false, entorno: 'pruebas', motivo: 'apagado' });
        process.env.SPFE_ENABLED = 'true';
        expect(spfeConfig()).toEqual({ habilitado: true, entorno: 'pruebas' });
        process.env.SPFE_ENTORNO = 'produccion';
        expect(spfeConfig()).toEqual({ habilitado: true, entorno: 'produccion' });
        process.env.SPFE_ENTORNO = 'prod';
        expect(spfeConfig()).toMatchObject({ habilitado: false, motivo: 'entorno_invalido' });
    });

    it('sin la especificación de la AEAT no hay transporte, aunque el interruptor esté encendido', () => {
        process.env.SPFE_ENABLED = 'true';
        expect(PENDIENTES_AEAT.map((p) => p.id)).toEqual(['transporte', 'validacion', 'calificadores', 'retenciones', 'cabecera_mensajes', 'entorno_pruebas']);
        for (const p of PENDIENTES_AEAT) expect(p.que.length > 20 && p.fuente.length > 10, p.id).toBe(true);
        expect(transporteDisponible()).toBe(false);
        expect(transporteAeat('pruebas', { key: '', cert: '' })).toBeNull();
        expect(spfeEstadoRiel()).toEqual({ estado: 'proximamente', entorno: 'pruebas' });
    });

    it('plazos del RD 238/2026 contados desde la entrada en vigor de la Orden', () => {
        expect(SPFE_PLAZOS).toEqual({ ordenEnVigor: '2026-10-06', granEmpresa: '2027-10-06', resto: '2028-10-06', estadosPersonasFisicas: '2029-10-06', plataformasPrivadas: '2027-10-06' });
    });
});

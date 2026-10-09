// Piezas puras de la NFS-e de Padrão Nacional: armado de la DPS, cálculo de
// valores (descuento incondicionado, ISS retenido, alícuota, tributos
// aproximados), Id y número, ajustes, titular del certificado ICP-Brasil,
// lectura de la NFS-e, representación impresa y mensajes de rechazo. El XML
// contra los XSD oficiales y la firma contra lxml/openssl los prueba
// scripts/nfse-check.mjs.
import { describe, expect, it } from 'vitest';
import { calculateDocumentTotals } from '../packages/elements/src/engine';
import { armarDps, conNumero, dataHoraBrasilia, documentoFederal, numeroDocumento, xmlDps } from '../src/lib/fiscal/latam/nfse/dps';
import { aplicarCambio, faltantesAjustes } from '../src/lib/fiscal/latam/nfse/ajustes';
import { mensajeRechazo } from '../src/lib/fiscal/latam/nfse/erros';
import { motivoCancelamento, pedidoCancelamento, xmlPedidoCancelamento } from '../src/lib/fiscal/latam/nfse/evento';
import { municipio, municipiosDeUf } from '../src/lib/fiscal/latam/nfse/municipios';
import { RailDatosError } from '../src/lib/fiscal/latam/errores';
import type { FiscalLineItem } from '../src/lib/fiscal/index';
import { railDeDocumento, railDePais } from '../src/lib/fiscal/latam/rieles';
import { documentPrefix, isFiscalDocument, selectDocumentType } from '../src/lib/fiscal/document-kind';

const CNPJ = '16727230000197';
const INSTANTE = new Date('2026-10-09T15:00:00Z');
const linea = (subtotal: number, extra: Partial<FiscalLineItem> = {}): FiscalLineItem => ({
    description: 'Consultoria', quantity: 1, unitPrice: subtotal + (extra.discount ?? 0), taxRate: 0,
    subtotal, taxAmount: 0, total: subtotal, ...extra,
});
const entrada = (over: Record<string, unknown> = {}) => ({
    entorno: 'produccion' as const, documentoEmisor: CNPJ, municipio: '3304557', serie: '1',
    opSimpNac: 1 as const, regEspTrib: 0 as const, servico: '170101', instante: INSTANTE,
    receptor: { taxId: '11.222.333/0001-81', nome: 'Cliente Ltda', pais: 'BR' },
    lineas: [linea(1000)], totales: { subtotal: 1000, taxes: 0, total: 1000, currency: 'BRL' },
    ...over,
});

describe('riel y tipo de documento', () => {
    it('Brasil emite nfse_invoice solo con el riel listo; la NFS-e se anula ante la Sefin', () => {
        expect(railDePais('br')?.id).toBe('nfse');
        expect(railDeDocumento('nfse_invoice')).toMatchObject({ pais: 'BR', anulable: true, numeracionPropia: true });
        expect(isFiscalDocument('nfse_invoice', 'BR')).toBe(true);
        expect(selectDocumentType('BR', 'starter', undefined, true)).toBe('nfse_invoice');
        expect(selectDocumentType('BR', 'starter', undefined, false)).toBe('commercial_invoice');
        expect(selectDocumentType('BR', 'starter', 'commercial', true)).toBe('proforma');
        expect(documentPrefix('nfse_credit_note', 'FA')).toBe('NC-FA');
    });
});

describe('armado de la DPS', () => {
    it('producción: tpAmb 1, municipio como emisor y lugar de prestación, Id de 45 posiciones', () => {
        const s = conNumero(armarDps(entrada() as any), 123);
        expect(s.tpAmb).toBe(1);
        expect(s.id).toBe(['DPS', '3304557', '2', CNPJ, '00001', '000000000000123'].join(''));
        expect(s.id).toHaveLength(45);
        expect(s.serv.cLocPrestacao).toBe('3304557');
        expect(s.dCompet).toBe('2026-10-09');
        expect(s.dhEmi).toBe('2026-10-09T12:00:00-03:00');
    });

    it('descuento del motor de Cord = desconto incondicionado sobre el valor bruto', () => {
        const motor = calculateDocumentTotals([
            { descripcion: 'Consultoria', cantidad: 2, precio_unitario: 750, tax_rate: 0 },
        ], { roundLines: 2, descuento: { tipo: 'monto', valor: 100 } });
        const lineas = motor.lineas.map((l) => linea(l.base, { quantity: l.cantidad, unitPrice: (l.base + l.descuento) / l.cantidad, discount: l.descuento }));
        const s = armarDps(entrada({ lineas, totales: { subtotal: motor.subtotal, taxes: 0, total: motor.total, currency: 'BRL', discountTotal: motor.descuentoTotal } }) as any);
        expect(s.valores.vServ).toBe('1500.00');
        expect(s.valores.vDescIncond).toBe('100.00');
        expect(s.esperado.vLiq).toBe('1400.00');
    });

    it('ME/EPP: pTotTribSN siempre; pAliq solo con ISS retenido y todo por el Simples', () => {
        const sn = armarDps(entrada({ opSimpNac: 3, regApTribSN: 1, aliquotaSimples: 11.2 }) as any);
        expect(sn.valores.totTrib).toEqual({ pTotTribSN: '11.20' });
        expect(sn.valores.pAliq).toBeUndefined();
        const conRet = armarDps(entrada({
            opSimpNac: 3, regApTribSN: 1, aliquotaSimples: 11.2, retencaoIss: { nome: 'ISS 3%', tasa: 0.03 },
            totales: { subtotal: 1000, taxes: 0, total: 970, currency: 'BRL', retenciones: [{ nombre: 'ISS 3%', tipo: 'x', tasa: 0.03, base: 1000, monto: 30 }], retencionTotal: 30 },
        }) as any);
        expect(conRet.valores).toMatchObject({ tpRetISSQN: 2, pAliq: '3.00' });
        expect(conRet.esperado).toEqual({ vLiq: '970.00', issRetido: '30.00' });
        const fuera = armarDps(entrada({
            opSimpNac: 3, regApTribSN: 2, aliquotaSimples: 6, retencaoIss: { nome: 'ISS 3%', tasa: 0.03 },
            totales: { subtotal: 1000, taxes: 0, total: 970, currency: 'BRL', retenciones: [{ nombre: 'ISS 3%', tipo: 'x', tasa: 0.03, base: 1000, monto: 30 }], retencionTotal: 30 },
        }) as any);
        expect(fuera.valores.pAliq).toBeUndefined();
    });

    it('rechazos antes de enviar, con mensajes para el dueño del negocio', () => {
        const falla = (over: Record<string, unknown>, re: RegExp) => {
            let error: unknown;
            try { armarDps(entrada(over) as any); } catch (e) { error = e; }
            expect(error).toBeInstanceOf(RailDatosError);
            expect((error as Error).message).toMatch(re);
        };
        falla({ documentoEmisor: '16727230000198' }, /CNPJ \(o CPF\) de tu negocio/);
        falla({ retencaoIss: { nome: 'ISS 3%', tasa: 0.03 }, receptor: { taxId: '', pais: 'BR' }, totales: { subtotal: 1000, taxes: 0, total: 970, currency: 'BRL', retenciones: [{ nombre: 'ISS 3%', tipo: 'x', tasa: 0.03, base: 1000, monto: 30 }], retencionTotal: 30 } }, /tomador debe estar identificado/);
        falla({ retencaoIss: { nome: 'ISS 3%', tasa: 0.03 }, totales: { subtotal: 1000, taxes: 0, total: 950, currency: 'BRL', retenciones: [{ nombre: 'ISS 3%', tipo: 'x', tasa: 0.03, base: 1000, monto: 50 }], retencionTotal: 50 } }, /no corresponde al valor del servicio/);
        falla({ opSimpNac: 3, regApTribSN: 1 }, /porcentaje aproximado de tributos/);
    });

    it('XML: elementos en el orden del XSD y texto escapado', () => {
        const s = conNumero(armarDps(entrada({ lineas: [linea(1000, { description: 'Obra & <reforma> "A"' })] }) as any), 1);
        const xml = xmlDps(s);
        expect(xml).toContain('<xDescServ>Obra &amp; &lt;reforma&gt; "A"</xDescServ>');
        const orden = ['tpAmb', 'dhEmi', 'verAplic', 'serie', 'nDPS', 'dCompet', 'tpEmit', 'cLocEmi', 'prest', 'toma', 'serv', 'valores'].map((t) => xml.indexOf(`<${t}>`));
        expect([...orden].sort((a, b) => a - b)).toEqual(orden);
        expect(xml).not.toContain('<xNome>Empresa');
    });

    it('fechas, documentos y número de Cord', () => {
        expect(dataHoraBrasilia(new Date('2026-01-01T02:59:59Z'))).toBe('2025-12-31T23:59:59-03:00');
        expect(documentoFederal('529.982.247-25')).toEqual({ tipo: 'CPF', numero: '52998224725' });
        expect(documentoFederal('12.ABC.345/01DE-35')).toMatchObject({ tipo: 'CNPJ' });
        expect(documentoFederal('123')).toBeNull();
        expect(numeroDocumento('0000000000042', false)).toBe('NFSE-42');
    });
});

describe('ajustes, tablas y eventos', () => {
    it('ajustes validados y coherentes', () => {
        const r = aplicarCambio({}, { municipio: '3304557', serie: '1', op_simples: 3, reg_ap_simples: 1, aliquota_simples: '6,5', servico: '170101', reg_especial: 0 });
        expect(r).toMatchObject({ ok: true, ajustes: { municipio: '3304557', serie: '1', opSimpNac: 3, regApTribSN: 1, aliquotaSimples: 6.5, servico: '170101', regEspTrib: 0 } });
        if (r.ok) expect(faltantesAjustes(r.ajustes)).toEqual([]);
        // Al dejar de ser ME/EPP se limpian los datos del Simples.
        const r2 = aplicarCambio(r.ok ? r.ajustes : {}, { op_simples: 1 });
        expect(r2.ok && r2.ajustes.regApTribSN === undefined && r2.ajustes.aliquotaSimples === undefined).toBe(true);
        expect(aplicarCambio({}, { municipio: '1234567' })).toMatchObject({ ok: false });
        expect(aplicarCambio({ opSimpNac: 2 }, { retencao_iss_id: '00000000-0000-4000-8000-000000000001' })).toMatchObject({ ok: false });
    });

    it('municipios del IBGE por UF', () => {
        expect(municipio('3304557')).toEqual({ codigo: '3304557', uf: 'RJ', nome: 'Rio de Janeiro' });
        expect(municipiosDeUf('DF')).toEqual([{ codigo: '5300108', uf: 'DF', nome: 'Brasília' }]);
    });

    it('pedido de cancelación', () => {
        const chave = ['3304557', '2', '2', CNPJ, '0000000000042', '2610', '123456789', '9'].join('');
        expect(chave).toHaveLength(50);
        const p = pedidoCancelamento({ entorno: 'produccion', autor: { tipo: 'CNPJ', numero: CNPJ }, chave, instante: INSTANTE, motivo: null });
        expect(p.id).toBe(`PRE${chave}101101`);
        expect(xmlPedidoCancelamento(p)).toContain(`<tpAmb>1</tpAmb><verAplic>Cord-1.0</verAplic><dhEvento>2026-10-09T12:00:00-03:00</dhEvento><CNPJAutor>${CNPJ}</CNPJAutor><chNFSe>${chave}</chNFSe><e101101><xDesc>Cancelamento de NFS-e</xDesc><cMotivo>9</cMotivo>`);
        expect(motivoCancelamento('  Erro   no valor cobrado ✓ ')).toBe('Erro no valor cobrado');
        expect(() => pedidoCancelamento({ entorno: 'produccion', autor: { tipo: 'CNPJ', numero: CNPJ }, chave: '123', instante: INSTANTE })).toThrow(RailDatosError);
    });

    it('mensajes de rechazo sin el texto crudo de la Sefin', () => {
        expect(mensajeRechazo([{ codigo: 'E0312', descricao: 'O código de tributação nacional informado não está administrado...' }])).toMatch(/no administra ese código de servicio/);
        expect(mensajeRechazo([{ codigo: 'E0039' }])).toMatch(/sistema propio de la prefectura/);
    });
});

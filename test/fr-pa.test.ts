// Emisión por plataforma autorizada en Francia: las piezas puras. Periodos y
// plazos del e-reporting por régimen (Tableau 13 de la DGFiP), códigos de
// estado, reparto de un cobro por tasa, agregados del día, firma del webhook y
// lectura de los avisos de Iopole con la forma que publica su documentación.
import { describe, expect, it } from 'vitest';
import { assessEInvoice } from '../src/lib/fiscal/einvoice/model';
import { diasHasta, periodoDe, regimenDe } from '../src/lib/fiscal/transmision/periodos';
import { codigoDgfip, detalleTimeline, esRechazo, etiquetaEstado } from '../src/lib/fiscal/transmision/estados';
import { agregarPagos, agregarTransacciones, clasificar, cobroPorTasa, enEuros, reporteFactura } from '../src/lib/fiscal/transmision/ereporting';
import { estadoDeEtapa, leerEstado, cuerpoAlta, ruta } from '../src/lib/fiscal/transmision/iopole/cuerpos';
import { firmar, interpretar, verificarFirma } from '../src/lib/fiscal/transmision/iopole/webhook';
import { invoiceEventDetail } from '../src/lib/fiscal/timeline-detail';
import { frPaSample } from './helpers/fr-pa-samples';

const modelo = (id: string) => { const src = frPaSample(id).source; return { src, inv: assessEInvoice(src).invoice! }; };

describe('periodos y plazos del e-reporting (Tableau 13)', () => {
    it('réel normal mensuel: transacciones por décadas, pagos por mes', () => {
        expect(periodoDe('reel_mensuel', 'transaccion', '2026-10-03')).toEqual({ clave: '2026-10-D1', inicio: '2026-10-01', fin: '2026-10-10', limite: '2026-10-20' });
        expect(periodoDe('reel_mensuel', 'transaccion', '2026-10-15')).toMatchObject({ clave: '2026-10-D2', limite: '2026-10-31' });
        expect(periodoDe('reel_mensuel', 'transaccion', '2026-12-28')).toMatchObject({ clave: '2026-12-D3', fin: '2026-12-31', limite: '2027-01-10' });
        expect(periodoDe('reel_mensuel', 'pago', '2026-10-15')).toMatchObject({ clave: '2026-10', limite: '2026-11-10' });
    });

    it('trimestral: mes y día 10 siguiente; simplificado: mes y último día del siguiente', () => {
        expect(periodoDe('reel_trimestriel', 'transaccion', '2026-10-15')).toMatchObject({ clave: '2026-10', limite: '2026-11-10' });
        expect(periodoDe('simplifie', 'transaccion', '2027-01-31')).toMatchObject({ clave: '2027-01', limite: '2027-02-28' });
        expect(periodoDe('simplifie', 'pago', '2028-01-05')).toMatchObject({ limite: '2028-02-29' });
    });

    it('franquicia: bimestres civiles, plazo el último día del mes siguiente', () => {
        expect(periodoDe('franchise', 'transaccion', '2026-09-30')).toEqual({ clave: '2026-B5', inicio: '2026-09-01', fin: '2026-10-31', limite: '2026-11-30' });
        expect(periodoDe('franchise', 'pago', '2026-12-01')).toMatchObject({ clave: '2026-B6', limite: '2027-01-31' });
    });

    it('el régimen sale del perfil: la franquicia manda sobre el elegido', () => {
        expect(regimenDe({ fr_regime_tva: 'simplifie' })).toBe('simplifie');
        expect(regimenDe({ fr_regime_tva: 'simplifie', vat_regime: 'small_business' })).toBe('franchise');
        expect(regimenDe({ fr_regime_tva: 'otro' })).toBeNull();
        expect(diasHasta('2026-10-20', '2026-10-09')).toBe(11);
        expect(diasHasta('2026-10-20', '2026-10-21')).toBe(-1);
    });
});

describe('estados de la DGFiP', () => {
    it('código numérico si viene, si no el mapa del proveedor; 210, 213 y 501 son rechazos', () => {
        expect(codigoDgfip('202', 'RECEIVED')).toBe('202');
        expect(codigoDgfip(undefined, 'REFUSED')).toBe('210');
        expect(codigoDgfip('999', 'REJECTED')).toBe('213');
        expect(codigoDgfip(null, 'CANCELLED')).toBeNull();
        expect(esRechazo('210') && esRechazo('213') && esRechazo('501')).toBe(true);
        expect(esRechazo('212')).toBe(false);
        expect(etiquetaEstado('212', 'PAYMENT_RECEIVED', 'en')).toBe('Payment received (212)');
        expect(etiquetaEstado(null, 'CANCELLED', 'es')).toBe('Anulada tras un litigio');
    });

    it('la historia se escribe en español y se traduce al pintar', () => {
        const d = detalleTimeline('213', 'REJECTED', 'Taux de TVA incorrect');
        expect(d).toBe('Estado 213 · Rechazada por una plataforma: Taux de TVA incorrect');
        expect(invoiceEventDetail('plataforma', d, 'en')).toBe('Status 213 · Rejected by a platform: Taux de TVA incorrect');
        expect(invoiceEventDetail('plataforma', 'Cobro comunicado a la plataforma', 'en')).toBe('Payment reported to the platform');
        expect(invoiceEventDetail('plataforma', d, 'es')).toBe(d);
    });
});

describe('qué se comunica de cada documento', () => {
    it('clasificación: B2B, extranjero y particular', () => {
        expect(clasificar(modelo('b2b-servicios').src)).toMatchObject({ flux: 'B2B', cadre: 'S1', siren: '303265045', notaCredito: false });
        expect(clasificar(modelo('b2bint-biens-ue').src)).toMatchObject({ flux: 'B2BINT', cadre: 'B1' });
        expect(clasificar(modelo('b2c-mixte').src)).toMatchObject({ flux: 'B2C', cadre: 'M1' });
    });

    it('el cobro se reparte por tasa solo sobre los servicios, y suma lo cobrado de ellos', () => {
        const { src, inv } = modelo('b2c-mixte');
        // Lámparas 178 + 35.60, libro 32 + 1.76 (bienes) e instalación 60 + 6 (servicio al 10 %).
        expect(cobroPorTasa(src, inv, inv.totals.payable)).toEqual([{ tasa: 10, importe: 66 }]);
        expect(cobroPorTasa(src, inv, inv.totals.payable / 2)).toEqual([{ tasa: 10, importe: 33 }]);
        expect(cobroPorTasa(src, inv, -inv.totals.payable)).toEqual([{ tasa: 10, importe: -66 }]);
        const deb = modelo('b2b-mixte-debits');
        expect(cobroPorTasa(deb.src, deb.inv, 100)).toBeNull();
    });

    it('en euros con el tipo de cambio congelado; sin él, no se inventa', () => {
        expect(enEuros(100, { currency: 'EUR' })).toBe(100);
        expect(enEuros(100, { currency: 'USD', ledgerCurrency: 'EUR', fxRate: 0.9182 })).toBe(91.82);
        expect(enEuros(100, { currency: 'USD', ledgerCurrency: 'USD', fxRate: null })).toBeNull();
    });

    it('el número de una factura con el extranjero cabe en 20 caracteres o se dice', () => {
        const { src, inv } = modelo('b2bint-biens-ue');
        const r = reporteFactura({ ...src, invoiceNumber: 'FACTURE-2026-0000000012' }, { ...inv, number: 'FACTURE-2026-0000000012' });
        expect('bloqueo' in r && r.bloqueo.codigo).toBe('numero_largo');
    });

    it('agregado del día: la nota de crédito resta y un concepto sin naturaleza aparta su documento', () => {
        const a = modelo('b2c-services');
        const nota = modelo('b2c-services');
        nota.src.creditNoteOf = { number: a.src.invoiceNumber, issuedAt: a.src.issuedAt };
        const sin = modelo('b2c-services');
        sin.src.lines = sin.src.lines.map(({ nature: _n, ...l }) => l);
        const ag = agregarTransacciones('2026-10-08', 'c', 'EUR', [a, nota, sin]);
        expect(ag.incluidos).toEqual([0, 1]);
        expect(ag.bloqueados.map((x) => [x.indice, x.bloqueo.codigo])).toEqual([[2, 'sin_categoria']]);
        expect(ag.reporte?.categorias).toEqual([{ categoria: 'TPS1', base: 0, impuesto: 0, desglose: [{ base: 0, impuesto: 0, tasa: 20, categoria: 'S' }], exigibilidad: 'cobro' }]);
    });

    it('pagos del día: una devolución resta, y un neto negativo no se puede declarar', () => {
        expect(agregarPagos('2026-10-09', [[{ tasa: 20, importe: 120 }], [{ tasa: 20, importe: -20 }, { tasa: 5.5, importe: 10 }]]))
            .toEqual({ reporte: { fechaPago: '2026-10-09', porTasa: [{ tasa: 20, importe: 100 }, { tasa: 5.5, importe: 10 }] } });
        expect(agregarPagos('2026-10-09', [[{ tasa: 20, importe: 10 }], [{ tasa: 20, importe: -10 }]])).toBeNull();
        expect(agregarPagos('2026-10-09', [[{ tasa: 20, importe: -5 }]])).toMatchObject({ bloqueo: { codigo: 'devolucion_neta' } });
    });
});

describe('Iopole: alta, avisos y firma', () => {
    it('el alta pide solo emisión y el régimen en el vocabulario de la plataforma', () => {
        expect(cuerpoAlta({ siren: '303265045', regimen: 'simplifie', contactoEmail: 'a@b.fr', direccion: 'x', representante: null }))
            .toEqual({
                siren: '303265045', registerInPeppolInternational: false, selfBilling: false, registrationStrategy: 'NONE',
                businessEntityDetails: { vatRegime: 'SIMPLIFIED_TAX_REGIME', contactEmail: 'a@b.fr', address: 'x' },
                operatorRelation: { direction: 'OUTBOUND' },
            });
        expect(ruta('altaPorIdentificador', { scheme: '0002', identifier: '303265045' })).toBe('/v1/config/enrollment/0002/303265045/link');
        expect(() => ruta('consultarAlta')).toThrow(/enrollmentId/);
    });

    it('etapas del alta: lo que pide algo al negocio, lo que no', () => {
        expect(estadoDeEtapa('COMPLETED')).toBe('completada');
        expect(estadoDeEtapa('ELECTRONIC_ADDRESS_DISPUTE')).toBe('accion_requerida');
        expect(estadoDeEtapa('IDENTITY_CHECK_ACTION_REQUIRED')).toBe('en_curso');
        expect(estadoDeEtapa('CANCELLED')).toBe('cancelada');
    });

    it('lee el aviso de estado documentado y el del historial', () => {
        const e = leerEstado({
            invoiceId: 'i1', statusId: 's1', date: '2026-10-09T10:00:00Z', status: { code: 'REFUSED' },
            json: { responses: [{ documentReference: { issuerAssignedId: 'F-1', issuer: { siren: '303265045' } }, rejectionDetail: { reason: 'DUPLICATE_INVOICE', message: 'Facture déjà reçue' } }] },
        });
        expect(e).toMatchObject({ codigo: '210', numero: 'F-1', sirenEmisor: '303265045', motivo: 'Facture déjà reçue · DUPLICATE_INVOICE' });
        expect(leerEstado({ invoiceId: 'i1' })).toBeNull();
        expect(interpretar({ eventId: 'e', eventType: 'EREPORTING_ERROR', referencedObject: { type: 'TRANSACTION', id: 't1' }, payload: { rejectionDetail: { reason: 'VALIDATION_FAILURE', message: 'm', errors: [{ reason: 'SCHEMA', message: 'detalle' }] } } }))
            .toEqual({ tipo: 'reporte_rechazado', envioProveedorId: 't1', motivo: 'm · detalle', detalle: expect.any(Object) });
        expect(interpretar({ hola: 1 })).toEqual({ tipo: 'ignorado', razon: 'forma_desconocida' });
    });

    it('firma HMAC: ruta con consulta, cuerpo exacto, ventana de diez minutos', () => {
        const cuerpo = new TextEncoder().encode('{"a":1}');
        const f = firmar('k', 'POST', '/api/fiscal/iopole/webhook?tipo=status', cuerpo, 1_760_000_000_000);
        const base = { secreto: 'k', metodo: 'POST', rutaConConsulta: '/api/fiscal/iopole/webhook?tipo=status', cuerpo, ahora: 1_760_000_000_000 + 60_000 };
        expect(verificarFirma({ ...base, cabeceras: { timestamp: f.timestamp, firma: f.firma, checksum: f.checksum } })).toBe(true);
        expect(verificarFirma({ ...base, cabeceras: { timestamp: f.timestamp, firma: f.firma, checksum: null } })).toBe(true);
        expect(verificarFirma({ ...base, rutaConConsulta: '/api/fiscal/iopole/webhook?tipo=events', cabeceras: { timestamp: f.timestamp, firma: f.firma, checksum: null } })).toBe(false);
        expect(verificarFirma({ ...base, cabeceras: { timestamp: f.timestamp, firma: f.firma, checksum: '0'.repeat(64) } })).toBe(false);
        expect(verificarFirma({ ...base, secreto: 'otro', cabeceras: { timestamp: f.timestamp, firma: f.firma, checksum: null } })).toBe(false);
        expect(verificarFirma({ ...base, secreto: '', cabeceras: { timestamp: f.timestamp, firma: f.firma, checksum: null } })).toBe(false);
    });
});

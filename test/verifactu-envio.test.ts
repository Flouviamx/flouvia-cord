import { describe, expect, it } from 'vitest';
import { resolverRespuesta, type GrupoEnvio } from '../src/lib/fiscal/verifactu/envio';

const alta = { idEmisorFactura: 'B12345674', numSerieFactura: 'F2026-000001', fechaExpedicionFactura: '07-10-2026' };
const grupo = (tipo: 'alta' | 'anulacion'): GrupoEnvio => ({
    entorno: 'pruebas',
    emisor: { nif: 'B12345674', nombreRazon: 'Estudio Sol SL' },
    filas: [{
        id: 'r1', tipo, seq: 1,
        payload: (tipo === 'alta' ? alta : {
            idEmisorFacturaAnulada: alta.idEmisorFactura, numSerieFacturaAnulada: alta.numSerieFactura,
            fechaExpedicionFacturaAnulada: alta.fechaExpedicionFactura,
        }) as any,
    }],
    registros: [],
});
const respuesta = (tipoOperacion: 'Alta' | 'Anulacion', dup: string) => ({
    estadoEnvio: 'ParcialmenteCorrecto',
    lineas: [{ ...alta, tipoOperacion, estado: 'Incorrecto', codigoError: 3000, registroDuplicado: { estado: dup } }],
}) as any;

describe('respuesta 3000 (registro duplicado)', () => {
    it('un alta duplicada de un registro vigente toma su estado', () => {
        expect(resolverRespuesta(grupo('alta'), respuesta('Alta', 'Correcta'))[0].estado).toBe('aceptado');
        expect(resolverRespuesta(grupo('alta'), respuesta('Alta', 'AceptadaConErrores'))[0].estado).toBe('aceptado_con_errores');
    });

    it('un alta cuyo duplicado la AEAT tiene anulado NO se da por aceptada', () => {
        const [r] = resolverRespuesta(grupo('alta'), respuesta('Alta', 'Anulada'));
        expect(r.estado).toBe('rechazado');
        expect(r.motivo).toMatch(/anulada/);
    });
});

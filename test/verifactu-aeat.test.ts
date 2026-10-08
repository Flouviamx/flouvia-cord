// Transporte del envío a la AEAT contra un servidor local: la respuesta grande
// que antes se perdía (agent.close() esperado antes de leer el cuerpo colgaba
// hasta el timeout con cuerpos de más de ~64 KB), la cabecera SOAPAction y el
// SoapFault devuelto con HTTP 500.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { AeatCertificadoError, AeatFaultError, submitToAeat, type BatchRegistro } from '../src/lib/fiscal/verifactu/aeat';
import { clasificarFallo } from '../src/lib/fiscal/verifactu/envio';

const NS = 'xmlns:env="http://schemas.xmlsoap.org/soap/envelope/" xmlns:sfR="https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/RespuestaSuministro.xsd" xmlns:sf="https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroInformacion.xsd"';

function respuestaGrande(lineas: number): string {
    const linea = (i: number) => `<sfR:RespuestaLinea><sfR:IDFactura><sf:IDEmisorFactura>B12345674</sf:IDEmisorFactura><sf:NumSerieFactura>F2026-${String(i).padStart(6, '0')}</sf:NumSerieFactura><sf:FechaExpedicionFactura>07-10-2026</sf:FechaExpedicionFactura></sfR:IDFactura><sfR:Operacion><sf:TipoOperacion>Alta</sf:TipoOperacion></sfR:Operacion><sfR:EstadoRegistro>Correcto</sfR:EstadoRegistro></sfR:RespuestaLinea>`;
    return `<?xml version="1.0" encoding="UTF-8"?><env:Envelope ${NS}><env:Body><sfR:RespuestaRegFactuSistemaFacturacion>`
        + `<sfR:CSV>CSV</sfR:CSV><sfR:TiempoEsperaEnvio>60</sfR:TiempoEsperaEnvio><sfR:EstadoEnvio>Correcto</sfR:EstadoEnvio>`
        + Array.from({ length: lineas }, (_, i) => linea(i + 1)).join('')
        + `</sfR:RespuestaRegFactuSistemaFacturacion></env:Body></env:Envelope>`;
}

const sif = {
    nombreRazon: 'Flouvia', nif: 'Q2826000H', nombreSistemaInformatico: 'Cord', idSistemaInformatico: 'CD', version: '1.0',
    numeroInstalacion: 'CORD-1', tipoUsoPosibleSoloVerifactu: 'S', tipoUsoPosibleMultiOT: 'S', indicadorMultiplesOT: 'N',
} as const;
const registro: BatchRegistro = {
    tipo: 'alta',
    previous: null,
    payload: {
        idEmisorFactura: 'B12345674', numSerieFactura: 'F2026-000001', fechaExpedicionFactura: '07-10-2026', tipoFactura: 'F1',
        cuotaTotal: '21.00', importeTotal: '121.00', nombreRazonEmisor: 'ACME SL', descripcionOperacion: 'Consultoría',
        destinatario: { nombreRazon: 'Cliente SA', nif: 'A58818501' },
        desglose: [{ claveRegimen: '01', calificacionOperacion: 'S1', tipoImpositivo: '21', baseImponibleOimporteNoSujeto: '100.00', cuotaRepercutida: '21.00' }],
        sistemaInformatico: sif, huella: 'A'.repeat(64), huellaAnterior: '', fechaHoraHusoGenRegistro: '2026-10-07T10:00:00+02:00',
    },
};

let server: Server;
let url = '';
let modo: 'grande' | 'fault' | 'sin_certificado' = 'grande';
let soapAction: string | undefined;

beforeAll(async () => {
    server = createServer((req, res) => {
        soapAction = req.headers.soapaction as string | undefined;
        req.resume();
        req.on('end', () => {
            if (modo === 'sin_certificado') {
                // Lo que de verdad responde el portal de pruebas a un certificado
                // que no reconoce (comprobado oct 2026): redirección a una página HTML.
                res.writeHead(302, { Location: 'https://sede.agenciatributaria.gob.es/Sede/errores/erro4033.html' });
                res.end();
                return;
            }
            if (modo === 'fault') {
                res.writeHead(500, { 'Content-Type': 'text/xml' });
                res.end(`<?xml version="1.0" encoding="UTF-8"?><env:Envelope xmlns:env="http://schemas.xmlsoap.org/soap/envelope/"><env:Body><env:Fault><faultcode>env:Client</faultcode><faultstring>Codigo[4102].El XML no cumple el esquema.</faultstring></env:Fault></env:Body></env:Envelope>`);
                return;
            }
            res.writeHead(200, { 'Content-Type': 'text/xml' });
            res.end(respuestaGrande(1000));
        });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/VerifactuSOAP`;
});

afterAll(async () => { await new Promise((resolve) => server.close(resolve)); });

describe('submitToAeat', () => {
    it('lee una respuesta de cientos de KB sin colgarse hasta el timeout', async () => {
        modo = 'grande';
        const inicio = Date.now();
        const respuesta = await submitToAeat({ nif: 'B12345674', nombreRazon: 'ACME SL' }, [registro], {
            entorno: 'pruebas', credenciales: { key: '', cert: '' }, timeoutMs: 4_000, url,
        });
        expect(respuesta.lineas).toHaveLength(1000);
        expect(respuesta.tiempoEsperaEnvio).toBe(60);
        expect(Date.now() - inicio).toBeLessThan(3_000);
        expect(soapAction).toBe('""');
    });

    it('un SoapFault con HTTP 500 llega como AeatFaultError con su código', async () => {
        modo = 'fault';
        const error = await submitToAeat({ nif: 'B12345674', nombreRazon: 'ACME SL' }, [registro], {
            entorno: 'pruebas', credenciales: { key: '', cert: '' }, timeoutMs: 4_000, url,
        }).catch((e) => e);
        expect(error).toBeInstanceOf(AeatFaultError);
        expect(error.codigo).toBe(4102);
        expect(error.faultcode).toBe('Client');
    });

    it('un certificado que la AEAT no reconoce es un fallo de cabecera, no un reintento infinito', async () => {
        modo = 'sin_certificado';
        let error: unknown;
        try {
            await submitToAeat({ nif: 'B12345674', nombreRazon: 'ACME SL' }, [registro], {
                entorno: 'pruebas', credenciales: { key: '', cert: '' }, timeoutMs: 4_000, url,
            });
        } catch (e) { error = e; }
        expect(error).toBeInstanceOf(AeatCertificadoError);
        expect(clasificarFallo(error)).toBe('cabecera');
    });
});

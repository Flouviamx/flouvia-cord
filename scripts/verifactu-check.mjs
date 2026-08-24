// Contrato de la huella y el QR de Verifactu — corre en `npm run test:payments`.
//
// Los tres vectores de esta sección NO son inventados: son los tres ejemplos
// completos (§6.1, §6.2, §6.3) del documento oficial "Detalle de las
// especificaciones técnicas para la generación de la huella o hash de los
// registros de facturación" (AEAT, v0.1.2) — se transcribieron a mano el
// 23-ago-2026 y se verificaron computando el SHA-256 antes de escribir
// huella.ts, no después. Si este script empieza a fallar, el problema está en
// huella.ts, no en los vectores.
import assert from 'node:assert/strict';
import {
    huellaAlta,
    huellaAnulacion,
    fechaExpedicionAEAT,
    fechaHoraHusoAEAT,
} from '../src/lib/fiscal/verifactu/huella.ts';
import { verifactuQrUrl, VERIFACTU_LEYENDA } from '../src/lib/fiscal/verifactu/qr.ts';
import { buildEnvelope, parseRespuesta, verifactuEndpoint } from '../src/lib/fiscal/verifactu/aeat.ts';
import { buildDesglose, buildDestinatario } from '../src/lib/fiscal/verifactu/desglose.ts';
import { parseStringPromise } from 'xml2js';

// ── Caso 1 (§6.1): primer registro de un SIF, sin huella anterior ──────────
{
    const huella = huellaAlta({
        idEmisorFactura: '89890001K',
        numSerieFactura: '12345678/G33',
        fechaExpedicionFactura: '01-01-2024',
        tipoFactura: 'F1',
        cuotaTotal: '12.35',
        importeTotal: '123.45',
        huellaAnterior: null,
        fechaHoraHusoGenRegistro: '2024-01-01T19:20:30+01:00',
    });
    assert.equal(huella, '3C464DAF61ACB827C65FDA19F352A4E3BDC2C640E9E9FC4CC058073F38F12F60',
        'caso 1 oficial (primer registro de alta) no coincide con el vector de la AEAT');
}

// ── Caso 2 (§6.2): segundo registro de alta, con huella anterior ───────────
{
    const huella = huellaAlta({
        idEmisorFactura: '89890001K',
        numSerieFactura: '12345679/G34',
        fechaExpedicionFactura: '01-01-2024',
        tipoFactura: 'F1',
        cuotaTotal: '12.35',
        importeTotal: '123.45',
        huellaAnterior: '3C464DAF61ACB827C65FDA19F352A4E3BDC2C640E9E9FC4CC058073F38F12F60',
        fechaHoraHusoGenRegistro: '2024-01-01T19:20:35+01:00',
    });
    assert.equal(huella, 'F7B94CFD8924EDFF273501B01EE5153E4CE8F259766F88CF6ACB8935802A2B97',
        'caso 2 oficial (segundo registro, encadenado) no coincide con el vector de la AEAT');
}

// ── Caso 3 (§6.3): registro de anulación, con huella anterior ──────────────
{
    const huella = huellaAnulacion({
        idEmisorFacturaAnulada: '89890001K',
        numSerieFacturaAnulada: '12345679/G34',
        fechaExpedicionFacturaAnulada: '01-01-2024',
        huellaAnterior: 'F7B94CFD8924EDFF273501B01EE5153E4CE8F259766F88CF6ACB8935802A2B97',
        fechaHoraHusoGenRegistro: '2024-01-01T19:20:40+01:00',
    });
    assert.equal(huella, '177547C0D57AC74748561D054A9CEC14B4C4EA23D1BEFD6F2E69E3A388F90C68',
        'caso 3 oficial (anulación encadenada) no coincide con el vector de la AEAT');
}

// ── Forma del algoritmo: siempre 64 hex mayúsculas, campo vacío = "Campo=" ──
{
    const h = huellaAlta({
        idEmisorFactura: 'X', numSerieFactura: 'Y', fechaExpedicionFactura: '01-01-2026',
        tipoFactura: 'F1', cuotaTotal: '0', importeTotal: '0',
        huellaAnterior: null, fechaHoraHusoGenRegistro: '2026-01-01T00:00:00+01:00',
    });
    assert.equal(h.length, 64, 'la huella siempre debe tener 64 caracteres');
    assert.ok(/^[0-9A-F]{64}$/.test(h), 'la huella debe ser hexadecimal en MAYÚSCULAS, sin excepción');
}

// ── Zona horaria: Europe/Madrid, con offset explícito (nunca "Z") ──────────
{
    // 2024-01-01T18:20:30Z es invierno en Madrid → +01:00.
    assert.equal(fechaHoraHusoAEAT(new Date('2024-01-01T18:20:30Z')), '2024-01-01T19:20:30+01:00');
    // 2024-07-01T17:20:30Z es verano en Madrid (CEST) → +02:00.
    assert.equal(fechaHoraHusoAEAT(new Date('2024-07-01T17:20:30Z')), '2024-07-01T19:20:30+02:00');
    assert.equal(fechaExpedicionAEAT(new Date('2024-01-01T18:20:30Z')), '01-01-2024',
        'FechaExpedicionFactura es dd-mm-aaaa, NO ISO');
}

// ── QR: verificado contra "Detalle de las especificaciones técnicas del
//    código QR de la factura" (AEAT, v0.5.0) ───────────────────────────────
{
    const url = verifactuQrUrl({ nif: '89890001K', numSerie: '12345678/G33', fecha: '01-01-2024', importeTotal: 241.4 });
    assert.equal(url, 'https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR?nif=89890001K&numserie=12345678/G33&fecha=01-01-2024&importe=241.40',
        'la URL del QR debe coincidir literalmente con el formato publicado por la AEAT');
    assert.ok(!url.includes('%2F'), 'la barra de la serie NO debe codificarse — así la publica la AEAT en su propio ejemplo');
    assert.match(VERIFACTU_LEYENDA, /sede electrónica de la AEAT/);
}

// ── Endpoints: byte a byte contra el <soap:address location> del WSDL real ──
// Descargado directamente de la AEAT el 24-ago-2026 (no una fuente
// secundaria): https://www2.agenciatributaria.gob.es/static_files/common/
// internet/dep/aplicaciones/es/aeat/tikeV1.0/cont/ws/SistemaFacturacion.wsdl
{
    assert.equal(verifactuEndpoint(false), 'https://www1.agenciatributaria.gob.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP');
    assert.equal(verifactuEndpoint(true), 'https://prewww1.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP');
}

// ── buildDesglose / buildDestinatario: traducción a vocabulario AEAT ───────
{
    const lines = [
        { taxRate: 0.21, subtotal: 100, taxAmount: 21 },
        { taxRate: 0.04, subtotal: 10, taxAmount: 0.4 },
        { taxRate: 0, subtotal: 50, taxAmount: 0, exemptionReason: 'E1' },
    ];
    const desglose = buildDesglose(lines);
    assert.equal(desglose.length, 3, 'una línea de desglose por cada (tasa, exención) distinta');
    const s21 = desglose.find((d) => d.tipoImpositivo === '21');
    assert.equal(s21.calificacionOperacion, 'S1');
    assert.equal(s21.baseImponibleOimporteNoSujeto, '100.00');
    assert.equal(s21.cuotaRepercutida, '21.00');
    const exenta = desglose.find((d) => d.operacionExenta === 'E1');
    assert.ok(exenta, 'una línea con exemptionReason debe usar OperacionExenta, no CalificacionOperacion');
    assert.equal(exenta.calificacionOperacion, undefined, 'una línea exenta no debe llevar CalificacionOperacion (son <choice> en el esquema)');

    const destEs = buildDestinatario({ legalName: 'Cliente ES', taxId: 'B12345674', address: { countryCode: 'ES' } });
    assert.equal(destEs.nif, 'B12345674');
    const destFr = buildDestinatario({ legalName: 'Client FR', taxId: 'FR12345678901', address: { countryCode: 'FR' } });
    assert.equal(destFr.idOtro.idType, '02', 'un país de la UE con VAT number usa IDType=02 (NIF-IVA)');
    const destUs = buildDestinatario({ legalName: 'Client US', taxId: '12-3456789', address: { countryCode: 'US' } });
    assert.equal(destUs.idOtro.idType, '04', 'fuera de la UE usa IDType=04 (identificación en país de residencia)');
    assert.equal(buildDestinatario({ legalName: 'Sin NIF', address: { countryCode: 'ES' } }), null,
        'Destinatarios es opcional en el esquema — sin tax id se omite, no se inventa un ID');
}

// ── Envelope SOAP: bien formado, namespaces correctos, encadenamiento real ─
// Estructura y orden de campos verificados contra SuministroLR.xsd,
// SuministroInformacion.xsd y el ejemplo oficial §9.1.1.1 (AEAT v1.0.3).
{
    const emisor = { nombreRazon: 'ACME S.L. & Co', nif: '89890001K' };
    const sistemaInformatico = {
        nombreRazon: 'Flouvia SL', nif: 'B00000000', nombreSistemaInformatico: 'Cord',
        idSistemaInformatico: '77', version: '1.0', numeroInstalacion: 'CORD-PROD',
        tipoUsoPosibleSoloVerifactu: 'S', tipoUsoPosibleMultiOT: 'S', indicadorMultiplesOT: 'S',
    };
    const alta1 = {
        idEmisorFactura: '89890001K', numSerieFactura: '12345678/G33', fechaExpedicionFactura: '01-01-2024',
        tipoFactura: 'F1', cuotaTotal: '21.40', importeTotal: '131.40',
        nombreRazonEmisor: emisor.nombreRazon, descripcionOperacion: 'Venta <de> bienes & servicios',
        destinatario: { nombreRazon: 'Cliente S.A.', nif: 'B12345674' },
        desglose: [{ claveRegimen: '01', calificacionOperacion: 'S1', tipoImpositivo: '21', baseImponibleOimporteNoSujeto: '100.00', cuotaRepercutida: '21.00' }],
        sistemaInformatico, huella: 'AAAA', huellaAnterior: '', fechaHoraHusoGenRegistro: '2024-01-01T19:20:30+01:00',
    };
    const alta2 = { ...alta1, numSerieFactura: '12345679/G34', huella: 'BBBB', huellaAnterior: 'AAAA' };

    const prev1 = null; // primer registro del SIF: sin anterior
    const prev2 = { idEmisorFactura: '89890001K', numSerieFactura: '12345678/G33', fechaExpedicionFactura: '01-01-2024' };
    const xml = buildEnvelope(emisor, [
        { tipo: 'alta', payload: alta1, previous: prev1 },
        { tipo: 'alta', payload: alta2, previous: prev2 },
    ]);
    // Caracteres especiales escapados (§6.9 del documento oficial): & y < como mínimo.
    assert.ok(xml.includes('Venta &lt;de&gt; bienes &amp; servicios') && !xml.includes('Venta <de>'));
    assert.ok(xml.includes('<soapenv:Header/>'), 'la autenticación es 100% mTLS — el Header SOAP va vacío, igual que el ejemplo oficial');

    const parsed = await parseStringPromise(xml, { explicitArray: false });
    const body = parsed['soapenv:Envelope']['soapenv:Body'];
    const reg = body['sum:RegFactuSistemaFacturacion'];
    assert.equal(reg['sum:Cabecera']['sum1:ObligadoEmision']['sum1:NIF'], '89890001K');
    assert.equal(reg['sum:RegistroFactura'].length, 2, 'un RegistroFactura por registro del lote');
    const first = reg['sum:RegistroFactura'][0]['sum1:RegistroAlta'];
    const second = reg['sum:RegistroFactura'][1]['sum1:RegistroAlta'];
    assert.equal(first['sum1:Encadenamiento']['sum1:PrimerRegistro'], 'S',
        'sin huella anterior, el encadenamiento se declara con PrimerRegistro, no con un RegistroAnterior vacío');
    assert.equal(second['sum1:Encadenamiento']['sum1:RegistroAnterior']['sum1:Huella'], 'AAAA',
        'el segundo registro debe encadenar contra la huella real del primero, no un valor fijo');
    assert.equal(second['sum1:Encadenamiento']['sum1:RegistroAnterior']['sum1:NumSerieFactura'], '12345678/G33',
        'RegistroAnterior identifica la factura anterior completa (serie+fecha+huella), no solo la huella suelta');
}

// ── Respuesta de la AEAT: estados por línea y CSV, sin depender de un prefijo fijo ──
{
    const respXml = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:sfR="https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/RespuestaSuministro.xsd" xmlns:sf="https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroInformacion.xsd">
  <soapenv:Body>
    <sfR:RespuestaRegFactuSistemaFacturacion>
      <sfR:CSV>CSV123456</sfR:CSV>
      <sfR:EstadoEnvio>ParcialmenteCorrecto</sfR:EstadoEnvio>
      <sfR:RespuestaLinea>
        <sf:IDFactura><sf:IDEmisorFactura>89890001K</sf:IDEmisorFactura><sf:NumSerieFactura>12345678/G33</sf:NumSerieFactura><sf:FechaExpedicionFactura>01-01-2024</sf:FechaExpedicionFactura></sf:IDFactura>
        <sfR:EstadoRegistro>Correcto</sfR:EstadoRegistro>
      </sfR:RespuestaLinea>
      <sfR:RespuestaLinea>
        <sf:IDFactura><sf:IDEmisorFactura>89890001K</sf:IDEmisorFactura><sf:NumSerieFactura>12345679/G34</sf:NumSerieFactura><sf:FechaExpedicionFactura>01-01-2024</sf:FechaExpedicionFactura></sf:IDFactura>
        <sfR:EstadoRegistro>Incorrecto</sfR:EstadoRegistro>
        <sfR:CodigoErrorRegistro>1234</sfR:CodigoErrorRegistro>
        <sfR:DescripcionErrorRegistro>Error de ejemplo</sfR:DescripcionErrorRegistro>
      </sfR:RespuestaLinea>
    </sfR:RespuestaRegFactuSistemaFacturacion>
  </soapenv:Body>
</soapenv:Envelope>`;
    const respuesta = await parseRespuesta(respXml);
    assert.equal(respuesta.estadoEnvio, 'ParcialmenteCorrecto');
    assert.equal(respuesta.csv, 'CSV123456');
    assert.equal(respuesta.lineas.length, 2);
    assert.equal(respuesta.lineas[0].estado, 'Correcto');
    assert.equal(respuesta.lineas[1].estado, 'Incorrecto');
    assert.equal(respuesta.lineas[1].codigoError, 1234);
    assert.equal(respuesta.lineas[1].numSerieFactura, '12345679/G34');
}

process.stdout.write('security:verifactu (huella, QR y envío SOAP contra los vectores y esquemas oficiales de la AEAT) OK\n');

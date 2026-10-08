// Contrato de Verifactu — corre en `npm run test:payments` (security:verifactu).
//
// Tres capas, de la más dura a la más blanda:
//
//   1. Huella: los tres vectores oficiales (§6.1–§6.3) del documento "Detalle
//      de las especificaciones técnicas para la generación de la huella o hash
//      de los registros de facturación" (AEAT, v0.1.2), transcritos a mano y
//      verificados con SHA-256 antes de escribir huella.ts. Si fallan, el
//      problema está en huella.ts, no en los vectores.
//   2. Esquema: cada VARIANTE de registro que Cord sabe generar (F1, F2 sin
//      destinatario, R1 por diferencias, R5, anulación, anulación sin registro
//      previo, subsanación, productor con IDOtro, cliente UE con NIF-IVA…) se
//      valida con xmllint contra los XSD OFICIALES vendorizados en
//      scripts/fixtures/aeat/ (SuministroLR.xsd + SuministroInformacion.xsd +
//      xmldsig-core-schema.xsd, descargados de la sede de la AEAT; solo se
//      cambió `schemaLocation` a ruta local). Un elemento fuera de orden rompe
//      el esquema y la AEAT rechaza el MENSAJE completo, así que esto no es
//      cosmético. Sin xmllint en la máquina se avisa y se omite esta capa
//      (VERIFACTU_XSD_REQUIRED=1 la vuelve obligatoria).
//   3. Reglas de negocio de "Validaciones y errores" (v1.2.2) y de las FAQ de
//      desarrolladores que Cord aplica ANTES de encadenar: ImporteTotal sin
//      IRPF, F2 sin NIF del cliente, rectificativas negativas, tipos de IVA
//      admitidos, conversión a euros, calificación de las líneas al 0 %…
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    huellaAlta,
    huellaAnulacion,
    fechaExpedicionAEAT,
    fechaHoraHusoAEAT,
    ejercicioAEAT,
} from '../src/lib/fiscal/verifactu/huella.ts';
import { verifactuQrUrl, VERIFACTU_LEYENDA, VERIFACTU_QR_PRESENTACION, mmAPuntos } from '../src/lib/fiscal/verifactu/qr.ts';
import { buildEnvelope, parseRespuesta, verifactuEndpoint, AeatFaultError } from '../src/lib/fiscal/verifactu/aeat.ts';
import { buildDesglose, resolverDestinatario } from '../src/lib/fiscal/verifactu/desglose.ts';
import { construirAlta, problemasEsquemaAlta, problemasEsquemaAnulacion } from '../src/lib/fiscal/verifactu/registro.ts';
import { primerGrupo, resolverRespuesta, clasificarFallo, loteTrasFallo, segundosDeEspera } from '../src/lib/fiscal/verifactu/envio.ts';
import { nifEsValido, normalizarNifEs, nifIvaUE, textoAEAT, validarNumSerie, VerifactuDatosError } from '../src/lib/fiscal/verifactu/validacion.ts';
import { identidadSifParaOrg, numeroInstalacionPorOrg, requireSifIdentity, SifNotConfiguredError } from '../src/lib/fiscal/verifactu/sif.ts';
import { declaracionResponsable } from '../src/lib/fiscal/verifactu/declaracion.ts';

const XSD_DIR = fileURLToPath(new URL('./fixtures/aeat/', import.meta.url));

// ── 1. Huella: vectores oficiales de la AEAT ───────────────────────────────
{
    // Caso 1 (§6.1): primer registro de un SIF, sin huella anterior.
    assert.equal(huellaAlta({
        idEmisorFactura: '89890001K', numSerieFactura: '12345678/G33', fechaExpedicionFactura: '01-01-2024',
        tipoFactura: 'F1', cuotaTotal: '12.35', importeTotal: '123.45',
        huellaAnterior: null, fechaHoraHusoGenRegistro: '2024-01-01T19:20:30+01:00',
    }), '3C464DAF61ACB827C65FDA19F352A4E3BDC2C640E9E9FC4CC058073F38F12F60',
    'caso 1 oficial (primer registro de alta) no coincide con el vector de la AEAT');
    // Caso 2 (§6.2): segundo registro de alta, con huella anterior.
    assert.equal(huellaAlta({
        idEmisorFactura: '89890001K', numSerieFactura: '12345679/G34', fechaExpedicionFactura: '01-01-2024',
        tipoFactura: 'F1', cuotaTotal: '12.35', importeTotal: '123.45',
        huellaAnterior: '3C464DAF61ACB827C65FDA19F352A4E3BDC2C640E9E9FC4CC058073F38F12F60',
        fechaHoraHusoGenRegistro: '2024-01-01T19:20:35+01:00',
    }), 'F7B94CFD8924EDFF273501B01EE5153E4CE8F259766F88CF6ACB8935802A2B97',
    'caso 2 oficial (segundo registro, encadenado) no coincide con el vector de la AEAT');
    // Caso 3 (§6.3): registro de anulación, con huella anterior.
    assert.equal(huellaAnulacion({
        idEmisorFacturaAnulada: '89890001K', numSerieFacturaAnulada: '12345679/G34', fechaExpedicionFacturaAnulada: '01-01-2024',
        huellaAnterior: 'F7B94CFD8924EDFF273501B01EE5153E4CE8F259766F88CF6ACB8935802A2B97',
        fechaHoraHusoGenRegistro: '2024-01-01T19:20:40+01:00',
    }), '177547C0D57AC74748561D054A9CEC14B4C4EA23D1BEFD6F2E69E3A388F90C68',
    'caso 3 oficial (anulación encadenada) no coincide con el vector de la AEAT');
}

// ── Zona horaria y año: Europe/Madrid, offset explícito, nunca "24:00" ─────
{
    assert.equal(fechaHoraHusoAEAT(new Date('2024-01-01T18:20:30Z')), '2024-01-01T19:20:30+01:00');
    assert.equal(fechaHoraHusoAEAT(new Date('2024-07-01T17:20:30Z')), '2024-07-01T19:20:30+02:00');
    // Medianoche en Madrid: con hour12:false algunos ICU daban "24".
    assert.equal(fechaHoraHusoAEAT(new Date('2025-12-31T23:00:00Z')), '2026-01-01T00:00:00+01:00');
    assert.equal(fechaExpedicionAEAT(new Date('2024-01-01T18:20:30Z')), '01-01-2024', 'FechaExpedicionFactura es dd-mm-aaaa, NO ISO');
    // 00:30 del 1 de enero en Madrid sigue siendo 31 de diciembre en UTC.
    assert.equal(ejercicioAEAT(new Date('2025-12-31T23:30:00Z')), 2026, 'el ejercicio de la serie es el año en Madrid, no en UTC');
}

// ── QR: hosts por entorno y «URL encoding» (documento del QR v0.5.0) ──────
{
    assert.equal(
        verifactuQrUrl({ nif: '89890001K', numSerie: '12345678&G33', fecha: '01-01-2024', importeTotal: 241.4 }, { entorno: 'pruebas' }),
        'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR?nif=89890001K&numserie=12345678%26G33&fecha=01-01-2024&importe=241.40',
        '§4: el & de la serie se codifica; pruebas usa prewww2.aeat.es');
    assert.equal(
        verifactuQrUrl({ nif: '89890001K', numSerie: '12345678-G33', fecha: '01-09-2024', importeTotal: '241.40' }, { entorno: 'produccion' }),
        'https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR?nif=89890001K&numserie=12345678-G33&fecha=01-09-2024&importe=241.40',
        '§8.3: URL de producción');
    assert.ok(verifactuQrUrl({ nif: 'B12345674', numSerie: 'NC-F2026-000001', fecha: '07-10-2026', importeTotal: '-21.00' }, { entorno: 'pruebas' }).endsWith('importe=-21.00'),
        'una rectificativa lleva su ImporteTotal negativo en el QR');
    assert.match(VERIFACTU_LEYENDA, /sede electrónica de la AEAT/);
    assert.equal(VERIFACTU_QR_PRESENTACION.etiquetaSuperior, 'QR tributario:');
    assert.ok(mmAPuntos(30) > 84 && mmAPuntos(40) < 114, '30–40 mm ≈ 85–113 pt');
}

// ── Endpoints: <soap:address location> del WSDL real ───────────────────────
{
    assert.equal(verifactuEndpoint('produccion'), 'https://www1.agenciatributaria.gob.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP');
    assert.equal(verifactuEndpoint('pruebas'), 'https://prewww1.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP');
}

// ── Identificadores ────────────────────────────────────────────────────────
{
    assert.equal(normalizarNifEs('ES-B12345674'), 'B12345674', 'el prefijo ES del NIF-IVA no entra en NIFType (9 caracteres)');
    assert.equal(normalizarNifEs(' es b1234567-4 '), 'B12345674');
    assert.ok(nifEsValido('ESB12345674'));
    assert.ok(nifEsValido('X1234567L'), 'NIE');
    assert.ok(nifEsValido(`L1234567${'TRWAGMYFPDXBNJZSQVHLCKE'[1234567 % 23]}`), 'NIF K/L/M con letra de control de DNI');
    assert.ok(!nifEsValido('B12345675'), 'dígito de control incorrecto');
    assert.equal(nifIvaUE('FR', '12345678901'), 'FR12345678901', 'NIF-IVA se prefija con el país');
    assert.equal(nifIvaUE('GR', '123456789'), 'EL123456789', 'Grecia usa EL');
    assert.equal(nifIvaUE('DE', 'DE12345'), null, 'estructura incorrecta → no es NIF-IVA');
    assert.equal(textoAEAT('A\u0000B\u001B C\n\nD', 120), 'AB C D', 'caracteres inválidos en XML 1.0 fuera');
    assert.throws(() => validarNumSerie('F"2026'), VerifactuDatosError);
    assert.throws(() => validarNumSerie('FAC-ÑÚ'), VerifactuDatosError, 'solo ASCII imprimible');
}

// ── Construcción del registro de alta (reglas de negocio) ─────────────────
const emisor = { legalName: 'ACME Consultoría SL', taxId: 'B12345674' };
const clienteES = { legalName: 'Cliente SA', taxId: 'A58818501', address: { countryCode: 'ES' } };
const linea = (taxRate, subtotal, extra = {}) => ({
    description: 'Consultoría', quantity: 1, unitPrice: subtotal, taxRate, subtotal,
    taxAmount: Math.round(subtotal * taxRate * 100) / 100, total: subtotal + Math.round(subtotal * taxRate * 100) / 100, ...extra,
});
const base = (over = {}) => ({
    emisor, receptor: clienteES, numSerie: 'F2026-000001', fechaExpedicion: '07-10-2026',
    lines: [linea(0.21, 100)], totals: { subtotal: 100, taxes: 21, total: 121, currency: 'EUR' }, entorno: 'pruebas', ...over,
});

const altaF1 = construirAlta(base({
    // FAQ desarrolladores §20: la retención de IRPF NO forma parte del registro.
    totals: { subtotal: 100, taxes: 21, total: 106, currency: 'EUR', retenciones: [{ nombre: 'IRPF', tipo: 'ret_isr', tasa: 0.15, base: 100, monto: 15 }], retencionTotal: 15 },
}));
assert.equal(altaF1.tipoFactura, 'F1');
assert.equal(altaF1.importeTotal, '121.00', 'ImporteTotal = Σ(base + cuota), sin restar el IRPF');
assert.equal(altaF1.cuotaTotal, '21.00');

const altaF2 = construirAlta(base({ receptor: { legalName: 'Particular', address: { countryCode: 'ES' } } }));
assert.equal(altaF2.tipoFactura, 'F2', 'sin NIF del cliente → F2 (antes F1 sin Destinatarios, error 1189)');
assert.equal(altaF2.facturaSinIdentifDestinatarioArt61d, 'S');
assert.equal(altaF2.destinatario, null);

const altaR1 = construirAlta(base({
    numSerie: 'NC-F2026-000001',
    lines: [linea(0.21, 50)], totals: { subtotal: 50, taxes: 10.5, total: 60.5, currency: 'EUR' },
    rectificativa: { original: { idEmisorFactura: 'ESB12345674', numSerieFactura: 'F2026-000001', fechaExpedicionFactura: '01-10-2026' }, tipoOriginal: 'F1' },
}));
assert.equal(altaR1.tipoFactura, 'R1');
assert.equal(altaR1.tipoRectificativa, 'I', 'rectificativa por diferencias (error 1114 sin TipoRectificativa)');
assert.equal(altaR1.importeTotal, '-60.50', 'una nota de crédito reduce: importes negativos');
assert.equal(altaR1.desglose[0].baseImponibleOimporteNoSujeto, '-50.00');
assert.equal(altaR1.desglose[0].cuotaRepercutida, '-10.50');
assert.deepEqual(altaR1.facturasRectificadas, [{ idEmisorFactura: 'B12345674', numSerieFactura: 'F2026-000001', fechaExpedicionFactura: '01-10-2026' }]);

const altaR5 = construirAlta(base({
    numSerie: 'NC-F2026-000002', receptor: { legalName: 'Particular', address: { countryCode: 'ES' } },
    rectificativa: { original: { idEmisorFactura: 'B12345674', numSerieFactura: 'F2026-000003', fechaExpedicionFactura: '01-10-2026' }, tipoOriginal: 'F2' },
}));
assert.equal(altaR5.tipoFactura, 'R5', 'la rectificativa de una F2 es R5');
assert.equal(altaR5.destinatario, null, 'R5 no admite Destinatarios (error 1190)');

// Calificación de las líneas al 0 %.
const clienteFR = { legalName: 'Client SARL', taxId: '12345678901', address: { countryCode: 'FR' } };
const clienteUS = { legalName: 'Client Inc', taxId: '12-3456789', address: { countryCode: 'US' } };
const cero = (receptor, extra = {}) => construirAlta(base({
    receptor, lines: [linea(0, 100, extra)], totals: { subtotal: 100, taxes: 0, total: 100, currency: 'EUR' },
}));
{
    const fr = cero(clienteFR);
    assert.deepEqual(fr.destinatario, { nombreRazon: 'Client SARL', idOtro: { idType: '02', id: 'FR12345678901' } });
    assert.equal(fr.desglose[0].calificacionOperacion, 'N2', 'servicio B2B a la UE: no sujeto por localización, no "exento E1"');
    assert.equal(fr.desglose[0].claveRegimen, '01');
    assert.equal(cero(clienteUS).desglose[0].calificacionOperacion, 'N2', 'fuera de la UE: N2');
    assert.equal(cero(clienteUS).destinatario.idOtro.idType, '04');
    assert.equal(cero(clienteUS).destinatario.idOtro.codigoPais, 'US');
    assert.equal(cero(clienteES).desglose[0].operacionExenta, 'E6', 'nacional 0 % sin causa: exención genérica E6, no E1');
    assert.equal(cero(clienteES, { exemptionReason: 'E1' }).desglose[0].operacionExenta, 'E1', 'la causa explícita manda');
    const exp = cero(clienteUS, { exemptionReason: 'E2' });
    assert.equal(exp.desglose[0].claveRegimen, '02', 'exportación E2 va con ClaveRegimen 02 (error 1199)');
    const s2 = cero(clienteES, { exemptionReason: 'S2' });
    assert.deepEqual([s2.desglose[0].calificacionOperacion, s2.desglose[0].tipoImpositivo, s2.desglose[0].cuotaRepercutida], ['S2', '0', '0.00']);
    assert.throws(() => cero({ legalName: 'Particular', address: { countryCode: 'ES' } }, { exemptionReason: 'S2' }), VerifactuDatosError,
        'inversión del sujeto pasivo sin NIF del cliente: falla antes de encadenar');
    assert.throws(() => cero(clienteES, { exemptionReason: 'E5' }), VerifactuDatosError, 'E5 exige NIF-IVA de la UE');
}

// Tipos, desglose y divisa: fallo cerrado.
assert.throws(() => construirAlta(base({ lines: [linea(0.07, 100)], totals: { subtotal: 100, taxes: 7, total: 107, currency: 'EUR' } })),
    VerifactuDatosError, 'IGIC 7 % no es un tipo de IVA admitido (error 1124)');
{
    // 13 combinaciones distintas de régimen/calificación/tipo: la AEAT admite
    // 12 DetalleDesglose. Antes se recortaba en silencio con slice(0, 12).
    const ctx = { destinatario: resolverDestinatario(clienteES, 'B12345674'), fechaExpedicion: '15-11-2024', signo: 1, aEur: 1 };
    const trece = [
        ...[0.21, 0.10, 0.04, 0.02, 0.075].map((r) => linea(r, 10)),
        ...['E1', 'E2', 'E3', 'E4', 'E6', 'N1', 'N2', 'S2'].map((c) => linea(0, 10, { exemptionReason: c })),
    ];
    assert.equal(buildDesglose(trece.slice(0, 12), ctx).desglose.length, 12);
    assert.throws(() => buildDesglose(trece, ctx), /más de 12/);
}
{
    const muchas = [0.21, 0.10, 0.04].flatMap((r) => [linea(r, 10)]);
    assert.equal(buildDesglose(muchas, { destinatario: resolverDestinatario(clienteES, 'B12345674'), fechaExpedicion: '07-10-2026', signo: 1, aEur: 1 }).desglose.length, 3);
}
assert.throws(() => construirAlta(base({ totals: { subtotal: 100, taxes: 21, total: 121, currency: 'USD' } })),
    VerifactuDatosError, 'USD sin tipo de cambio a EUR: no se registra en dólares');
{
    const usd = construirAlta(base({ totals: { subtotal: 100, taxes: 21, total: 121, currency: 'USD', exchangeRate: 0.9, ledgerCurrency: 'EUR' } }));
    assert.equal(usd.importeTotal, '108.90', 'conversión línea a línea con el tipo del documento');
    assert.equal(usd.desglose[0].baseImponibleOimporteNoSujeto, '90.00');
}
assert.throws(() => construirAlta(base({ receptor: { ...clienteES, taxId: 'B12345674' } })), VerifactuDatosError,
    'el cliente no puede tener el NIF del emisor (error 1193)');
assert.throws(() => construirAlta(base({ emisor: { legalName: 'X', taxId: 'B1234' } })), VerifactuDatosError);

// ── Identidad del productor (SistemaInformatico) ───────────────────────────
const sifNif = {
    nombreRazon: 'Flouvia SL', nif: 'B12345674', nombreSistemaInformatico: 'Cord',
    idSistemaInformatico: 'CD', version: '1.0', numeroInstalacion: 'CORD-00000000-0000-4000-8000-000000000001',
    tipoUsoPosibleSoloVerifactu: 'S', tipoUsoPosibleMultiOT: 'S', indicadorMultiplesOT: 'N',
};
const sifOtro = { ...sifNif, nif: undefined, nombreRazon: 'Flouvia SA de CV', idOtro: { codigoPais: 'MX', idType: '04', id: 'FLO010101AB1' } };
{
    const saved = { ...process.env };
    try {
        for (const k of Object.keys(process.env)) if (k.startsWith('VERIFACTU_')) delete process.env[k];
        assert.throws(() => requireSifIdentity(), SifNotConfiguredError);
        Object.assign(process.env, { VERIFACTU_SIF_NOMBRE: 'Flouvia SA de CV', VERIFACTU_SIF_ID: 'cd',
            VERIFACTU_SIF_ID_OTRO_PAIS: 'MX', VERIFACTU_SIF_ID_OTRO_TIPO: '04', VERIFACTU_SIF_ID_OTRO_ID: 'FLO010101AB1' });
        // Sin declaración responsable completa (art. 15 de la Orden) el sistema no opera.
        assert.throws(() => requireSifIdentity(), SifNotConfiguredError, 'sin dirección, fecha y lugar de la declaración responsable no hay identidad');
        Object.assign(process.env, { VERIFACTU_SIF_DIRECCION: 'Av. Reforma 1|06600 Ciudad de México|México',
            VERIFACTU_DECLARACION_FECHA: '2026-10-01', VERIFACTU_DECLARACION_LUGAR: 'Ciudad de México, México' });
        const base1 = requireSifIdentity();
        assert.equal(base1.idSistemaInformatico, 'CD');
        assert.deepEqual(base1.idOtro, { codigoPais: 'MX', idType: '04', id: 'FLO010101AB1' });
        const org = 'f0f0f0f0-0000-4000-8000-000000000001';
        const full = identidadSifParaOrg(base1, { numeroInstalacion: numeroInstalacionPorOrg(base1.prefijoInstalacion, org), multiplesOT: false });
        assert.equal(full.numeroInstalacion, `CORD-${org}`, 'número de instalación por organización');
        assert.equal(full.indicadorMultiplesOT, 'N');

        // ── Declaración responsable (Orden HAC/1177/2024, art. 15) ──────────
        // Apartados 1.a–1.l en el orden de la Orden, con los textos del modelo
        // de la AEAT y la variante del 1.i para un productor sin NIF español.
        const decl = declaracionResponsable();
        assert.equal(decl.titulo, 'DECLARACIÓN RESPONSABLE DEL SISTEMA INFORMÁTICO DE FACTURACIÓN');
        assert.deepEqual(decl.apartados.map((a) => a.clave), ['1.a', '1.b', '1.c', '1.d', '1.e', '1.f', '1.g', '1.h', '1.i', '1.j', '1.k', '1.l']);
        const ap = (k) => decl.apartados.find((a) => a.clave === k);
        assert.deepEqual([ap('1.a').valor[0], ap('1.b').valor[0], ap('1.c').valor[0]], ['Cord', base1.idSistemaInformatico, base1.version], 'lo declarado es lo que viaja en SistemaInformatico');
        assert.equal(ap('1.e').valor[0], 'S - Sí');
        assert.equal(ap('1.f').valor[0], 'S - Sí');
        assert.match(ap('1.i').texto, /^Identificación de la entidad productora/);
        assert.ok(ap('1.i').valor.includes('País de emisión de la identificación: MX - México.'));
        assert.match(ap('1.k').texto, /artículo 29\.2\.j\) de la Ley 58\/2003/);
        assert.deepEqual(ap('1.l').valor, ['Fecha: 1 de octubre de 2026.', 'Lugar: Ciudad de México, México.']);
        assert.deepEqual(ap('1.j').valor, ['Av. Reforma 1', '06600 Ciudad de México', 'México']);
        assert.match(ap('1.h').texto, /^Razón social de la entidad productora/, 'un RFC de 12 caracteres es una persona moral');
        // Persona productora (nota i del modelo de la AEAT): cambian los textos.
        process.env.VERIFACTU_SIF_PRODUCTOR = 'persona';
        const declPersona = declaracionResponsable();
        const apP = (k) => declPersona.apartados.find((a) => a.clave === k);
        assert.match(apP('1.h').texto, /^Nombre y apellidos de la persona productora/);
        for (const k of ['1.i', '1.j', '1.k', '1.l']) assert.ok(!/entidad productora/.test(apP(k).texto), `${k} habla de la persona productora`);
        delete process.env.VERIFACTU_SIF_PRODUCTOR;
        const fechaOk = process.env.VERIFACTU_DECLARACION_FECHA;
        process.env.VERIFACTU_DECLARACION_FECHA = '2999-01-01';
        assert.throws(() => requireSifIdentity(), SifNotConfiguredError, 'una declaración no se suscribe en el futuro');
        process.env.VERIFACTU_DECLARACION_FECHA = '2026-02-31';
        assert.throws(() => requireSifIdentity(), SifNotConfiguredError, 'fecha que no existe');
        process.env.VERIFACTU_DECLARACION_FECHA = fechaOk;

        process.env.VERIFACTU_SIF_ID = 'C';
        assert.throws(() => requireSifIdentity(), SifNotConfiguredError, 'IdSistemaInformatico debe tener 2 posiciones');
        process.env.VERIFACTU_SIF_ID = 'CD';
        process.env.VERIFACTU_SIF_ID_OTRO_PAIS = 'ES';
        assert.throws(() => requireSifIdentity(), SifNotConfiguredError, 'IDOtro con país ES solo con pasaporte (03)');
        try { requireSifIdentity(); } catch (e) {
            assert.ok(!/VERIFACTU_/.test(e.message), 'el mensaje al usuario no nombra variables de entorno (regla 14)');
            assert.ok(/VERIFACTU_|IDOtro|ES/.test(e.detalle), 'el detalle operativo sí');
        }
    } finally {
        for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
        Object.assign(process.env, saved);
    }
}

// ── Sobres SOAP de cada variante ───────────────────────────────────────────
const H = (c) => c.repeat(64);
const chainFields = (huella, anterior = '') => ({ huella, huellaAnterior: anterior, fechaHoraHusoGenRegistro: '2026-10-07T10:00:00+02:00' });
const idPrev = { idEmisorFactura: 'B12345674', numSerieFactura: 'F2026-000001', fechaExpedicionFactura: '07-10-2026' };
const variantes = {
    f1_irpf: [{ tipo: 'alta', payload: { ...altaF1, sistemaInformatico: sifNif, ...chainFields(H('A')) }, previous: null }],
    f2_sin_destinatario: [{ tipo: 'alta', payload: { ...altaF2, numSerieFactura: 'F2026-000002', sistemaInformatico: sifNif, ...chainFields(H('B'), H('A')) }, previous: idPrev }],
    r1_diferencias: [{ tipo: 'alta', payload: { ...altaR1, sistemaInformatico: sifNif, ...chainFields(H('C'), H('B')) }, previous: idPrev }],
    r5: [{ tipo: 'alta', payload: { ...altaR5, sistemaInformatico: sifNif, ...chainFields(H('D'), H('C')) }, previous: idPrev }],
    ue_n2_productor_idotro: [{ tipo: 'alta', payload: { ...cero(clienteFR), sistemaInformatico: sifOtro, ...chainFields(H('E'), H('D')) }, previous: idPrev }],
    exportacion_e2: [{ tipo: 'alta', payload: { ...cero(clienteUS, { exemptionReason: 'E2' }), sistemaInformatico: sifNif, ...chainFields(H('F')) }, previous: null }],
    subsanacion_rechazo: [{ tipo: 'alta', payload: { ...construirAlta(base({ correccion: { rechazoPrevio: 'X' } })), sistemaInformatico: sifNif, ...chainFields(H('0'), H('F')) }, previous: idPrev }],
    anulacion: [{ tipo: 'anulacion', payload: { idEmisorFacturaAnulada: 'B12345674', numSerieFacturaAnulada: 'F2026-000001', fechaExpedicionFacturaAnulada: '07-10-2026', nombreRazonEmisor: emisor.legalName, sistemaInformatico: sifNif, ...chainFields(H('1'), H('0')) }, previous: idPrev }],
    anulacion_sin_registro_previo: [{ tipo: 'anulacion', payload: { idEmisorFacturaAnulada: 'B12345674', numSerieFacturaAnulada: 'F2026-000001', fechaExpedicionFacturaAnulada: '07-10-2026', sinRegistroPrevio: 'S', rechazoPrevio: 'S', sistemaInformatico: sifNif, ...chainFields(H('2'), H('1')) }, previous: idPrev }],
};
// Lote mixto: alta y su anulación en el mismo envío (RegistroFactura distintos).
variantes.lote_mixto = [...variantes.f1_irpf, ...variantes.anulacion];

for (const [nombre, registros] of Object.entries(variantes)) {
    for (const r of registros) {
        const problemas = r.tipo === 'alta' ? problemasEsquemaAlta(r.payload) : problemasEsquemaAnulacion(r.payload);
        assert.deepEqual(problemas, [], `la variante ${nombre} no debe tener problemas de esquema: ${problemas.join('; ')}`);
    }
}
// Un payload heredado roto se detecta antes de mandarlo (y se aparca).
assert.ok(problemasEsquemaAlta({ ...variantes.f1_irpf[0].payload, idEmisorFactura: 'ESB12345674' }).some((p) => /IDEmisorFactura/.test(p)));
assert.ok(problemasEsquemaAlta({ ...variantes.f1_irpf[0].payload, desglose: Array(13).fill(altaF1.desglose[0]) }).some((p) => /Desglose/.test(p)));

const emisorDe = (registros) => {
    const p = registros[0].payload;
    return { nif: p.idEmisorFactura ?? p.idEmisorFacturaAnulada, nombreRazon: p.nombreRazonEmisor ?? 'ACME' };
};
const sobres = Object.fromEntries(Object.entries(variantes).map(([n, regs]) => [n, buildEnvelope(emisorDe(regs), regs)]));
assert.throws(() => buildEnvelope({ nif: 'A58818501', nombreRazon: 'Otro' }, variantes.f1_irpf), /mismo obligado/,
    'la cabecera sale del NIF de los propios registros (error 1108)');
{
    const xml = sobres.r1_diferencias;
    const orden = ['NombreRazonEmisor', 'TipoFactura', 'TipoRectificativa', 'FacturasRectificadas', 'DescripcionOperacion', 'Destinatarios', 'Desglose'];
    const pos = orden.map((t) => xml.indexOf(`<sum1:${t}>`));
    assert.ok(pos.every((p, i) => p > 0 && (i === 0 || p > pos[i - 1])), 'orden de RegistroFacturacionAltaType');
    assert.ok(sobres.subsanacion_rechazo.indexOf('<sum1:Subsanacion>S') < sobres.subsanacion_rechazo.indexOf('<sum1:TipoFactura>'), 'Subsanacion/RechazoPrevio van antes de TipoFactura');
    assert.ok(sobres.f2_sin_destinatario.includes('<sum1:FacturaSinIdentifDestinatarioArt61d>S</sum1:FacturaSinIdentifDestinatarioArt61d>'));
    assert.ok(!sobres.f2_sin_destinatario.includes('<sum1:Destinatarios>'));
    assert.ok(sobres.ue_n2_productor_idotro.includes('<sum1:IDOtro><sum1:CodigoPais>MX</sum1:CodigoPais><sum1:IDType>04</sum1:IDType>'));
    assert.ok(sobres.f1_irpf.includes('<soapenv:Header/>'), 'autenticación 100% mTLS: Header SOAP vacío');
}

// ── 2. Validación contra los XSD oficiales ─────────────────────────────────
{
    let xmllint = true;
    try { execFileSync('xmllint', ['--version'], { stdio: 'ignore' }); } catch { xmllint = false; }
    if (!xmllint) {
        if (process.env.VERIFACTU_XSD_REQUIRED === '1') throw new Error('xmllint no está disponible y VERIFACTU_XSD_REQUIRED=1');
        process.stdout.write('security:verifactu: AVISO — xmllint no está instalado; se omite la validación contra los XSD oficiales.\n');
    } else {
        const dir = mkdtempSync(join(tmpdir(), 'verifactu-xsd-'));
        try {
            const validar = (nombre, envelope) => {
                const inicio = envelope.indexOf('<sum:RegFactuSistemaFacturacion>');
                const fin = envelope.indexOf('</soapenv:Body>');
                const inner = envelope.slice(inicio, fin).replace('<sum:RegFactuSistemaFacturacion>',
                    '<sum:RegFactuSistemaFacturacion xmlns:sum="https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroLR.xsd" xmlns:sum1="https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroInformacion.xsd">');
                const file = join(dir, `${nombre}.xml`);
                writeFileSync(file, `<?xml version="1.0" encoding="UTF-8"?>${inner}`);
                try {
                    execFileSync('xmllint', ['--noout', '--nonet', '--schema', join(XSD_DIR, 'SuministroLR.xsd'), file], { stdio: 'pipe' });
                    return null;
                } catch (error) {
                    return String(error.stderr || error.message);
                }
            };
            for (const [nombre, xml] of Object.entries(sobres)) {
                const err = validar(nombre, xml);
                assert.equal(err, null, `la variante ${nombre} no cumple SuministroLR.xsd:\n${err}`);
            }
            // El validador de verdad detecta lo que se rompe: control negativo.
            const roto = buildEnvelope({ nif: 'ESB12345674', nombreRazon: 'ACME' },
                [{ ...variantes.f1_irpf[0], payload: { ...variantes.f1_irpf[0].payload, idEmisorFactura: 'ESB12345674' } }]);
            assert.notEqual(validar('control_negativo', roto), null, 'un NIF de 11 caracteres debe romper el esquema (prueba de que xmllint valida de verdad)');
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    }
}

// ── Respuesta de la AEAT ───────────────────────────────────────────────────
{
    const linea = (num, op, estado, extra = '') => `<sfR:RespuestaLinea>
        <sfR:IDFactura><sf:IDEmisorFactura>B12345674</sf:IDEmisorFactura><sf:NumSerieFactura>${num}</sf:NumSerieFactura><sf:FechaExpedicionFactura>07-10-2026</sf:FechaExpedicionFactura></sfR:IDFactura>
        <sfR:Operacion><sf:TipoOperacion>${op}</sf:TipoOperacion></sfR:Operacion>
        <sfR:EstadoRegistro>${estado}</sfR:EstadoRegistro>${extra}
      </sfR:RespuestaLinea>`;
    const respXml = `<?xml version="1.0" encoding="UTF-8"?>
<env:Envelope xmlns:env="http://schemas.xmlsoap.org/soap/envelope/" xmlns:sfR="https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/RespuestaSuministro.xsd" xmlns:sf="https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroInformacion.xsd">
  <env:Body>
    <sfR:RespuestaRegFactuSistemaFacturacion>
      <sfR:CSV>CSV123456</sfR:CSV>
      <sfR:TiempoEsperaEnvio>90</sfR:TiempoEsperaEnvio>
      <sfR:EstadoEnvio>ParcialmenteCorrecto</sfR:EstadoEnvio>
      ${linea('F2026-000001', 'Alta', 'Incorrecto', '<sfR:CodigoErrorRegistro>3000</sfR:CodigoErrorRegistro><sfR:DescripcionErrorRegistro>Registro de facturación duplicado.</sfR:DescripcionErrorRegistro><sfR:RegistroDuplicado><sf:IdPeticionRegistroDuplicado>123</sf:IdPeticionRegistroDuplicado><sf:EstadoRegistroDuplicado>AceptadaConErrores</sf:EstadoRegistroDuplicado></sfR:RegistroDuplicado>')}
      ${linea('F2026-000001', 'Anulacion', 'Correcto')}
    </sfR:RespuestaRegFactuSistemaFacturacion>
  </env:Body>
</env:Envelope>`;
    const respuesta = await parseRespuesta(respXml);
    assert.equal(respuesta.estadoEnvio, 'ParcialmenteCorrecto');
    assert.equal(respuesta.csv, 'CSV123456');
    assert.equal(respuesta.tiempoEsperaEnvio, 90);
    assert.equal(segundosDeEspera(respuesta), 90);
    assert.equal(segundosDeEspera(null), 60, 'sin dato, 60 s (valor inicial de la Orden)');
    assert.equal(respuesta.lineas[0].tipoOperacion, 'Alta');
    assert.equal(respuesta.lineas[0].registroDuplicado.estado, 'AceptadaConErrores');

    // Alta + su anulación en el mismo lote: cada uno con SU línea.
    const pendientes = [
        { id: 'a', tipo: 'alta', seq: 5, payload: variantes.f1_irpf[0].payload },
        { id: 'b', tipo: 'anulacion', seq: 6, payload: variantes.anulacion[0].payload },
        { id: 'c', tipo: 'alta', seq: 7, payload: variantes.f2_sin_destinatario[0].payload },
    ];
    const grupo = primerGrupo(pendientes, idPrev, { max: 1000, entornoPorDefecto: 'pruebas', nombrePorDefecto: 'ACME' });
    assert.equal(grupo.filas.length, 3);
    assert.deepEqual(grupo.registros[1].previous, idPrev, 'el anterior de la anulación es el alta previa del lote');
    const resol = Object.fromEntries(resolverRespuesta(grupo, respuesta).map((r) => [r.fila.id, r.estado]));
    assert.equal(resol.a, 'aceptado_con_errores', '3000 duplicado = lo que la AEAT ya tiene, no un rechazo');
    assert.equal(resol.b, 'aceptado', 'la anulación no se pisa con la línea del alta');
    assert.equal(resol.c, 'pendiente', 'sin línea de respuesta sigue pendiente (reintentable)');

    // Un tramo se corta en el cambio de NIF o de entorno.
    const otroNif = { ...variantes.f1_irpf[0].payload, idEmisorFactura: 'A58818501' };
    assert.equal(primerGrupo([...pendientes.slice(0, 1), { id: 'd', tipo: 'alta', seq: 6, payload: otroNif }], null,
        { max: 1000, entornoPorDefecto: 'pruebas', nombrePorDefecto: '' }).filas.length, 1);

    // SoapFault: clasificación y aislamiento.
    const faultXml = (code, msg) => `<?xml version="1.0" encoding="UTF-8"?><env:Envelope xmlns:env="http://schemas.xmlsoap.org/soap/envelope/"><env:Body><env:Fault><faultcode>env:${code}</faultcode><faultstring>${msg}</faultstring></env:Fault></env:Body></env:Envelope>`;
    let fault;
    try { await parseRespuesta(faultXml('Client', 'Codigo[4102].El XML no cumple el esquema.')); } catch (e) { fault = e; }
    assert.ok(fault instanceof AeatFaultError);
    assert.equal(fault.codigo, 4102);
    assert.equal(clasificarFallo(fault), 'aislable', 'esquema roto: se parte el lote para aislar al culpable');
    let cab;
    try { await parseRespuesta(faultXml('Client', 'Codigo[4104].El NIF del titular en la cabecera no está identificado.')); } catch (e) { cab = e; }
    assert.equal(clasificarFallo(cab), 'cabecera', 'cabecera/certificado: no se aparca ningún registro');
    let srv;
    try { await parseRespuesta(faultXml('Server', 'Error interno')); } catch (e) { srv = e; }
    assert.equal(clasificarFallo(srv), 'transitorio');
    assert.equal(clasificarFallo(new Error('ECONNRESET')), 'transitorio');
    assert.equal(loteTrasFallo(100), 50);
    assert.equal(loteTrasFallo(1), 1);
}

process.stdout.write('security:verifactu (huella, QR, registros, esquema XSD y respuesta de la AEAT contra las fuentes oficiales) OK\n');

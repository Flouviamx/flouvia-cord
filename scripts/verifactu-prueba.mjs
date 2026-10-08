#!/usr/bin/env node
// Prueba de Verifactu contra el PORTAL DE PRUEBAS EXTERNAS de la AEAT.
//
//   npm run verifactu:prueba -- --solo-xml
//       Genera el envío y lo valida contra los XSD oficiales. No necesita
//       certificado ni red: sirve para revisar la identidad del software antes
//       de tener un certificado.
//
//   VERIFACTU_PRUEBA_PASSWORD='…' npm run verifactu:prueba -- \
//       --p12 ruta/certificado.p12 --nif 12345678Z --nombre "Nombre del titular"
//       Envía al entorno de PRUEBAS tres registros encadenados: dos altas de
//       facturas simplificadas (F2) y la anulación de la segunda. Imprime la
//       respuesta línea por línea y las URL del QR para cotejarlas en la sede.
//
// Opcional: --cliente-nif B12345674 --cliente-nombre "Cliente SL" convierte la
// segunda alta en una factura completa (F1) con destinatario.
//
// Nunca toca la base de datos ni el entorno de PRODUCCIÓN: el entorno está
// fijado a 'pruebas' y no hay opción para cambiarlo. La identidad del
// software (VERIFACTU_SIF_*, VERIFACTU_DECLARACION_*) se lee del entorno —
// los mismos valores que en producción— o de un archivo .env en la raíz.
//
// El certificado es el de la persona o entidad cuyo NIF va en --nif (el
// "obligado a expedir"): la AEAT exige que el titular del certificado sea el
// obligado o esté apoderado para remitir sus facturas. La contraseña viaja
// por variable de entorno para que no quede en el historial del shell.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { huellaAlta, huellaAnulacion, fechaExpedicionAEAT, fechaHoraHusoAEAT } from '../src/lib/fiscal/verifactu/huella.ts';
import { buildEnvelope, submitToAeat, AeatCertificadoError, AeatFaultError, AeatTransitoryError } from '../src/lib/fiscal/verifactu/aeat.ts';
import { construirAlta, problemasEsquemaAlta, problemasEsquemaAnulacion } from '../src/lib/fiscal/verifactu/registro.ts';
import { identidadSifParaOrg, numeroInstalacionPorOrg, requireSifIdentity, SifNotConfiguredError } from '../src/lib/fiscal/verifactu/sif.ts';
import { verifactuQrUrl } from '../src/lib/fiscal/verifactu/qr.ts';
import { credencialesTls, parsePkcs12, InvalidCertificateError } from '../src/lib/fiscal/verifactu/cert.ts';
import { normalizarNifEs, nifEsValido } from '../src/lib/fiscal/verifactu/validacion.ts';

const ENTORNO = 'pruebas';
const XSD_DIR = fileURLToPath(new URL('./fixtures/aeat/', import.meta.url));

const { values: args } = parseArgs({
    options: {
        'p12': { type: 'string' },
        'nif': { type: 'string' },
        'nombre': { type: 'string' },
        'cliente-nif': { type: 'string' },
        'cliente-nombre': { type: 'string' },
        'solo-xml': { type: 'boolean', default: false },
        'salida': { type: 'string' },
    },
});

const out = (s = '') => process.stdout.write(`${s}\n`);
const fallo = (s) => { process.stderr.write(`\nERROR: ${s}\n`); process.exit(1); };

// ── 1. Identidad del software y declaración responsable ────────────────────
let base;
try {
    base = requireSifIdentity();
} catch (error) {
    if (error instanceof SifNotConfiguredError) fallo(`identidad del software incompleta.\n  ${error.detalle}`);
    throw error;
}
const sistemaInformatico = identidadSifParaOrg(base, {
    // Instalación propia de la prueba: no se mezcla con ninguna organización real.
    numeroInstalacion: numeroInstalacionPorOrg(base.prefijoInstalacion, 'PRUEBA-AEAT'),
    multiplesOT: false,
});
out('Identidad del software (SistemaInformatico):');
out(`  Productor:   ${base.nombreRazon}`);
out(`  Identific.:  ${base.nif ? `NIF ${base.nif}` : `IDOtro ${base.idOtro.codigoPais} / tipo ${base.idOtro.idType} / ${base.idOtro.id}`}`);
out(`  Sistema:     ${base.nombreSistemaInformatico} (${base.idSistemaInformatico}) versión ${base.version}`);
out(`  Instalación: ${sistemaInformatico.numeroInstalacion}`);

// ── 2. Obligado y certificado ──────────────────────────────────────────────
const soloXml = args['solo-xml'];
let credenciales = null;
let nif = args.nif ? normalizarNifEs(args.nif) : '';
let nombre = (args.nombre || '').trim();
if (soloXml) {
    // Sin certificado: un obligado de ejemplo con NIF válido, solo para el esquema.
    nif ||= 'B12345674';
    nombre ||= 'Empresa de prueba SL';
} else {
    if (!args.p12) fallo('falta --p12 (ruta del certificado .p12/.pfx). Usa --solo-xml para probar sin certificado.');
    const password = process.env.VERIFACTU_PRUEBA_PASSWORD;
    if (!password) fallo('falta la contraseña del certificado en VERIFACTU_PRUEBA_PASSWORD.');
    let p12;
    try { p12 = readFileSync(args.p12); } catch { fallo(`no se pudo leer ${args.p12}`); }
    let parsed;
    try {
        parsed = parsePkcs12(new Uint8Array(p12), password);
        credenciales = credencialesTls(p12, password);
    } catch (error) {
        if (error instanceof InvalidCertificateError) fallo(`certificado no válido: ${error.message}`);
        throw error;
    }
    out('\nCertificado:');
    out(`  Titular:  ${parsed.subjectCN || '(sin nombre común)'}`);
    out(`  NIF:      ${parsed.nifs.join(', ') || '(no declara NIF español)'}`);
    out(`  Caduca:   ${parsed.expiresAt.toISOString().slice(0, 10)}`);
    if (parsed.expiresAt.getTime() <= Date.now()) fallo('el certificado está caducado.');
    nif ||= parsed.nifs[0] || '';
    if (!nif) fallo('falta --nif (el NIF del obligado; el certificado no declara ninguno).');
    if (!nombre) fallo('falta --nombre (nombre o razón social del obligado, tal como consta en la AEAT).');
    if (parsed.nifs.length && !parsed.nifs.includes(nif)) {
        out(`  AVISO: el NIF ${nif} no es el del certificado. La AEAT solo lo acepta si el titular está apoderado.`);
    }
}
if (!nifEsValido(nif)) fallo(`el NIF ${nif} no es un NIF español válido.`);

// ── 3. Tres registros encadenados ──────────────────────────────────────────
const ahora = new Date();
const sello = ahora.toISOString().replace(/\D/g, '').slice(2, 14);
const fechaExpedicion = fechaExpedicionAEAT(ahora);
const linea = (base) => ({
    description: 'Servicio de prueba Verifactu', quantity: 1, unitPrice: base, taxRate: 0.21,
    subtotal: base, taxAmount: Math.round(base * 21) / 100, total: Math.round(base * 121) / 100,
});
const totales = (l) => ({ subtotal: l.subtotal, taxes: l.taxAmount, total: l.total, currency: 'EUR' });
const emisor = { legalName: nombre, taxId: nif };
const cliente = args['cliente-nif']
    ? { legalName: args['cliente-nombre'] || 'Cliente de prueba', taxId: args['cliente-nif'], address: { countryCode: 'ES' } }
    : { legalName: '', address: { countryCode: 'ES' } };

const registros = [];
let anterior = null; // { huella, identidad }

function encadenarAlta(numSerie, receptor, l) {
    const alta = construirAlta({
        emisor, receptor, numSerie, fechaExpedicion, lines: [l], totals: totales(l), entorno: ENTORNO,
    });
    const fechaHoraHusoGenRegistro = fechaHoraHusoAEAT(new Date());
    const huellaAnterior = anterior?.huella ?? '';
    const huella = huellaAlta({ ...alta, huellaAnterior: huellaAnterior || null, fechaHoraHusoGenRegistro });
    const payload = { ...alta, sistemaInformatico, emitidaAt: ahora.toISOString(), huellaAnterior, huella, fechaHoraHusoGenRegistro };
    const problemas = problemasEsquemaAlta(payload);
    if (problemas.length) fallo(`el alta ${numSerie} no cumple el esquema: ${problemas.join('; ')}`);
    registros.push({ tipo: 'alta', payload, previous: anterior?.identidad ?? null });
    anterior = { huella, identidad: { idEmisorFactura: alta.idEmisorFactura, numSerieFactura: alta.numSerieFactura, fechaExpedicionFactura: alta.fechaExpedicionFactura } };
    return payload;
}

function encadenarAnulacion(alta) {
    const input = {
        idEmisorFacturaAnulada: alta.idEmisorFactura,
        numSerieFacturaAnulada: alta.numSerieFactura,
        fechaExpedicionFacturaAnulada: alta.fechaExpedicionFactura,
        nombreRazonEmisor: alta.nombreRazonEmisor,
        entorno: ENTORNO,
        sistemaInformatico,
    };
    const fechaHoraHusoGenRegistro = fechaHoraHusoAEAT(new Date());
    const huellaAnterior = anterior?.huella ?? '';
    const huella = huellaAnulacion({ ...input, huellaAnterior: huellaAnterior || null, fechaHoraHusoGenRegistro });
    const payload = { ...input, huellaAnterior, huella, fechaHoraHusoGenRegistro };
    const problemas = problemasEsquemaAnulacion(payload);
    if (problemas.length) fallo(`la anulación no cumple el esquema: ${problemas.join('; ')}`);
    registros.push({ tipo: 'anulacion', payload, previous: anterior?.identidad ?? null });
    anterior = { huella, identidad: { idEmisorFactura: input.idEmisorFacturaAnulada, numSerieFactura: input.numSerieFacturaAnulada, fechaExpedicionFactura: input.fechaExpedicionFacturaAnulada } };
    return payload;
}

const serie = `PRUEBA${base.idSistemaInformatico}${sello}`;
const alta1 = encadenarAlta(`${serie}-1`, { legalName: '', address: { countryCode: 'ES' } }, linea(100));
const alta2 = encadenarAlta(`${serie}-2`, cliente, linea(250));
encadenarAnulacion(alta2);

out(`\nRegistros (${registros.length}), serie ${serie}:`);
for (const r of registros) {
    const p = r.payload;
    out(r.tipo === 'alta'
        ? `  alta      ${p.numSerieFactura}  ${p.tipoFactura}  total ${p.importeTotal} EUR  huella ${p.huella.slice(0, 16)}…`
        : `  anulación ${p.numSerieFacturaAnulada}                     huella ${p.huella.slice(0, 16)}…`);
}

const envelope = buildEnvelope({ nif, nombreRazon: nombre }, registros);

// ── 4. Esquema oficial (si hay xmllint) ────────────────────────────────────
let xmllint = true;
try { execFileSync('xmllint', ['--version'], { stdio: 'ignore' }); } catch { xmllint = false; }
if (xmllint) {
    const dir = mkdtempSync(join(tmpdir(), 'verifactu-prueba-'));
    try {
        const inicio = envelope.indexOf('<sum:RegFactuSistemaFacturacion>');
        const fin = envelope.indexOf('</soapenv:Body>');
        const inner = envelope.slice(inicio, fin).replace('<sum:RegFactuSistemaFacturacion>',
            '<sum:RegFactuSistemaFacturacion xmlns:sum="https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroLR.xsd" xmlns:sum1="https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroInformacion.xsd">');
        const file = join(dir, 'envio.xml');
        writeFileSync(file, `<?xml version="1.0" encoding="UTF-8"?>${inner}`);
        try {
            execFileSync('xmllint', ['--noout', '--nonet', '--schema', join(XSD_DIR, 'SuministroLR.xsd'), file], { stdio: 'pipe' });
            out('\nEsquema: el envío cumple los XSD oficiales de la AEAT.');
        } catch (error) {
            fallo(`el envío NO cumple los XSD oficiales:\n${String(error.stderr || error.message)}`);
        }
    } finally { rmSync(dir, { recursive: true, force: true }); }
} else {
    out('\nEsquema: AVISO — xmllint no está instalado; no se validó contra los XSD.');
}

if (soloXml) {
    const salida = args.salida || 'verifactu-prueba.xml';
    writeFileSync(salida, envelope);
    out(`\nEnvío guardado en ${salida}. No se mandó nada a la AEAT (--solo-xml).`);
    process.exit(0);
}

// ── 5. Envío al portal de pruebas ──────────────────────────────────────────
out('\nEnviando al portal de pruebas de la AEAT…');
let respuesta;
try {
    respuesta = await submitToAeat({ nif, nombreRazon: nombre }, registros, { entorno: ENTORNO, credenciales, timeoutMs: 60_000 });
} catch (error) {
    if (error instanceof AeatCertificadoError) fallo(`${error.message}\n  En el portal de pruebas también hace falta un certificado reconocido (por ejemplo, de la FNMT); uno autofirmado no sirve.`);
    if (error instanceof AeatFaultError) fallo(`la AEAT rechazó el envío completo (${error.faultcode}${error.codigo ? ` ${error.codigo}` : ''}):\n  ${error.faultstring}`);
    if (error instanceof AeatTransitoryError) fallo(`no hubo respuesta válida de la AEAT: ${error.message}`);
    throw error;
}

out(`\nRespuesta: ${respuesta.estadoEnvio}${respuesta.csv ? `  CSV ${respuesta.csv}` : ''}  (espera ${respuesta.tiempoEsperaEnvio ?? '?'} s antes del siguiente envío)`);
let todoBien = true;
for (const l of respuesta.lineas) {
    const ok = l.estado === 'Correcto' || l.estado === 'AceptadoConErrores';
    if (!ok) todoBien = false;
    out(`  ${l.tipoOperacion?.padEnd(9) ?? ''} ${l.numSerieFactura}  ${l.estado}${l.codigoError ? `  [${l.codigoError}] ${l.descripcionError || ''}` : ''}`);
}
if (respuesta.lineas.length !== registros.length) {
    todoBien = false;
    out(`  AVISO: se enviaron ${registros.length} registros y la AEAT respondió ${respuesta.lineas.length} líneas.`);
}

out('\nCotejo del QR en la sede de pruebas (abre cada URL en el navegador):');
for (const p of [alta1, alta2]) {
    out(`  ${p.numSerieFactura}: ${verifactuQrUrl({ nif: p.idEmisorFactura, numSerie: p.numSerieFactura, fecha: p.fechaExpedicionFactura, importeTotal: p.importeTotal }, { entorno: ENTORNO })}`);
}
out(`\n${todoBien ? 'RESULTADO: la AEAT aceptó los registros.' : 'RESULTADO: hay registros rechazados; revisa los códigos de arriba.'}`);
process.exit(todoBien ? 0 : 2);

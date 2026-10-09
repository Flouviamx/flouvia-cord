#!/usr/bin/env node
// Prueba de la factura electrónica con el SII contra CERTIFICACIÓN (maullin).
//
//   npm run sii:prueba
//       Sin certificado: pide una semilla (CrSeed). Sirve para comprobar la
//       red y el TLS hasta maullin.sii.cl.
//
//   SII_PRUEBA_PASSWORD='…' npm run sii:prueba -- --p12 ruta/certificado.pfx \
//       [--rut-firmante 11111111-1] [--rut-emisor 76123456-0 --track-id 123456]
//
//       Firma la semilla y pide un token (GetTokenFromSeed). Un certificado que
//       el SII no tiene registrado responde 10; una firma inválida, 11. Con
//       --track-id consulta el estado de ese envío (QueryEstUp).
//
//   … --emitir --caf ruta/caf-33.xml --folio N --rut-emisor 76123456-0 \
//       --razon-social 'EMPRESA SPA' --giro 'GIRO' --acteco 620200 \
//       --direccion 'CALLE 123' --comuna 'SANTIAGO' --resolucion-fecha AAAA-MM-DD \
//       --receptor-rut 77777777-7 [--receptor-razon 'CLIENTE DE PRUEBA'] \
//       [--salida ruta/envio.xml]
//
//       Arma una factura 33 de prueba (1 servicio de $ 10.000 + IVA 19 %) con
//       el folio N del CAF de certificación, la timbra, la firma, la sube con
//       DTEUpload y consulta su estado. El folio lo elige quien corre la
//       prueba: el script no toca la base de datos y no sabe cuáles ya se
//       usaron; un folio repetido el SII lo rechaza.
//
// Nunca toca la base de datos ni PRODUCCIÓN: el entorno está fijado a
// 'homologacion' (maullin.sii.cl) y no hay opción para cambiarlo. El número de
// resolución en certificación es 0.
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { parsearCertificado } from '../src/lib/fiscal/latam/certificado.ts';
import { rutDelCertificado } from '../src/lib/fiscal/latam/sii/certificado.ts';
import { decodificarArchivo, parsearCaf } from '../src/lib/fiscal/latam/sii/caf.ts';
import { armarBorrador } from '../src/lib/fiscal/latam/sii/dte.ts';
import { emitirDocumento } from '../src/lib/fiscal/latam/sii/emision.ts';
import { bytesEnvio, semillaFirmada } from '../src/lib/fiscal/latam/sii/envio.ts';
import { siiEndpoints } from '../src/lib/fiscal/latam/sii/constantes.ts';
import { fechaChile, rutValido } from '../src/lib/fiscal/latam/sii/texto.ts';
import { faseEnvio, mensajeToken, mensajeUpload } from '../src/lib/fiscal/latam/sii/errores.ts';
import { llamarSii, parsearRespuesta, sobreEstadoEnvio, sobreSemilla, sobreToken, subirEnvio } from '../src/lib/fiscal/latam/sii/ws.ts';

const ENTORNO = 'homologacion';

const { values: args } = parseArgs({
    options: {
        p12: { type: 'string' },
        'rut-firmante': { type: 'string' },
        'rut-emisor': { type: 'string' },
        'track-id': { type: 'string' },
        emitir: { type: 'boolean', default: false },
        caf: { type: 'string' },
        folio: { type: 'string' },
        'razon-social': { type: 'string' },
        giro: { type: 'string' },
        acteco: { type: 'string' },
        direccion: { type: 'string' },
        comuna: { type: 'string' },
        'resolucion-fecha': { type: 'string' },
        'receptor-rut': { type: 'string' },
        'receptor-razon': { type: 'string', default: 'CLIENTE DE PRUEBA' },
        salida: { type: 'string' },
    },
});

const linea = (t = '') => process.stdout.write(`${t}\n`);
const fallar = (m) => { process.stderr.write(`sii:prueba: ${m}\n`); process.exit(1); };

linea(`Entorno: certificación (${new URL(siiEndpoints(ENTORNO).semilla).host})`);
const semilla = await parsearRespuesta(await llamarSii(ENTORNO, 'getSeed', sobreSemilla()), 'getSeed');
linea(`CrSeed: estado ${semilla.estado}, semilla ${semilla.campos.SEMILLA ?? '-'}`);
if (semilla.estado !== '00' || !semilla.campos.SEMILLA) fallar('el SII no entregó una semilla.');
if (!args.p12) {
    linea('Sin certificado: nada más que probar. Usa --p12 (y SII_PRUEBA_PASSWORD).');
    process.exit(0);
}

// ── Certificado y token ──────────────────────────────────────────────────────
const cert = parsearCertificado({ pkcs12: readFileSync(args.p12), pkcs12Password: process.env.SII_PRUEBA_PASSWORD ?? '' });
const rutCert = rutDelCertificado(cert.certPem);
const rutFirmante = rutValido(args['rut-firmante']) ?? rutCert;
linea(`Certificado: ${cert.sujetoCN ?? '(sin CN)'} · RUT ${rutCert ?? '(no lo declara)'} · emitido por ${cert.emisorCN ?? '?'} · vence ${cert.caduca.toISOString().slice(0, 10)}`);
if (!rutFirmante) fallar('el certificado no declara el RUT del titular: pásalo con --rut-firmante.');
const clave = { certPem: cert.certPem, keyPem: cert.keyPem };
const token = await parsearRespuesta(await llamarSii(ENTORNO, 'getToken', sobreToken(semillaFirmada(semilla.campos.SEMILLA, clave))), 'getToken');
linea(`GetTokenFromSeed: estado ${token.estado}${token.glosa ? ` (${token.glosa})` : ''}`);
if (token.estado !== '00' || !token.campos.TOKEN) fallar(`sin token: ${mensajeToken(token.estado)}`);
const tok = token.campos.TOKEN;

const consultarEnvio = async (rutEmisor, trackId) => {
    const r = await parsearRespuesta(await llamarSii(ENTORNO, 'getEstUp', sobreEstadoEnvio(rutEmisor, trackId, tok)), 'getEstUp');
    const c = r.campos;
    linea(`QueryEstUp ${trackId}: ${r.estado} (${faseEnvio(r.estado)})${r.glosa ? ` ${r.glosa}` : ''}`
        + `${c.ACEPTADOS !== undefined ? ` · aceptados ${c.ACEPTADOS}, rechazados ${c.RECHAZADOS ?? '-'}, reparos ${c.REPAROS ?? '-'}` : ''}`);
    return r;
};

if (args['track-id']) {
    const rutEmisor = rutValido(args['rut-emisor']);
    if (!rutEmisor) fallar('--track-id necesita --rut-emisor.');
    await consultarEnvio(rutEmisor, args['track-id']);
}

// ── Emisión de prueba ────────────────────────────────────────────────────────
if (args.emitir) {
    const rutEmisor = rutValido(args['rut-emisor']);
    const receptorRut = rutValido(args['receptor-rut']);
    const folio = Number(args.folio);
    const acteco = String(args.acteco ?? '').split(/[\s,]+/).filter(Boolean).map(Number);
    const fechaResolucion = String(args['resolucion-fecha'] ?? '');
    if (!rutEmisor || !receptorRut) fallar('--emitir necesita --rut-emisor y --receptor-rut válidos.');
    if (!args.caf || !Number.isInteger(folio) || folio < 1) fallar('--emitir necesita --caf y --folio.');
    if (!args['razon-social'] || !args.giro || !args.direccion || !args.comuna || !acteco.length) fallar('--emitir necesita --razon-social, --giro, --acteco, --direccion y --comuna.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaResolucion)) fallar('--resolucion-fecha debe ser AAAA-MM-DD.');

    const caf = parsearCaf(decodificarArchivo(readFileSync(args.caf)), rutEmisor);
    if (caf.tipo !== 33) fallar(`el CAF es de tipo ${caf.tipo}; esta prueba emite una factura 33.`);
    if (folio < caf.desde || folio > caf.hasta) fallar(`el folio ${folio} no está en el rango del CAF (${caf.desde}–${caf.hasta}).`);
    const borrador = armarBorrador({
        emisor: { rut: rutEmisor, razonSocial: args['razon-social'], giro: args.giro, acteco, direccion: args.direccion, comuna: args.comuna },
        receptor: { rut: receptorRut, razonSocial: args['receptor-razon'], giro: 'PRUEBA', direccion: 'DIRECCION DE PRUEBA', comuna: 'SANTIAGO', pais: 'CL' },
        fechaEmision: fechaChile(new Date()),
        lineas: [{ description: 'Servicio de prueba de certificación', quantity: 1, unitPrice: 10000, taxRate: 0.19, subtotal: 10000, taxAmount: 1900, total: 11900 }],
        totales: { subtotal: 10000, taxes: 1900, total: 11900, currency: 'CLP' },
    });
    const doc = emitirDocumento(borrador, {
        folio, cafXml: caf.cafXml, llavePrivadaPem: caf.llavePrivadaPem, tipo: 33, desde: caf.desde, hasta: caf.hasta, fechaAutorizacion: caf.fechaAutorizacion,
    }, clave, { rutEmisor, rutEnvia: rutFirmante, resolucion: { numero: 0, fecha: fechaResolucion } }, new Date());
    if (args.salida) {
        writeFileSync(args.salida, bytesEnvio(doc.envioXml));
        linea(`Envío escrito en ${args.salida}`);
    }
    const nombre = `${rutEmisor}_${doc.id}.xml`;
    const r = await subirEnvio(ENTORNO, tok, rutFirmante, rutEmisor, nombre, bytesEnvio(doc.envioXml));
    linea(`DTEUpload: STATUS ${r.status}${r.trackId ? ` · trackid ${r.trackId}` : ''}${r.detalle.length ? ` · ${r.detalle.join(' | ')}` : ''}`);
    if (r.status !== 0 || !r.trackId) fallar(mensajeUpload(r.status));
    // El SII valida en segundos o minutos; se consulta unas veces.
    for (let i = 0; i < 6; i++) {
        await new Promise((ok) => setTimeout(ok, 5000));
        const estado = await consultarEnvio(rutEmisor, r.trackId);
        if (faseEnvio(estado.estado) !== 'en_proceso') break;
    }
    linea(`Factura de prueba ${doc.id}: revisa el detalle en www.sii.cl › Factura electrónica › Sistema de certificación.`);
}

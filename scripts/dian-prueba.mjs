#!/usr/bin/env node
// Prueba de la factura electrónica con la DIAN contra HABILITACIÓN.
//
//   npm run dian:prueba
//       Sin certificado: firma un GetStatus con una cadena de PRUEBA y lo envía
//       al ambiente de habilitación. La DIAN responde con un fault de
//       certificado no avalado: sirve para comprobar la red, el TLS y que el
//       servicio responde (no valida nada fiscal).
//
//   DIAN_PRUEBA_PASSWORD='…' DIAN_PRUEBA_PIN='12345' DIAN_PRUEBA_CLAVE_TECNICA='…' \
//   npm run dian:prueba -- --p12 ruta/certificado.p12 [--cadena ruta/cadena.pem] \
//       --nit 900373076 --razon-social "Mi Empresa S.A.S." --municipio 11001 --direccion "Calle 1 # 2-3" \
//       --software-id xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx --test-set-id xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx \
//       --resolucion 18760000001 --prefijo SETP --desde 990000000 --hasta 995000000 \
//       --vigente-desde 2019-01-19 --vigente-hasta 2030-01-19 \
//       [--responsabilidades O-13,O-23] [--tributo 01] [--persona 1] [--prefijo-notas NC] \
//       [--numero 990000001] [--numero-nota 1] [--facturas 2 --notas-credito 1 --notas-debito 1] \
//       [--enviar] [--estado <zipKey>]
//
//       Arma y firma el set de pruebas con los datos del facturador (los del
//       portal de habilitación: software, PIN, TestSetId y el rango de pruebas
//       con su clave técnica). Sin --enviar se queda en local: valida cada
//       documento contra los XSD oficiales (si hay xmllint) y deja los XML en
//       un directorio temporal. Con --enviar los manda con SendTestSetAsync y
//       consulta cada ZipKey con GetStatusZip. --estado consulta un ZipKey.
//
// Nunca toca la base de datos ni PRODUCCIÓN: el entorno está fijado a
// 'homologacion' y SendTestSetAsync solo existe en habilitación. El
// certificado debe ser el de firma del facturador, emitido por una entidad
// certificadora avalada por la ONAC, con su cadena completa.
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { parsearCertificado } from '../src/lib/fiscal/latam/certificado.ts';
import { cadenaDesde, certificadosDeArchivo, certificadosDePkcs12, problemaDeUso } from '../src/lib/fiscal/latam/dian/cadena.ts';
import { dvNit, nitValido } from '../src/lib/fiscal/latam/dian/comprobante.ts';
import { firmarDocumento } from '../src/lib/fiscal/latam/dian/firma.ts';
import { armarSetDePruebas, cantidadesValidas, enviarDocumentoDePrueba, estadoDeEnvio } from '../src/lib/fiscal/latam/dian/habilitacion.ts';
import { cuerpoGetStatus, DianFaultError, llamarDian, parsearGetStatus, sobreDian } from '../src/lib/fiscal/latam/dian/soap.ts';
import { documentoXml, nombresArchivo } from '../src/lib/fiscal/latam/dian/ubl.ts';
import { interpretarMensaje } from '../src/lib/fiscal/latam/dian/errores.ts';
import { cadenaDePrueba } from './dian-cadena-prueba.mjs';

const ENTORNO = 'homologacion';

const { values: args } = parseArgs({
    options: {
        p12: { type: 'string' },
        cadena: { type: 'string' },
        nit: { type: 'string' },
        'razon-social': { type: 'string' },
        municipio: { type: 'string', default: '11001' },
        direccion: { type: 'string' },
        persona: { type: 'string', default: '1' },
        responsabilidades: { type: 'string', default: 'R-99-PN' },
        tributo: { type: 'string', default: '01' },
        'software-id': { type: 'string' },
        'test-set-id': { type: 'string' },
        resolucion: { type: 'string' },
        prefijo: { type: 'string', default: '' },
        desde: { type: 'string' },
        hasta: { type: 'string' },
        'vigente-desde': { type: 'string' },
        'vigente-hasta': { type: 'string' },
        'prefijo-notas': { type: 'string', default: 'NC' },
        numero: { type: 'string' },
        'numero-nota': { type: 'string', default: '1' },
        facturas: { type: 'string', default: '2' },
        'notas-credito': { type: 'string', default: '1' },
        'notas-debito': { type: 'string', default: '1' },
        enviar: { type: 'boolean', default: false },
        estado: { type: 'string' },
    },
});

const linea = (t = '') => process.stdout.write(`${t}\n`);
const fallar = (m) => { process.stderr.write(`dian:prueba: ${m}\n`); process.exit(1); };

if (!args.p12) {
    // Sonda: red, TLS y que el servicio responde.
    const c = cadenaDePrueba();
    const sobre = sobreDian(ENTORNO, 'GetStatus', cuerpoGetStatus('0'.repeat(96)), { certPem: c.cadena[0], llavePem: c.llavePem });
    try {
        const r = await parsearGetStatus(await llamarDian(ENTORNO, 'GetStatus', sobre, { timeoutMs: 45_000 }));
        linea(`GetStatus respondió: ${r.statusCode} ${r.statusDescription}`);
    } catch (e) {
        if (e instanceof DianFaultError) linea(`La DIAN respondió (fault ${e.codigo}${e.subcodigo ? ` / ${e.subcodigo}` : ''}): el servicio de habilitación está en línea; con una cadena de prueba se espera este rechazo.`);
        else fallar(`sin respuesta de la DIAN: ${e?.detalle ?? e?.message ?? e}`);
    }
    process.exit(0);
}

const password = process.env.DIAN_PRUEBA_PASSWORD ?? '';
const p12 = new Uint8Array(readFileSync(args.p12));
let cert;
let cadena;
try {
    cert = parsearCertificado({ pkcs12: p12, pkcs12Password: password });
    cadena = cadenaDesde(cert.certPem, [...certificadosDePkcs12(p12, password), ...(args.cadena ? certificadosDeArchivo(readFileSync(args.cadena)) : [])]);
} catch (e) {
    fallar(e?.message ?? String(e));
}
const uso = problemaDeUso(cadena[0]);
if (uso) fallar(uso);
const firmante = { cadena, llavePem: cert.keyPem };
linea(`Certificado: ${cert.sujetoCN ?? '(sin CN)'} · vence ${cert.caduca.toISOString().slice(0, 10)} · cadena de ${cadena.length}`);

if (args.estado) {
    for (const r of await estadoDeEnvio(args.estado, firmante)) {
        linea(`${r.fileName}: ${r.isValid ? 'ACEPTADO' : 'NO aceptado'} (${r.statusCode}) ${r.statusDescription}`);
        for (const m of r.mensajes) linea(`   ${m}`);
    }
    process.exit(0);
}

const nit = nitValido(args.nit);
if (!nit) fallar('--nit no es un NIT válido');
for (const k of ['razon-social', 'direccion', 'software-id', 'test-set-id', 'resolucion', 'desde', 'hasta', 'vigente-desde', 'vigente-hasta']) {
    if (!args[k]) fallar(`falta --${k}`);
}
const pin = process.env.DIAN_PRUEBA_PIN ?? '';
const claveTecnica = process.env.DIAN_PRUEBA_CLAVE_TECNICA ?? '';
if (!/^\d{5}$/.test(pin)) fallar('falta DIAN_PRUEBA_PIN (5 dígitos)');
if (!claveTecnica) fallar('falta DIAN_PRUEBA_CLAVE_TECNICA (la del rango de pruebas)');

const resolucion = {
    numero: args.resolucion, prefijo: args.prefijo.toUpperCase(), desde: Number(args.desde), hasta: Number(args.hasta),
    vigenteDesde: args['vigente-desde'], vigenteHasta: args['vigente-hasta'],
};
const emisor = {
    nit: nit.nit, dv: dvNit(nit.nit), razonSocial: args['razon-social'], tipoPersona: args.persona,
    responsabilidades: args.responsabilidades.split(',').map((x) => x.trim()).filter(Boolean), tributo: args.tributo,
    direccion: { municipio: args.municipio, linea: args.direccion },
};
let docs;
try {
    docs = armarSetDePruebas({
        emisor, resolucion, prefijoNotas: args['prefijo-notas'].toUpperCase(), softwareId: args['software-id'],
        claves: { pin, claveTecnica },
        cantidades: cantidadesValidas({ facturas: Number(args.facturas), notasCredito: Number(args['notas-credito']), notasDebito: Number(args['notas-debito']) }),
        numeroFactura: Number(args.numero ?? resolucion.desde), numeroNota: Number(args['numero-nota']),
        ahora: new Date(Date.now() - 5_000),
    });
} catch (e) {
    fallar(e?.message ?? String(e));
}

const dir = mkdtempSync(join(tmpdir(), 'dian-prueba-'));
for (const s of docs) {
    const xml = firmarDocumento(documentoXml(s), firmante, s.firmadoAt);
    const nombre = nombresArchivo(s).xml;
    writeFileSync(join(dir, nombre), xml);
    linea(`${s.id} (${s.clase}) → ${nombre} · ${s.algoritmo} ${s.cufe}`);
}
linea(`XML firmados en ${dir}`);
if (!args.enviar) {
    linea('Sin --enviar: nada salió hacia la DIAN.');
    process.exit(0);
}

const envios = [];
for (const s of docs) {
    try {
        const e = await enviarDocumentoDePrueba(s, firmante, args['test-set-id']);
        envios.push(e);
        linea(`${s.id}: ZipKey ${e.zipKey || '—'}${e.error ? ` · ${e.error}` : ''}`);
    } catch (e) {
        linea(`${s.id}: ${e instanceof DianFaultError ? `fault ${e.codigo} ${e.razon}` : (e?.detalle ?? e?.message ?? e)}`);
    }
}
linea('Esperando la validación (15 s)…');
await new Promise((r) => setTimeout(r, 15_000));
for (const e of envios.filter((x) => x.zipKey)) {
    for (const r of await estadoDeEnvio(e.zipKey, firmante)) {
        linea(`${e.id}: ${r.isValid ? 'ACEPTADO' : 'NO aceptado'} (${r.statusCode}) ${r.statusDescription}`);
        for (const m of r.mensajes.map((x) => interpretarMensaje(x, !r.isValid))) linea(`   ${m.tipo} ${m.regla}: ${m.texto}`);
    }
}

#!/usr/bin/env node
// Prueba de la factura electrónica con SUNAT contra el servicio BETA
// (homologación del SEE - Del Contribuyente).
//
//   npm run sunat:prueba
//       Sin argumentos: firma con un certificado desechable generado en el
//       momento, usa el RUC de ejemplo del manual del programador
//       (20100066603) y el usuario de pruebas que SUNAT publica para beta
//       (<RUC>MODDATOS / MODDATOS). Manda una factura de S/ 100 + IGV 18 % y
//       la nota de crédito que la anula, e imprime cada CDR. Sirve para
//       comprobar la red, el TLS y que el validador de SUNAT acepta lo que
//       Cord genera hoy.
//
//   SUNAT_PRUEBA_PASSWORD='…' SUNAT_PRUEBA_CLAVE_SOL='…' npm run sunat:prueba -- \
//       --cert ruta/certificado.crt --key ruta/llave.key --ruc 20123456789 \
//       [--usuario USUARIOSOL] [--serie F001] [--sin-nota]
//       (o --p12 ruta/certificado.p12 en lugar de --cert/--key)
//
//       Lo mismo con el certificado y el usuario SOL secundario del negocio.
//       El servicio beta acepta cualquier usuario SOL; uno real sirve para
//       comprobar que está bien escrito antes de pasar a producción.
//
// Nunca toca la base de datos ni PRODUCCIÓN: el entorno está fijado a
// 'homologacion' y no hay opción para cambiarlo. Beta no guarda estado ni
// tiene servicio de consulta: un comprobante de prueba no existe para SUNAT.
import { generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import forge from 'node-forge';
import { parsearCertificado } from '../src/lib/fiscal/latam/certificado.ts';
import { armarSolicitud, conNumero, idComprobante, nombreArchivo, problemasDeCuadre, rucValido, serieValida } from '../src/lib/fiscal/latam/sunat/comprobante.ts';
import { firmarComprobante, verificarFirmaPropia } from '../src/lib/fiscal/latam/sunat/firma.ts';
import { zipComprobante } from '../src/lib/fiscal/latam/sunat/zip.ts';
import { llamar, parsearSendBill, sobreSendBill, urlDe, SunatFaultError } from '../src/lib/fiscal/latam/sunat/servicio.ts';
import { leerCdr } from '../src/lib/fiscal/latam/sunat/cdr.ts';
import { sunatQr } from '../src/lib/fiscal/latam/sunat/representacion.ts';
import { mensajeCodigo } from '../src/lib/fiscal/latam/sunat/errores.ts';
import { CLAVE_BETA, USUARIO_BETA, claseCodigo } from '../src/lib/fiscal/latam/sunat/constantes.ts';

const ENTORNO = 'homologacion';
/** RUC del ejemplo del manual del programador [MAN §2.2]. */
const RUC_EJEMPLO = '20100066603';
/** Adquirente de prueba: un RUC de 11 dígitos con dígito verificador válido. */
const RUC_CLIENTE = '20131312955';

const { values: args } = parseArgs({
    options: {
        cert: { type: 'string' },
        key: { type: 'string' },
        p12: { type: 'string' },
        ruc: { type: 'string' },
        usuario: { type: 'string' },
        serie: { type: 'string', default: 'F001' },
        'sin-nota': { type: 'boolean', default: false },
    },
});

const linea = (t = '') => process.stdout.write(`${t}\n`);
const fallar = (m) => { process.stderr.write(`sunat:prueba: ${m}\n`); process.exit(1); };

const url = urlDe(ENTORNO, 'sendBill');
if (!/^https:\/\/e-beta\.sunat\.gob\.pe\//.test(url)) fallar(`el endpoint no es el de beta (${url}); se detiene.`);

// ── Emisor y certificado ─────────────────────────────────────────────────────
const ruc = rucValido(args.ruc ?? RUC_EJEMPLO);
if (!ruc) fallar('--ruc no es un RUC válido (11 dígitos con dígito verificador).');
const serie = serieValida(args.serie);
if (!serie) fallar('--serie debe ser F seguida de tres letras o dígitos (F001).');

let credencial;
if (args.p12 || args.cert) {
    const password = process.env.SUNAT_PRUEBA_PASSWORD ?? '';
    const c = args.p12
        ? parsearCertificado({ pkcs12: readFileSync(args.p12), pkcs12Password: password })
        : parsearCertificado({ certificado: readFileSync(args.cert), llave: args.key ? readFileSync(args.key) : null, llavePassword: password });
    linea(`Certificado: ${c.sujetoCN ?? '(sin CN)'} · emitido por ${c.emisorCN ?? '?'} · vence ${c.caduca.toISOString().slice(0, 10)}`);
    credencial = { certPem: c.certPem, keyPem: c.keyPem };
} else {
    // Certificado desechable: beta valida la estructura y la firma, no la
    // cadena de confianza ni que el certificado esté registrado en SOL.
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const keyPem = privateKey.export({ type: 'pkcs1', format: 'pem' }).toString();
    const key = forge.pki.privateKeyFromPem(keyPem);
    const cert = forge.pki.createCertificate();
    cert.publicKey = forge.pki.setRsaPublicKey(key.n, key.e);
    cert.serialNumber = '01';
    cert.validity.notBefore = new Date(Date.now() - 86_400_000);
    cert.validity.notAfter = new Date(Date.now() + 86_400_000);
    const sujeto = [{ name: 'commonName', value: 'Cord sunat:prueba' }, { name: 'organizationalUnitName', value: ruc }, { name: 'countryName', value: 'PE' }];
    cert.setSubject(sujeto);
    cert.setIssuer(sujeto);
    cert.sign(key, forge.md.sha256.create());
    credencial = { certPem: forge.pki.certificateToPem(cert), keyPem };
    linea('Certificado: desechable, autofirmado (solo para beta).');
}
const sol = args.usuario
    ? { usuario: `${ruc}${args.usuario}`, clave: process.env.SUNAT_PRUEBA_CLAVE_SOL ?? '' }
    : { usuario: `${ruc}${USUARIO_BETA}`, clave: CLAVE_BETA };
if (args.usuario && !sol.clave) fallar('falta la clave SOL: pásala en SUNAT_PRUEBA_CLAVE_SOL.');
linea(`Emisor ${ruc} · serie ${serie} · usuario SOL ${sol.usuario} · ${url}`);

// ── Envío ────────────────────────────────────────────────────────────────────
async function enviar(s, etiqueta) {
    const problemas = problemasDeCuadre(s);
    if (problemas.length) fallar(`${etiqueta}: la solicitud no cuadra: ${problemas.join('; ')}`);
    const f = firmarComprobante(s, credencial);
    if (!verificarFirmaPropia(s, f)) fallar(`${etiqueta}: la firma no se verifica localmente.`);
    const nombre = nombreArchivo(s);
    const zip = zipComprobante(nombre, f.xml);
    linea(`${etiqueta} ${idComprobante(s)} (${nombre}.zip, ${zip.length} bytes, total ${s.moneda} ${s.totales.importeTotal})`);
    const t0 = Date.now();
    try {
        const cdr = await leerCdr(await parsearSendBill(await llamar(ENTORNO, 'sendBill', sobreSendBill(sol, `${nombre}.zip`, Buffer.from(zip).toString('base64')))));
        linea(`  CDR en ${Date.now() - t0} ms: código ${cdr.codigo} (${claseCodigo(cdr.codigo)}) — ${cdr.descripcion}`);
        linea(`  referencia ${cdr.referencia} · adquirente ${cdr.receptor} · recibido ${cdr.fechaRecepcion}`);
        for (const o of cdr.observaciones) linea(`  observación ${o.code}: ${o.msg}`);
        if (cdr.resumen && cdr.resumen !== f.resumen) fallar(`${etiqueta}: el valor resumen de la CDR no coincide con el enviado.`);
        if (cdr.referencia !== idComprobante(s)) fallar(`${etiqueta}: la CDR responde por ${cdr.referencia}, no por ${idComprobante(s)}.`);
        linea(`  valor resumen ${f.resumen}`);
        linea(`  QR ${sunatQr(s, f.resumen)}`);
        return cdr.codigo === 0 || claseCodigo(cdr.codigo) === 'observacion';
    } catch (error) {
        if (error instanceof SunatFaultError) {
            linea(`  SUNAT respondió ${error.faultcode}: ${error.faultstring}`);
            if (error.codigo) linea(`  para el negocio: ${mensajeCodigo(error.codigo)}`);
            return false;
        }
        throw error;
    }
}

const numero = (Math.floor(Date.now() / 1000) % 90_000_000) + 1;
const entrada = {
    ruc, razonSocial: 'EMPRESA DE PRUEBA S.A.C.', serie, concepto: 'servicios', afectacionSinIgv: '20', fecha: new Date(),
    receptor: { taxId: RUC_CLIENTE, pais: 'PE', nombre: 'CLIENTE DE PRUEBA S.A.C.' },
    lineas: [{ description: 'Servicio de prueba de homologación', quantity: 1, unitPrice: 100, taxRate: 0.18, subtotal: 100, taxAmount: 18, total: 118 }],
    totales: { subtotal: 100, taxes: 18, total: 118, currency: 'PEN' },
};
const factura = conNumero(armarSolicitud(entrada), numero);
const ok = await enviar(factura, 'Factura');
if (ok && !args['sin-nota']) {
    const nota = conNumero(armarSolicitud({ ...entrada, notaCreditoDe: factura, motivo: 'Anulación de la operación de prueba' }), numero);
    if (!(await enviar(nota, 'Nota de crédito'))) process.exitCode = 1;
}
if (!ok) process.exitCode = 1;

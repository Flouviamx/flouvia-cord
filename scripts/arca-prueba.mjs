#!/usr/bin/env node
// Prueba de la factura electrónica con ARCA contra HOMOLOGACIÓN.
//
//   npm run arca:prueba
//       Sin certificado: consulta FEDummy (estado de los servidores de
//       homologación). Sirve para comprobar la red y el TLS.
//
//   ARCA_PRUEBA_PASSWORD='…' npm run arca:prueba -- \
//       --cert ruta/certificado.crt --key ruta/llave.key --cuit 20123456789 \
//       [--pto-vta 1] [--condicion responsable_inscripto|monotributo|exento] \
//       [--parametros] [--emitir]
//       (o --p12 ruta/certificado.p12 en lugar de --cert/--key)
//
//       Hace login en el WSAA con el certificado de homologación, lista los
//       puntos de venta y, con --parametros, imprime las tablas vivas de ARCA
//       (tipos de comprobante, alícuotas, monedas, documentos y condiciones
//       frente al IVA) y las coteja con las constantes de Cord. Con --emitir
//       pide un CAE real de homologación para una factura de prueba a
//       consumidor final ($ 1.000 + IVA 21 %, o Factura C sin IVA si la
//       condición es monotributo/exento) y la vuelve a consultar.
//
// Nunca toca la base de datos ni PRODUCCIÓN: el entorno está fijado a
// 'homologacion' y no hay opción para cambiarlo. El certificado debe ser uno
// de homologación (WSASS, "Autogestión certificados Homologación"). El
// ticket del WSAA se guarda en un archivo temporal con permisos 0600 para no
// pedir otro en cada corrida: ARCA rechaza un login nuevo mientras el ticket
// anterior siga vigente (coe.alreadyAuthenticated).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { parsearCertificado } from '../src/lib/fiscal/latam/certificado.ts';
import { construirTRA, firmarTRA, loginCms, cuitsRepresentadas, ArcaWsaaError } from '../src/lib/fiscal/latam/arca/wsaa.ts';
import {
    llamarWsfe, parsearDummy, parsearPtosVenta, parsearParametros, parsearUltimoAutorizado, parsearCAESolicitar,
    parsearCompConsultar, sobreDummy, sobreSoloAuth, sobreUltimoAutorizado, sobreCAESolicitar, sobreCompConsultar, ambienteCoincide,
} from '../src/lib/fiscal/latam/arca/wsfe.ts';
import { armarSolicitud, conNumero, cuitValido, fechaArcaAIso, problemasDeCuadre } from '../src/lib/fiscal/latam/arca/comprobante.ts';
import { arcaQrUrl } from '../src/lib/fiscal/latam/arca/qr.ts';
import {
    ALICUOTAS_IVA, CONDICIONES_EMISOR, CONDICIONES_IVA_RECEPTOR, DOC_TIPO, MONEDAS_ARCA, SERVICIO_WSFE, TIPO_COMPROBANTE,
} from '../src/lib/fiscal/latam/arca/constantes.ts';

const ENTORNO = 'homologacion';

const { values: args } = parseArgs({
    options: {
        cert: { type: 'string' },
        key: { type: 'string' },
        p12: { type: 'string' },
        cuit: { type: 'string' },
        'pto-vta': { type: 'string', default: '1' },
        condicion: { type: 'string', default: 'responsable_inscripto' },
        parametros: { type: 'boolean', default: false },
        emitir: { type: 'boolean', default: false },
    },
});

const linea = (t = '') => process.stdout.write(`${t}\n`);
const fallar = (m) => { process.stderr.write(`arca:prueba: ${m}\n`); process.exit(1); };

// ── Servidores ───────────────────────────────────────────────────────────────
const dummy = await parsearDummy(await llamarWsfe(ENTORNO, 'FEDummy', sobreDummy()));
linea(`FEDummy (${dummy.ambiente || 'sin ambiente'}): app ${dummy.app}, base ${dummy.db}, autenticación ${dummy.auth}`);
if (!ambienteCoincide(dummy.ambiente, ENTORNO)) fallar('la respuesta no vino de homologación; se detiene.');
if (!args.cert && !args.p12) {
    linea('Sin certificado: nada más que probar. Usa --cert/--key o --p12 y --cuit.');
    process.exit(0);
}

// ── Certificado y login ──────────────────────────────────────────────────────
const cuit = cuitValido(args.cuit);
if (!cuit) fallar('--cuit no es una CUIT válida.');
if (!CONDICIONES_EMISOR.some((c) => c.id === args.condicion)) fallar(`--condicion debe ser una de: ${CONDICIONES_EMISOR.map((c) => c.id).join(', ')}`);
const ptoVta = Number(args['pto-vta']);
if (!Number.isInteger(ptoVta) || ptoVta < 1 || ptoVta > 99998) fallar('--pto-vta debe ser un número entre 1 y 99998.');
const password = process.env.ARCA_PRUEBA_PASSWORD ?? '';
const cert = args.p12
    ? parsearCertificado({ pkcs12: readFileSync(args.p12), pkcs12Password: password })
    : parsearCertificado({ certificado: readFileSync(args.cert), llave: args.key ? readFileSync(args.key) : null, llavePassword: password });
linea(`Certificado: ${cert.sujetoCN ?? '(sin CN)'} · ${cert.sujetoSerialNumber ?? '(sin serialNumber)'} · emitido por ${cert.emisorCN ?? '?'} · vence ${cert.caduca.toISOString().slice(0, 10)}`);
if (!/homo|test|prueba/i.test(cert.emisorCN ?? '')) {
    linea('AVISO: el emisor del certificado no parece la autoridad de homologación. Un certificado de producción no sirve aquí.');
}

const cacheFile = join(tmpdir(), `cord-arca-prueba-${cert.huellaSha256.slice(0, 16)}.json`);
let ticket = null;
if (existsSync(cacheFile)) {
    try {
        const c = JSON.parse(readFileSync(cacheFile, 'utf8'));
        if (Date.parse(c.expira) - Date.now() > 5 * 60_000) ticket = c;
    } catch { /* caché ilegible: se pide otro */ }
}
if (!ticket) {
    try {
        const t = await loginCms(ENTORNO, firmarTRA(construirTRA(SERVICIO_WSFE), cert.certPem, cert.keyPem));
        ticket = { token: t.token, sign: t.sign, expira: t.expira.toISOString() };
        writeFileSync(cacheFile, JSON.stringify(ticket), { mode: 0o600 });
    } catch (error) {
        if (error instanceof ArcaWsaaError) fallar(`el WSAA rechazó el login: ${error.faultcode} — ${error.faultstring}`);
        throw error;
    }
}
const representadas = cuitsRepresentadas(ticket.token);
linea(`Ticket del WSAA vigente hasta ${ticket.expira}${representadas.length ? ` · representa a ${representadas.join(', ')}` : ''}`);
if (representadas.length && !representadas.includes(cuit)) fallar(`el certificado no está autorizado a facturar por ${cuit}.`);
const auth = { token: ticket.token, sign: ticket.sign, cuit };

const errores = (r) => (r.errores.length ? ` · errores: ${r.errores.map((e) => `${e.code} ${e.msg}`).join(' | ')}` : '');

// ── Puntos de venta ──────────────────────────────────────────────────────────
const pv = await parsearPtosVenta(await llamarWsfe(ENTORNO, 'FEParamGetPtosVenta', sobreSoloAuth('FEParamGetPtosVenta', auth)));
linea(`Puntos de venta: ${pv.puntos.length ? pv.puntos.map((p) => `${p.numero} (${p.emisionTipo}${p.bloqueado ? ', bloqueado' : ''}${p.baja ? `, baja ${p.baja}` : ''})`).join(', ') : 'ninguno informado'}${errores(pv)}`);

// ── Tablas vivas contra las constantes de Cord ───────────────────────────────
if (args.parametros) {
    const tabla = async (op, item) => parsearParametros(await llamarWsfe(ENTORNO, op, sobreSoloAuth(op, auth)), op, item);
    const comparar = (nombre, vivos, esperados) => {
        const ids = new Set(vivos.map((v) => String(v.id)));
        const faltan = esperados.filter((e) => !ids.has(String(e)));
        linea(`  ${nombre}: ${faltan.length ? `FALTAN en ARCA: ${faltan.join(', ')}` : 'todas las que Cord usa existen'}`);
    };
    const cbte = await tabla('FEParamGetTiposCbte', 'CbteTipo');
    linea(`Tipos de comprobante (${cbte.valores.length})${errores(cbte)}`);
    comparar('comprobantes', cbte.valores, Object.values(TIPO_COMPROBANTE).flatMap((t) => [t.factura, t.notaCredito]));
    const iva = await tabla('FEParamGetTiposIva', 'IvaTipo');
    linea(`Alícuotas de IVA: ${iva.valores.map((v) => `${v.id}=${v.desc}`).join(', ')}${errores(iva)}`);
    comparar('alícuotas', iva.valores, ALICUOTAS_IVA.map((a) => a.id));
    const mon = await tabla('FEParamGetTiposMonedas', 'Moneda');
    linea(`Monedas (${mon.valores.length})${errores(mon)}`);
    comparar('monedas', mon.valores, Object.values(MONEDAS_ARCA));
    const doc = await tabla('FEParamGetTiposDoc', 'DocTipo');
    linea(`Tipos de documento (${doc.valores.length})${errores(doc)}`);
    comparar('documentos', doc.valores, Object.values(DOC_TIPO));
    const cond = await tabla('FEParamGetCondicionIvaReceptor', 'CondicionIvaReceptor');
    linea(`Condiciones frente al IVA del receptor: ${cond.valores.map((v) => `${v.id}=${v.desc} [${v.clase ?? '?'}]`).join(', ')}${errores(cond)}`);
    comparar('condiciones', cond.valores, CONDICIONES_IVA_RECEPTOR.map((c) => c.id));
}

// ── Emisión de prueba ────────────────────────────────────────────────────────
if (args.emitir) {
    const claseC = args.condicion !== 'responsable_inscripto';
    const lineas = [claseC
        ? { description: 'Prueba de homologación', quantity: 1, unitPrice: 1000, taxRate: 0, subtotal: 1000, taxAmount: 0, total: 1000 }
        : { description: 'Prueba de homologación', quantity: 1, unitPrice: 1000, taxRate: 0.21, subtotal: 1000, taxAmount: 210, total: 1210 }];
    const base = armarSolicitud({
        cuitEmisor: cuit, condicionEmisor: args.condicion, puntoVenta: ptoVta, concepto: 1, fecha: new Date(),
        receptor: { taxId: '', pais: 'AR', condicionIva: null },
        lineas, totales: { subtotal: 1000, taxes: claseC ? 0 : 210, total: claseC ? 1000 : 1210, currency: 'ARS' },
        moneda: { id: 'PES', cotizacion: 1 },
    });
    const problemas = problemasDeCuadre(base.detalle, base.clase);
    if (problemas.length) fallar(`la solicitud no cuadra: ${problemas.join('; ')}`);
    const ult = await parsearUltimoAutorizado(await llamarWsfe(ENTORNO, 'FECompUltimoAutorizado', sobreUltimoAutorizado(auth, ptoVta, base.cbteTipo)));
    if (ult.numero === null) fallar(`no se pudo leer el último autorizado${errores(ult)}`);
    const sol = conNumero(base, ult.numero + 1);
    linea(`Pidiendo CAE: Factura ${sol.clase} (tipo ${sol.cbteTipo}) ${ptoVta}-${sol.detalle.CbteDesde}, total ${sol.detalle.ImpTotal}`);
    const r = await parsearCAESolicitar(await llamarWsfe(ENTORNO, 'FECAESolicitar', sobreCAESolicitar(auth, sol, sol.detalle)));
    linea(`Resultado: cabecera ${r.resultadoCabecera || '-'}, comprobante ${r.resultado || '-'}, CAE ${r.cae || '-'}, vence ${r.caeVence || '-'}`);
    for (const o of r.observaciones) linea(`  observación ${o.code}: ${o.msg}`);
    for (const e of r.errores) linea(`  error ${e.code}: ${e.msg}`);
    for (const e of r.eventos) linea(`  evento ${e.code}: ${e.msg}`);
    if (r.resultado === 'A' && /^\d{14}$/.test(r.cae)) {
        const c = await parsearCompConsultar(await llamarWsfe(ENTORNO, 'FECompConsultar', sobreCompConsultar(auth, ptoVta, sol.cbteTipo, sol.detalle.CbteDesde)));
        linea(`FECompConsultar: ${c.comprobante ? `CAE ${c.comprobante.codAutorizacion}, emisión ${c.comprobante.emisionTipo}, total ${c.comprobante.impTotal}` : 'sin datos'}${errores(c)}`);
        linea(`QR: ${arcaQrUrl({
            fecha: fechaArcaAIso(sol.detalle.CbteFch), cuit, ptoVta, tipoCmp: sol.cbteTipo, nroCmp: sol.detalle.CbteDesde,
            importe: sol.detalle.ImpTotal, moneda: sol.detalle.MonId, ctz: sol.detalle.MonCotiz,
            tipoDocRec: sol.detalle.DocTipo, nroDocRec: sol.detalle.DocNro, tipoCodAut: 'E', codAut: r.cae,
        })}`);
    }
}

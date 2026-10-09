#!/usr/bin/env node
// security:fr-pa — la emisión por plataforma autorizada en Francia contra la
// especificación PUBLICADA de la plataforma, sin red.
//
//   npm run security:fr-pa
//
// Capas:
//   1. Artefactos fijados: la OpenAPI del operador de Iopole (config,
//      invoicing, reporting) tal como la publica https://api.ppd.iopole.fr/v1/api,
//      vendorizada en scripts/fixtures/iopole/ con su SHA-256. Un hash distinto
//      es un fallo: o el archivo cambió o no es el que se revisó.
//   2. Autenticación y hosts: la URL del token de cada archivo es la que usa
//      el cliente para preproducción (config.ts).
//   3. Rutas: cada ruta que usa el adaptador (cuerpos.ts, RUTAS) existe en la
//      especificación con su método.
//   4. Cuerpos: lo que arman las funciones del adaptador desde las muestras
//      reales (test/helpers/fr-pa-samples.ts, por el mismo camino que la cola)
//      valida contra el esquema de cada operación: obligatorios, listas
//      cerradas, patrones, longitudes y campos no declarados.
//   5. Respuestas y vocabulario: cada campo que el adaptador LEE existe en el
//      esquema de la respuesta, y cada código que interpreta (etapas del alta,
//      estados de factura, eventos) está en la lista de la especificación.
//   6. Superficie: el webhook es público y exento de CSRF, y el cron está en el
//      workflow horario y en vercel.json.
// Y controles NEGATIVOS: cuerpos deliberadamente rotos que el validador debe
// rechazar; sin ellos, un validador que no mira nada "aprobaría" todo.
//
// Se corre con Node plano: --experimental-strip-types y el gancho
// scripts/lib/ts-resolve.mjs (los módulos de src/ importan sin extensión).

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearValidador } from './lib/openapi-mini.mjs';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const FIX = join(ROOT, 'scripts/fixtures/iopole');

/** SHA-256 de la OpenAPI de preproducción de Iopole, descargada el 09/10/2026. */
const SPECS = {
    config: { archivo: 'operator-config.json', sha256: '99a26a743bb8872f4d94aaf067096c3a49132a9b93b9b74e09b857988f045124', url: 'https://api.ppd.iopole.fr/v1/api/operator/config' },
    invoicing: { archivo: 'operator-invoicing.json', sha256: '5e37015e101747cfe82df0a6973c58bf4a879a8e9b089c7c279193cf97baadde', url: 'https://api.ppd.iopole.fr/v1/api/operator/invoicing' },
    reporting: { archivo: 'operator-reporting.json', sha256: '62d47846030f3ffd11e5325e8c30ed7723a0f2c29fdc09fad1921a5e9d0841c5', url: 'https://api.ppd.iopole.fr/v1/api/operator/reporting' },
};

const fallos = [];
const ok = [];
const check = (cond, msg) => { (cond ? ok : fallos).push(msg); };

// ── 1. Artefactos ────────────────────────────────────────────────────────────
const spec = {};
const v = {};
for (const [id, s] of Object.entries(SPECS)) {
    const buf = readFileSync(join(FIX, s.archivo));
    const got = createHash('sha256').update(buf).digest('hex');
    check(got === s.sha256, `${s.archivo}: SHA-256 ${got === s.sha256 ? 'fijado' : `${got}, se esperaba ${s.sha256}`}`);
    spec[id] = JSON.parse(buf.toString('utf8'));
    v[id] = crearValidador(spec[id]);
}

const { HOSTS_IOPOLE } = await import('../src/lib/fiscal/transmision/config.ts');
const C = await import('../src/lib/fiscal/transmision/iopole/cuerpos.ts');
const { interpretar, firmar, verificarFirma } = await import('../src/lib/fiscal/transmision/iopole/webhook.ts');
const { CODIGO_DE_IOPOLE } = await import('../src/lib/fiscal/transmision/estados.ts');
const E = await import('../src/lib/fiscal/transmision/ereporting.ts');
const { assessEInvoice } = await import('../src/lib/fiscal/einvoice/model.ts');
const { FR_PA_SAMPLES, frPaSample } = await import('../test/helpers/fr-pa-samples.ts');

// ── 2. Autenticación ─────────────────────────────────────────────────────────
for (const [id, s] of Object.entries(spec)) {
    const flujo = s.components?.securitySchemes?.oauth2ClientCredentials?.flows?.clientCredentials;
    check(flujo?.tokenUrl === HOSTS_IOPOLE.preproduccion.token, `${id}: token OAuth 2.0 client_credentials en ${flujo?.tokenUrl ?? '(sin tokenUrl)'}`);
    check(JSON.stringify(s.security ?? []).includes('oauth2ClientCredentials'), `${id}: la seguridad global es OAuth 2.0`);
}
check(HOSTS_IOPOLE.preproduccion.api === new URL(SPECS.config.url).origin, 'preproducción: el host de la API es el que publica la especificación');
check(HOSTS_IOPOLE.produccion.token === 'https://auth.iopole.com/realms/iopole/protocol/openid-connect/token', 'producción: token del realm iopole de auth.iopole.com');

// ── 3. Rutas ─────────────────────────────────────────────────────────────────
for (const [nombre, r] of Object.entries(C.RUTAS)) {
    check(!!v[r.spec].operacion(r.metodo, r.ruta), `ruta ${nombre}: ${r.metodo} ${r.ruta} existe en ${SPECS[r.spec].archivo}`);
}

// ── 4. Cuerpos ───────────────────────────────────────────────────────────────
function validarCuerpo(nombre, cuerpo, etiqueta) {
    const r = C.RUTAS[nombre];
    const schema = v[r.spec].esquemaCuerpo(r.metodo, r.ruta);
    if (!schema) { fallos.push(`${etiqueta}: ${r.ruta} no declara cuerpo JSON`); return []; }
    const errores = v[r.spec].validar(schema, cuerpo);
    check(errores.length === 0, `${etiqueta}: valida contra ${r.metodo} ${r.ruta}${errores.length ? `\n      ${errores.slice(0, 6).join('\n      ')}` : ''}`);
    return errores;
}
function negativo(nombre, cuerpo, etiqueta) {
    const r = C.RUTAS[nombre];
    const errores = v[r.spec].validar(v[r.spec].esquemaCuerpo(r.metodo, r.ruta), cuerpo);
    check(errores.length > 0, `[negativo] ${etiqueta}: el validador lo rechaza`);
}

const alta = C.cuerpoAlta({ siren: '303265045', regimen: 'reel_mensuel', contactoEmail: 'compta@atelier-lumiere.fr', direccion: '12 rue de la Paix, 75002 Paris', representante: { nombre: 'Claire', apellido: 'Martin', cargo: 'Présidente' } });
validarCuerpo('crearAlta', alta, 'alta (con representante)');
validarCuerpo('crearAlta', C.cuerpoAlta({ siren: '303265045', regimen: 'franchise', contactoEmail: 'a@b.fr', direccion: 'x', representante: null }), 'alta (franquicia, sin representante)');
check(alta.registrationStrategy === 'NONE' && alta.operatorRelation.direction === 'OUTBOUND' && alta.selfBilling === false && alta.registerInPeppolInternational === false,
    'alta: solo emisión (sin dirección de recepción, sin autofacturación, sin Peppol internacional)');
negativo('crearAlta', { ...alta, siren: '30326504' }, 'alta con SIREN de 8 dígitos');
negativo('crearAlta', { ...alta, registrationStrategy: 'NUNCA' }, 'alta con estrategia inventada');

validarCuerpo('crearWebhook', C.cuerpoWebhook('https://cordhq.app', 'a'.repeat(64)), 'webhook');
negativo('crearWebhook', { ...C.cuerpoWebhook('https://cordhq.app', 'x'), interopData: { endpoints: { events: { callbackUrl: 'https://cordhq.app/x', subscribedEvents: ['INVENTADO'] } } } }, 'webhook con un evento inventado');

const modelo = (id) => { const s = frPaSample(id).source; return { src: s, inv: assessEInvoice(s).invoice }; };

for (const id of ['b2bint-biens-ue', 'b2bint-services-hors-ue']) {
    const { src, inv } = modelo(id);
    const rep = inv ? E.reporteFactura(src, inv) : null;
    check(!!rep && 'reporte' in rep, `${id}: genera el bloque 10.1${rep && 'bloqueo' in rep ? ` (bloqueo: ${rep.bloqueo.codigo})` : ''}`);
    if (rep && 'reporte' in rep) {
        const cuerpo = C.cuerpoReporteFactura(rep.reporte);
        validarCuerpo('reporteFactura', cuerpo, `${id}: e-reporting de factura (10.1)`);
        if (id === 'b2bint-biens-ue') {
            check(cuerpo.invoice.buyer.identifier.scheme === '0223', `${id}: comprador de la UE identificado por su TVA (0223, G2.19)`);
            negativo('reporteFactura', { invoice: { ...cuerpo.invoice, invoiceId: 'F'.repeat(21) } }, 'número de factura de 21 caracteres');
            negativo('reporteFactura', { invoice: { ...cuerpo.invoice, processType: 'X9' } }, 'categoría de operación inventada');
        } else {
            check(cuerpo.invoice.buyer.identifier.scheme === '0227', `${id}: comprador fuera de la UE identificado por país y razón social (0227, G2.19)`);
        }
        const pago = E.cobroPorTasa(src, inv, inv.totals.payable);
        if (id === 'b2bint-services-hors-ue') {
            check(!pago, `${id}: una exportación (categoría G) no tiene TVA francesa exigible al cobro: no se reporta el pago`);
        }
    }
}

{
    const { src, inv } = modelo('b2b-servicios');
    const porTasa = E.cobroPorTasa(src, inv, 500);
    check(!!porTasa && porTasa.reduce((s, x) => s + x.importe, 0) === 500, 'b2b-servicios: el cobro completo de servicios se reparte por tasa');
    const cobro = C.cuerpoCobro({ fecha: '2026-10-09', moneda: 'EUR', porTasa });
    validarCuerpo('enviarEstado', cobro, 'estado 212 (PAYMENT_RECEIVED)');
    const devolucion = C.cuerpoCobro({ fecha: '2026-10-09', moneda: 'EUR', porTasa: porTasa.map((x) => ({ ...x, importe: -x.importe })), mensaje: 'Remboursement' });
    validarCuerpo('enviarEstado', devolucion, 'estado 212 de una devolución (importe negativo, P1.17)');
    negativo('enviarEstado', { ...cobro, code: 'ENCAISSEE' }, 'estado con código inventado');
    const pagoFactura = C.cuerpoPagoFactura({ numero: inv.number, fechaFactura: inv.issueDate, fechaPago: '2026-10-09', porTasa });
    validarCuerpo('reportePagoFactura', pagoFactura, 'e-reporting de pago de factura (10.2)');
    negativo('reportePagoFactura', C.cuerpoPagoFactura({ numero: inv.number, fechaFactura: inv.issueDate, fechaPago: '2026-10-09', porTasa: [{ tasa: 20, importe: -10 }] }), 'pago de factura negativo (la API no lo admite)');
}
{
    const { src, inv } = modelo('b2b-mixte-debits');
    check(E.cobroPorTasa(src, inv, 100) === null, 'b2b-mixte-debits: con la opción por los débitos no se comunica el cobro');
}
{
    const { src, inv } = modelo('b2b-biens');
    check(E.cobroPorTasa(src, inv, 100) === null, 'b2b-biens: una venta de bienes no comunica el cobro');
}
{
    const docs = ['b2c-services', 'b2c-mixte'].map((id) => modelo(id));
    const ag = E.agregarTransacciones('2026-10-08', '2026-10-08-EUR-1', 'EUR', docs);
    check(!!ag.reporte && ag.bloqueados.length === 0, 'b2c: agregado diario por categoría (10.3)');
    if (ag.reporte) {
        const cuerpo = C.cuerpoTransacciones(ag.reporte);
        validarCuerpo('reporteTransacciones', cuerpo, 'e-reporting de transacciones (10.3)');
        check(cuerpo.transactions.map((t) => t.categoryCode).join(',') === 'TLB1,TPS1', 'b2c: bienes en TLB1 y servicios en TPS1');
        negativo('reporteTransacciones', { ...cuerpo, extra: true }, 'campo no declarado (additionalProperties: false)');
        negativo('reporteTransacciones', { ...cuerpo, transactions: cuerpo.transactions.map((t) => ({ ...t, categoryCode: 'TXX1' })) }, 'categoría de transacción inventada');
    }
    const partes = docs.map(({ src, inv }) => E.cobroPorTasa(src, inv, inv.totals.payable)).filter(Boolean);
    const pagos = E.agregarPagos('2026-10-09', partes);
    check(!!pagos && 'reporte' in pagos, 'b2c: lo cobrado del día, solo la parte de servicios (10.4)');
    if (pagos && 'reporte' in pagos) validarCuerpo('reportePagoTransacciones', C.cuerpoPagoTransacciones(pagos.reporte), 'e-reporting de pagos de transacciones (10.4)');
}

// ── 5. Respuestas y vocabulario ──────────────────────────────────────────────
const LEIDOS = [
    ['crearAlta', 201, ['enrollmentId', 'onboardingUrl']],
    ['consultarAlta', 200, ['enrollmentId', 'state', 'enrollmentLink']],
    ['altaPorIdentificador', 200, ['enrollmentId', 'onboardingUrl']],
    ['entidades', 200, ['data[].businessEntityId', 'data[].identifierScheme', 'data[].identifierValue', 'data[].type', 'data[].countryIdentifier.siren']],
    ['enviarFactura', 201, ['id']],
    ['buscarFacturas', 200, ['data[].metadata.invoiceId', 'data[].metadata.direction', 'data[].businessData.invoiceId']],
    ['historialEstados', 200, ['[].statusId', '[].invoiceId', '[].date', '[].status.code', '[].status.networkCode',
        '[].json.responses[].documentReference.issuerAssignedId', '[].json.responses[].documentReference.issuer.siren',
        '[].json.responses[].rejectionDetail.message', '[].json.responses[].rejectionDetail.reason']],
    ['enviarEstado', 201, ['id']],
    ['reporteFactura', 202, ['id']],
    ['reporteTransacciones', 202, ['id']],
    ['reportePagoFactura', 202, ['id']],
    ['reportePagoTransacciones', 202, ['id']],
];
for (const [nombre, codigo, campos] of LEIDOS) {
    const r = C.RUTAS[nombre];
    const schema = v[r.spec].esquemaRespuesta(r.metodo, r.ruta, codigo);
    for (const campo of campos) {
        const camino = campo.startsWith('[]') ? `${campo}` : campo;
        check(!!schema && v[r.spec].tieneCampo(schema, camino), `respuesta ${codigo} de ${nombre}: lee ${campo}`);
    }
}
// El webhook de onboarding: sus etapas (enum `stages`) y la lista de eventos del operador.
const webhookSchema = v.config.esquemaCuerpo('POST', '/v1/config/webhook');
const etapas = v.config.deref(v.config.deref(v.config.deref(v.config.deref(webhookSchema).properties.interopData).properties.endpoints).properties.onboarding).properties.stages.items.enum;
for (const e of ['COMPLETED', 'CANCELLED', 'ACTION_REQUIRED', 'ELECTRONIC_ADDRESS_MIGRATION', 'ELECTRONIC_ADDRESS_DISPUTE', 'STARTED', 'MANDATE_SIGNED']) {
    check(etapas.includes(e), `etapa del alta ${e} en la lista de la especificación`);
}
const eventos = v.config.deref(v.config.deref(v.config.deref(webhookSchema).properties.interopData).properties.endpoints).properties.events;
const enumEventos = v.config.deref(v.config.deref(eventos).properties.subscribedEvents).items.enum;
for (const e of C.EVENTOS_SUSCRITOS) check(enumEventos.includes(e), `evento ${e} en la lista de la especificación`);
const enumEstados = v.invoicing.deref(v.invoicing.deref(v.invoicing.deref(v.invoicing.esquemaRespuesta('GET', '/v1/invoice/{invoiceId}/status-history', 200)).items).properties.status).properties.code.enum;
for (const k of Object.keys(CODIGO_DE_IOPOLE)) check(enumEstados.includes(k), `estado ${k} en la lista de la especificación`);

// La lectura de un aviso de estado con la forma documentada ("Callback status").
{
    const aviso = { invoiceId: '29d2576d-8408-4248-93b9-ca05251b4ce0', statusId: '1f102a32-b0c4-4eba-a31d-0be0f416bf07', date: '2024-07-16T20:44:12Z',
        status: { code: 'RECEIVED', value: '202', desc: 'Reçue par la plateforme' },
        json: { responses: [{ documentReference: { issuerAssignedId: 'F-LTKAPRIdocgmdE', issuerTradeParty: { siren: '325994648' } } }] } };
    const ev = interpretar(aviso);
    check(ev.tipo === 'estado_factura' && ev.estado.codigo === '202' && ev.estado.numero === 'F-LTKAPRIdocgmdE' && ev.estado.sirenEmisor === '325994648',
        'aviso de estado: código 202, número y SIREN del emisor');
    const onboarding = interpretar({ enrollmentId: '79d4dc11-e784-4c77-874e-0c04b3274530', eventId: 'x', status: 'COMPLETED', date: '2025-11-04T10:11:23.670Z' });
    check(onboarding.tipo === 'alta' && onboarding.estado === 'completada', 'aviso de onboarding COMPLETED: alta completada');
    const cuerpo = Buffer.from(JSON.stringify(aviso));
    const f = firmar('secreto-de-prueba', 'POST', '/api/fiscal/iopole/webhook?tipo=status', cuerpo, 1_760_000_000_000);
    const base = { secreto: 'secreto-de-prueba', metodo: 'POST', rutaConConsulta: '/api/fiscal/iopole/webhook?tipo=status', cuerpo, ahora: 1_760_000_000_000 };
    check(verificarFirma({ ...base, cabeceras: { timestamp: f.timestamp, firma: f.firma, checksum: f.checksum } }), 'firma HMAC del webhook: canónica `ts\\nMÉTODO\\nruta?consulta\\nsha256`');
    check(!verificarFirma({ ...base, cuerpo: Buffer.from(JSON.stringify({ ...aviso, statusId: 'otro' })), cabeceras: { timestamp: f.timestamp, firma: f.firma, checksum: null } }), '[negativo] cuerpo alterado: firma rechazada');
    check(!verificarFirma({ ...base, ahora: base.ahora + 11 * 60_000, cabeceras: { timestamp: f.timestamp, firma: f.firma, checksum: f.checksum } }), '[negativo] aviso de hace más de diez minutos: rechazado');
}

// ── 6. Superficie ────────────────────────────────────────────────────────────
const csrf = readFileSync(join(ROOT, 'src/lib/csrf-policy.ts'), 'utf8');
const mw = readFileSync(join(ROOT, 'src/middleware.ts'), 'utf8');
check(csrf.includes("'/api/fiscal/iopole/webhook'"), 'webhook en CSRF_EXEMPT_WRITE_EXACT (la credencial es la firma)');
check(/PUBLIC_API_EXACT = \[[^\]]*"\/api\/fiscal\/iopole\/webhook"/.test(mw), 'webhook en PUBLIC_API_EXACT (sin sesión)');
check(readFileSync(join(ROOT, '.github/workflows/cord-crons.yml'), 'utf8').includes('*:*:api/cron/fiscal-plataforma'), 'cron horario en cord-crons.yml');
check(readFileSync(join(ROOT, 'vercel.json'), 'utf8').includes('/api/cron/fiscal-plataforma'), 'cron de respaldo en vercel.json');
check(FR_PA_SAMPLES.length >= 6, 'muestras de los tres tratamientos (B2B, B2BINT, B2C)');

console.log(`\nsecurity:fr-pa — ${ok.length} comprobaciones`);
for (const m of ok.filter((x) => x.startsWith('[negativo]')).slice(0, 20)) console.log(`  ok ${m}`);
if (fallos.length) {
    console.error(`\nsecurity:fr-pa FALLÓ (${fallos.length}):`);
    for (const f of fallos) console.error(`  - ${f}`);
    process.exit(1);
}
console.log('security:fr-pa OK');

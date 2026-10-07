// Operativas de corrección de Verifactu: anulación, subsanación y la
// identificación de la factura que rectifica una nota de crédito.
//
// La operativa correcta depende de lo que la AEAT YA TIENE de esa factura, no
// de lo que Cord hizo: el anexo §6 de "Validaciones y errores" (v1.2.2) define
// qué combinación de Subsanacion / RechazoPrevio / SinRegistroPrevio admite
// cada situación, y la equivocada se rechaza (p. ej. una anulación "normal" de
// una factura cuyo alta fue rechazada recibe 3002 "no existe el registro").
// Aquí se deriva del historial de envío de la propia factura.

import { sql, withOrgTx } from '../../db';
import type { FiscalLineItem, FiscalParty, FiscalTotals } from '../index';
import {
    appendVerifactuAlta, appendVerifactuAnulacion, correccionDe, historialDocumento, logVerifactuEvento,
    sifIdentityForOrg, type ChainedRegistro, type CorreccionRegistro, type EnvioEstado, type RegistroHistorial,
} from './chain';
import { fechaExpedicionAEAT } from './huella';
import { construirAlta, problemasEsquemaAnulacion, type IdFacturaAEAT } from './registro';
import { verifactuEnvioConfig } from './sif';
import { normalizarNifEs, VerifactuDatosError } from './validacion';
import { verifactuQrUrl } from './qr';

const EN_AEAT: ReadonlySet<EnvioEstado> = new Set(['aceptado', 'aceptado_con_errores']);
const NO_LLEGO: ReadonlySet<EnvioEstado> = new Set(['rechazado', 'bloqueado']);

/** Error de corrección con mensaje apto para el usuario (regla 14). */
export class VerifactuCorreccionError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'VerifactuCorreccionError';
    }
}

function idFacturaDeAlta(payload: Record<string, any>): IdFacturaAEAT {
    return {
        idEmisorFactura: normalizarNifEs(payload.idEmisorFactura),
        numSerieFactura: String(payload.numSerieFactura ?? ''),
        fechaExpedicionFactura: String(payload.fechaExpedicionFactura ?? ''),
    };
}

/**
 * IDFactura y TipoFactura de la factura que rectifica una nota de crédito: del
 * último registro de alta de la original (lo que la AEAT conoce); si la
 * original no tiene registro, de su documento (folio, fecha de emisión en
 * Madrid y NIF del emisor). `null` si no se puede identificar.
 */
export async function identidadFacturaOriginal(
    orgId: string, originalDocumentId: string,
): Promise<{ original: IdFacturaAEAT | null; tipoOriginal: string | null }> {
    const [altas, docs] = await withOrgTx(orgId,
        sql`select payload from verifactu_registros
             where org_id = ${orgId} and documento_id = ${originalDocumentId} and tipo = 'alta'
             order by seq desc limit 1`,
        sql`select invoice_number, issued_at, issuer_snapshot from documentos_fiscales
             where id = ${originalDocumentId} and org_id = ${orgId} limit 1`,
    );
    const alta = altas[0]?.payload as Record<string, any> | undefined;
    if (alta?.numSerieFactura) return { original: idFacturaDeAlta(alta), tipoOriginal: String(alta.tipoFactura || '') || null };
    const doc = docs[0];
    if (doc?.invoice_number && doc?.issued_at) {
        return {
            original: {
                idEmisorFactura: normalizarNifEs((doc.issuer_snapshot as FiscalParty | null)?.taxId),
                numSerieFactura: String(doc.invoice_number),
                fechaExpedicionFactura: fechaExpedicionAEAT(new Date(doc.issued_at as string)),
            },
            tipoOriginal: null,
        };
    }
    return { original: null, tipoOriginal: null };
}

export interface PlanAnulacion {
    /** La anulación ya estaba encadenada: replay idempotente. */
    existente?: ChainedRegistro;
    input?: Parameters<typeof appendVerifactuAnulacion>[2];
    /** Anulación que sucede a otra anterior de la misma factura (tras una reactivación). */
    correccion?: CorreccionRegistro;
    sinRegistroPrevio?: boolean;
}

/**
 * Valida TODO lo necesario para anular una factura ante Verifactu, sin
 * encadenar nada. Pensado para llamarse ANTES de efectos irreversibles en
 * otros sistemas (cerrar el cobro en línea, por ejemplo): si la anulación no
 * se va a poder registrar, mejor saberlo antes.
 *
 * - Sin alta en la cadena → no hay registro que anular: error explícito (una
 *   factura emitida por el carril Verifactu siempre tiene alta; si falta, el
 *   dato está roto y no se inventa una anulación).
 * - El alta nunca llegó a la AEAT (rechazada o aparcada, sin corrección
 *   aceptada) → "ANULACIÓN SIN REGISTRO PREVIO" (SinRegistroPrevio = S). Una
 *   anulación normal recibiría 3002 "no existe el registro de facturación".
 * - El alta está aceptada o todavía pendiente → anulación normal. Si el alta
 *   pendiente termina rechazada, la anulación recibirá 3002 y se corrige con
 *   `crearSubsanacionVerifactu` (que entonces declara SinRegistroPrevio).
 * - La última operación de la factura ya es una anulación → replay. Si después
 *   de anularla se REACTIVÓ (`reactivarAltaVerifactu`), se encadena una
 *   anulación nueva que sucede a la anterior.
 */
export async function prepararAnulacionVerifactu(orgId: string, documentId: string): Promise<PlanAnulacion> {
    const historial = await historialDocumento(orgId, documentId);
    const altas = historial.filter((r) => r.tipo === 'alta');
    const ultimaAnulacion = ultimoDeTipo(historial, 'anulacion');
    const ultimaAltaSeq = altas.length ? altas[altas.length - 1].seq : 0;
    if (ultimaAnulacion && ultimaAnulacion.seq > ultimaAltaSeq) {
        const [rows] = await withOrgTx(orgId, sql`
            select id, seq, huella, huella_anterior, payload, envio_estado from verifactu_registros
             where id = ${ultimaAnulacion.id} and org_id = ${orgId} limit 1`);
        const r = rows[0];
        return {
            existente: {
                id: String(r.id), seq: Number(r.seq), huella: String(r.huella), huellaAnterior: String(r.huella_anterior ?? ''),
                fechaHoraHusoGenRegistro: String((r.payload as any)?.fechaHoraHusoGenRegistro ?? ''),
                payload: r.payload as Record<string, unknown>, envioEstado: String(r.envio_estado) as EnvioEstado,
            },
        };
    }
    if (!altas.length) {
        throw new VerifactuCorreccionError(
            'Esta factura no tiene registro de alta en Verifactu, así que no se puede registrar su anulación. Escríbenos a soporte@flouvia.com antes de anularla.',
        );
    }
    const ultimaAlta = altas[altas.length - 1];
    const id = idFacturaDeAlta(ultimaAlta.payload);
    const enAeat = altas.some((r) => EN_AEAT.has(r.envioEstado));
    const pendiente = altas.some((r) => r.envioEstado === 'pendiente');
    const sinRegistroPrevio = !enAeat && !pendiente;
    const sistemaInformatico = await sifIdentityForOrg(orgId);
    const input = {
        idEmisorFacturaAnulada: id.idEmisorFactura,
        numSerieFacturaAnulada: id.numSerieFactura,
        fechaExpedicionFacturaAnulada: id.fechaExpedicionFactura,
        nombreRazonEmisor: String(ultimaAlta.payload.nombreRazonEmisor || ''),
        entorno: ultimaAlta.payload.entorno === 'pruebas' || ultimaAlta.payload.entorno === 'produccion'
            ? ultimaAlta.payload.entorno : verifactuEnvioConfig().entorno,
        ...(sinRegistroPrevio ? { sinRegistroPrevio: 'S' as const } : {}),
        sistemaInformatico,
    };
    const problemas = problemasEsquemaAnulacion({ ...input, huella: 'A'.repeat(64), fechaHoraHusoGenRegistro: '2000-01-01T00:00:00+01:00' });
    if (problemas.length) {
        throw new VerifactuDatosError('Los datos del registro de alta de esta factura no permiten registrar su anulación. Escríbenos a soporte@flouvia.com.');
    }
    const correccion: CorreccionRegistro | undefined = ultimaAnulacion
        ? { subsanaDe: ultimaAnulacion.id, subsanacion: false, rechazoPrevio: null, sinRegistroPrevio }
        : undefined;
    return { input, sinRegistroPrevio, ...(correccion ? { correccion } : {}) };
}

function ultimoDeTipo(historial: RegistroHistorial[], tipo: 'alta' | 'anulacion'): RegistroHistorial | undefined {
    const delTipo = historial.filter((r) => r.tipo === tipo);
    return delTipo[delTipo.length - 1];
}

/**
 * Crea el registro de SUBSANACIÓN de un registro ya encadenado — la única
 * forma legal de corregirlo (regla 29). Sin UI todavía: lo invoca soporte (o
 * una futura acción en Ajustes › Fiscal) con el id del registro que la AEAT
 * rechazó o aceptó con errores, DESPUÉS de corregir el dato de origen (NIF del
 * cliente, razón social, conceptos del documento…).
 *
 * Alta (se reconstruye desde el snapshot ACTUAL del documento, con el MISMO
 * IDFactura — NIF, número y fecha — del registro que corrige):
 *   - la AEAT ya tiene la factura y el último intento fue aceptado →
 *     "ALTA DE SUBSANACIÓN" (Subsanacion = S);
 *   - la AEAT ya la tiene pero la última subsanación se rechazó →
 *     "ALTA POR RECHAZO DE SUBSANACIÓN" (Subsanacion = S, RechazoPrevio = S);
 *   - la AEAT nunca la tuvo (todo rechazado o aparcado) →
 *     "ALTA POR RECHAZO" (Subsanacion = S, RechazoPrevio = X).
 * Anulación (solo si la anterior fue rechazada o aparcada):
 *   - el alta está en la AEAT → "ANULACIÓN POR RECHAZO" (RechazoPrevio = S);
 *   - el alta nunca llegó → "ANULACIÓN POR RECHAZO SIN REGISTRO PREVIO"
 *     (SinRegistroPrevio = S, RechazoPrevio = S).
 *
 * Con `reactivar: true` se admite corregir el alta de una factura YA anulada:
 * la AEAT la vuelve a dar de alta con los datos nuevos (anexo §6.1, OK(5)). Es
 * la salida cuando la anulación se encadenó y la factura no llegó a anularse
 * en Cord (entró un pago mientras tanto): ver `reactivarAltaVerifactu`.
 *
 * Idempotente: corregir dos veces el mismo registro devuelve la misma
 * corrección. Solo se corrige el ÚLTIMO registro de su tipo para la factura.
 * Lanza `VerifactuCorreccionError` / `VerifactuDatosError` con mensaje apto
 * para el usuario.
 */
export async function crearSubsanacionVerifactu(
    orgId: string,
    registroId: string,
    opciones: { reactivar?: boolean } = {},
): Promise<ChainedRegistro> {
    const [rows] = await withOrgTx(orgId, sql`
        select id, documento_id, tipo, envio_estado, payload from verifactu_registros
         where id = ${registroId} and org_id = ${orgId} limit 1`);
    const registro = rows[0];
    if (!registro) throw new VerifactuCorreccionError('No se encontró ese registro de Verifactu.');
    // Idempotente: si ese registro ya se corrigió, la corrección es la misma.
    const yaCorregido = await correccionDe(orgId, registroId);
    if (yaCorregido) return yaCorregido;
    const documentId = String(registro.documento_id);
    const tipo = registro.tipo === 'anulacion' ? 'anulacion' : 'alta';
    const estado = String(registro.envio_estado) as EnvioEstado;
    const historial = await historialDocumento(orgId, documentId);
    const ultimo = ultimoDeTipo(historial, tipo);
    if (ultimo && ultimo.id !== registroId) {
        throw new VerifactuCorreccionError('Ese registro ya tiene una corrección posterior: corrige el más reciente.');
    }
    if (estado === 'pendiente') {
        throw new VerifactuCorreccionError('Ese registro todavía no tiene respuesta de la AEAT. Espera al resultado del envío antes de corregirlo.');
    }
    const altas = historial.filter((r) => r.tipo === 'alta');
    const altaEnAeat = altas.some((r) => EN_AEAT.has(r.envioEstado));
    const sistemaInformatico = await sifIdentityForOrg(orgId);
    const payloadPrevio = registro.payload as Record<string, any>;

    if (tipo === 'anulacion') {
        if (!NO_LLEGO.has(estado)) {
            throw new VerifactuCorreccionError('Solo se corrige una anulación que la AEAT rechazó o que no se pudo enviar.');
        }
        const correccion: CorreccionRegistro = {
            subsanaDe: registroId, subsanacion: false, rechazoPrevio: 'S', sinRegistroPrevio: !altaEnAeat,
        };
        const nuevo = await appendVerifactuAnulacion(orgId, documentId, {
            idEmisorFacturaAnulada: normalizarNifEs(payloadPrevio.idEmisorFacturaAnulada),
            numSerieFacturaAnulada: String(payloadPrevio.numSerieFacturaAnulada ?? ''),
            fechaExpedicionFacturaAnulada: String(payloadPrevio.fechaExpedicionFacturaAnulada ?? ''),
            nombreRazonEmisor: String(payloadPrevio.nombreRazonEmisor || ultimoDeTipo(historial, 'alta')?.payload.nombreRazonEmisor || ''),
            entorno: payloadPrevio.entorno ?? verifactuEnvioConfig().entorno,
            rechazoPrevio: 'S',
            ...(!altaEnAeat ? { sinRegistroPrevio: 'S' as const } : {}),
            sistemaInformatico,
        }, correccion);
        await logVerifactuEvento(orgId, 'subsanacion', { registro: registroId, nuevo: nuevo.id, tipo });
        return nuevo;
    }

    const anulacionVigente = historial.some((r) => r.tipo === 'anulacion' && !NO_LLEGO.has(r.envioEstado));
    if (anulacionVigente && !opciones.reactivar) {
        // Una subsanación de alta sobre una factura anulada la REACTIVA en la
        // AEAT (anexo §6.1, OK(5)). No es una corrección: es otra decisión.
        throw new VerifactuCorreccionError('Esta factura está anulada: corregir su alta la volvería a dar de alta ante la AEAT.');
    }
    const ultimaAlta = ultimoDeTipo(historial, 'alta');
    const rechazoPrevio: 'S' | 'X' | null = !altaEnAeat ? 'X' : (ultimaAlta && NO_LLEGO.has(ultimaAlta.envioEstado) ? 'S' : null);

    const [docs] = await withOrgTx(orgId, sql`
        select d.invoice_number, d.credit_note_of, d.currency, d.ledger_currency, d.fx_rate,
               d.subtotal, d.tax_total, d.total, d.issuer_snapshot, d.recipient_snapshot, d.line_items_snapshot
          from documentos_fiscales d
         where d.id = ${documentId} and d.org_id = ${orgId} limit 1`);
    const doc = docs[0];
    if (!doc) throw new VerifactuCorreccionError('No se encontró el documento de ese registro.');
    const issuer = (doc.issuer_snapshot ?? {}) as FiscalParty;
    const fxRate = Number(doc.fx_rate);
    const totals: FiscalTotals = {
        subtotal: Number(doc.subtotal) || 0,
        taxes: Number(doc.tax_total) || 0,
        total: Number(doc.total) || 0,
        currency: String(doc.currency || 'EUR'),
        ...(Number.isFinite(fxRate) && fxRate > 0 && fxRate !== 1
            ? { exchangeRate: fxRate, ledgerCurrency: String(doc.ledger_currency || '') } : {}),
    };
    const rectificativa = doc.credit_note_of
        ? await identidadFacturaOriginal(orgId, String(doc.credit_note_of))
        : undefined;
    const alta = construirAlta({
        // El IDFactura de una subsanación es el del registro que corrige: misma
        // clave única ante la AEAT.
        emisor: { legalName: issuer.legalName, taxId: payloadPrevio.idEmisorFactura },
        receptor: (doc.recipient_snapshot ?? {}) as FiscalParty,
        numSerie: String(payloadPrevio.numSerieFactura ?? doc.invoice_number ?? ''),
        fechaExpedicion: String(payloadPrevio.fechaExpedicionFactura ?? ''),
        lines: (doc.line_items_snapshot ?? []) as FiscalLineItem[],
        totals,
        entorno: payloadPrevio.entorno ?? verifactuEnvioConfig().entorno,
        ...(rectificativa ? { rectificativa: { original: rectificativa.original, tipoOriginal: rectificativa.tipoOriginal } } : {}),
        correccion: rechazoPrevio ? { rechazoPrevio } : {},
    });
    const correccion: CorreccionRegistro = {
        subsanaDe: registroId, subsanacion: true, rechazoPrevio, sinRegistroPrevio: false,
    };
    const nuevo = await appendVerifactuAlta(orgId, documentId, {
        ...alta, sistemaInformatico, emitidaAt: payloadPrevio.emitidaAt,
    }, correccion);

    // El QR de la factura se recalcula con el registro corregido (su importe
    // pudo cambiar): el PDF se regenera desde provider_data.verifactu.
    const p = nuevo.payload as Record<string, any>;
    const qrUrl = verifactuQrUrl({
        nif: p.idEmisorFactura, numSerie: p.numSerieFactura, fecha: p.fechaExpedicionFactura, importeTotal: p.importeTotal,
    }, { entorno: p.entorno ?? verifactuEnvioConfig().entorno });
    await withOrgTx(orgId, sql`
        update documentos_fiscales
           set provider_data = jsonb_set(
                 coalesce(provider_data, '{}'::jsonb), '{verifactu}',
                 coalesce(provider_data->'verifactu', '{}'::jsonb)
                   || ${JSON.stringify({ seq: nuevo.seq, huella: nuevo.huella, huellaAnterior: nuevo.huellaAnterior, qrUrl, importeTotal: p.importeTotal, envioEstado: 'pendiente', subsanaDe: registroId })}::jsonb),
               updated_at = now()
         where id = ${documentId} and org_id = ${orgId}`);
    await logVerifactuEvento(orgId, 'subsanacion', { registro: registroId, nuevo: nuevo.id, tipo, rechazoPrevio });
    return nuevo;
}

/**
 * Vuelve a dar de alta ante la AEAT una factura cuya anulación ya se encadenó
 * pero que en Cord sigue vigente — el caso de `voidInvoice` cuando un pago
 * entra entre el registro de anulación y la anulación local. Encadena un alta
 * de SUBSANACIÓN del último alta de la factura (que, enviada después de la
 * anulación, la reactiva con sus datos). Lanza `VerifactuCorreccionError` si
 * la factura no tiene alta o su alta aún no tiene respuesta de la AEAT.
 */
export async function reactivarAltaVerifactu(orgId: string, documentId: string): Promise<ChainedRegistro> {
    const historial = await historialDocumento(orgId, documentId);
    const ultimaAlta = ultimoDeTipo(historial, 'alta');
    if (!ultimaAlta) throw new VerifactuCorreccionError('Esta factura no tiene registro de alta en Verifactu.');
    if (!historial.some((r) => r.tipo === 'anulacion')) {
        throw new VerifactuCorreccionError('Esta factura no tiene registro de anulación: no hay nada que reactivar.');
    }
    return crearSubsanacionVerifactu(orgId, ultimaAlta.id, { reactivar: true });
}

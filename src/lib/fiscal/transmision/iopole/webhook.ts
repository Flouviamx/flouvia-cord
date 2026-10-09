// Webhooks de Iopole: la firma HMAC y la lectura de cada aviso en el
// vocabulario de Cord (EventoPlataforma). Fuente: documentación "The Webhook
// object", secciones "HMAC Authentication", "Callback status", "Callback
// onboarding" y "Events Endpoint".
//
// Firma, tal como la documenta Iopole:
//   checksum  = SHA-256 hex del cuerpo JSON tal como llegó (en multipart, solo
//               del archivo; Cord no se suscribe a facturas recibidas)
//   canónica  = `${X-Timestamp}\n${MÉTODO}\n${ruta?consulta}\n${checksum}`
//   X-Signature = HMAC-SHA256 hex de la canónica con el secreto compartido
// `X-Checksum` es opcional; si viene, debe coincidir. Además Cord rechaza una
// marca de tiempo a más de diez minutos (repetición de un aviso viejo): los
// avisos son "al menos una vez" y se deduplican por su id, pero uno capturado
// y reenviado mucho después no es un reintento de Iopole.
//
// Puro: sin base de datos ni red.

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { EventoPlataforma } from '../proveedor';
import { estadoDeEtapa, leerEstado } from './cuerpos';

export const VENTANA_FIRMA_MS = 10 * 60_000;

export interface FirmaEntrante {
    secreto: string;
    metodo: string;
    /** Ruta y consulta tal como se pidieron (`/api/fiscal/iopole/webhook?tipo=status`). */
    rutaConConsulta: string;
    cabeceras: { timestamp: string | null; firma: string | null; checksum: string | null };
    cuerpo: Uint8Array;
    ahora?: number;
}

const HEX64 = /^[0-9a-f]{64}$/i;

export function verificarFirma(f: FirmaEntrante): boolean {
    const ts = String(f.cabeceras.timestamp ?? '').trim();
    const firma = String(f.cabeceras.firma ?? '').trim().toLowerCase();
    if (!f.secreto || !/^\d{10,16}$/.test(ts) || !HEX64.test(firma)) return false;
    const ahora = f.ahora ?? Date.now();
    if (Math.abs(ahora - Number(ts)) > VENTANA_FIRMA_MS) return false;
    const checksum = createHash('sha256').update(f.cuerpo).digest('hex');
    const recibido = String(f.cabeceras.checksum ?? '').trim().toLowerCase();
    if (recibido && recibido !== checksum) return false;
    const canonica = `${ts}\n${f.metodo.toUpperCase()}\n${f.rutaConConsulta}\n${checksum}`;
    const esperada = createHmac('sha256', f.secreto).update(canonica).digest();
    const dada = Buffer.from(firma, 'hex');
    return dada.length === esperada.length && timingSafeEqual(dada, esperada);
}

/** Para pruebas y para el script de registro: la firma que pondría Iopole. */
export function firmar(secreto: string, metodo: string, rutaConConsulta: string, cuerpo: Uint8Array, timestamp: number): { timestamp: string; firma: string; checksum: string } {
    const checksum = createHash('sha256').update(cuerpo).digest('hex');
    const firma = createHmac('sha256', secreto).update(`${timestamp}\n${metodo.toUpperCase()}\n${rutaConConsulta}\n${checksum}`).digest('hex');
    return { timestamp: String(timestamp), firma, checksum };
}

const texto = (v: unknown) => (typeof v === 'string' ? v : v === undefined || v === null ? '' : String(v));

function motivoEvento(payload: any): string {
    const r = payload?.rejectionDetail ?? null;
    const errores = Array.isArray(r?.errors) ? r.errors.map((e: any) => texto(e?.message)).filter(Boolean) : [];
    return [texto(r?.message) || texto(r?.reason), ...errores.slice(0, 3)].filter(Boolean).join(' · ').slice(0, 1000)
        || 'La plataforma rechazó el envío.';
}

/**
 * Un aviso de Iopole ya verificado, en el vocabulario de Cord. Distingue el
 * tipo por su forma (la URL registrada lleva además `?tipo=`): onboarding
 * trae `enrollmentId`, estado trae `statusId` e `invoiceId`, y los eventos del
 * operador `eventType`.
 */
export function interpretar(json: any): EventoPlataforma {
    if (!json || typeof json !== 'object') return { tipo: 'ignorado', razon: 'cuerpo' };

    if (json.enrollmentId && (json.status || json.state)) {
        const etapa = texto(json.status ?? json.state).toUpperCase();
        return { tipo: 'alta', altaId: texto(json.enrollmentId), etapa, estado: estadoDeEtapa(etapa), fecha: texto(json.date) || new Date().toISOString() };
    }

    if (json.statusId && json.invoiceId) {
        const estado = leerEstado(json);
        return estado ? { tipo: 'estado_factura', estado } : { tipo: 'ignorado', razon: 'estado_ilegible' };
    }

    if (json.eventType) {
        const ref = texto(json.referencedObject?.id);
        switch (String(json.eventType)) {
            case 'EREPORTING_TRANSACTION_ATTACHED':
            case 'EREPORTING_PAYMENT_ATTACHED':
                return ref ? { tipo: 'reporte_integrado', envioProveedorId: ref, fecha: texto(json.timestamp) || new Date().toISOString() } : { tipo: 'ignorado', razon: 'sin_referencia' };
            case 'EREPORTING_ERROR':
                return ref ? { tipo: 'reporte_rechazado', envioProveedorId: ref, motivo: motivoEvento(json.payload), detalle: json.payload ?? null } : { tipo: 'ignorado', razon: 'sin_referencia' };
            case 'OUTBOUND_STATUS_INVALID':
            case 'OUTBOUND_STATUS_NOT_ALLOWED': {
                // La documentación no publica el cuerpo de estos dos: el id del
                // estado se toma del objeto referido, como en los demás eventos.
                const id = ref || texto(json.payload?.statusId);
                return id ? { tipo: 'cobro_rechazado', envioProveedorId: id, motivo: motivoEvento(json.payload) } : { tipo: 'ignorado', razon: 'sin_referencia' };
            }
            case 'OUTBOUND_INVOICE_NOT_DELIVERED': {
                const id = ref || texto(json.payload?.invoiceId);
                return id ? { tipo: 'factura_no_entregada', facturaId: id, motivo: motivoEvento(json.payload) } : { tipo: 'ignorado', razon: 'sin_referencia' };
            }
            default:
                return { tipo: 'ignorado', razon: `evento ${texto(json.eventType)}` };
        }
    }
    return { tipo: 'ignorado', razon: 'forma_desconocida' };
}

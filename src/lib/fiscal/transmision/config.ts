// Interruptor ÚNICO de la emisión por plataforma autorizada en Francia. Mismo
// contrato que la SPFE (spfe/config.ts) y los rieles de LatAm:
//
//   IOPOLE_ENABLED=true           sin esto Cord no habla con la plataforma y la
//                                 pantalla lo dice. Falla cerrado.
//   IOPOLE_ENTORNO=produccion     'preproduccion' es el valor por defecto a
//                                 propósito: subir a producción exige escribirlo.
//                                 Un valor desconocido APAGA el riel.
//   IOPOLE_CLIENT_ID / _SECRET    credenciales OAuth 2.0 (client_credentials) del
//                                 operador, una pareja por entorno.
//   IOPOLE_CUSTOMER_ID            opcional: cabecera `customer-id` cuando la
//                                 cuenta de operador gestiona varios clientes.
//   IOPOLE_WEBHOOK_SECRET         secreto HMAC con que la plataforma firma sus
//                                 webhooks (el mismo que se registra en ella).
//
// Los hosts salen de la especificación publicada por Iopole, no de memoria:
// preproducción, de la OpenAPI de https://api.ppd.iopole.fr/v1/api (copia
// fijada en scripts/fixtures/iopole/, la verifica `npm run security:fr-pa`);
// producción, de la de https://api.iopole.com/v1/api, idéntica salvo la URL
// del token (SHA-256 el 09/10/2026: operator/config fabd846e…b21f8856d…,
// operator/invoicing f346cc59…, operator/reporting f3d77439…) y del
// descubrimiento OpenID de https://auth.iopole.com/realms/iopole.
//
// Puro: sin base de datos ni red.

import type { EntornoPa } from './proveedor';

export interface HostsIopole {
    api: string;
    token: string;
}

export const HOSTS_IOPOLE: Record<EntornoPa, HostsIopole> = {
    preproduccion: {
        api: 'https://api.ppd.iopole.fr',
        token: 'https://auth.preprod.iopole.fr/realms/iopole/protocol/openid-connect/token',
    },
    produccion: {
        api: 'https://api.iopole.com',
        token: 'https://auth.iopole.com/realms/iopole/protocol/openid-connect/token',
    },
};

export interface ConfigPa {
    habilitado: boolean;
    entorno: EntornoPa;
    /** Por qué está apagado, en vocabulario operativo (log y Ops, nunca la UI). */
    motivo?: 'apagado' | 'entorno_invalido' | 'sin_credenciales';
    clientId?: string;
    clientSecret?: string;
    customerId?: string | null;
    webhookSecret?: string | null;
}

function env(name: string): string {
    const fromMeta = (import.meta as { env?: Record<string, string | undefined> }).env?.[name];
    return String(fromMeta || (typeof process !== 'undefined' ? process.env?.[name] : '') || '').trim();
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function paConfig(): ConfigPa {
    const raw = env('IOPOLE_ENTORNO').toLowerCase();
    const entorno: EntornoPa = raw === 'produccion' ? 'produccion' : 'preproduccion';
    if (raw && raw !== 'produccion' && raw !== 'preproduccion') return { habilitado: false, entorno, motivo: 'entorno_invalido' };
    if (env('IOPOLE_ENABLED').toLowerCase() !== 'true') return { habilitado: false, entorno, motivo: 'apagado' };
    const clientId = env('IOPOLE_CLIENT_ID');
    const clientSecret = env('IOPOLE_CLIENT_SECRET');
    if (!clientId || !clientSecret) return { habilitado: false, entorno, motivo: 'sin_credenciales' };
    const customerId = env('IOPOLE_CUSTOMER_ID');
    return {
        habilitado: true,
        entorno,
        clientId,
        clientSecret,
        customerId: UUID.test(customerId) ? customerId : null,
        webhookSecret: env('IOPOLE_WEBHOOK_SECRET') || null,
    };
}

/** El entorno de lo que se lee y se escribe, encendido o no (las filas se guardan por entorno). */
export function entornoPa(): EntornoPa {
    return paConfig().entorno;
}

/** Nombre de la plataforma: solo donde el negocio firma su mandato (excepción de la regla 14). */
export const NOMBRE_PLATAFORMA = 'Iopole';

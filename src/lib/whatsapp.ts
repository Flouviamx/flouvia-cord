// src/lib/whatsapp.ts
// WhatsApp Business (Cloud API de Meta) como canal hacia el CLIENTE.
//
// Tres reglas de Meta que mandan sobre el diseño, no al revés:
//
// 1. **Una conversación se inicia con una PLANTILLA aprobada.** No se puede
//    mandar texto libre a alguien que no te escribió en las últimas 24 horas.
//    Por eso el negocio configura el nombre de su plantilla y Cord solo rellena
//    sus variables: ofrecer un campo de texto libre sería prometer algo que el
//    proveedor rechaza con un error que no le dice nada al vendedor (regla 14).
// 2. **El número va en E.164**, sin espacios ni signos. Meta acepta el mensaje
//    y no lo entrega si el formato está mal, así que se valida aquí.
// 3. **El token es de la cuenta del negocio** y viaja cifrado en la base.
//
// REGLA DE ORO (igual que Slack/Teams/webhooks): nunca lanza.

import { sql, withOrgTx } from './db';
import { decryptSecret } from './crypto-secret';
import { log } from './log';
import { trackExternalUsage } from './external-usage';

const GRAPH = 'https://graph.facebook.com/v21.0';
const TIMEOUT_MS = 8000;

/** Máximo de variables que admite el cuerpo de una plantilla en Cord. */
export const WHATSAPP_MAX_VARS = 4;

export interface WhatsAppConfig {
    phoneId: string;
    token: string;
    plantilla: string;
    idioma: string;
}

/**
 * Número en E.164: `+` y de 8 a 15 dígitos. Se acepta lo que el vendedor ya
 * tiene capturado con espacios o guiones y se normaliza; lo que no se hace es
 * INVENTAR la lada del país, porque un número sin lada entregado al azar le
 * escribe a un desconocido.
 */
export function toE164(raw: string | null | undefined): string | null {
    const limpio = String(raw ?? '').replace(/[\s()\-.]/g, '');
    if (!limpio) return null;
    const conMas = limpio.startsWith('+') ? limpio : (limpio.startsWith('00') ? `+${limpio.slice(2)}` : null);
    if (!conMas) return null;
    return /^\+[1-9]\d{7,14}$/.test(conMas) ? conMas : null;
}

/** Configuración de la organización, o null si no está completa. */
export async function whatsappConfig(orgId: string): Promise<WhatsAppConfig | null> {
    const [[org]] = await withOrgTx(orgId, sql`
        select whatsapp_phone_id, whatsapp_token_enc, whatsapp_plantilla, whatsapp_plantilla_idioma
          from orgs where id = ${orgId}`);
    const token = decryptSecret(org?.whatsapp_token_enc as string);
    const phoneId = String(org?.whatsapp_phone_id ?? '').trim();
    const plantilla = String(org?.whatsapp_plantilla ?? '').trim();
    if (!token || !phoneId || !plantilla) return null;
    return {
        phoneId,
        token,
        plantilla,
        idioma: String(org?.whatsapp_plantilla_idioma ?? '').trim() || 'es_MX',
    };
}

export type WhatsAppResult =
    | { ok: true; messageId: string | null }
    | { ok: false; reason: 'sin_config' | 'numero' | 'plantilla' | 'rechazo' | 'red' };

/**
 * Manda la plantilla configurada. `vars` rellena {{1}}, {{2}}… del cuerpo, en
 * orden: Meta las numera, no las nombra.
 */
export async function sendWhatsAppTemplate(orgId: string, telefono: string | null | undefined, vars: string[]): Promise<WhatsAppResult> {
    const config = await whatsappConfig(orgId);
    if (!config) return { ok: false, reason: 'sin_config' };
    return sendWithConfig(orgId, config, telefono, vars);
}

export async function sendWithConfig(orgId: string, config: WhatsAppConfig, telefono: string | null | undefined, vars: string[]): Promise<WhatsAppResult> {
    const to = toE164(telefono);
    if (!to) return { ok: false, reason: 'numero' };

    const parameters = vars.slice(0, WHATSAPP_MAX_VARS).map((v) => ({
        type: 'text',
        // Meta rechaza saltos de línea y tabulaciones dentro de una variable.
        text: String(v ?? '').replace(/[\r\n\t]+/g, ' ').slice(0, 300),
    }));
    const body = {
        messaging_product: 'whatsapp',
        to: to.replace('+', ''),
        type: 'template',
        template: {
            name: config.plantilla,
            language: { code: config.idioma },
            ...(parameters.length ? { components: [{ type: 'body', parameters }] } : {}),
        },
    };

    try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
        const res = await fetch(`${GRAPH}/${encodeURIComponent(config.phoneId)}/messages`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: ctrl.signal,
            redirect: 'error',
        });
        clearTimeout(timer);
        const data = await res.json().catch(() => ({}));
        await trackExternalUsage({ orgId, provider: 'meta', category: 'whatsapp', operation: 'template', status: res.ok ? 'success' : 'failure' });
        if (!res.ok) {
            // El mensaje de Meta se registra para operación, no viaja al
            // vendedor: habla de plantillas y códigos de Graph (regla 14).
            log.error('WhatsApp rechazó el mensaje', { route: 'whatsapp', orgId, status: res.status, err: data?.error?.message });
            const code = Number(data?.error?.code ?? 0);
            // 132000-132015 es la familia de errores de plantilla: no existe,
            // no está aprobada o le faltan variables.
            return { ok: false, reason: code >= 132000 && code <= 132100 ? 'plantilla' : 'rechazo' };
        }
        return { ok: true, messageId: data?.messages?.[0]?.id ?? null };
    } catch (err) {
        log.error('WhatsApp no respondió', { route: 'whatsapp', orgId, err });
        return { ok: false, reason: 'red' };
    }
}

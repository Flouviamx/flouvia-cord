'use strict';

// Disparador de Cord para n8n. n8n registra y borra el webhook en Cord por su
// cuenta (`webhookMethods`), así que el usuario nunca pega una URL a mano ni
// deja webhooks huérfanos al borrar el flujo.
//
// La firma `X-Cord-Signature-V1` SÍ se verifica: n8n entrega el cuerpo crudo en
// `req.rawBody`, que es lo que Make no expone. Sin cuerpo crudo no se inventa
// una verificación con el JSON re-serializado — daría falsos negativos y, peor,
// falsa confianza.

const crypto = require('node:crypto');
const { EVENT_OPTIONS } = require('../../lib/events.js');

const API = 'https://cordhq.app/api/v1';

function timingSafeEqual(a, b) {
    const bufA = Buffer.from(a, 'utf8');
    const bufB = Buffer.from(b, 'utf8');
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Firma v1 de Cord: HMAC-SHA256 sobre `<timestamp>.<cuerpo crudo>`.
 *
 * Durante una rotación de secreto el header trae DOS `v1=` (nuevo y viejo);
 * basta con que uno cuadre. Quedarse con el último —lo que haría un
 * `Object.fromEntries`— funciona por casualidad hoy y se rompe el día que el
 * orden cambie. `toleranciaSeg` corta el replay de una entrega vieja.
 */
function signatureMatches(rawBody, header, secret, toleranciaSeg = 300) {
    if (!header || !secret) return false;
    let t = null;
    const firmas = [];
    for (const kv of String(header).split(',')) {
        const eq = kv.indexOf('=');
        if (eq === -1) continue;
        const key = kv.slice(0, eq).trim();
        const value = kv.slice(eq + 1).trim();
        if (key === 't') t = value;
        else if (key === 'v1') firmas.push(value);
    }
    if (!t || !firmas.length) return false;
    const edad = Math.abs(Math.floor(Date.now() / 1000) - parseInt(t, 10));
    if (!Number.isFinite(edad) || edad > toleranciaSeg) return false;
    const expected = crypto.createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');
    return firmas.some((firma) => timingSafeEqual(expected, firma));
}

class CordTrigger {
    constructor() {
        this.description = {
            displayName: 'Cord Trigger',
            name: 'cordTrigger',
            icon: 'file:cord.svg',
            group: ['trigger'],
            version: 1,
            description: 'Starts the workflow when something happens in Cord',
            defaults: { name: 'Cord Trigger' },
            inputs: [],
            outputs: ['main'],
            credentials: [{ name: 'cordApi', required: true }],
            webhooks: [{
                name: 'default',
                httpMethod: 'POST',
                responseMode: 'onReceived',
                path: 'webhook',
            }],
            properties: [
                {
                    displayName: 'Events',
                    name: 'eventos',
                    type: 'multiOptions',
                    required: true,
                    default: [],
                    description: 'Cord sends only the events you choose',
                    options: EVENT_OPTIONS,
                },
                {
                    displayName: 'Verify Signature',
                    name: 'verificar',
                    type: 'boolean',
                    default: true,
                    description: 'Whether to reject deliveries whose X-Cord-Signature-V1 does not match the webhook secret',
                },
            ],
        };

        this.webhookMethods = {
            default: {
                async checkExists() {
                    const data = this.getWorkflowStaticData('node');
                    return Boolean(data.webhookId);
                },
                async create() {
                    const data = this.getWorkflowStaticData('node');
                    const url = this.getNodeWebhookUrl('default');
                    const eventos = this.getNodeParameter('eventos');
                    const body = await this.helpers.httpRequestWithAuthentication.call(this, 'cordApi', {
                        method: 'POST',
                        url: `${API}/webhooks`,
                        body: { url, eventos },
                        json: true,
                    });
                    const created = body && body.data ? body.data : body;
                    if (!created || !created.id) return false;
                    data.webhookId = created.id;
                    // El secreto sólo se devuelve al crear: si no se guarda aquí,
                    // no hay forma de volver a pedirlo y la firma queda sin verificar.
                    data.secret = created.secret || null;
                    return true;
                },
                async delete() {
                    const data = this.getWorkflowStaticData('node');
                    if (!data.webhookId) return true;
                    try {
                        await this.helpers.httpRequestWithAuthentication.call(this, 'cordApi', {
                            method: 'DELETE',
                            url: `${API}/webhooks/${data.webhookId}`,
                            json: true,
                        });
                    } catch {
                        // Un webhook ya borrado en Cord no debe impedir borrar el nodo.
                    }
                    delete data.webhookId;
                    delete data.secret;
                    return true;
                },
            },
        };
    }

    async webhook() {
        const req = this.getRequestObject();
        const data = this.getWorkflowStaticData('node');
        const verificar = this.getNodeParameter('verificar', true);
        const eventos = this.getNodeParameter('eventos', []);

        if (verificar && data.secret) {
            const raw = req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(req.body ?? {});
            if (!req.rawBody || !signatureMatches(raw, req.headers['x-cord-signature-v1'], data.secret)) {
                return { webhookResponse: { status: 401 }, noWebhookResponse: false, workflowData: [] };
            }
        }

        const body = req.body ?? {};
        // Segunda compuerta: Cord ya filtra por suscripción, pero si alguien
        // edita los eventos del nodo sin recrear el webhook, el flujo no debe
        // recibir lo que ya no eligió.
        if (Array.isArray(eventos) && eventos.length && body.event && !eventos.includes(body.event)) {
            return { workflowData: [] };
        }

        return { workflowData: [this.helpers.returnJsonArray([body])] };
    }
}

module.exports = { CordTrigger, signatureMatches, API };

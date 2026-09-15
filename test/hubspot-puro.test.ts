import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { decodeHubSpotUri, parseHubSpotEvents, verifyHubSpotSignature } from '../src/lib/integraciones/hubspot/webhook';
import {
    clienteFromCompany, clienteFromContact, companyProps, contactProps, dealProps, huella, sanitizeAjustes, stagesComplete,
} from '../src/lib/integraciones/hubspot/mapping';

const SECRET = 'hubspot-client-secret';
const URL_HOOK = 'https://cordhq.app/api/integraciones/hubspot/webhook';
const sign = (body: string, ts: string, uri = URL_HOOK, method = 'POST') =>
    createHmac('sha256', SECRET).update(`${method}${uri}${body}${ts}`).digest('base64');

describe('firma v3 de HubSpot', () => {
    const body = JSON.stringify([{ portalId: 123, objectId: 456, subscriptionType: 'contact.propertyChange' }]);
    const now = 1_760_000_000_000;
    const ts = String(now - 1000);

    it('acepta una firma válida y rechaza cuerpo, secreto o método alterados', () => {
        const signature = sign(body, ts);
        const base = { secret: SECRET, method: 'POST', uris: [URL_HOOK], body, signature, timestamp: ts, now };
        expect(verifyHubSpotSignature(base)).toBe(true);
        expect(verifyHubSpotSignature({ ...base, body: body.replace('456', '457') })).toBe(false);
        expect(verifyHubSpotSignature({ ...base, secret: 'otro' })).toBe(false);
        expect(verifyHubSpotSignature({ ...base, method: 'PUT' })).toBe(false);
        expect(verifyHubSpotSignature({ ...base, signature: null })).toBe(false);
    });

    it('rechaza timestamps de más de 5 minutos o mal formados', () => {
        const viejo = String(now - 6 * 60 * 1000);
        expect(verifyHubSpotSignature({ secret: SECRET, method: 'POST', uris: [URL_HOOK], body, signature: sign(body, viejo), timestamp: viejo, now })).toBe(false);
        expect(verifyHubSpotSignature({ secret: SECRET, method: 'POST', uris: [URL_HOOK], body, signature: sign(body, 'abc'), timestamp: 'abc', now })).toBe(false);
    });

    it('prueba cada URI candidata, para cubrir el host público configurado', () => {
        const signature = sign(body, ts);
        expect(verifyHubSpotSignature({ secret: SECRET, method: 'POST', uris: ['http://internal:3000/api/integraciones/hubspot/webhook', URL_HOOK], body, signature, timestamp: ts, now })).toBe(true);
    });

    it('decodifica solo los caracteres que indica HubSpot', () => {
        expect(decodeHubSpotUri('https://x.test/a%3Ab%2Fc?d=%40e%20f')).toBe('https://x.test/a:b/c?d=@e%20f');
    });
});

describe('eventos de HubSpot', () => {
    it('toma empresas y contactos, descarta lo demás y deduplica', () => {
        const out = parseHubSpotEvents([
            { portalId: 1, objectId: 10, subscriptionType: 'company.propertyChange' },
            { portalId: 1, objectId: 10, subscriptionType: 'company.propertyChange' },
            { portalId: 1, objectId: 20, subscriptionType: 'contact.deletion' },
            { portalId: 1, objectId: 30, subscriptionType: 'object.propertyChange', objectTypeId: '0-2' },
            { portalId: 1, objectId: 40, subscriptionType: 'deal.propertyChange' },
            { portalId: 'x', objectId: 50, subscriptionType: 'contact.propertyChange' },
            { portalId: 1, objectId: '1; drop', subscriptionType: 'contact.propertyChange' },
            null,
        ]);
        expect(out).toEqual([
            { portalId: '1', objeto: 'company', objectId: '10' },
            { portalId: '1', objeto: 'contact', objectId: '20' },
            { portalId: '1', objeto: 'company', objectId: '30' },
        ]);
        expect(parseHubSpotEvents({ no: 'lista' })).toEqual([]);
    });
});

describe('mapeo Cord ↔ HubSpot', () => {
    it('cliente a empresa y contacto', () => {
        const c = { empresa: ' Stark\nIndustries ', contacto: 'Pepper Potts Stark', email: 'Compras@Stark.com', telefono: '555' };
        expect(companyProps(c)).toEqual({ name: 'Stark Industries' });
        expect(contactProps(c)).toEqual({ email: 'compras@stark.com', firstname: 'Pepper', lastname: 'Potts Stark', phone: '555' });
        expect(contactProps({ empresa: 'X' })).toBeNull();
    });

    it('un deal exige etapa y divisa: sin divisa no se envía un monto', () => {
        const ajustes = sanitizeAjustes({});
        expect(stagesComplete(ajustes)).toBe(true);
        const q = { folio: 'COT-1', status: 'paid', total: 1500.5, moneda: 'usd', cliente: 'ACME' };
        const now = new Date('2026-09-14T12:00:00Z');
        expect(dealProps(q, ajustes, now)).toEqual({
            dealname: 'COT-1 · ACME', amount: '1500.5', deal_currency_code: 'USD', pipeline: 'default', dealstage: 'closedwon', closedate: '2026-09-14',
        });
        expect(dealProps({ ...q, moneda: null }, ajustes)).toBeNull();
        expect(dealProps({ ...q, status: 'draft' }, ajustes)).toBeNull();
        expect(dealProps({ ...q, status: 'sent' }, ajustes, now)).not.toHaveProperty('closedate');
        expect(dealProps({ ...q, cerrada: '2026-03-02T18:00:00Z' }, ajustes, now)).toMatchObject({ closedate: '2026-03-02' });
    });

    it('un pipeline propio sin etapas elegidas no sincroniza deals', () => {
        const ajustes = sanitizeAjustes({ pipeline: '12345', etapas: { sent: '999' } });
        expect(stagesComplete(ajustes)).toBe(false);
        expect(dealProps({ folio: 'COT-1', status: 'approved', total: 1, moneda: 'MXN', cliente: null }, ajustes)).toBeNull();
        expect(sanitizeAjustes({ pipeline: 'x; drop', etapas: { sent: '<script>' } })).toMatchObject({ pipeline: 'default', etapas: { sent: 'presentationscheduled' } });
    });

    it('lo que llega de HubSpot se limpia y un correo inválido no pasa', () => {
        expect(clienteFromCompany({ name: '  ' })).toBeNull();
        expect(clienteFromContact({ firstname: 'Ana', lastname: 'López', email: 'no-es-correo', phone: '1' })).toEqual({ contacto: 'Ana López', email: '', telefono: '1' });
    });

    it('la huella no depende del orden de las propiedades', () => {
        expect(huella({ a: '1', b: '2' })).toBe(huella({ b: '2', a: '1' }));
        expect(huella({ a: '1' })).not.toBe(huella({ a: '2' }));
    });
});

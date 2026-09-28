import { describe, expect, it } from 'vitest';
import { construirMime, encabezadoUtf8 } from '../src/lib/integraciones/gmail/mime';
import { OPERACIONES_GMAIL } from '../src/lib/integraciones/gmail/envio';

const cabecera = (mime: string) => mime.split('\r\n\r\n')[0];

describe('correo MIME para Gmail', () => {
    it('codifica el asunto con acentos y deja el ASCII tal cual', () => {
        expect(encabezadoUtf8('Quote COT-1')).toBe('Quote COT-1');
        const enc = encabezadoUtf8('Cotización COT-0006 — Flouvia');
        expect(enc).toMatch(/^=\?UTF-8\?B\?.+\?=$/);
        expect(Buffer.from(enc.slice(10, -2), 'base64').toString('utf8')).toBe('Cotización COT-0006 — Flouvia');
    });

    it('un salto de línea en datos del negocio no inyecta encabezados', () => {
        const mime = construirMime({
            from: 'ventas@acme.test', fromName: 'Acme\r\nBcc: robo@evil.test', to: 'cliente@x.test\nBcc: otro@evil.test',
            subject: 'Hola\r\nBcc: tercero@evil.test', html: '<p>hola</p>',
        }, 'b1');
        const lineas = cabecera(mime).split('\r\n');
        expect(lineas.some((l) => /^Bcc:/i.test(l))).toBe(false);
        expect(lineas.filter((l) => l.startsWith('To: '))).toEqual(['To: cliente@x.test Bcc: otro@evil.test']);
    });

    it('lleva el HTML y los adjuntos en partes separadas', () => {
        const mime = construirMime({
            from: 'ventas@acme.test', fromName: 'Acme', to: 'c@x.test', replyTo: 'r@acme.test', subject: 'Factura',
            html: '<p>Tu factura</p>', attachments: [{ filename: 'F-1.pdf', content: new Uint8Array([37, 80, 68, 70]), contentType: 'application/pdf' }],
        }, 'b1');
        expect(cabecera(mime)).toContain('From: Acme <ventas@acme.test>');
        expect(cabecera(mime)).toContain('Reply-To: r@acme.test');
        expect(mime).toContain('Content-Type: application/pdf; name="F-1.pdf"');
        expect(mime).toContain(Buffer.from('<p>Tu factura</p>').toString('base64'));
        expect(mime.trimEnd().endsWith('--b1--')).toBe(true);
    });

    it('solo los correos al cliente del negocio salen por su Gmail', () => {
        expect(OPERACIONES_GMAIL.has('quote_sent')).toBe(true);
        expect(OPERACIONES_GMAIL.has('invoice_issued')).toBe(true);
        expect(OPERACIONES_GMAIL.has('webhook_health_alert')).toBe(false);
    });
});

import { describe, expect, it, vi } from 'vitest';

const enviarPorGmail = vi.fn(async () => ({ ok: true, id: 'g-1' }));
vi.mock('../src/lib/integraciones/gmail/envio', () => ({
    enviarPorGmail, OPERACIONES_GMAIL: new Set(['quote_sent']),
}));
vi.mock('../src/lib/db', () => ({ sql: vi.fn(() => ''), withOrgTx: vi.fn() }));
vi.mock('../src/lib/external-usage', () => ({ trackExternalUsage: vi.fn() }));

const { sendEmail } = await import('../src/lib/email');

describe('la respuesta a un correo que sale por Gmail', () => {
    it('vuelve al Gmail del negocio, no al correo de contacto', async () => {
        await sendEmail({
            orgId: 'org', operation: 'quote_sent', to: 'c@x.test', subject: 'S', html: '<p/>',
            replyTo: 'contacto@acme.test', replyToPropio: null,
        });
        expect(enviarPorGmail).toHaveBeenLastCalledWith('org', expect.objectContaining({ replyTo: null }));
    });

    it('respeta la dirección de respuesta que el negocio eligió a propósito', async () => {
        await sendEmail({
            orgId: 'org', operation: 'quote_sent', to: 'c@x.test', subject: 'S', html: '<p/>',
            replyTo: 'cobros@acme.test', replyToPropio: 'cobros@acme.test',
        });
        expect(enviarPorGmail).toHaveBeenLastCalledWith('org', expect.objectContaining({ replyTo: 'cobros@acme.test' }));
    });
});

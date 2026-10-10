import { beforeEach, describe, expect, it, vi } from 'vitest';

// Correos al CLIENTE fuera de una sesión (cron, API pública): salen en el idioma
// de la CUENTA (`orgs.idioma`), no en el español por defecto de un request sin
// idioma. Y los recordatorios llevan la firma propia del negocio con el mismo
// gate de plan que el correo con que se envió la factura.

const m = vi.hoisted(() => ({
    row: {} as Record<string, unknown>,
    plan: 'starter',
    enviados: [] as { subject: string; html: string; fromName?: string | null }[],
}));
vi.mock('../src/lib/db', () => ({ sql: vi.fn(() => ''), withOrgTx: vi.fn(async () => [[m.row]]) }));
vi.mock('../src/lib/org-entitlements', () => ({ getEntitlementContext: async () => ({ effectivePlan: m.plan }) }));
vi.mock('../src/lib/public-links', () => ({ publicDocumentUrl: async (_o: string, k: string, tk: string) => `https://cordhq.app/${k}/${tk}` }));
vi.mock('../src/lib/external-usage', () => ({ trackExternalUsage: vi.fn() }));
vi.mock('../src/lib/fiscal/invoice-attachment', () => ({ buildInvoiceAttachments: async () => [] }));
vi.mock('../src/lib/integraciones/gmail/envio', () => ({
    OPERACIONES_GMAIL: new Set(['invoice_reminder', 'payment_reminder', 'invoice_issued']),
    enviarPorGmail: async (_org: string, o: { subject: string; html: string; fromName?: string | null }) => {
        m.enviados.push({ subject: o.subject, html: o.html, fromName: o.fromName });
        return { ok: true, id: 'g-1' };
    },
}));

const { notifyInvoiceIssued, notifyInvoiceReminder, notifyQuoteReminder } = await import('../src/lib/email');

const FACTURA = {
    invoice_number: 'F-1048', total: 2400, currency: 'USD', amount_remaining: 1200, due_date: '2026-10-17',
    public_token: 'tok-f', lifecycle: 'open', email: 'ap@austinbuilders.test', empresa: 'Austin Builders',
    org_nombre: 'Lone Star Supply', color: '#0a192f', logo_url: null, color_secundario: null, brand_profile: null,
    email_from_name: 'Lone Star Billing', email_reply_to: null, email_contacto: 'hi@lonestar.test',
    portal_powered: true, sandbox_of: null, moneda: 'USD', idioma: 'en-US',
    email_intro: 'Hi {cliente}, here is invoice {folio}.', email_firma: 'Dana, {negocio}', pdf_mensaje: null,
    autopay_activo: false, autopay_metodo: null, cobro_automatico_permitido: true,
};

beforeEach(() => { m.enviados = []; m.plan = 'starter'; m.row = { ...FACTURA }; });

describe('idioma de la cuenta en correos sin sesión', () => {
    it('el recordatorio de factura sale en inglés para una cuenta en inglés', async () => {
        expect(await notifyInvoiceReminder('org', 'doc', 'vencida')).toBe(true);
        const [c] = m.enviados;
        expect(c.subject).toBe('Past due: invoice F-1048 — Lone Star Supply');
        expect(c.html).toContain('is past due');
        expect(c.html).toContain('$1,200.00');
        expect(c.html).toContain('Pay invoice');
    });

    it('y en español para una cuenta en español', async () => {
        m.row = { ...FACTURA, idioma: 'es-MX', currency: 'MXN', moneda: 'MXN' };
        await notifyInvoiceReminder('org', 'doc', 'antes');
        expect(m.enviados[0].subject).toBe('Tu factura F-1048 está por vencer — Lone Star Supply');
    });

    it('el día del vencimiento tiene su propio aviso', async () => {
        await notifyInvoiceReminder('org', 'doc', 'hoy');
        expect(m.enviados[0].subject).toBe('Invoice F-1048 is due today — Lone Star Supply');
        expect(m.enviados[0].html).toContain('is due today');
    });

    it('la factura emitida por la API o por una recurrencia también sigue a la cuenta', async () => {
        await notifyInvoiceIssued('org', 'doc');
        expect(m.enviados[0].subject).toBe('Invoice F-1048 — Lone Star Supply');
    });

    it('el aviso de cotización sale en el idioma de la cuenta, con divisa y la fecha civil', async () => {
        m.row = { ...FACTURA, folio: 'COT-0149', base_currency: 'USD', public_token: 'tok-q' };
        await notifyQuoteReminder('org', 'cot', { saldo: 40000, vence: '2026-10-13' });
        const [c] = m.enviados;
        expect(c.subject).toBe('Payment reminder — COT-0149');
        expect(c.html).toContain('Hello, Austin Builders team');
        expect(c.html).toContain('$40,000.00');
        expect(c.html).toContain('October 13');
        expect(c.fromName).toBe('Lone Star Billing');
    });
});

describe('texto propio del negocio en los recordatorios', () => {
    it('lleva la firma, no la introducción (que es del correo de envío)', async () => {
        await notifyInvoiceReminder('org', 'doc', 'vencida');
        const { html } = m.enviados[0];
        expect(html).toContain('Best regards,<br>Dana, Lone Star Supply');
        expect(html).not.toContain('here is invoice');
    });

    it('sin el plan que incluye correos personalizados, ni firma ni remitente propio', async () => {
        m.plan = 'free';
        await notifyInvoiceReminder('org', 'doc', 'vencida');
        expect(m.enviados[0].html).not.toContain('Dana');
        expect(m.enviados[0].fromName).toBe('Lone Star Supply');
        m.row = { ...FACTURA, folio: 'COT-0149', base_currency: 'USD', public_token: 'tok-q' };
        await notifyQuoteReminder('org', 'cot', { saldo: 10, vence: '2026-10-13' });
        expect(m.enviados[1].html).not.toContain('Dana');
    });
});

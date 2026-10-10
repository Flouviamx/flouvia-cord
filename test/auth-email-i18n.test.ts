import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTH_EMAIL_LOCALES, LOCALES } from '../src/i18n/locales';
import { authEmailStrings, t } from '../src/i18n/auth-email';
import { reqContext } from '../src/lib/context';

const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn().mockResolvedValue({ sent: true }) }));
vi.mock('../src/lib/email', () => ({ sendEmail, siteOrigin: () => 'https://cordhq.app' }));
import { sendVerificationEmail, sendPasswordResetEmail, sendNewDeviceAlertEmail, sendPasskeyAddedEmail, sendTeamInviteEmail } from '../src/lib/auth-email';

beforeEach(() => sendEmail.mockClear());

describe('correos de seguridad en cinco idiomas (sin envíos reales)', () => {
    it.each(AUTH_EMAIL_LOCALES)('%s: claves completas y variables preservadas', (locale) => {
        expect(Object.keys(authEmailStrings[locale]).sort()).toEqual(Object.keys(authEmailStrings.es).sort());
        for (const key of Object.keys(authEmailStrings.es) as (keyof typeof authEmailStrings.es)[]) {
            const value = t(locale, key);
            expect(value.trim()).not.toBe('');
            expect(value.match(/\{\w+\}/g) ?? []).toEqual(t('es', key).match(/\{\w+\}/g) ?? []);
        }
    });

    it.each(AUTH_EMAIL_LOCALES)('%s: asuntos, remitente, idioma HTML, enlaces y plazos', async (locale) => {
        await reqContext.run({ userId: null, locale: 'es', authEmailLocale: locale }, async () => {
            await sendVerificationEmail('person@example.test', 'a+/?&');
            await sendPasswordResetEmail('person@example.test', 'a+/?&');
            await sendNewDeviceAlertEmail('person@example.test');
            await sendPasskeyAddedEmail('person@example.test');
            await sendTeamInviteEmail('person@example.test', 'Acme', 'a+/?&', locale);
        });
        const kinds = ['verify', 'reset', 'alert', 'passkey', 'invite'] as const;
        kinds.forEach((kind, index) => {
            const mail = sendEmail.mock.calls[index][0];
            expect(mail.to).toBe('person@example.test');
            expect(mail.subject).toBe(t(locale, `authEmail.${kind}.asunto`).replace('{org}', 'Acme'));
            expect(mail.fromName).toBe(t(locale, 'authEmail.sender'));
            expect(mail.html).toContain(`lang="${LOCALES[locale].tag}"`);
            expect(mail.html).toContain(t(locale, `authEmail.${kind}.boton`));
            expect(mail.html).not.toMatch(/\{org\}/);
        });
        expect(sendEmail.mock.calls[0][0].html).toContain('/verify-email?token=a%2B%2F%3F%26');
        expect(sendEmail.mock.calls[0][0].html).toContain(t(locale, 'authEmail.verify.expira'));
        expect(sendEmail.mock.calls[1][0].html).toContain('/reset-password?token=a%2B%2F%3F%26');
        expect(sendEmail.mock.calls[1][0].html).toContain(t(locale, 'authEmail.reset.expira'));
        expect(sendEmail.mock.calls[4][0].html).toContain('/unirse/a%2B%2F%3F%26');
        expect(sendEmail.mock.calls[4][0].html).toContain(t(locale, 'authEmail.invite.expira'));
    });

    it('no confunde al invitado con quien invita; escapa HTML sin mutilar el asunto', async () => {
        await reqContext.run({ userId: null, locale: 'en', authEmailLocale: 'de' }, () =>
            sendTeamInviteEmail('person@example.test', 'A & B <script> $&\r\nCc: x', 'token'));
        const mail = sendEmail.mock.calls[0][0];
        expect(mail.fromName).toBe('Cord Security');
        expect(mail.subject).toContain('A & B <script> $&');
        expect(mail.subject).not.toMatch(/[\r\n]/);
        expect(mail.html).toContain('A &amp; B &lt;script&gt; $&');
        expect(mail.html).not.toContain('<script>');
    });

    it('propaga un fallo del envío sin inventar éxito', async () => {
        sendEmail.mockResolvedValueOnce({ sent: false, error: 'simulated failure' });
        expect(await sendVerificationEmail('person@example.test', 'token', 'fr')).toEqual({ sent: false, error: 'simulated failure' });
    });
});

import { brandEmailShell, emailBrandFromRow, emailButtonStyle, escapeEmail as esc } from './brand-email';
import { t } from '../i18n/app';
import { currencyDecimals, normalizeCurrency } from './currency';

/** Shared by delivery and the authenticated preview. No network or side effects. */
export function renderQuoteEmail(r: any, options: {locale:'es'|'en';link:string;canCustomizeEmail:boolean;canRemoveBranding:boolean}) {
    const {locale:L,link,canCustomizeEmail,canRemoveBranding} = options;
    const quoteCurrency = normalizeCurrency(r.base_currency || r.moneda);
    const moneyFmt = (n:number, locale:string, currency:string) => new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'es-MX', {style:'currency',currency,minimumFractionDigits:currencyDecimals(currency),maximumFractionDigits:currencyDecimals(currency)}).format(Number(n)||0);
    const tf = (key:string, vars:Record<string,string> = {}) => {
        let text = t(L,key as any); for (const [k,v] of Object.entries(vars)) text = text.split(`{${k}}`).join(v); return text;
    };
    // Variables disponibles en intro/firma: {cliente} {folio} {total} {negocio}.
    // (Texto propio del vendedor, capturado en Ajustes › Correo — no se traduce.)
    const fill = (txt: string) => esc(txt)
        .replace(/\{cliente\}/g, esc(r.empresa || t(L, 'email.cliente_generico')))
        .replace(/\{folio\}/g, esc(r.folio))
        .replace(/\{total\}/g, moneyFmt(r.total, L, quoteCurrency))
        .replace(/\{negocio\}/g, esc(r.org_nombre));
    const intro = (canCustomizeEmail && r.email_intro && r.email_intro.trim())
        ? fill(r.email_intro)
        : tf('email.intro_default', { org: esc(r.org_nombre), folio: esc(r.folio), total: moneyFmt(r.total, L, quoteCurrency) });
    const firma = (canCustomizeEmail && r.email_firma && r.email_firma.trim()) ? fill(r.email_firma) : '';
    const poweredLine = canRemoveBranding && r.portal_powered === false ? esc(r.org_nombre) : `${esc(r.org_nombre)}${t(L, 'email.enviado_con_cord')}`;
    const html = brandEmailShell(emailBrandFromRow(r), `<p style="font-size:16px;color:#111827;margin-top:0;font-weight:500;">${tf('email.saludo', { empresa: esc(r.empresa || t(L, 'email.cliente_generico')) })}</p>
            <p style="font-size:16px;line-height:1.6;color:#374151;margin-bottom:32px;font-weight:400;white-space:pre-line;">${intro}</p>

            <div style="margin:40px 0;">
                <a href="${esc(link)}" style="${emailButtonStyle(emailBrandFromRow(r))}">${tf('email.ver_cotizacion', { folio: esc(r.folio) })}</a>
            </div>

            <p style="font-size:14px;color:#6B7280;line-height:1.5;word-break:break-all;">${t(L, 'email.copie_enlace')}<br><a href="${esc(link)}" style="color:#2563EB;text-decoration:none;">${esc(link)}</a></p>

            ${r.mensaje ? `<div style="margin-top:40px;padding-top:32px;border-top:1px solid #F3F4F6;"><p style="font-size:15px;color:#374151;line-height:1.6;margin:0;">${esc(r.mensaje)}</p></div>` : ''}
            ${firma ? `<div style="margin-top:32px;"><p style="font-size:15px;color:#374151;line-height:1.6;margin:0;">${t(L, 'email.atentamente')}<br><span style="white-space:pre-line;">${firma}</span></p></div>` : ''}

        `, poweredLine);
    return html;
}

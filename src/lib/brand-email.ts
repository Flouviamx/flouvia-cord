import { brandColor, brandVariables, onBrandColor, resolveBrandProfile } from './brand-profile';

export interface EmailBrand { name: string; logo?: string; primary?: string; secondary?: string; profile?: unknown; }
export const escapeEmail = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function emailBrandFromRow(row: any): EmailBrand {
    return {name:row.org_nombre || row.nombre || '',logo:row.logo_url || '',primary:row.color || row.color_marca,secondary:row.color_secundario,profile:row.brand_profile};
}
export function emailButtonStyle(brand: EmailBrand): string {
    const p = resolveBrandProfile(brand.profile), color = brandColor(brand.primary);
    return `display:inline-block;background-color:${color};color:${onBrandColor(color)};text-decoration:none;font-weight:600;font-size:15px;padding:14px 24px;border-radius:${brandVariables(p,color)['--brand-button-radius']};`;
}
/** Pure presentation: caller owns escaped content, permissions, links and delivery. */
export function brandEmailShell(brand: EmailBrand, body: string, footer = ''): string {
    const p = resolveBrandProfile(brand.profile), color = brandColor(brand.primary);
    const v = brandVariables(p,color,brand.secondary);
    const contrast = p.header === 'contrast';
    const logo = contrast && p.logoDark ? p.logoDark : brand.logo;
    const safeLogo = typeof logo === 'string' && /^(https:\/\/|data:image\/(png|jpeg|webp|svg\+xml);base64,)/.test(logo) ? logo : '';
    const secondary = brandColor(brand.secondary,color);
    const soft = '#' + secondary.slice(1).match(/../g)!.map(c => Math.round(parseInt(c,16)*.1+255*.9).toString(16).padStart(2,'0')).join('');
    const background = contrast ? color : p.header === 'soft' ? soft : '#ffffff';
    const ink = contrast ? onBrandColor(color) : '#111827';
    const pad = p.density === 'compact' ? 24 : 36;
    return `<div style="background:#f5f5f7;padding:24px 12px;font-family:${escapeEmail(v['--brand-font'])};color:#111827;line-height:1.6;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:${v['--brand-radius']};"><tr><td style="padding:${pad}px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;background:${background};border-radius:${v['--brand-button-radius']};"><tr><td style="padding:${p.header === 'classic' ? '0 0 20px' : '22px'};color:${ink};border-bottom:${p.header === 'classic' ? `2px solid ${brandColor(brand.secondary,color)}` : '0'};">
${safeLogo ? `<img data-cord-brand-logo src="${escapeEmail(safeLogo)}" alt="${escapeEmail(brand.name)}" height="${parseInt(v['--brand-logo-height'])}" style="display:block;height:${v['--brand-logo-height']};max-width:200px;object-fit:contain;margin-bottom:12px;">` : ''}
<strong style="font-size:20px;line-height:1.3;color:${ink};">${escapeEmail(brand.name)}</strong></td></tr></table>
${body}
${footer ? `<div style="margin-top:32px;padding-top:20px;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280;">${footer}</div>` : ''}
</td></tr></table></div>`;
}

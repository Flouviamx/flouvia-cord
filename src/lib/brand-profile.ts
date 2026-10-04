import { z } from 'zod';

export const brandProfileSchema = z.object({
    header: z.enum(['classic', 'soft', 'contrast']).default('classic'),
    font: z.enum(['system', 'humanist', 'editorial']).default('system'),
    corners: z.enum(['precise', 'soft', 'round']).default('round'),
    density: z.enum(['comfortable', 'compact']).default('comfortable'),
    logoSize: z.enum(['small', 'medium', 'large']).default('medium'),
    logoDark: z.string().max(1_500_000).refine((v) => !v || /^(https:\/\/|data:image\/(png|jpeg|webp|svg\+xml);base64,)/.test(v)).default(''),
}).strict();
export type BrandProfile = z.infer<typeof brandProfileSchema>;
export const DEFAULT_BRAND = brandProfileSchema.parse({});
export function resolveBrandProfile(value: unknown): BrandProfile {
    const result = brandProfileSchema.safeParse(value ?? {});
    return result.success ? result.data : { ...DEFAULT_BRAND };
}
export function brandColor(value: unknown, fallback = '#0a192f'): string {
    return typeof value === 'string' && /^#[\da-f]{6}$/i.test(value) ? value : fallback;
}
export function onBrandColor(hex: string): string {
    const rgb = brandColor(hex).slice(1).match(/../g)!.map((v) => {
        const s = parseInt(v, 16) / 255;
        return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4;
    });
    const light = .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2];
    return (light + .05) / .05 > 1.05 / (light + .05) ? '#000000' : '#ffffff';
}
export function brandVariables(profile: BrandProfile, primary: string, secondary?: string): Record<string, string> {
    const color = brandColor(primary);
    return {
        '--brand-primary': color,
        '--brand-secondary': brandColor(secondary, color),
        '--brand-on-primary': onBrandColor(color),
        '--brand-radius': { precise: '12px', soft: '20px', round: '28px' }[profile.corners],
        '--brand-button-radius': { precise: '6px', soft: '12px', round: '24px' }[profile.corners],
        '--brand-logo-height': { small: '30px', medium: '42px', large: '60px' }[profile.logoSize],
        '--brand-gap': profile.density === 'compact' ? '1.3rem' : '2rem',
        '--brand-font': { system: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif', humanist: 'Verdana,Geneva,sans-serif', editorial: 'Georgia,"Times New Roman",serif' }[profile.font],
    };
}
export function brandStyle(profile: BrandProfile, primary: string, secondary?: string): string {
    return Object.entries(brandVariables(profile, primary, secondary)).map(([k, v]) => `${k}:${v}`).join(';');
}

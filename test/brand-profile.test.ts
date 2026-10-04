import { describe, it, expect } from 'vitest';
import { brandProfileSchema, resolveBrandProfile, DEFAULT_BRAND, brandColor, onBrandColor, brandVariables } from '../src/lib/brand-profile';
describe('public brand contract', () => {
    it('preserves default presentation for legacy orgs', () => {
        expect(resolveBrandProfile(undefined)).toEqual(DEFAULT_BRAND);
        expect(resolveBrandProfile({font:'injected'})).toEqual(DEFAULT_BRAND);
    });
    it('rejects unsupported settings and executable image URLs', () => {
        for (const data of [{font:'url(evil)'},{logoDark:'javascript:alert(1)'},{logoDark:'data:text/html;base64,AA=='},{header:'freeform'},{css:'body{}'}]) expect(brandProfileSchema.safeParse(data).success).toBe(false);
    });
    it('keeps valid choices on a serialization roundtrip', () => {
        const input={...DEFAULT_BRAND,header:'contrast',font:'editorial',logoSize:'large'};
        expect(resolveBrandProfile(JSON.parse(JSON.stringify(input)))).toEqual(input);
    });
    it('chooses readable text at both palette extremes', () => {
        expect(onBrandColor('#ffffff')).toBe('#000000');
        expect(onBrandColor('#0a192f')).toBe('#ffffff');
        expect(onBrandColor('#ffff00')).toBe('#000000');
    });
    it('cannot inject declarations through colors', () => {
        expect(brandColor('red;position:fixed')).toBe('#0a192f');
        expect(brandVariables(DEFAULT_BRAND,'url(evil)')['--brand-primary']).toBe('#0a192f');
    });
});

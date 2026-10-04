import { describe, expect, it } from 'vitest';
import { optionalWidgetHidden } from '../src/lib/widget-defaults';
describe('optional widget visibility', () => {
    it('keeps newly shipped widgets hidden for new and existing layouts', () => {
        expect(optionalWidgetHidden('new', [], [])).toBe(true);
        expect(optionalWidgetHidden('new', ['old'], [])).toBe(true);
    });
    it('restores an explicitly added widget and respects later removal', () => {
        expect(optionalWidgetHidden('new', ['new'], [])).toBe(false);
        expect(optionalWidgetHidden('new', ['new'], ['new'])).toBe(true);
    });
    it('reset returns optional widgets to the library', () => {
        expect(optionalWidgetHidden('new', [], [])).toBe(true);
    });
});

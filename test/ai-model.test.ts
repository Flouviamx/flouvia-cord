import { describe, expect, it } from 'vitest';
import { DEFAULT_AI_MODEL, resolveAiModel } from '../src/lib/ai-model';

describe('modelo de IA', () => {
    it('Haiku por default y con alias; un valor inválido no rompe las llamadas', () => {
        expect(DEFAULT_AI_MODEL).toMatch(/^claude-haiku-/);
        expect(resolveAiModel(undefined)).toBe(DEFAULT_AI_MODEL);
        expect(resolveAiModel('haiku')).toBe(DEFAULT_AI_MODEL);
        expect(resolveAiModel(' Haiku ')).toBe(DEFAULT_AI_MODEL);
        expect(resolveAiModel('el mejor')).toBe(DEFAULT_AI_MODEL);
        expect(resolveAiModel('claude-haiku-4-5-20251001')).toBe('claude-haiku-4-5-20251001');
    });
});

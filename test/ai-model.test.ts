import { describe, expect, it } from 'vitest';
import { DEFAULT_AI_MODEL, resolveAiModel } from '../src/lib/ai-model';

describe('modelo de IA', () => {
    it('Haiku por default y con alias; un valor inválido no rompe las llamadas', () => {
        expect(DEFAULT_AI_MODEL).toBe('claude-haiku-5-5');
        expect(resolveAiModel(undefined)).toBe(DEFAULT_AI_MODEL);
        expect(resolveAiModel('haiku')).toBe(DEFAULT_AI_MODEL);
        expect(resolveAiModel(' Haiku ')).toBe(DEFAULT_AI_MODEL);
        expect(resolveAiModel('el mejor')).toBe(DEFAULT_AI_MODEL);
        expect(resolveAiModel('claude-sonnet-5-5')).toBe('claude-sonnet-5-5');
    });

    it('un AI_MODEL que aún apunta a Haiku 4.5 se traduce al default (las llamadas mandan effort, que 4.5 rechaza)', () => {
        expect(resolveAiModel('claude-haiku-4-5-20251001')).toBe(DEFAULT_AI_MODEL);
        expect(resolveAiModel('claude-haiku-4-5')).toBe(DEFAULT_AI_MODEL);
    });
});

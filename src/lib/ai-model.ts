// Modelo de IA de Cord: Haiku en todo. AI_MODEL permite cambiarlo, pero un
// valor que no es un ID de Anthropic (por ejemplo "haiku" a secas) haría fallar
// cada llamada; se traduce el alias o se cae al default.
export const DEFAULT_AI_MODEL = 'claude-haiku-4-5-20251001';

const ALIASES: Record<string, string> = {
    haiku: DEFAULT_AI_MODEL,
    'claude-haiku': DEFAULT_AI_MODEL,
    'claude-haiku-4-5': DEFAULT_AI_MODEL,
};

export function resolveAiModel(value: unknown): string {
    const v = String(value ?? '').trim().toLowerCase();
    if (!v) return DEFAULT_AI_MODEL;
    if (ALIASES[v]) return ALIASES[v];
    return /^claude-[a-z0-9.-]+$/.test(v) ? v : DEFAULT_AI_MODEL;
}

export function aiModel(): string {
    return resolveAiModel(import.meta.env?.AI_MODEL || process.env.AI_MODEL);
}

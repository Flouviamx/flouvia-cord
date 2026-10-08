// Modelo de IA de Cord: Haiku en todo. AI_MODEL permite cambiarlo, pero un
// valor que no es un ID de Anthropic (por ejemplo "haiku" a secas) haría fallar
// cada llamada; se traduce el alias o se cae al default.
//
// Claude Haiku 5.5 (oct 2026) reemplazó a Haiku 4.5: 10x más barato ($0.10 / $0.50
// por millón contra $1 / $5) y mejor siguiendo instrucciones. Las llamadas mandan
// `output_config.effort`, que Haiku 4.5 rechaza con 400, así que un AI_MODEL que
// todavía apunte a 4.5 se TRADUCE al default en vez de pasar tal cual: si no, el
// override viejo de un entorno tumbaría toda la IA de la app.
export const DEFAULT_AI_MODEL = 'claude-haiku-5-5';

const ALIASES: Record<string, string> = {
    haiku: DEFAULT_AI_MODEL,
    'claude-haiku': DEFAULT_AI_MODEL,
    'claude-haiku-4-5': DEFAULT_AI_MODEL,
    'claude-haiku-4-5-20251001': DEFAULT_AI_MODEL,
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

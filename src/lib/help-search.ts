// Búsqueda del Centro de ayuda: la usan el panel de Ayuda en el navegador (FAQ y
// artículos) y Cord AI en el servidor (qué artículos acompañan a la pregunta).
// Un solo módulo para que los dos lados decidan "relevante" igual.
//
// Es por PALABRAS, no por frase: "como activo cobros con tarjeta" debe encontrar
// "Cómo activar los cobros en línea". Sin acentos, sin palabras vacías.

export const normalizeText = (s: string) =>
    String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const STOP = new Set(
    ('como que para por con los las del una uno unos unas mis tus sus hay puedo puede hago hacer esta este esto '
        + 'the and for how can what does with your you this that are from into have where when which '
        + 'de la el en y o a es se me lo le al un no si mas ya mi tu')
        .split(' ')
        .map(normalizeText),
);

export function tokenize(s: string): string[] {
    return normalizeText(s).split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w));
}

// Fracción de las palabras de la consulta presentes en el documento; el título
// pesa el doble que el cuerpo. 1 = todas en el título, 0.5 = todas en el cuerpo.
export function scoreDoc(query: string[], title: string, body: string): number {
    if (!query.length) return 0;
    const t = normalizeText(title);
    const b = normalizeText(body);
    let s = 0;
    for (const w of query) s += t.includes(w) ? 2 : b.includes(w) ? 1 : 0;
    return s / (query.length * 2);
}

export function rankDocs<T>(
    query: string,
    docs: T[],
    fields: (d: T) => { title: string; body: string },
    min = 0.5,
    limit = 4,
): T[] {
    const q = tokenize(query);
    if (!q.length) return [];
    return docs
        .map((d) => {
            const f = fields(d);
            return { d, s: scoreDoc(q, f.title, f.body) };
        })
        .filter((x) => x.s >= min)
        .sort((a, b) => b.s - a.s)
        .slice(0, limit)
        .map((x) => x.d);
}

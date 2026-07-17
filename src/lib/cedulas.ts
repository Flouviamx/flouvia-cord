// Motor de fórmulas y plantillas para Cédulas Presupuestales.
//
// Filosofía (ver docs/historial.md si se documenta ahí más tarde): esto es
// planeación, no un ERP de inventario en vivo. "Inventario inicial/final" son
// SUPUESTOS que el usuario teclea (filas 'input'), nunca un saldo rastreado.
// Las fórmulas usan UN SOLO primitivo genérico — "combo" (suma ponderada de
// referencias a otras filas, propias o de otra cédula) — que cubre suma, resta
// y escala sin necesitar un lenguaje de fórmulas libre tipo Excel.

import { getCedula, addCedulaFila, type CedulaFull, type CedulaFilaRow } from './queries';

export interface ComboTerm {
    fila_id: string;
    cedula_id?: string | null; // null/omitido = la misma cédula
    coef: number;
}
export interface ComboFormula {
    op: 'combo';
    terms: ComboTerm[];
}

export interface ComputedCedula {
    cedula: CedulaFull;
    valores: Record<string, number[]>; // filaId -> valor por periodo (input y formula resueltos)
}

function zeros(n: number): number[] {
    return Array.from({ length: n }, () => 0);
}
function round2(v: number): number {
    return Math.round((v + Number.EPSILON) * 100) / 100;
}

// Calcula una cédula completa: resuelve las filas 'formula' (incluidas las que
// referencian OTRA cédula, recursivamente) contra las filas 'input' tecleadas.
// `cache`/`stack` se pasan en llamadas recursivas para memoizar entre cédulas
// hermanas y cortar ciclos entre cédulas (una referencia circular resuelve a 0
// en vez de colgar el request).
export async function computeCedula(
    orgId: string,
    cedulaId: string,
    cache: Map<string, Promise<ComputedCedula | null>> = new Map(),
    stack: Set<string> = new Set(),
): Promise<ComputedCedula | null> {
    if (cache.has(cedulaId)) return cache.get(cedulaId)!;

    const promise = (async (): Promise<ComputedCedula | null> => {
        if (stack.has(cedulaId)) return null; // ciclo entre cédulas — corta
        stack.add(cedulaId);
        const cedula = await getCedula(orgId, cedulaId);
        if (!cedula) { stack.delete(cedulaId); return null; }

        const n = cedula.periodos.length;
        const out: Record<string, number[]> = {};
        const evaluating = new Set<string>(); // ciclo DENTRO de la misma cédula

        async function resolveRef(ref: ComboTerm): Promise<number[]> {
            const targetId = ref.cedula_id && ref.cedula_id !== cedulaId ? ref.cedula_id : cedulaId;
            if (targetId === cedulaId) {
                const fila = cedula!.filas.find((f) => f.id === ref.fila_id);
                if (!fila) return zeros(n);
                return await evalFila(fila);
            }
            const other = await computeCedula(orgId, targetId, cache, stack);
            if (!other) return zeros(n);
            const v = other.valores[ref.fila_id] ?? zeros(other.cedula.periodos.length);
            return Array.from({ length: n }, (_, i) => v[i] ?? 0);
        }

        async function evalFila(fila: CedulaFilaRow): Promise<number[]> {
            if (out[fila.id]) return out[fila.id];
            if (evaluating.has(fila.id)) return zeros(n); // ciclo local — corta a 0
            if (fila.tipo === 'input') {
                const row = cedula!.valores[fila.id] ?? {};
                const vals = Array.from({ length: n }, (_, i) => Number(row[i] ?? 0));
                out[fila.id] = vals;
                return vals;
            }
            evaluating.add(fila.id);
            let vals = zeros(n);
            const f = fila.formula as ComboFormula | null;
            if (f && f.op === 'combo' && Array.isArray(f.terms) && f.terms.length) {
                const resolved = await Promise.all(
                    f.terms.map(async (t) => ({ coef: Number(t.coef) || 0, vals: await resolveRef(t) })),
                );
                vals = Array.from({ length: n }, (_, i) =>
                    round2(resolved.reduce((s, r) => s + r.coef * (r.vals[i] ?? 0), 0)));
            }
            evaluating.delete(fila.id);
            out[fila.id] = vals;
            return vals;
        }

        for (const fila of cedula.filas) await evalFila(fila);
        stack.delete(cedulaId);
        return { cedula, valores: out };
    })();

    cache.set(cedulaId, promise);
    return promise;
}

// ── Plantillas ───────────────────────────────────────────────────────────
// Cada fila de plantilla se crea en orden; las filas 'formula' referencian
// por `key` local a filas YA creadas en esta misma pasada (se resuelven a su
// fila_id real antes de insertarse). El usuario puede editar/borrar/agregar
// filas libremente después — la plantilla es solo el punto de partida.

export interface TemplateRowDef {
    key: string;
    concepto: string;
    tipo: 'input' | 'formula';
    formula?: (ids: Record<string, string>) => ComboFormula;
}

export const CEDULA_TEMPLATES: Record<string, { nombre: string; filas: TemplateRowDef[] }> = {
    ventas: {
        nombre: 'Presupuesto de Ventas',
        filas: [
            { key: 'ventas', concepto: 'Ventas (unidades)', tipo: 'input' },
        ],
    },
    produccion: {
        nombre: 'Presupuesto de Producción',
        filas: [
            { key: 'ventas', concepto: 'Ventas (unidades)', tipo: 'input' },
            { key: 'inv_final', concepto: 'Inventario final deseado', tipo: 'input' },
            { key: 'inv_inicial', concepto: 'Inventario inicial', tipo: 'input' },
            {
                key: 'produccion', concepto: 'Producción requerida', tipo: 'formula',
                formula: (ids) => ({
                    op: 'combo',
                    terms: [
                        { fila_id: ids.ventas, coef: 1 },
                        { fila_id: ids.inv_final, coef: 1 },
                        { fila_id: ids.inv_inicial, coef: -1 },
                    ],
                }),
            },
        ],
    },
    compras_mp: {
        nombre: 'Presupuesto de Compras de Materia Prima',
        filas: [
            { key: 'consumo', concepto: 'Consumo de MP requerido para producción', tipo: 'input' },
            { key: 'inv_final_mp', concepto: 'Inventario final deseado de MP', tipo: 'input' },
            { key: 'inv_inicial_mp', concepto: 'Inventario inicial de MP', tipo: 'input' },
            {
                key: 'compras', concepto: 'Compras de MP requeridas', tipo: 'formula',
                formula: (ids) => ({
                    op: 'combo',
                    terms: [
                        { fila_id: ids.consumo, coef: 1 },
                        { fila_id: ids.inv_final_mp, coef: 1 },
                        { fila_id: ids.inv_inicial_mp, coef: -1 },
                    ],
                }),
            },
        ],
    },
    mano_obra: {
        nombre: 'Presupuesto de Mano de Obra y CIF',
        filas: [
            { key: 'unidades', concepto: 'Unidades a producir', tipo: 'input' },
            { key: 'horas_unidad', concepto: 'Horas de MOD por unidad', tipo: 'input' },
            { key: 'costo_hora', concepto: 'Costo por hora de MOD', tipo: 'input' },
            { key: 'cif_fijo', concepto: 'CIF fijo del periodo', tipo: 'input' },
        ],
    },
    cobranza: {
        nombre: 'Presupuesto de Cobranza',
        filas: [
            { key: 'ventas_credito', concepto: 'Ventas a crédito del periodo ($)', tipo: 'input' },
            { key: 'pct_mes', concepto: '% cobrado el mismo mes', tipo: 'input' },
            { key: 'pct_siguiente', concepto: '% cobrado el mes siguiente', tipo: 'input' },
        ],
    },
    custom: { nombre: 'Cédula personalizada', filas: [] },
};

// Siembra las filas de la plantilla del `tipo` dado sobre una cédula recién
// creada (vacía). No falla si el tipo no tiene plantilla — simplemente no
// agrega filas (equivalente a 'custom').
export async function applyTemplate(orgId: string, cedulaId: string, tipo: string): Promise<void> {
    const tpl = CEDULA_TEMPLATES[tipo];
    if (!tpl || !tpl.filas.length) return;
    const ids: Record<string, string> = {};
    let orden = 0;
    for (const row of tpl.filas) {
        const formula = row.tipo === 'formula' && row.formula ? row.formula(ids) : null;
        const id = await addCedulaFila(orgId, cedulaId, {
            concepto: row.concepto,
            tipo: row.tipo,
            formula,
            orden: orden++,
        });
        ids[row.key] = id;
    }
}

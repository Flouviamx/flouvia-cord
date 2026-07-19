// Motor de fórmulas y plantillas para Cédulas Presupuestales.
//
// Filosofía (ver docs/historial.md si se documenta ahí más tarde): esto es
// planeación, no un ERP de inventario en vivo. "Inventario inicial/final" son
// SUPUESTOS que el usuario teclea (filas 'input'), nunca un saldo rastreado.
// Las fórmulas usan UN SOLO primitivo genérico — "combo" (suma ponderada de
// referencias a otras filas, propias o de otra cédula) — que cubre suma, resta
// y escala sin necesitar un lenguaje de fórmulas libre tipo Excel.

import {
    getCedula, addCedulaFila, createCedula, upsertCedulaValor, getRealPorMes,
    setCedulaFilaFuente, upsertCedulaFilaFormula,
    type CedulaFull, type CedulaFilaRow,
} from './queries';

export interface ComboTerm {
    fila_id: string;
    cedula_id?: string | null; // null/omitido = la misma cédula
    coef: number;
    // 'suma' (default): running += coef × valor. 'pct': running *= (1 + valor/100) —
    // valor referenciado se interpreta como un % (ej. una fila input con "1" = 1%).
    // 'producto': running *= valor — multiplica el acumulado por otra fila completa.
    // Los términos se evalúan EN ORDEN (no como una suma sin orden) para poder encadenar
    // ajustes aditivos seguidos de factores multiplicativos (ver docs/historial.md).
    kind?: 'suma' | 'pct' | 'producto';
    // Desplazamiento de periodo (default 0 = mismo periodo). offset=1 lee el valor de la
    // fila referenciada UN periodo ANTES (ej. "cobranza de abril = 30% de ventas de marzo").
    // Fuera de rango (periodo-offset < 0) resuelve a 0 — no hay "periodo -1" implícito.
    // Ortogonal a `kind`: aplica igual a suma/pct/producto.
    offset?: number;
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
            let vals: number[];
            if (targetId === cedulaId) {
                const fila = cedula!.filas.find((f) => f.id === ref.fila_id);
                vals = fila ? await evalFila(fila) : zeros(n);
            } else {
                const other = await computeCedula(orgId, targetId, cache, stack);
                const v = other ? (other.valores[ref.fila_id] ?? zeros(other.cedula.periodos.length)) : zeros(n);
                vals = Array.from({ length: n }, (_, i) => v[i] ?? 0);
            }
            const offset = Number(ref.offset) || 0;
            if (!offset) return vals;
            // Desplaza N periodos atrás: el periodo i lee vals[i - offset]. Fuera de rango
            // (no hay periodo previo) resuelve a 0 — no se inventa un "periodo -1".
            return Array.from({ length: n }, (_, i) => vals[i - offset] ?? 0);
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
                // Fold SECUENCIAL (no una suma sin orden): cada término se aplica en el
                // orden en que el usuario lo agregó, sobre un acumulado por periodo. Los
                // términos 'suma' (default, retrocompatible) siguen dando el mismo
                // resultado que la suma ponderada de antes; 'pct'/'producto' operan sobre
                // lo acumulado hasta ese punto, permitiendo cascadas tipo "+ajustes → ×(1+
                // FE%) → ×(1+FA%)" o "unidades × precio" en una sola fila.
                const resolved = await Promise.all(
                    f.terms.map(async (t) => ({
                        kind: t.kind || 'suma',
                        coef: Number(t.coef) || 0,
                        vals: await resolveRef(t),
                    })),
                );
                const running = zeros(n);
                for (const r of resolved) {
                    for (let i = 0; i < n; i++) {
                        const v = r.vals[i] ?? 0;
                        if (r.kind === 'pct') running[i] = running[i] * (1 + v / 100);
                        else if (r.kind === 'producto') running[i] = running[i] * v;
                        else running[i] = running[i] + r.coef * v;
                    }
                }
                vals = running.map(round2);
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
    ventas_factores: {
        nombre: 'Presupuesto de Ventas con factores de ajuste',
        filas: [
            { key: 'base', concepto: 'Ventas año anterior (unidades)', tipo: 'input' },
            { key: 'ajuste1', concepto: 'Ajuste 1 — evento puntual (unidades)', tipo: 'input' },
            { key: 'ajuste2', concepto: 'Ajuste 2 — evento puntual (unidades)', tipo: 'input' },
            {
                key: 'ventas_ajustadas', concepto: 'Ventas ajustadas (unidades)', tipo: 'formula',
                formula: (ids) => ({
                    op: 'combo',
                    terms: [
                        { fila_id: ids.base, coef: 1 },
                        { fila_id: ids.ajuste1, coef: 1 },
                        { fila_id: ids.ajuste2, coef: 1 },
                    ],
                }),
            },
            { key: 'factor1', concepto: 'Factor de ajuste 1 (%)', tipo: 'input' },
            { key: 'factor2', concepto: 'Factor de ajuste 2 (%)', tipo: 'input' },
            {
                key: 'ventas_finales', concepto: 'Ventas finales (unidades)', tipo: 'formula',
                formula: (ids) => ({
                    op: 'combo',
                    terms: [
                        { fila_id: ids.ventas_ajustadas, coef: 1 },
                        { fila_id: ids.factor1, coef: 1, kind: 'pct' },
                        { fila_id: ids.factor2, coef: 1, kind: 'pct' },
                    ],
                }),
            },
            { key: 'precio', concepto: 'Precio unitario', tipo: 'input' },
            { key: 'crecimiento_precio', concepto: 'Crecimiento de precio (%)', tipo: 'input' },
            {
                key: 'precio_ajustado', concepto: 'Precio ajustado', tipo: 'formula',
                formula: (ids) => ({
                    op: 'combo',
                    terms: [
                        { fila_id: ids.precio, coef: 1 },
                        { fila_id: ids.crecimiento_precio, coef: 1, kind: 'pct' },
                    ],
                }),
            },
            {
                key: 'monto_total', concepto: 'Monto total de ventas ($)', tipo: 'formula',
                formula: (ids) => ({
                    op: 'combo',
                    terms: [
                        { fila_id: ids.ventas_finales, coef: 1 },
                        { fila_id: ids.precio_ajustado, coef: 1, kind: 'producto' },
                    ],
                }),
            },
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
    efectivo: {
        nombre: 'Presupuesto de Efectivo',
        filas: [
            { key: 'saldo_inicial', concepto: 'Saldo inicial de caja', tipo: 'input' },
            { key: 'ventas', concepto: 'Ventas del periodo ($)', tipo: 'input' },
            { key: 'compras', concepto: 'Compras del periodo ($)', tipo: 'input' },
            { key: 'gastos_fijos', concepto: 'Gastos fijos del periodo ($)', tipo: 'input' },
            {
                // Ejemplo 40/30/30 — edítalo a tu propio patrón de cobranza real.
                key: 'cobranza', concepto: 'Cobranza esperada ($)', tipo: 'formula',
                formula: (ids) => ({
                    op: 'combo',
                    terms: [
                        { fila_id: ids.ventas, coef: 0.4, offset: 0 },
                        { fila_id: ids.ventas, coef: 0.3, offset: 1 },
                        { fila_id: ids.ventas, coef: 0.3, offset: 2 },
                    ],
                }),
            },
            {
                // Ejemplo 30/70 — edítalo a tu propio patrón de pago real.
                key: 'pagos', concepto: 'Pagos a proveedores ($)', tipo: 'formula',
                formula: (ids) => ({
                    op: 'combo',
                    terms: [
                        { fila_id: ids.compras, coef: 0.3, offset: 0 },
                        { fila_id: ids.compras, coef: 0.7, offset: 1 },
                    ],
                }),
            },
            { key: 'prestamo', concepto: 'Préstamo recibido ($) — captúralo si falta efectivo', tipo: 'input' },
            { key: 'inversion', concepto: 'Inversión retirada ($) — captúralo si sobra efectivo', tipo: 'input' },
            {
                key: 'flujo_neto', concepto: 'Flujo neto del periodo ($)', tipo: 'formula',
                formula: (ids) => ({
                    op: 'combo',
                    terms: [
                        { fila_id: ids.cobranza, coef: 1 },
                        { fila_id: ids.pagos, coef: -1 },
                        { fila_id: ids.gastos_fijos, coef: -1 },
                        { fila_id: ids.prestamo, coef: 1 },
                        { fila_id: ids.inversion, coef: 1 },
                    ],
                }),
            },
            {
                // Saldo inicial es un supuesto tecleado (mismo patrón que "Inventario
                // inicial" en Producción) — cópialo del saldo final del periodo anterior.
                key: 'saldo_final', concepto: 'Saldo final de caja', tipo: 'formula',
                formula: (ids) => ({
                    op: 'combo',
                    terms: [
                        { fila_id: ids.saldo_inicial, coef: 1 },
                        { fila_id: ids.flujo_neto, coef: 1 },
                    ],
                }),
            },
        ],
    },
    custom: { nombre: 'Cédula personalizada', filas: [] },
};

// ── Presupuesto vs. Real ─────────────────────────────────────────────────
// Fuentes de datos reales a las que puede conectarse una fila. La etiqueta se
// muestra en el editor; la serie la resuelve getRealPorMes (queries.ts).
export const FUENTES_REAL: Record<string, string> = {
    ventas_monto: 'Ventas cerradas ($)',
    ventas_unidades: 'Unidades vendidas',
    cobranza_monto: 'Cobranza recibida ($)',
};

// Intenta leer un mes calendario de la etiqueta de un periodo ("Ene 2026",
// "Enero 2026", "2026-01", "01/2026", "Ene 26"…). Devuelve null si la etiqueta
// no nombra un mes reconocible (ej. "Q1", "Semana 3") — en ese caso esa columna
// simplemente no muestra dato real. Sin año explícito se asume el año en curso.
const MES_NOMBRES: Record<string, number> = {
    ene: 1, enero: 1, jan: 1, feb: 2, febrero: 2, mar: 3, marzo: 3, abr: 4, abril: 4, apr: 4,
    may: 5, mayo: 5, jun: 6, junio: 6, jul: 7, julio: 7, ago: 8, agosto: 8, aug: 8,
    sep: 9, sept: 9, septiembre: 9, oct: 10, octubre: 10, nov: 11, noviembre: 11, dic: 12, diciembre: 12, dec: 12,
};
export function parsePeriodoMes(label: string, hoy: Date = new Date()): { y: number; m: number } | null {
    const norm = String(label || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    if (!norm) return null;
    let match = norm.match(/^(\d{4})[-\/.](\d{1,2})$/);
    if (match) { const m = Number(match[2]); return m >= 1 && m <= 12 ? { y: Number(match[1]), m } : null; }
    match = norm.match(/^(\d{1,2})[-\/.](\d{4})$/);
    if (match) { const m = Number(match[1]); return m >= 1 && m <= 12 ? { y: Number(match[2]), m } : null; }
    const nombre = norm.match(/^([a-z]+)/)?.[1] ?? '';
    const m = MES_NOMBRES[nombre] ?? MES_NOMBRES[nombre.slice(0, 3)];
    if (!m) return null;
    const y4 = norm.match(/(\d{4})/);
    if (y4) return { y: Number(y4[1]), m };
    const y2 = norm.match(/[^0-9](\d{2})$/) ?? norm.match(/^[a-z]+\s*'?(\d{2})$/);
    if (y2) return { y: 2000 + Number(y2[1]), m };
    return { y: hoy.getFullYear(), m };
}

// Serie real por fila conectada: reales[fila_id][periodo_idx] = número o null.
// null = la etiqueta del periodo no nombra un mes, o el mes todavía no llega
// (mostrar "real $0 · −100%" de meses futuros sería ruido, no información).
export async function realesParaCedula(
    orgId: string,
    cedula: CedulaFull,
): Promise<Record<string, (number | null)[]>> {
    const conectadas = cedula.filas.filter((f) => f.fuenteReal && FUENTES_REAL[f.fuenteReal]);
    if (!conectadas.length) return {};

    const hoy = new Date();
    const mesActual = hoy.getFullYear() * 12 + hoy.getMonth(); // meses absolutos, 0-based
    const meses = cedula.periodos.map((label) => {
        const p = parsePeriodoMes(label, hoy);
        if (!p) return null;
        const abs = p.y * 12 + (p.m - 1);
        return abs > mesActual ? null : p; // futuro → sin dato real
    });
    const usables = meses.filter(Boolean) as { y: number; m: number }[];
    if (!usables.length) {
        // Filas conectadas pero ningún periodo parseable/pasado → todo null.
        return Object.fromEntries(conectadas.map((f) => [f.id, cedula.periodos.map(() => null)]));
    }
    const abs = usables.map((p) => p.y * 12 + (p.m - 1));
    const min = Math.min(...abs), max = Math.max(...abs);
    const desde = new Date(Math.floor(min / 12), min % 12, 1);
    const hasta = new Date(Math.floor(max / 12), (max % 12) + 1, 1); // exclusivo
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
    const serie = await getRealPorMes(orgId, iso(desde), iso(hasta));

    const out: Record<string, (number | null)[]> = {};
    for (const f of conectadas) {
        out[f.id] = meses.map((p) => {
            if (!p) return null;
            const mes = `${p.y}-${String(p.m).padStart(2, '0')}`;
            const r = serie[mes];
            if (!r) return 0; // mes pasado sin actividad = real 0 (dato válido)
            if (f.fuenteReal === 'ventas_unidades') return r.ventasUnidades;
            if (f.fuenteReal === 'cobranza_monto') return r.cobranzaMonto;
            return r.ventasMonto;
        });
    }
    return out;
}

// ── Duplicar cédula ──────────────────────────────────────────────────────
// Copia filas + valores a una cédula nueva ("copia 2026 → 2027"). Las fórmulas
// que referencian filas de la MISMA cédula se remapean a las filas nuevas; las
// referencias cruzadas a OTRAS cédulas se conservan tal cual.
export async function duplicateCedula(orgId: string, cedulaId: string, nombre?: string): Promise<string | null> {
    const src = await getCedula(orgId, cedulaId);
    if (!src) return null;
    const nuevoId = await createCedula(orgId, {
        tipo: src.tipo,
        nombre: (nombre || `${src.nombre} (copia)`).slice(0, 120),
        periodos: src.periodos,
    });
    const idMap: Record<string, string> = {};
    // 1ª pasada: crear todas las filas (las fórmulas se remapean después, cuando
    // ya existen los ids nuevos de TODAS las filas — una fórmula puede referenciar
    // una fila que aparece más adelante en el orden).
    let orden = 0;
    for (const f of src.filas) {
        idMap[f.id] = await addCedulaFila(orgId, nuevoId, {
            concepto: f.concepto, tipo: f.tipo, formula: null, orden: orden++,
        });
    }
    // 2ª pasada: fórmulas remapeadas + fuente_real + valores de filas input.
    for (const f of src.filas) {
        if (f.tipo === 'formula' && f.formula && (f.formula as ComboFormula).op === 'combo') {
            const formula: ComboFormula = {
                op: 'combo',
                terms: ((f.formula as ComboFormula).terms || []).map((t) => ({
                    ...t,
                    // Referencia interna → fila nueva; cruzada → intacta.
                    fila_id: (!t.cedula_id || t.cedula_id === cedulaId) ? (idMap[t.fila_id] ?? t.fila_id) : t.fila_id,
                    cedula_id: (!t.cedula_id || t.cedula_id === cedulaId) ? null : t.cedula_id,
                })),
            };
            await upsertCedulaFilaFormula(orgId, nuevoId, idMap[f.id], formula);
        }
        if (f.fuenteReal) await setCedulaFilaFuente(orgId, nuevoId, idMap[f.id], f.fuenteReal);
        if (f.tipo === 'input') {
            const vals = src.valores[f.id] ?? {};
            for (const [idx, valor] of Object.entries(vals)) {
                if (Number(valor)) await upsertCedulaValor(orgId, idMap[f.id], nuevoId, Number(idx), Number(valor));
            }
        }
    }
    return nuevoId;
}

// ── Wizard "Plan financiero completo" ────────────────────────────────────
// Crea en un clic la cascada de dinero universal — Ventas → Cobranza → Efectivo
// — ya CABLEADA entre cédulas (las referencias cruzadas que a mano exigirían
// dominar el constructor de fórmulas), sembrada con el promedio real de ventas
// de los últimos meses de la org, y con las filas clave ya conectadas a
// "Presupuesto vs. Real". Con `incluirProduccion` agrega además las cédulas de
// Producción y Compras de MP (plantillas estándar, en unidades).
export async function createPlanCompleto(
    orgId: string,
    periodos: string[],
    opts: { incluirProduccion?: boolean } = {},
): Promise<{ ventasId: string; ids: string[] }> {
    // Seed: promedio mensual de ventas cerradas de los últimos 6 meses (si hay).
    let seedVentas = 0;
    try {
        const hoy = new Date();
        const desde = new Date(hoy.getFullYear(), hoy.getMonth() - 6, 1);
        const hasta = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1);
        const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
        const serie = await getRealPorMes(orgId, iso(desde), iso(hasta));
        const montos = Object.values(serie).map((r) => r.ventasMonto).filter((v) => v > 0);
        if (montos.length) seedVentas = Math.round(montos.reduce((a, b) => a + b, 0) / montos.length);
    } catch { /* sin historial → arranca en 0, no es error */ }

    const ids: string[] = [];

    // 1) Ventas — la base. Conectada a ventas reales desde el día uno.
    const ventasId = await createCedula(orgId, { tipo: 'ventas', nombre: 'Presupuesto de Ventas', periodos });
    ids.push(ventasId);
    const filaVentas = await addCedulaFila(orgId, ventasId, { concepto: 'Ventas del periodo ($)', tipo: 'input', orden: 0 });
    await setCedulaFilaFuente(orgId, ventasId, filaVentas, 'ventas_monto');
    if (seedVentas > 0) {
        for (let i = 0; i < periodos.length; i++) await upsertCedulaValor(orgId, filaVentas, ventasId, i, seedVentas);
    }

    // 2) Cobranza — 40/30/30 sobre Ventas (referencia CRUZADA + offsets), editable.
    const cobranzaId = await createCedula(orgId, { tipo: 'cobranza', nombre: 'Presupuesto de Cobranza', periodos });
    ids.push(cobranzaId);
    const filaCobranza = await addCedulaFila(orgId, cobranzaId, {
        concepto: 'Cobranza esperada ($)', tipo: 'formula', orden: 0,
        formula: {
            op: 'combo',
            terms: [
                { fila_id: filaVentas, cedula_id: ventasId, coef: 0.4, offset: 0 },
                { fila_id: filaVentas, cedula_id: ventasId, coef: 0.3, offset: 1 },
                { fila_id: filaVentas, cedula_id: ventasId, coef: 0.3, offset: 2 },
            ],
        } satisfies ComboFormula,
    });
    await setCedulaFilaFuente(orgId, cobranzaId, filaCobranza, 'cobranza_monto');

    // 3) Efectivo — entradas = Cobranza (cruzada); salidas tecleadas; saldo final.
    const efectivoId = await createCedula(orgId, { tipo: 'efectivo', nombre: 'Presupuesto de Efectivo', periodos });
    ids.push(efectivoId);
    let o = 0;
    const fSaldoIni = await addCedulaFila(orgId, efectivoId, { concepto: 'Saldo inicial de caja', tipo: 'input', orden: o++ });
    const fEntradas = await addCedulaFila(orgId, efectivoId, {
        concepto: 'Entradas — cobranza esperada ($)', tipo: 'formula', orden: o++,
        formula: { op: 'combo', terms: [{ fila_id: filaCobranza, cedula_id: cobranzaId, coef: 1 }] } satisfies ComboFormula,
    });
    const fGastos = await addCedulaFila(orgId, efectivoId, { concepto: 'Gastos fijos del periodo ($)', tipo: 'input', orden: o++ });
    const fPagos = await addCedulaFila(orgId, efectivoId, { concepto: 'Pagos a proveedores ($)', tipo: 'input', orden: o++ });
    const fFlujo = await addCedulaFila(orgId, efectivoId, {
        concepto: 'Flujo neto del periodo ($)', tipo: 'formula', orden: o++,
        formula: {
            op: 'combo',
            terms: [
                { fila_id: fEntradas, coef: 1 },
                { fila_id: fGastos, coef: -1 },
                { fila_id: fPagos, coef: -1 },
            ],
        } satisfies ComboFormula,
    });
    await addCedulaFila(orgId, efectivoId, {
        concepto: 'Saldo final de caja', tipo: 'formula', orden: o++,
        formula: { op: 'combo', terms: [{ fila_id: fSaldoIni, coef: 1 }, { fila_id: fFlujo, coef: 1 }] } satisfies ComboFormula,
    });

    // 4) Opcional: Producción + Compras de MP (plantillas estándar, en unidades).
    if (opts.incluirProduccion) {
        const prodId = await createCedula(orgId, { tipo: 'produccion', nombre: 'Presupuesto de Producción', periodos });
        await applyTemplate(orgId, prodId, 'produccion');
        ids.push(prodId);
        const mpId = await createCedula(orgId, { tipo: 'compras_mp', nombre: 'Presupuesto de Compras de MP', periodos });
        await applyTemplate(orgId, mpId, 'compras_mp');
        ids.push(mpId);
    }

    return { ventasId, ids };
}

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

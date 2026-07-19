// Motor de cálculo para las herramientas de análisis (evaluación de proyecto y
// punto óptimo de inventario). Funciones PURAS, sin imports de DB — así se pueden
// bundlear también en el <script> del cliente (single source of truth, la misma
// fórmula corre en el navegador y en cualquier validación de servidor).
//
// Solo se persisten los INPUTS (tabla `analisis`); estos resultados se calculan
// on-the-fly, igual que las filas 'formula' de una cédula.

// ── Evaluación de proyecto (VPN / TIR / periodo de recuperación) ──────────────

export interface ProyectoInputs {
    inversionInicial: number;   // desembolso al inicio (I0), como número positivo
    tasa: number;               // tasa de descuento anual, en % (ej. 15)
    anios: number;              // horizonte en años
    flujos: number[];           // flujo neto de efectivo por año (año 1..n)
}

export interface ProyectoResult {
    vpFlujos: number[];         // valor presente de cada flujo
    vpn: number;
    decision: 'acepta' | 'rechaza';
    payback: number | null;     // años (con fracción); null si nunca se recupera
    tir: number | null;         // en %, o null si no hay raíz
    factorAnualidad: number | null; // (1-(1+r)^-n)/r cuando el flujo es uniforme
}

function round2(v: number): number {
    return Math.round((v + Number.EPSILON) * 100) / 100;
}

// Normaliza los flujos al horizonte: recorta/rellena con 0 hasta `anios`.
function flujosDeInputs(inp: ProyectoInputs): number[] {
    const n = Math.max(0, Math.floor(inp.anios) || 0);
    const src = Array.isArray(inp.flujos) ? inp.flujos : [];
    return Array.from({ length: n }, (_, i) => Number(src[i]) || 0);
}

// VPN a una tasa `r` (decimal) dado I0 y los flujos anuales.
function npvAt(r: number, i0: number, flujos: number[]): number {
    let acc = -i0;
    for (let i = 0; i < flujos.length; i++) acc += flujos[i] / Math.pow(1 + r, i + 1);
    return acc;
}

export function computeProyecto(inp: ProyectoInputs): ProyectoResult {
    const i0 = Number(inp.inversionInicial) || 0;
    const r = (Number(inp.tasa) || 0) / 100;
    const flujos = flujosDeInputs(inp);
    const n = flujos.length;

    const vpFlujos = flujos.map((f, i) => round2(f / Math.pow(1 + r, i + 1)));
    const vpn = round2(vpFlujos.reduce((s, v) => s + v, 0) - i0);
    const decision: 'acepta' | 'rechaza' = vpn >= 0 ? 'acepta' : 'rechaza';

    // Periodo de recuperación (sin descontar): acumula los flujos hasta cubrir I0.
    let payback: number | null = null;
    let acum = 0;
    for (let k = 0; k < n; k++) {
        const prev = acum;
        acum += flujos[k];
        if (acum >= i0 && i0 > 0) {
            const faltante = i0 - prev;
            payback = flujos[k] > 0 ? round2(k + faltante / flujos[k]) : k + 1;
            break;
        }
    }

    // TIR: raíz de npv(r)=0 por bisección en [-0.99, 10] (−99% a +1000%).
    let tir: number | null = null;
    if (n > 0) {
        let lo = -0.99, hi = 10;
        let flo = npvAt(lo, i0, flujos);
        let fhi = npvAt(hi, i0, flujos);
        if (flo * fhi <= 0) {                       // hay cambio de signo → hay raíz
            for (let iter = 0; iter < 200; iter++) {
                const mid = (lo + hi) / 2;
                const fmid = npvAt(mid, i0, flujos);
                if (Math.abs(fmid) < 1e-7) { lo = hi = mid; break; }
                if (flo * fmid < 0) { hi = mid; fhi = fmid; }
                else { lo = mid; flo = fmid; }
            }
            tir = round2(((lo + hi) / 2) * 100);
        }
    }

    // Factor de anualidad — solo tiene sentido mostrarlo si el flujo es uniforme.
    let factorAnualidad: number | null = null;
    const uniforme = n > 0 && flujos.every((f) => Math.abs(f - flujos[0]) < 1e-9);
    if (uniforme && r !== 0) factorAnualidad = round2((1 - Math.pow(1 + r, -n)) / r);
    else if (uniforme && r === 0) factorAnualidad = n;

    return { vpFlujos, vpn, decision, payback, tir, factorAnualidad };
}

// Asistente: deriva el flujo neto anual desde la utilidad, replicando el examen —
// flujo = (ganancia antes de dep e imp − depreciación) × (1 − ISR) + depreciación.
// (Se le vuelve a sumar la depreciación porque no es una salida real de efectivo.)
export function deriveFlujoAnual(p: {
    gananciaAntesDepImp: number;
    depreciacion: number;
    tasaImp: number; // en %
}): number {
    const g = Number(p.gananciaAntesDepImp) || 0;
    const dep = Number(p.depreciacion) || 0;
    const t = (Number(p.tasaImp) || 0) / 100;
    return round2((g - dep) * (1 - t) + dep);
}

// ── Punto óptimo de inventario (EOQ / CEP + punto de reorden) ─────────────────

export interface InventarioInputs {
    demandaAnual: number;   // D
    costoOrdenar: number;   // co (por orden)
    costoMantener: number;  // cm (por unidad al año)
    tiempoEntrega: number;  // T (días de lead time)
    diasAnio: number;       // días hábiles del año (default 365)
}

export interface InventarioResult {
    cep: number;            // cantidad económica de pedido
    numOrdenes: number;
    costoOrdenar: number;   // anual
    costoMantener: number;  // anual
    costoTotal: number;
    demandaDiaria: number;
    puntoReorden: number;
}

// ── Análisis de variaciones (presupuesto flexible: estándar vs. real) ─────────

export interface VariacionConcepto {
    nombre: string;
    qStd: number;   // cantidad estándar POR UNIDAD producida
    pStd: number;   // precio/costo estándar por unidad de insumo
    qReal: number;  // cantidad real POR UNIDAD producida
    pReal: number;  // precio/costo real por unidad de insumo
}

export interface VariacionesInputs {
    unidades: number;              // producción real (output)
    conceptos: VariacionConcepto[];
}

export interface VariacionRow {
    nombre: string;
    costoStd: number;
    costoReal: number;
    varTotal: number;    // costoReal − costoStd (>0 desfavorable)
    varPrecio: number;   // (pReal − pStd) × qRealTotal
    varCantidad: number; // (qRealTotal − qStdTotal) × pStd
}

export interface VariacionesResult {
    filas: VariacionRow[];
    totales: { costoStd: number; costoReal: number; varTotal: number; varPrecio: number; varCantidad: number };
}

// Sentido de una variación de COSTO: positivo = desfavorable (costó de más),
// negativo = favorable. Helper de presentación (la app lo usa para las pills F/D).
export function sentidoVariacion(v: number): 'F' | 'D' | '—' {
    if (v > 0.004) return 'D';
    if (v < -0.004) return 'F';
    return '—';
}

export function computeVariaciones(inp: VariacionesInputs): VariacionesResult {
    const u = Number(inp.unidades) || 0;
    const conceptos = Array.isArray(inp.conceptos) ? inp.conceptos : [];
    const filas: VariacionRow[] = conceptos.map((c) => {
        const qStd = Number(c.qStd) || 0, pStd = Number(c.pStd) || 0;
        const qReal = Number(c.qReal) || 0, pReal = Number(c.pReal) || 0;
        const qStdTotal = qStd * u;
        const qRealTotal = qReal * u;
        const costoStd = qStdTotal * pStd;
        const costoReal = qRealTotal * pReal;
        return {
            nombre: String(c.nombre ?? '').trim() || 'Concepto',
            costoStd: round2(costoStd),
            costoReal: round2(costoReal),
            varTotal: round2(costoReal - costoStd),
            varPrecio: round2((pReal - pStd) * qRealTotal),
            varCantidad: round2((qRealTotal - qStdTotal) * pStd),
        };
    });
    const totales = filas.reduce((t, f) => ({
        costoStd: round2(t.costoStd + f.costoStd),
        costoReal: round2(t.costoReal + f.costoReal),
        varTotal: round2(t.varTotal + f.varTotal),
        varPrecio: round2(t.varPrecio + f.varPrecio),
        varCantidad: round2(t.varCantidad + f.varCantidad),
    }), { costoStd: 0, costoReal: 0, varTotal: 0, varPrecio: 0, varCantidad: 0 });
    return { filas, totales };
}

// ── Saneo de inputs (compartido cliente/servidor) ─────────────────────────────
// Whitelist de campos numéricos por tipo — el cliente arma estos campos y el
// servidor sanea con la MISMA lista, sin persistir jsonb arbitrario. `flujos`
// (proyecto) y `conceptos` (variaciones) son los campos array.

export const TIPOS_ANALISIS = new Set(['proyecto', 'inventario', 'variaciones']);

const CAMPOS: Record<string, string[]> = {
    proyecto: ['inversionInicial', 'tasa', 'anios', 'flujoUniforme', 'usarFlujoUniforme',
        'gananciaAntesDepImp', 'depreciacion', 'tasaImp'],
    inventario: ['demandaAnual', 'costoOrdenar', 'costoMantener', 'tiempoEntrega', 'diasAnio'],
    variaciones: ['unidades'],
};

// Devuelve un objeto solo con los campos conocidos del tipo. Los escalares se
// coaccionan a número (no numérico → 0); los campos array (`flujos` en proyecto,
// `conceptos` en variaciones) se sanean elemento por elemento. Todo lo demás se descarta.
export function sanitizeInputs(tipo: string, raw: unknown): Record<string, unknown> {
    const src = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {};
    const out: Record<string, unknown> = {};
    for (const k of CAMPOS[tipo] ?? []) {
        if (k === 'usarFlujoUniforme') { out[k] = src[k] === false ? false : true; continue; }
        out[k] = Number(src[k]) || 0;
    }
    if (tipo === 'proyecto') {
        const f = Array.isArray(src.flujos) ? src.flujos : [];
        out.flujos = f.slice(0, 100).map((v) => Number(v) || 0);
    }
    if (tipo === 'variaciones') {
        const cs = Array.isArray(src.conceptos) ? src.conceptos : [];
        out.conceptos = cs.slice(0, 50).map((c: any) => ({
            nombre: String(c?.nombre ?? '').slice(0, 80),
            qStd: Number(c?.qStd) || 0, pStd: Number(c?.pStd) || 0,
            qReal: Number(c?.qReal) || 0, pReal: Number(c?.pReal) || 0,
        }));
    }
    return out;
}

export function computeInventario(inp: InventarioInputs): InventarioResult {
    const D = Number(inp.demandaAnual) || 0;
    const co = Number(inp.costoOrdenar) || 0;
    const cm = Number(inp.costoMantener) || 0;
    const T = Number(inp.tiempoEntrega) || 0;
    const dias = Number(inp.diasAnio) || 365;

    const cep = cm > 0 ? Math.sqrt((2 * D * co) / cm) : 0;
    const numOrdenes = cep > 0 ? D / cep : 0;
    const costoOrdenar = round2(numOrdenes * co);
    const costoMantener = round2((cep / 2) * cm);
    const costoTotal = round2(costoOrdenar + costoMantener);
    const demandaDiaria = dias > 0 ? D / dias : 0;
    const puntoReorden = demandaDiaria * T;

    return {
        cep: round2(cep),
        numOrdenes: round2(numOrdenes),
        costoOrdenar,
        costoMantener,
        costoTotal,
        demandaDiaria: round2(demandaDiaria),
        puntoReorden: round2(puntoReorden),
    };
}

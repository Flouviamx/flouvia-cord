import {
    MAX_CONDITIONS, MAX_NESTING, MAX_STEPS, SCHEDULE_TRIGGER, WAIT_MAX_DAYS,
    actionFitsTrigger, findAction, findTrigger, isPublicHttpsUrl, operatorsFor,
    type Lang, type Operator, type WorkflowField,
} from './catalog';
import { findDataset, type WorkflowDataset } from './datasets';
import { sanitizeSchedule, type Schedule } from './schedule';

const MSG = {
    es: {
        trigger: 'Elige qué evento inicia el workflow.',
        steps: 'Agrega al menos un paso.',
        action: 'Elige qué acción hace este paso.',
        required: (l: string) => `Completa "${l}".`,
        variable: (v: string) => `La variable {{${v}}} no existe para este evento.`,
        noConditions: 'Agrega al menos una condición.',
        badField: 'Una condición usa un campo que no existe para este evento.',
        op: (l: string) => `Elige cómo comparar "${l}".`,
        value: (l: string) => `Completa el valor para "${l}".`,
        number: (l: string) => `"${l}" necesita un número.`,
        option: (l: string) => `Elige un valor válido para "${l}".`,
        url: (l: string) => `"${l}" necesita una dirección https pública.`,
        objeto: (l: string) => `"${l}" necesita un disparador de ese documento; este evento no lo trae.`,
        dataset: 'Elige qué consulta hace este paso.',
        datasetCliente: 'Esta consulta necesita un disparador con cliente; este evento no lo trae.',
        variableDespues: (v: string) => `La variable {{${v}}} viene de una consulta que está después de este paso.`,
    },
    en: {
        trigger: 'Choose which event starts the workflow.',
        steps: 'Add at least one step.',
        action: 'Choose what this step does.',
        required: (l: string) => `Fill in "${l}".`,
        variable: (v: string) => `The variable {{${v}}} does not exist for this event.`,
        noConditions: 'Add at least one condition.',
        badField: 'A condition uses a field that does not exist for this event.',
        op: (l: string) => `Choose how to compare "${l}".`,
        value: (l: string) => `Fill in the value for "${l}".`,
        number: (l: string) => `"${l}" needs a number.`,
        option: (l: string) => `Choose a valid value for "${l}".`,
        url: (l: string) => `"${l}" needs a public https address.`,
        objeto: (l: string) => `"${l}" needs a trigger for that document; this event does not carry one.`,
        dataset: 'Choose what this step looks up.',
        datasetCliente: 'This lookup needs a trigger with a client; this event does not carry one.',
        variableDespues: (v: string) => `The variable {{${v}}} comes from a lookup that runs after this step.`,
    },
};

export interface Condition {
    field: string;
    op: Operator;
    value?: string | number | null;
}

export type Step =
    | { id: string; type: 'action'; action: string; params: Record<string, unknown> }
    | { id: string; type: 'condition'; match: 'all' | 'any'; conditions: Condition[]; then: Step[]; else: Step[] }
    | { id: string; type: 'wait'; days: number }
    | { id: string; type: 'query'; dataset: string; params: Record<string, unknown> }
    /**
     * Espera CONDICIONADA: sigue revisando hasta que la condición se cumple o
     * hasta que se acaba el plazo. `then` es lo que pasa cuando se cumple;
     * `else`, cuando venció el plazo sin cumplirse. Las dos ramas existen a
     * propósito: "se abrió" y "nunca se abrió" piden cosas distintas.
     */
    | { id: string; type: 'wait_until'; match: 'all' | 'any'; conditions: Condition[]; days: number; then: Step[]; else: Step[] };

export interface WorkflowDefinition {
    trigger: string | null;
    /** Solo para el disparador programado. */
    schedule?: Schedule;
    steps: Step[];
}

export type Path = (number | 'then' | 'else')[];

const ID_RE = /^[a-z0-9]{4,24}$/;
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');

export function sanitizeDefinition(input: unknown): WorkflowDefinition {
    const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
    const trigger = typeof raw.trigger === 'string' && findTrigger(raw.trigger) ? raw.trigger : null;
    const schedule = trigger === SCHEDULE_TRIGGER ? sanitizeSchedule(raw.schedule) : undefined;
    const seen = new Set<string>();
    let count = 0;

    const clean = (list: unknown, depth: number): Step[] => {
        if (!Array.isArray(list) || depth > MAX_NESTING) return [];
        const out: Step[] = [];
        for (const item of list) {
            if (count >= MAX_STEPS) break;
            if (!item || typeof item !== 'object') continue;
            const s = item as Record<string, unknown>;
            const id = typeof s.id === 'string' && ID_RE.test(s.id) && !seen.has(s.id) ? s.id : null;
            if (!id) continue;
            if (s.type === 'action') {
                const def = findAction(typeof s.action === 'string' ? s.action : '');
                const params: Record<string, unknown> = {};
                const rawParams = (s.params && typeof s.params === 'object' ? s.params : {}) as Record<string, unknown>;
                for (const p of def?.params ?? []) {
                    const v = rawParams[p.key];
                    if (p.kind === 'days') {
                        if (v !== '' && v !== null && v !== undefined && Number.isFinite(Number(v))) {
                            params[p.key] = Math.min(p.max ?? 365, Math.max(0, Math.floor(Number(v))));
                        }
                    } else if (p.kind === 'choice') {
                        if (p.options?.some((o) => o.value === v)) params[p.key] = v;
                    } else {
                        params[p.key] = str(v, p.max ?? 2000);
                    }
                }
                seen.add(id); count++;
                out.push({ id, type: 'action', action: def?.key ?? '', params });
            } else if (s.type === 'condition') {
                seen.add(id); count++;
                const conditions = cleanConditions(s.conditions);
                out.push({
                    id, type: 'condition',
                    match: s.match === 'any' ? 'any' : 'all',
                    conditions,
                    then: clean(s.then, depth + 1),
                    else: clean(s.else, depth + 1),
                });
            } else if (s.type === 'wait') {
                seen.add(id); count++;
                const days = Math.floor(Number(s.days));
                out.push({ id, type: 'wait', days: Number.isFinite(days) ? Math.min(WAIT_MAX_DAYS, Math.max(1, days)) : 1 });
            } else if (s.type === 'query') {
                seen.add(id); count++;
                const def = findDataset(typeof s.dataset === 'string' ? s.dataset : '');
                const rawParams = (s.params && typeof s.params === 'object' ? s.params : {}) as Record<string, unknown>;
                const params: Record<string, unknown> = {};
                for (const p of def?.params ?? []) {
                    const v = Number(rawParams[p.key]);
                    params[p.key] = Number.isFinite(v) ? Math.min(p.max, Math.max(p.min, Math.floor(v))) : p.default;
                }
                out.push({ id, type: 'query', dataset: def?.key ?? '', params });
            } else if (s.type === 'wait_until') {
                seen.add(id); count++;
                const days = Math.floor(Number(s.days));
                out.push({
                    id, type: 'wait_until',
                    match: s.match === 'any' ? 'any' : 'all',
                    conditions: cleanConditions(s.conditions),
                    days: Number.isFinite(days) ? Math.min(WAIT_MAX_DAYS, Math.max(1, days)) : 1,
                    then: clean(s.then, depth + 1),
                    else: clean(s.else, depth + 1),
                });
            }
        }
        return out;
    };

    return { trigger, ...(schedule ? { schedule } : {}), steps: clean(raw.steps, 1) };
}

function cleanConditions(input: unknown): Condition[] {
    return (Array.isArray(input) ? input : []).slice(0, MAX_CONDITIONS).map((c: any) => ({
        field: str(c?.field, 60),
        op: str(c?.op, 20) as Operator,
        value: typeof c?.value === 'number' ? c.value : (c?.value === null || c?.value === undefined ? null : str(c.value, 200)),
    }));
}

export interface ValidationIssue {
    stepId: string | null;
    message: string;
}

export function validateForPublish(def: WorkflowDefinition, lang: Lang = 'es'): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const m = MSG[lang];
    const trigger = findTrigger(def.trigger);
    if (!trigger) issues.push({ stepId: null, message: m.trigger });
    if (!def.steps.length) issues.push({ stepId: null, message: m.steps });

    // Las variables disponibles crecen con cada consulta que ya corrió. Una
    // acción que usa {{vencido_total}} antes de consultar la cartera no falla
    // en ejecución con un hueco vacío: no se puede publicar.
    const fields = new Map<string, WorkflowField>((trigger?.fields ?? []).map((x) => [x.key, x]));
    const walk = (steps: Step[]) => {
        // Cada rama parte de lo que había al entrar: una consulta dentro de
        // "si se cumple" no existe en la otra rama.
        const alEntrar = new Map(fields);
        for (const s of steps) {
            if (s.type === 'action') {
                const def = findAction(s.action);
                if (!def) { issues.push({ stepId: s.id, message: m.action }); continue; }
                if (trigger && !actionFitsTrigger(def, trigger)) {
                    issues.push({ stepId: s.id, message: m.objeto(def.label[lang]) });
                }
                for (const p of def.params) {
                    const v = s.params[p.key];
                    if (p.required && (v === undefined || v === null || (typeof v === 'string' && !v.trim()))) {
                        issues.push({ stepId: s.id, message: m.required(p.label[lang]) });
                    }
                    if (p.kind === 'url' && typeof v === 'string' && v.trim() && !isPublicHttpsUrl(v.trim())) {
                        issues.push({ stepId: s.id, message: m.url(p.label[lang]) });
                    }
                    if (typeof v === 'string' && trigger) {
                        for (const variable of templateVariables(v)) {
                            if (fields.has(variable)) continue;
                            const deConsulta = laterDatasetKeys.has(variable);
                            issues.push({ stepId: s.id, message: deConsulta ? m.variableDespues(variable) : m.variable(variable) });
                        }
                    }
                }
            } else if (s.type === 'query') {
                const ds = findDataset(s.dataset);
                if (!ds) { issues.push({ stepId: s.id, message: m.dataset }); continue; }
                if (ds.scope === 'client' && !triggerHasClient(trigger)) {
                    issues.push({ stepId: s.id, message: m.datasetCliente });
                }
                for (const f of ds.outputs) fields.set(f.key, f);
            } else if (s.type === 'condition' || s.type === 'wait_until') {
                if (!s.conditions.length) issues.push({ stepId: s.id, message: m.noConditions });
                for (const c of s.conditions) {
                    const field = fields.get(c.field);
                    const op = field ? operatorsFor(field).find((o) => o.op === c.op) : undefined;
                    if (!field) { issues.push({ stepId: s.id, message: m.badField }); continue; }
                    if (!op) { issues.push({ stepId: s.id, message: m.op(field.label[lang]) }); continue; }
                    if (op.needsValue && (c.value === null || c.value === undefined || c.value === '')) {
                        issues.push({ stepId: s.id, message: m.value(field.label[lang]) });
                    }
                    if (op.needsValue && field.type === 'number' && !Number.isFinite(Number(c.value))) {
                        issues.push({ stepId: s.id, message: m.number(field.label[lang]) });
                    }
                    if (op.needsValue && field.type === 'enum' && !field.options?.some((o) => o.value === c.value)) {
                        issues.push({ stepId: s.id, message: m.option(field.label[lang]) });
                    }
                }
                walk(s.then);
                walk(s.else);
            }
        }
        // Al salir de la rama, las variables vuelven a lo que había: lo que
        // consultó una rama no existe en la siguiente.
        fields.clear();
        for (const [k, v] of alEntrar) fields.set(k, v);
    };
    // Para distinguir "esa variable no existe" de "existe, pero todavía no":
    // el mensaje correcto ahorra el rato de buscar un typo que no está.
    const laterDatasetKeys = new Set<string>();
    const collect = (steps: Step[]) => {
        for (const s of steps) {
            if (s.type === 'query') for (const f of findDataset(s.dataset)?.outputs ?? []) laterDatasetKeys.add(f.key);
            else if (s.type === 'condition' || s.type === 'wait_until') { collect(s.then); collect(s.else); }
        }
    };
    collect(def.steps);
    walk(def.steps);
    return issues;
}

/** ¿El disparador entrega un cliente sobre el que consultar? */
function triggerHasClient(trigger: { object?: string; fields: WorkflowField[] } | undefined): boolean {
    if (!trigger) return false;
    return trigger.object === 'quote' || trigger.object === 'invoice' || trigger.fields.some((f) => f.key === 'empresa');
}

export function templateVariables(template: string): string[] {
    return [...template.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)].map((m) => m[1]);
}

export function renderTemplate(template: string, values: Record<string, unknown>, escape: (s: string) => string = (s) => s): string {
    return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_, key: string) => {
        const v = Object.prototype.hasOwnProperty.call(values, key) ? values[key] : undefined;
        return v === null || v === undefined ? '' : escape(String(v));
    });
}

export function evaluateConditions(step: Extract<Step, { type: 'condition' }>, values: Record<string, unknown>, fields: WorkflowField[]): boolean {
    const byKey = new Map(fields.map((x) => [x.key, x]));
    const own = (key: string) => (Object.prototype.hasOwnProperty.call(values, key) ? values[key] : undefined);
    const results = step.conditions.map((c) => evaluateCondition(c, own(c.field), byKey.get(c.field), own(`${c.field}_anterior`)));
    return step.match === 'any' ? results.some(Boolean) : results.every(Boolean);
}

/** Normaliza para comparar "antes vs ahora": null, undefined y '' son lo mismo. */
const sameValue = (a: unknown, b: unknown) => {
    const norm = (v: unknown) => (v === null || v === undefined ? '' : typeof v === 'number' ? String(v) : String(v).trim());
    return norm(a) === norm(b);
};

function evaluateCondition(c: Condition, actual: unknown, field: WorkflowField | undefined, previo?: unknown): boolean {
    if (!field) return false;
    if (c.op === 'changed' || c.op === 'unchanged') {
        // Sin valor anterior no se puede afirmar un cambio: un evento anterior a
        // esta capacidad respondería "cambió" a todo. Falla cerrado.
        if (!field.prev || previo === undefined) return false;
        const igual = sameValue(actual, previo);
        return c.op === 'changed' ? !igual : igual;
    }
    if (field.type === 'number') {
        const a = Number(actual);
        const b = Number(c.value);
        if (actual === null || actual === undefined || !Number.isFinite(a) || !Number.isFinite(b)) return false;
        switch (c.op) {
            case 'eq': return a === b;
            case 'neq': return a !== b;
            case 'gt': return a > b;
            case 'gte': return a >= b;
            case 'lt': return a < b;
            case 'lte': return a <= b;
            default: return false;
        }
    }
    if (field.type === 'boolean') {
        if (c.op === 'is_true') return actual === true;
        if (c.op === 'is_false') return actual === false;
        return false;
    }
    const a = actual === null || actual === undefined ? '' : String(actual).toLowerCase();
    const b = c.value === null || c.value === undefined ? '' : String(c.value).toLowerCase();
    switch (c.op) {
        case 'eq': return a === b;
        case 'neq': return a !== b;
        case 'contains': return field.type === 'text' && a.includes(b);
        case 'not_contains': return field.type === 'text' && !a.includes(b);
        case 'empty': return a === '';
        case 'not_empty': return a !== '';
        default: return false;
    }
}

export function stepAt(steps: Step[], path: Path): Step | null {
    let list: Step[] = steps;
    for (let i = 0; i < path.length; i += 2) {
        const idx = path[i];
        if (typeof idx !== 'number') return null;
        const step = list[idx];
        if (i === path.length - 1) return step ?? null;
        const branch = path[i + 1];
        // La espera condicionada también tiene ramas: sin esto, su rama se
        // recorría como si no existiera y la ejecución terminaba "bien" sin
        // hacer nada de lo que el workflow decía.
        const conRamas = step && (step.type === 'condition' || step.type === 'wait_until');
        if (!conRamas || (branch !== 'then' && branch !== 'else')) return null;
        list = step[branch];
    }
    return null;
}

export function nextSibling(path: Path): Path {
    const last = path[path.length - 1];
    return [...path.slice(0, -1), (typeof last === 'number' ? last : 0) + 1];
}

export function exitBranch(path: Path): Path | null {
    if (path.length <= 1) return null;
    return nextSibling(path.slice(0, -2));
}

export function isValidPath(value: unknown): value is Path {
    return Array.isArray(value) && value.length % 2 === 1 && value.length <= MAX_NESTING * 2 + 1
        && value.every((p, i) => (i % 2 === 0 ? Number.isInteger(p) && (p as number) >= 0 && (p as number) < MAX_STEPS : p === 'then' || p === 'else'));
}

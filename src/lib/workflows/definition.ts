import {
    MAX_CONDITIONS, MAX_NESTING, MAX_STEPS, OPERATORS, WAIT_MAX_DAYS,
    findAction, findTrigger, type Lang, type Operator, type WorkflowField,
} from './catalog';

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
    | { id: string; type: 'wait'; days: number };

export interface WorkflowDefinition {
    trigger: string | null;
    steps: Step[];
}

export type Path = (number | 'then' | 'else')[];

const ID_RE = /^[a-z0-9]{4,24}$/;
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');

export function sanitizeDefinition(input: unknown): WorkflowDefinition {
    const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
    const trigger = typeof raw.trigger === 'string' && findTrigger(raw.trigger) ? raw.trigger : null;
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
                const conditions = (Array.isArray(s.conditions) ? s.conditions : []).slice(0, MAX_CONDITIONS).map((c: any) => ({
                    field: str(c?.field, 60),
                    op: str(c?.op, 20) as Operator,
                    value: typeof c?.value === 'number' ? c.value : (c?.value === null || c?.value === undefined ? null : str(c.value, 200)),
                }));
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
            }
        }
        return out;
    };

    return { trigger, steps: clean(raw.steps, 1) };
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

    const fields = new Map<string, WorkflowField>((trigger?.fields ?? []).map((x) => [x.key, x]));
    const walk = (steps: Step[]) => {
        for (const s of steps) {
            if (s.type === 'action') {
                const def = findAction(s.action);
                if (!def) { issues.push({ stepId: s.id, message: m.action }); continue; }
                for (const p of def.params) {
                    const v = s.params[p.key];
                    if (p.required && (v === undefined || v === null || (typeof v === 'string' && !v.trim()))) {
                        issues.push({ stepId: s.id, message: m.required(p.label[lang]) });
                    }
                    if (typeof v === 'string' && trigger) {
                        for (const variable of templateVariables(v)) {
                            if (!fields.has(variable)) issues.push({ stepId: s.id, message: m.variable(variable) });
                        }
                    }
                }
            } else if (s.type === 'condition') {
                if (!s.conditions.length) issues.push({ stepId: s.id, message: m.noConditions });
                for (const c of s.conditions) {
                    const field = fields.get(c.field);
                    const op = field ? OPERATORS[field.type].find((o) => o.op === c.op) : undefined;
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
    };
    walk(def.steps);
    return issues;
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
    const results = step.conditions.map((c) => evaluateCondition(c, own(c.field), byKey.get(c.field)));
    return step.match === 'any' ? results.some(Boolean) : results.every(Boolean);
}

function evaluateCondition(c: Condition, actual: unknown, field: WorkflowField | undefined): boolean {
    if (!field) return false;
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
        if (!step || step.type !== 'condition' || (branch !== 'then' && branch !== 'else')) return null;
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

import { describe, expect, it } from 'vitest';
import { WORKFLOW_TRIGGERS, findTrigger, MAX_STEPS } from '../src/lib/workflows/catalog';
import { DOMAIN_EVENTS } from '../src/lib/domain-events';
import {
    evaluateConditions, exitBranch, isValidPath, nextSibling, renderTemplate, sanitizeDefinition,
    stepAt, validateForPublish, type Step,
} from '../src/lib/workflows/definition';

const quoteFields = findTrigger('quote.approved')!.fields;

describe('catálogo', () => {
    it('hay un disparador por cada evento de dominio, sin extras', () => {
        expect(WORKFLOW_TRIGGERS.map((t) => t.type).sort()).toEqual(Object.keys(DOMAIN_EVENTS).sort());
    });

    it('cada disparador tiene etiquetas en ambos idiomas y campos únicos', () => {
        for (const t of WORKFLOW_TRIGGERS) {
            expect(t.label.es && t.label.en).toBeTruthy();
            const keys = t.fields.map((f) => f.key);
            expect(new Set(keys).size).toBe(keys.length);
        }
    });
});

describe('plantillas', () => {
    it('cada plantilla, en los dos idiomas, se puede publicar tal cual y trae nombre y descripción', async () => {
        const { WORKFLOW_TEMPLATES } = await import('../src/lib/workflows/templates');
        const keys = new Set<string>();
        for (const tpl of WORKFLOW_TEMPLATES) {
            expect(keys.has(tpl.key)).toBe(false);
            keys.add(tpl.key);
            for (const lang of ['es', 'en'] as const) {
                expect(tpl.nombre[lang] && tpl.descripcion[lang]).toBeTruthy();
                const def = sanitizeDefinition(tpl.definicion(lang));
                expect(JSON.stringify(def)).toBe(JSON.stringify(tpl.definicion(lang)));
                expect(validateForPublish(def, lang)).toEqual([]);
            }
        }
    });
});

describe('sanitizeDefinition', () => {
    it('descarta disparadores, acciones, parámetros e ids desconocidos o repetidos', () => {
        const def = sanitizeDefinition({
            trigger: 'quote.hackeado',
            steps: [
                { id: 'abcd', type: 'action', action: 'create_task', params: { titulo: 'Hola', dias: '7', extra: 'x', sql: 'drop' } },
                { id: 'abcd', type: 'action', action: 'create_task', params: {} },
                { id: 'NO-VALIDO', type: 'wait', days: 3 },
                { id: 'efgh', type: 'script', code: 'process.exit()' },
                { id: 'ijkl', type: 'action', action: 'send_money', params: {} },
            ],
        });
        expect(def.trigger).toBeNull();
        expect(def.steps).toEqual([
            { id: 'abcd', type: 'action', action: 'create_task', params: { titulo: 'Hola', dias: 7 } },
            { id: 'ijkl', type: 'action', action: '', params: {} },
        ]);
    });

    it('acota pasos, anidamiento y días de espera', () => {
        const many = Array.from({ length: 50 }, (_, i) => ({ id: `w${i}xx`, type: 'wait', days: 999 }));
        const def = sanitizeDefinition({ trigger: 'quote.sent', steps: many });
        expect(def.steps).toHaveLength(MAX_STEPS);
        expect(def.steps.every((s) => s.type === 'wait' && s.days === 30)).toBe(true);

        let nested: any = { id: 'deep9', type: 'wait', days: 1 };
        for (let i = 0; i < 8; i++) nested = { id: `lvl${i}a`, type: 'condition', conditions: [], then: [nested], else: [] };
        const deep = sanitizeDefinition({ trigger: 'quote.sent', steps: [nested] });
        const depth = (steps: Step[]): number => Math.max(0, ...steps.map((s) => (s.type === 'condition' ? 1 + Math.max(depth(s.then), depth(s.else)) : 1)));
        expect(depth(deep.steps)).toBeLessThanOrEqual(4);
    });
});

describe('validateForPublish', () => {
    const valid = {
        trigger: 'quote.approved',
        steps: [
            {
                id: 'cond1', type: 'condition', match: 'all',
                conditions: [{ field: 'total', op: 'gte', value: 100000 }],
                then: [{ id: 'act1', type: 'action', action: 'create_task', params: { titulo: 'Kickoff {{folio}}' } }],
                else: [],
            },
        ],
    };

    it('acepta un workflow completo', () => {
        expect(validateForPublish(sanitizeDefinition(valid))).toEqual([]);
    });

    it('exige disparador, pasos, parámetros y valores válidos', () => {
        expect(validateForPublish(sanitizeDefinition({ trigger: null, steps: [] })).map((i) => i.message))
            .toEqual(['Elige qué evento inicia el workflow.', 'Agrega al menos un paso.']);
        const broken = sanitizeDefinition({
            trigger: 'quote.approved',
            steps: [
                { id: 'act1', type: 'action', action: 'notify_team', params: { asunto: '', mensaje: 'Total {{secreto}}' } },
                { id: 'cond1', type: 'condition', conditions: [
                    { field: 'total', op: 'gte', value: 'mucho' },
                    { field: 'status', op: 'eq', value: 'inventado' },
                    { field: 'costo', op: 'gt', value: 1 },
                    { field: 'folio', op: 'gt', value: 'x' },
                ], then: [], else: [] },
            ],
        });
        const issues = validateForPublish(broken);
        expect(issues.map((i) => i.stepId)).toEqual(['act1', 'act1', 'act1', 'cond1', 'cond1', 'cond1', 'cond1']);
        expect(validateForPublish(broken, 'en')[0].message).toBe('Fill in "To".');
    });
});

describe('evaluación de condiciones', () => {
    const cond = (conditions: any[], match: 'all' | 'any' = 'all') =>
        ({ id: 'c1', type: 'condition', match, conditions, then: [], else: [] }) as Extract<Step, { type: 'condition' }>;

    it('compara números, texto, enums y booleanos sin eval', () => {
        const values = { total: 150000, folio: 'COT-0042', status: 'approved', cliente: 'Distribuidora El Zarco' };
        expect(evaluateConditions(cond([{ field: 'total', op: 'gte', value: 100000 }]), values, quoteFields)).toBe(true);
        expect(evaluateConditions(cond([{ field: 'total', op: 'lt', value: '100000' }]), values, quoteFields)).toBe(false);
        expect(evaluateConditions(cond([{ field: 'cliente', op: 'contains', value: 'zarco' }]), values, quoteFields)).toBe(true);
        expect(evaluateConditions(cond([{ field: 'status', op: 'eq', value: 'APPROVED' }]), values, quoteFields)).toBe(true);
        expect(evaluateConditions(cond([{ field: 'status', op: 'contains', value: 'app' }]), values, quoteFields)).toBe(false);
        expect(evaluateConditions(cond([{ field: 'total', op: 'gte', value: '1; process.exit()' }]), values, quoteFields)).toBe(false);
    });

    it('all exige todas y any basta con una; campos inexistentes nunca se cumplen', () => {
        const values = { total: 10, moneda: 'USD' };
        const c = [{ field: 'total', op: 'gt', value: 100 }, { field: 'moneda', op: 'eq', value: 'usd' }];
        expect(evaluateConditions(cond(c, 'all'), values, quoteFields)).toBe(false);
        expect(evaluateConditions(cond(c, 'any'), values, quoteFields)).toBe(true);
        expect(evaluateConditions(cond([{ field: 'constructor', op: 'not_empty' }]), values, quoteFields)).toBe(false);
        expect(evaluateConditions(cond([{ field: 'total', op: 'gt', value: 1 }]), { total: null }, quoteFields)).toBe(false);
    });
});

describe('plantillas', () => {
    it('sustituye variables conocidas, vacía las ausentes y escapa por canal', () => {
        const html = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
        expect(renderTemplate('Folio {{folio}} de {{ cliente }} ({{nada}})', { folio: 'COT-1', cliente: '<b>ACME</b>' }, html))
            .toBe('Folio COT-1 de &#60;b&#62;ACME&#60;/b&#62; ()');
        expect(renderTemplate('{{__proto__}}{{constructor}}', {})).toBe('');
    });
});

describe('cursor de ejecución', () => {
    const steps = sanitizeDefinition({
        trigger: 'quote.sent',
        steps: [
            { id: 'aaaa', type: 'wait', days: 1 },
            { id: 'bbbb', type: 'condition', conditions: [], then: [{ id: 'cccc', type: 'wait', days: 2 }], else: [] },
            { id: 'dddd', type: 'wait', days: 3 },
        ],
    }).steps;

    it('recorre pasos anidados y sale de las ramas', () => {
        expect(stepAt(steps, [0])?.id).toBe('aaaa');
        expect(stepAt(steps, [1, 'then', 0])?.id).toBe('cccc');
        expect(stepAt(steps, [1, 'then', 1])).toBeNull();
        expect(stepAt(steps, [1, 'else', 0])).toBeNull();
        expect(exitBranch([1, 'then', 1])).toEqual([2]);
        expect(nextSibling([1, 'then', 0])).toEqual([1, 'then', 1]);
        expect(exitBranch([3])).toBeNull();
    });

    it('rechaza cursores mal formados', () => {
        expect(isValidPath([0])).toBe(true);
        expect(isValidPath([1, 'then', 0])).toBe(true);
        expect(isValidPath([])).toBe(false);
        expect(isValidPath([1, 'otro', 0])).toBe(false);
        expect(isValidPath([-1])).toBe(false);
        expect(isValidPath(['0'])).toBe(false);
    });
});

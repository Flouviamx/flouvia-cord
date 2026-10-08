import { describe, it, expect } from 'vitest';
import { OPERATIONS } from '../src/lib/api-schema';
import { samples, fieldsOf, bodyExample } from '../src/lib/api-reference';
import { Cord } from '../packages/node/src/index';
import { CreateQuoteInput } from '../src/lib/api-schema';

const calls = (code: string | undefined, re: RegExp) => [...(code ?? '').matchAll(re)].map((m) => m[1].split('.'));

describe('referencia de la API', () => {
    it('cada operación tiene ejemplo en curl', () => {
        for (const op of OPERATIONS) expect(samples(op).curl, `${op.method} ${op.path}`).toContain(op.method === 'GET' ? 'curl https://' : `-X ${op.method}`);
    });

    it('los ejemplos de Node llaman métodos que existen en @flouviahq/node', () => {
        const cord: any = new Cord('sk_test_x');
        for (const op of OPERATIONS) {
            for (const path of calls(samples(op).node, /cord\.([a-zA-Z.]+)\(/g)) {
                const fn = path.reduce((o, k) => o?.[k], cord);
                expect(typeof fn, `${op.method} ${op.path}: cord.${path.join('.')}`).toBe('function');
            }
        }
    });

    it('solo hay ejemplos de SDK publicados (curl y Node)', () => {
        for (const op of OPERATIONS) {
            for (const k of Object.keys(samples(op))) expect(['curl', 'node'], `${op.method} ${op.path}`).toContain(k);
        }
    });

    it('el ejemplo de crear cotización es válido según el contrato', () => {
        const op = OPERATIONS.find((o) => o.method === 'POST' && o.path === '/cotizaciones')!;
        expect(CreateQuoteInput.safeParse(bodyExample(op)).success).toBe(true);
        expect(fieldsOf(op.body).find((f) => f.name === 'items')?.required).toBe(true);
    });
});

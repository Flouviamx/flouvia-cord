import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
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

    it('los ejemplos de Python llaman métodos que existen en cord-sdk', () => {
        const paths = [...new Set(OPERATIONS.flatMap((op) => calls(samples(op).python, /cord\.([a-z_.]+)\(/g).map((p) => p.join('.'))))];
        const script = `import sys\nfrom cord import Cord\nc = Cord("sk_test_x")\ndef ok(p):\n    obj = c\n    for k in p.split("."):\n        obj = getattr(obj, k, None)\n        if obj is None:\n            return False\n    return callable(obj)\nprint(",".join(p for p in sys.argv[1:] if not ok(p)))`;
        const out = execFileSync('python3', ['-c', script, ...paths], { env: { ...process.env, PYTHONPATH: 'packages/python/src' } }).toString().trim();
        expect(out).toBe('');
    });

    it('el ejemplo de crear cotización es válido según el contrato', () => {
        const op = OPERATIONS.find((o) => o.method === 'POST' && o.path === '/cotizaciones')!;
        expect(CreateQuoteInput.safeParse(bodyExample(op)).success).toBe(true);
        expect(fieldsOf(op.body).find((f) => f.name === 'items')?.required).toBe(true);
    });
});

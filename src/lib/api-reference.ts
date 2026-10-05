// Referencia de la API generada del contrato (src/lib/api-schema.ts): campos de
// entrada y salida, y ejemplos en curl y en cada SDK oficial. Misma fuente que
// public/openapi.json, así que la referencia no se puede desfasar de la spec.
import { z } from 'zod';
import { OPERATIONS, type Operation } from './api-schema';

export interface Field { name: string; type: string; required: boolean; description?: string }

function typeOf(s: any): string {
    if (!s) return 'any';
    if (s.anyOf) return s.anyOf.map(typeOf).join(' | ');
    if (s.enum) return s.enum.map((v: unknown) => JSON.stringify(v)).join(' | ');
    if (s.const !== undefined) return JSON.stringify(s.const);
    if (s.type === 'array') return `${typeOf(s.items)}[]`;
    return String(s.type ?? 'any');
}

export function fieldsOf(schema: z.ZodType | undefined): Field[] {
    if (!schema) return [];
    let json: any = z.toJSONSchema(schema, { unrepresentable: 'any' });
    if (json.type === 'array') json = json.items;
    const required = new Set<string>(json.required ?? []);
    return Object.entries(json.properties ?? {}).map(([name, s]: [string, any]) => ({
        name, type: typeOf(s), required: required.has(name), description: s.description,
    }));
}

function example(schema: any): unknown {
    if (!schema) return null;
    if (schema.anyOf) return example(schema.anyOf.find((s: any) => s.type !== 'null') ?? schema.anyOf[0]);
    if (schema.enum) return schema.enum[0];
    if (schema.const !== undefined) return schema.const;
    switch (schema.type) {
        case 'object': {
            const out: Record<string, unknown> = {};
            for (const name of schema.required ?? []) out[name] = example(schema.properties?.[name]);
            return out;
        }
        case 'array': return [example(schema.items)];
        case 'number': case 'integer': return 1;
        case 'boolean': return true;
        default: return '…';
    }
}

const QUOTE_EXAMPLE = {
    cliente: { empresa: 'Acme' },
    items: [{ descripcion: 'Instalación', cantidad: 1, precio_unitario: 12500, tax_rate: 0.16 }],
    base_currency: 'MXN',
};

export function bodyExample(op: Operation): unknown {
    if (op.method === 'POST' && op.path === '/cotizaciones') return QUOTE_EXAMPLE;
    if (!op.body) return undefined;
    return example(z.toJSONSchema(op.body, { unrepresentable: 'any' }));
}

const RESOURCES: Record<string, { node: string; python: string; php: string }> = {
    '/cotizaciones': { node: 'quotes', python: 'quotes', php: 'quotes' },
    '/clientes': { node: 'clients', python: 'clients', php: 'clients' },
    '/productos': { node: 'products', python: 'products', php: 'products' },
    '/facturas': { node: 'invoices', python: 'invoices', php: 'invoices' },
    '/events': { node: 'events', python: 'events', php: 'events' },
    '/webhooks': { node: 'webhookEndpoints', python: 'webhook_endpoints', php: 'webhookEndpoints' },
};

const NODE_ACTION: Record<string, string> = { mark_paid: 'markPaid', payment: 'recordPayment', credit_note: 'creditNote' };
const PY_ACTION: Record<string, string> = { payment: 'record_payment' };

const json = (v: unknown, indent = 2) => JSON.stringify(v, null, indent);
const pyLiteral = (v: unknown): string => json(v).replace(/\btrue\b/g, 'True').replace(/\bfalse\b/g, 'False').replace(/\bnull\b/g, 'None');
const phpLiteral = (v: unknown): string => json(v, 4).replace(/\{/g, '[').replace(/\}/g, ']').replace(/":/g, '" =>').replace(/"/g, "'");

export interface CodeSamples { curl: string; node?: string; python?: string; php?: string }

export function samples(op: Operation): CodeSamples {
    const url = `https://cordhq.app/api/v1${op.path.replace('{id}', 'ID')}`;
    const body = bodyExample(op);
    const curl = [
        `curl ${op.method === 'GET' ? '' : `-X ${op.method} `}${url} \\`,
        `  -H "Authorization: Bearer sk_test_..."${body !== undefined || op.multipart ? ' \\' : ''}`,
        ...(op.multipart ? ['  -F "texto=5 sacos de cemento y 2 de arena"'] : body !== undefined ? ['  -H "Content-Type: application/json" \\', `  -d '${JSON.stringify(body)}'`] : []),
    ].join('\n');

    const base = Object.keys(RESOURCES).find((p) => op.path === p || op.path === `${p}/{id}`);
    if (!base || op.testOnly) return { curl, ...special(op) };
    const r = RESOURCES[base];
    const isItem = op.path.endsWith('{id}');
    const action = (body as any)?.action as string | undefined;

    if (op.method === 'GET' && !isItem && !op.page) {
        return { curl, node: `const items = await cord.${r.node}.list();`, python: `items = cord.${r.python}.list()`, php: `$items = $cord->${r.php}->list();` };
    }
    if (op.method === 'GET' && !isItem) {
        return {
            curl,
            node: `for await (const item of cord.${r.node}.listAll()) {\n  console.log(item.id);\n}`,
            python: `for item in cord.${r.python}.list_all():\n    print(item["id"])`,
            php: `foreach ($cord->${r.php}->listAll() as $item) {\n    echo $item['id'], PHP_EOL;\n}`,
        };
    }
    if (op.method === 'GET') return { curl, node: `const item = await cord.${r.node}.retrieve('ID');`, python: `item = cord.${r.python}.retrieve("ID")`, php: `$item = $cord->${r.php}->retrieve('ID');` };
    if (op.method === 'DELETE') return { curl, node: `await cord.${r.node}.del('ID');`, python: `cord.${r.python}.delete("ID")`, php: `$cord->${r.php}->delete('ID');` };
    if (op.method === 'PATCH') return { curl, node: `await cord.${r.node}.update('ID', { email: 'compras@acme.mx' });`, python: `cord.${r.python}.update("ID", email="compras@acme.mx")`, php: `$cord->${r.php}->update('ID', ['email' => 'compras@acme.mx']);` };
    if (op.method === 'POST' && isItem && action) {
        return {
            curl,
            node: `await cord.${r.node}.${NODE_ACTION[action] ?? action}('ID');`,
            python: `cord.${r.python}.${PY_ACTION[action] ?? action}("ID")`,
            php: `$cord->${r.php}->action('ID', '${action}');`,
        };
    }
    return {
        curl,
        node: `const created = await cord.${r.node}.create(${json(body)});`,
        python: `created = cord.${r.python}.create(**${pyLiteral(body)})`,
        php: `$created = $cord->${r.php}->create(${phpLiteral(body)});`,
    };
}

function special(op: Operation): Omit<CodeSamples, 'curl'> {
    const key = `${op.method} ${op.path}`;
    const table: Record<string, Omit<CodeSamples, 'curl'>> = {
        'GET /me': { node: 'const me = await cord.me();', python: 'me = cord.me()', php: '$me = $cord->me();' },
        'GET /cobranza': { node: 'const cartera = await cord.collections.retrieve();', python: 'cartera = cord.collections()', php: '$cartera = $cord->collections();' },
        'POST /cotizaciones/ia': { node: "const { items } = await cord.quotes.draftFromText('5 sacos de cemento');", python: 'draft = cord.quotes.draft_from_text("5 sacos de cemento")' },
        'POST /tareas': { node: "await cord.tasks.create({ titulo: 'Llamar a Acme' });", python: 'cord.create_task("Llamar a Acme")' },
        'GET /elements/config': { node: 'const config = await cord.elements.config();', python: 'config = cord.elements_config()' },
        'POST /test_helpers/fiscal': { node: "await cord.testHelpers.fiscal.setNextOutcome('pac_caido');", python: 'cord.test_helpers.set_next_fiscal_outcome("pac_caido")', php: "$cord->testHelpers->setNextFiscalOutcome('pac_caido');" },
        'POST /test_helpers/cotizaciones/{id}': { node: "await cord.testHelpers.quotes.expire('ID');", python: 'cord.test_helpers.expire_quote("ID")', php: "$cord->testHelpers->expireQuote('ID');" },
        'POST /test_helpers/webhooks': { node: "await cord.testHelpers.webhooks.trigger('invoice.paid');", python: 'cord.test_helpers.trigger_webhook("invoice.paid")', php: "$cord->testHelpers->triggerWebhook('invoice.paid');" },
    };
    return table[key] ?? {};
}

export function operationAnchor(op: Operation): string {
    return `${op.method.toLowerCase()}-${op.path.replace(/[{}]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')}`;
}

export function groupedOperations(): Array<[string, Operation[]]> {
    const groups = new Map<string, Operation[]>();
    for (const op of OPERATIONS) groups.set(op.tag, [...(groups.get(op.tag) ?? []), op]);
    return [...groups];
}

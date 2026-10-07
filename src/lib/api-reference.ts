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

// Solo curl y @flouviahq/node: los SDK de Python y PHP no están publicados, y un
// ejemplo con un paquete que no se puede instalar es documentación falsa.
const RESOURCES: Record<string, string> = {
    '/cotizaciones': 'quotes',
    '/clientes': 'clients',
    '/productos': 'products',
    '/facturas': 'invoices',
    '/events': 'events',
    '/webhooks': 'webhookEndpoints',
};

const NODE_ACTION: Record<string, string> = { mark_paid: 'markPaid', payment: 'recordPayment', credit_note: 'creditNote' };

const json = (v: unknown, indent = 2) => JSON.stringify(v, null, indent);

export interface CodeSamples { curl: string; node?: string }

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

    if (op.method === 'GET' && !isItem && !op.page) return { curl, node: `const items = await cord.${r}.list();` };
    if (op.method === 'GET' && !isItem) return { curl, node: `for await (const item of cord.${r}.listAll()) {\n  console.log(item.id);\n}` };
    if (op.method === 'GET') return { curl, node: `const item = await cord.${r}.retrieve('ID');` };
    if (op.method === 'DELETE') return { curl, node: `await cord.${r}.del('ID');` };
    if (op.method === 'PATCH') return { curl, node: `await cord.${r}.update('ID', { email: 'compras@acme.mx' });` };
    if (op.method === 'POST' && isItem && action) return { curl, node: `await cord.${r}.${NODE_ACTION[action] ?? action}('ID');` };
    return { curl, node: `const created = await cord.${r}.create(${json(body)});` };
}

function special(op: Operation): Omit<CodeSamples, 'curl'> {
    const key = `${op.method} ${op.path}`;
    const table: Record<string, Omit<CodeSamples, 'curl'>> = {
        'GET /me': { node: 'const me = await cord.me();' },
        'GET /cobranza': { node: 'const cartera = await cord.collections.retrieve();' },
        'POST /cotizaciones/ia': { node: "const { items } = await cord.quotes.draftFromText('5 sacos de cemento');" },
        'POST /tareas': { node: "await cord.tasks.create({ titulo: 'Llamar a Acme' });" },
        'GET /elements/config': { node: 'const config = await cord.elements.config();' },
        'POST /test_helpers/fiscal': { node: "await cord.testHelpers.fiscal.setNextOutcome('pac_caido');" },
        'POST /test_helpers/cotizaciones/{id}': { node: "await cord.testHelpers.quotes.expire('ID');" },
        'POST /test_helpers/webhooks': { node: "await cord.testHelpers.webhooks.trigger('invoice.paid');" },
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

// Metadatos de la página de referencia (src/pages/{,en/}docs/desarrolladores/referencia.astro).
// No es una entrada de la colección docs: el índice de búsqueda, el sitemap y
// llms-full la leen de aquí para no repetir título y descripción.
export const API_REFERENCE_PAGE = {
    es: {
        title: 'Referencia de la API',
        description: 'Todas las operaciones de la API v1 de Cord con sus campos y ejemplos en curl y Node, generadas del contrato de la API.',
        url: '/docs/desarrolladores/referencia',
    },
    en: {
        title: 'API Reference',
        description: 'Every Cord API v1 operation with its fields and examples in curl and Node, generated from the API contract.',
        url: '/en/docs/desarrolladores/referencia',
    },
} as const;

/** Texto buscable de la referencia: cada grupo con sus operaciones y campos. */
export function referenceSearchText(): string {
    return groupedOperations().map(([tag, ops]) => [
        tag,
        ...ops.map((op) => {
            const fields = fieldsOf(op.body).map((f) => f.name);
            return `${op.method} /api/v1${op.path} ${op.summary}${fields.length ? ` (${fields.join(', ')})` : ''}`;
        }),
    ].join('. ')).join('. ');
}

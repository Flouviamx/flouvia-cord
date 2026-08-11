import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createTextPdf } from '../src/lib/simple-pdf.ts';

const root = resolve(import.meta.dirname, '..');
const evidencePath = resolve(root, 'src/pages/api/cobros/disputas/[disputeId]/evidencia.ts');
const evidence = await readFile(evidencePath, 'utf8');
const required = [
    'submit: z.boolean().optional().default(false)',
    'if (!parsed.data.submit)',
    "const fields: Record<string, string> = { submit: 'true' }",
    'requireFreshAuth()',
    "key !== 'customer_communication_text'",
];
const failures = required.filter((needle) => !evidence.includes(needle));

const pdf = createTextPdf('Comprobante', ['Cotización C-100', 'Monto 1,000.00 MXN']);
if (!pdf.subarray(0, 8).equals(Buffer.from('%PDF-1.4'))) failures.push('el comprobante automático no inicia como PDF');
if (!pdf.includes(Buffer.from('xref')) || !pdf.subarray(-6).equals(Buffer.from('%%EOF\n'))) {
    failures.push('el comprobante automático no contiene xref/EOF válidos');
}

async function sourceFiles(path) {
    const entries = await readdir(path, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
        const child = resolve(path, entry.name);
        if (entry.isDirectory()) files.push(...await sourceFiles(child));
        else if (/\.(ts|astro)$/.test(entry.name)) files.push(child);
    }
    return files;
}

for (const base of ['src/pages/api/cron', 'src/pages/api/stripe']) {
    for (const file of await sourceFiles(resolve(root, base))) {
        const source = await readFile(file, 'utf8');
        if (/\/v1\/disputes\//.test(source) || /evidence\[submit\]/.test(source)) {
            failures.push(`envío automático encontrado en ${file.slice(root.length + 1)}`);
        }
    }
}

if (failures.length) {
    console.error('Dispute safety falló:\n- ' + failures.join('\n- '));
    process.exitCode = 1;
} else {
    console.log('Dispute safety: ningún carril automático puede enviar evidencia');
}

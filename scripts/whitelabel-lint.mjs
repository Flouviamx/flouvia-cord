import { readdir, readFile, stat } from 'node:fs/promises';
import { relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const targets = [
    'src/i18n',
    'src/pages/q',
    'src/pages/api/q',
    'src/components/q',
    'src/pages/app',
    'src/components/app',
    'src/content/support',
    'src/content/docs',
];
const extensions = new Set(['.ts', '.tsx', '.astro', '.md', '.mdx']);

// Allowlist deliberada. Cada excepción debe explicar por qué el nombre del
// proveedor es técnico o contractual y no copy visible de Cord Pagos.
const allowed = [
    // El texto contractual de la cuenta conectada ahora vive en el diccionario
    // CO_STRINGS del propio componente (una entrada por idioma), así que la
    // excepción cubre las dos versiones. Sigue siendo texto que Stripe EXIGE
    // mostrar literalmente, no copy de Cord Pagos.
    { path: /ConnectCustomOnboarding\.tsx$/, line: /Connected Account Agreement|Acuerdo de Cuenta Conectada de Stripe|stripe\.com\/mx\/connect-account\/legal|términos legales de Stripe|Términos de Servicio de Stripe|Stripe's Terms of Service|Stripe procesa los pagos|Stripe processes payments|procesamiento de pagos provistos por Stripe|payment processing services provided by Stripe|identificación y selfie se envían directamente a Stripe|sent directly to Stripe|acuerdo de Stripe|the Stripe agreement/, reason: 'texto contractual y de privacidad obligatorio de la cuenta conectada (es + en)' },
    { path: /.*/, line: /@stripe\//, reason: 'import técnico del SDK' },
    { path: /.*/, line: /theme\s*:\s*['"]stripe['"]/, reason: 'nombre técnico del preset Appearance' },
    { path: /src\/i18n\/app\.ts$/, line: /"(?:q\.suscripcion_stripe|set\.plan\.gestion_stripe)"\s*:/, reason: 'clave de traducción legacy; el valor visible ya es white-label' },
    { path: /.*/, line: /t\([^\n]*['"](?:q\.suscripcion_stripe|set\.plan\.gestion_stripe)['"]/, reason: 'consumo de una clave interna legacy' },
    { path: /.*/, line: /Stripe-Account|STRIPE_[A-Z_]+|api\.stripe\.com|files\.stripe\.com/, reason: 'API o variable de entorno interna' },
    { path: /.*/, line: /(?:stripe_|stripe[A-Z]|[a-z][A-Za-z0-9]*Stripe|Stripe[A-Z]|\.stripe\b|\bstripe\b|data-[^=\s]*stripe|parts=stripe)/, reason: 'identificador interno no renderizado' },
    { path: /src\/pages\/app\/checkout\.astro$/, line: /(?:const Stripe|!Stripe|Stripe\(PK\))/, reason: 'constructor global técnico del SDK' },
];

function isComment(line) {
    const s = line.trim();
    return s.startsWith('//') || s.startsWith('/*') || s.startsWith('*') || s.startsWith('<!--') || s.startsWith('-->');
}

async function filesUnder(path) {
    const absolute = resolve(root, path);
    try {
        const info = await stat(absolute);
        if (info.isFile()) return [absolute];
    } catch { return []; }
    const found = [];
    for (const entry of await readdir(absolute, { withFileTypes: true })) {
        const child = resolve(absolute, entry.name);
        if (entry.isDirectory()) found.push(...await filesUnder(relative(root, child)));
        else if (extensions.has(entry.name.slice(entry.name.lastIndexOf('.')))) found.push(child);
    }
    return found;
}

const violations = [];
for (const target of targets) {
    for (const file of await filesUnder(target)) {
        const rel = relative(root, file);
        const lines = (await readFile(file, 'utf8')).split(/\r?\n/);
        let blockComment = false;
        lines.forEach((line, index) => {
            const trimmed = line.trim();
            if (blockComment) {
                if (trimmed.includes('*/') || trimmed.includes('-->')) blockComment = false;
                return;
            }
            if (trimmed.startsWith('/*') || trimmed.startsWith('<!--')) {
                if (!trimmed.includes('*/') && !trimmed.includes('-->')) blockComment = true;
                return;
            }
            const commentAt = line.indexOf('//');
            const candidate = commentAt >= 0 && !line.slice(0, commentAt).includes('http') ? line.slice(0, commentAt) : line;
            if (!/stripe/i.test(candidate) || isComment(candidate)) return;
            if (allowed.some((rule) => rule.path.test(rel) && rule.line.test(candidate))) return;
            violations.push(`${rel}:${index + 1}: ${candidate.trim()}`);
        });
    }
}

if (violations.length) {
    console.error('White-label: se encontró copy no permitido del proveedor:\n' + violations.join('\n'));
    process.exitCode = 1;
} else {
    console.log('White-label: superficies de comprador y vendedor limpias');
}

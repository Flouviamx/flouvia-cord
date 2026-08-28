// Contrato de las rutas que mueven dinero. Corre en `npm run security:payments`.
//
// Por qué existe este script
// ─────────────────────────
// La auditoría de agosto 2026 encontró cuatro clases de hueco en el carril de
// pagos, y las cuatro eran INVISIBLES para `typecheck`, `build` y el resto de
// los `security:*`, porque ninguna es un error de tipos:
//
//   · un PaymentIntent creado SIN `Idempotency-Key` — un reintento del
//     navegador acuñaba un segundo Customer en la cuenta conectada y, como la
//     CLABE de SPEI se asigna por Customer, el cliente terminaba con dos CLABEs
//     vivas y el pago llegaba a la que nadie conciliaba;
//   · una ruta de dinero sin carril de tenencia, sin la segunda línea de
//     defensa que da RLS;
//   · una ruta de dinero sin rate limit;
//   · el mensaje CRUDO del proveedor devuelto al usuario (regla 14): inglés,
//     con ids internos, y describiendo el mecanismo en vez del estado.
//
// El linter deriva su universo del árbol de rutas, no de una lista escrita a
// mano: un endpoint nuevo que toque dinero queda cubierto el día que se crea.
//
// Cómo detecta una violación
// ──────────────────────────
// Se enmascaran comentarios y strings (para no confundir una mención en prosa
// con una llamada real), se marca cada archivo de `src/pages/api/**` que crea un
// objeto de dinero, y se le exige las cuatro cosas. Las excepciones van con su
// motivo escrito y la lista SOLO PUEDE ENCOGER: si un archivo listado deja de
// violar, el script falla para obligar a quitarlo.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const API_DIR = join(ROOT, 'src/pages/api');

// ── Excepciones, con motivo. Solo pueden ENCOGER. ───────────────────────────
const EXENTOS = new Map([
    ['src/pages/api/stripe/webhook.ts',
     'no crea objetos de dinero: los recibe firmados y su idempotencia es el claim de stripe_events'],
]);

// ── Qué cuenta como "mueve dinero" ──────────────────────────────────────────
const CREA_DINERO = [
    /\/v1\/payment_intents/,
    /\/v1\/checkout\/sessions/,
    /\/v1\/subscriptions\b/,
    /\/v1\/refunds/,
    /\/v1\/customers\b/,
    /application_fee_amount/,
    /application_fee_percent/,
];

// CREA un objeto nuevo: la ruta del proveedor termina en la colección, sin id.
// `POST /v1/subscriptions/sub_123` MODIFICA una que ya existe y no necesita
// clave de idempotencia; `POST /v1/subscriptions` acuña una nueva y sí.
const CREA_OBJETO = [
    /\/v1\/payment_intents['"`]/,
    /\/v1\/checkout\/sessions['"`]/,
    /\/v1\/customers['"`]/,
    /\/v1\/subscriptions['"`]/,
    /\/v1\/refunds['"`]/,
    /\/v1\/setup_intents['"`]/,
];

const CARRILES = /\b(withOrgTx|withUserTx|withSystemTx|withOpsTx|withCaptureToken)\s*\(/;
// `billingContext()` aplica el límite por dentro, para todas las rutas de la
// superficie de facturación a la vez. Se acepta como proveedor de rate limit,
// pero NO a ciegas: abajo se verifica que ese envoltorio realmente lo llame. Un
// linter que confía en un envoltorio sin comprobarlo deja de proteger el día que
// alguien vacía el envoltorio.
const RATE_LIMIT = /\b(rateLimit|strictRateLimit|limitConnectMutation|limitConnectRead|limitPublicPayment|assertCronAuth|billingContext)\s*\(/;
const IDEMPOTENCIA = /Idempotency-Key|idempotencyKey/;
/** Sólo hay carril que exigir si el archivo ejecuta alguna query. */
const HACE_QUERY = /\bsql\s*`/;

// Fuga de la regla 14: el mensaje del proveedor devuelto tal cual al usuario.
// `payerError`/`merchantError`/`translateStripeError` son los traductores
// permitidos.
//
// Se busca la forma del error CAPTURADO —`e?.message`, `err?.message`,
// `data?.error?.message`— y no `error.message` a secas: esa última es como el
// repo devuelve el texto de sus PROPIOS errores tipados (`FXUnavailableError`,
// `TaxCatalogUnavailableError`), que son mensajes curados en español y
// accionables. Marcarlos sería un falso positivo, y un linter con falsos
// positivos se desactiva a la semana.
const FUGA_MENSAJE = /error:\s*(?:\w+\?\.)*(?:\w+\?\.message|\w+\??\.error\??\.message)/;

/**
 * Enmascara comentarios y literales para no leer prosa como código.
 *
 * Trata los LITERALES DE EXPRESIÓN REGULAR, y no es un lujo: este archivo
 * empezó sin hacerlo y el primer `/[&<>"']/g` que encontró abrió una comilla
 * que nunca cerró, borrando el resto del archivo y reportando como faltantes un
 * carril y un rate limit que sí estaban ahí. Un linter con falsos positivos se
 * desactiva a la semana.
 *
 * Se conservan los saltos de línea y la longitud, para que los offsets sigan
 * correspondiendo al archivo real.
 */
function enmascarar(src) {
    const out = src.split('');
    const borra = (i) => { if (src[i] !== '\n') out[i] = ' '; };
    // Un `/` inicia expresión regular (y no división) cuando lo anterior no es
    // un valor. Es la heurística estándar y basta aquí: el código de estas
    // rutas no divide por algo que termine en `)` seguido de regex.
    const ANTES_DE_REGEX = /[(,=:[!&|?{};+\-*%^~<>]$|\b(return|typeof|case|in|of|new|delete|void|do|else|yield|await)$/;
    let i = 0;
    while (i < src.length) {
        const c = src[i];
        if (c === '/' && src[i + 1] === '/') {
            while (i < src.length && src[i] !== '\n') { borra(i); i++; }
            continue;
        }
        if (c === '/' && src[i + 1] === '*') {
            while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) { borra(i); i++; }
            borra(i); borra(i + 1); i += 2;
            continue;
        }
        if (c === '/') {
            const previo = src.slice(0, i).replace(/\s+$/, '');
            if (ANTES_DE_REGEX.test(previo)) {
                borra(i); i++;
                let clase = false;
                while (i < src.length) {
                    const ch = src[i];
                    if (ch === '\\') { borra(i); borra(i + 1); i += 2; continue; }
                    if (ch === '\n') break;                 // regex sin cerrar: no se arrastra
                    if (ch === '[') clase = true;
                    else if (ch === ']') clase = false;
                    else if (ch === '/' && !clase) { borra(i); i++; break; }
                    borra(i); i++;
                }
                while (i < src.length && /[a-z]/.test(src[i])) { borra(i); i++; } // banderas
                continue;
            }
            i++;
            continue;
        }
        if (c === '"' || c === "'") {
            const comilla = c;
            borra(i); i++;
            while (i < src.length && src[i] !== comilla) {
                if (src[i] === '\\') { borra(i); borra(i + 1); i += 2; continue; }
                if (src[i] === '\n') break;                 // cadena sin cerrar: no se arrastra
                borra(i); i++;
            }
            borra(i); i++;
            continue;
        }
        if (c === '`') {
            borra(i); i++;
            let profundidad = 0;
            while (i < src.length) {
                if (src[i] === '\\') { borra(i); borra(i + 1); i += 2; continue; }
                if (src[i] === '$' && src[i + 1] === '{') { profundidad++; borra(i); borra(i + 1); i += 2; continue; }
                if (src[i] === '}' && profundidad > 0) { profundidad--; borra(i); i++; continue; }
                if (src[i] === '`' && profundidad === 0) break;
                borra(i); i++;
            }
            borra(i); i++;
            continue;
        }
        i++;
    }
    return out.join('');
}

function archivos(dir) {
    const salida = [];
    for (const nombre of readdirSync(dir)) {
        const ruta = join(dir, nombre);
        if (statSync(ruta).isDirectory()) salida.push(...archivos(ruta));
        else if (/\.(ts|mts)$/.test(nombre)) salida.push(ruta);
    }
    return salida;
}

const violaciones = [];
const marcados = [];

for (const ruta of archivos(API_DIR)) {
    const rel = relative(ROOT, ruta);
    const crudo = readFileSync(ruta, 'utf8');
    // La detección de "mueve dinero" se hace sobre el CRUDO: las rutas de la API
    // del proveedor viven dentro de strings, que el enmascarado borra.
    if (!CREA_DINERO.some((re) => re.test(crudo))) continue;
    marcados.push(rel);
    if (EXENTOS.has(rel)) continue;

    const codigo = enmascarar(crudo);
    const faltan = [];
    // El carril protege QUERIES. Un archivo que sólo habla con el proveedor no
    // tiene ninguna que proteger — exigírselo sería ruido, y el ruido apaga
    // linters.
    if (HACE_QUERY.test(codigo) && !CARRILES.test(codigo)) faltan.push('carril de tenencia');
    if (!RATE_LIMIT.test(codigo)) faltan.push('rate limit');
    if (CREA_OBJETO.some((re) => re.test(crudo)) && !IDEMPOTENCIA.test(crudo)) {
        faltan.push('Idempotency-Key');
    }
    if (FUGA_MENSAJE.test(codigo)) faltan.push('fuga del mensaje del proveedor (regla 14)');
    if (faltan.length) violaciones.push({ rel, faltan });
}

// Los envoltorios en los que confía la regla de arriba tienen que seguir
// cumpliendo. Confiar en uno sin comprobarlo deja de proteger el día que alguien
// lo vacía — y el vaciado no rompe ningún tipo, así que nada más lo detectaría.
const ENVOLTORIOS = [
    {
        archivo: 'src/lib/billing-surface.ts',
        exige: /strictRateLimit\s*\(/,
        porque: 'Las rutas de facturación lo delegan en billingContext(); sin él quedan TODAS sin límite.',
    },
    {
        archivo: 'src/lib/connect-security.ts',
        // El carril público de pago (/api/q/*, /api/i/*) delega aquí. Se exige
        // `strictRateLimit` explícitamente: `rateLimit()` falla ABIERTO, y en el
        // endpoint donde vive el fraude de prueba de tarjetas eso es no tener
        // límite justo cuando más falta hace.
        exige: /export async function limitPublicPayment[\s\S]{0,900}?strictRateLimit\s*\(/,
        porque: 'limitPublicPayment() protege /api/q/* y /api/i/*; sin strictRateLimit falla abierto.',
    },
];
for (const { archivo, exige, porque } of ENVOLTORIOS) {
    const fuente = readFileSync(join(ROOT, archivo), 'utf8');
    if (!exige.test(fuente)) {
        console.error(`payments-contract-check: ${archivo} ya no aplica rate limit.`);
        console.error(`  ${porque}`);
        process.exitCode = 1;
    }
}

// Sanity-check del propio parser: si deja de encontrar rutas de dinero, lo roto
// es el script, no el código. Mismo criterio que tenancy-lint.
if (marcados.length < 6) {
    console.error(`payments-contract-check: solo se detectaron ${marcados.length} rutas de dinero.`);
    console.error('El parser está roto, no el código. Revisa CREA_DINERO antes de tocar nada más.');
    process.exit(1);
}

// Una excepción que ya no hace falta se quita: la lista solo puede encoger.
for (const [rel, motivo] of EXENTOS) {
    if (!marcados.includes(rel)) {
        console.error(`payments-contract-check: ${rel} está exento pero ya no toca dinero.`);
        console.error(`  Motivo registrado: ${motivo}`);
        console.error('  Quítalo de EXENTOS.');
        process.exitCode = 1;
    }
}

if (violaciones.length) {
    console.error('Contrato de pagos incumplido:');
    for (const { rel, faltan } of violaciones) {
        console.error(`  ${rel} → falta ${faltan.join(', ')}`);
    }
    console.error('');
    console.error('Toda ruta que crea un objeto de dinero necesita las cuatro cosas.');
    console.error('Si una NO aplica, agrégala a EXENTOS con el motivo escrito.');
    process.exitCode = 1;
} else {
    console.log(`Contrato de pagos correcto (${marcados.length} rutas de dinero, sin deuda pendiente).`);
}

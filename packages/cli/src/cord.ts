// cord — CLI de desarrollo de Cord. Solo trabaja con llaves de prueba.
import { mkdirSync, readFileSync, writeFileSync, rmSync, chmodSync, existsSync, appendFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { spawn } from 'node:child_process';
import { hostname } from 'node:os';
import { HELP, MAX_SETUP_FILE, VERSION, checkForwardUrl, checkTestKey, configPath, describeCounts, maskKey, parseArgs, parseEventList, sameOrigin } from './lib.js';
import { planInit, type ProjectFiles } from './init.js';

const API_VERSION = '2026-10-01';
const { command, flags } = parseArgs(process.argv.slice(2));
const baseUrl = String(flags['base-url'] || process.env.CORD_BASE_URL || 'https://cordhq.app').replace(/\/+$/, '');
const dim = (s: string) => (process.stdout.isTTY ? `\x1b[2m${s}\x1b[0m` : s);
const bold = (s: string) => (process.stdout.isTTY ? `\x1b[1m${s}\x1b[0m` : s);
const red = (s: string) => (process.stderr.isTTY ? `\x1b[31m${s}\x1b[0m` : s);
const green = (s: string) => (process.stdout.isTTY ? `\x1b[32m${s}\x1b[0m` : s);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function die(message: string): never {
    process.stderr.write(`${red('Error:')} ${message}\n`);
    process.exit(1);
}

function readConfig(): { apiKey?: string } {
    try { return JSON.parse(readFileSync(configPath(), 'utf8')); } catch { return {}; }
}

function writeConfig(cfg: { apiKey?: string }) {
    const path = configPath();
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    writeFileSync(path, JSON.stringify(cfg, null, 2), { mode: 0o600 });
    chmodSync(path, 0o600);
}

function apiKey(): string {
    const key = String(flags['api-key'] || process.env.CORD_API_KEY || readConfig().apiKey || '');
    if (!key) die('No hay llave. Corre `cord login` o pasa --api-key sk_test_….');
    const check = checkTestKey(key);
    if (!check.ok) die(check.error);
    return key;
}

async function api<T>(method: string, path: string, body?: unknown, key = apiKey()): Promise<T> {
    let res: Response;
    try {
        res = await fetch(`${baseUrl}/api/v1${path}`, {
            method,
            headers: {
                Authorization: `Bearer ${key}`,
                'Cord-Version': API_VERSION,
                'User-Agent': `cord-cli/${VERSION}`,
                ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
            },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
    } catch (err) {
        throw new Error(`No se pudo contactar a Cord (${(err as Error).message}).`);
    }
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) {
        const rid = json?.request_id ? dim(` (${json.request_id})`) : '';
        throw new Error(`${json?.error || res.statusText}${rid}`);
    }
    return json.data as T;
}

function promptHidden(question: string): Promise<string> {
    return new Promise((resolve) => {
        const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
        const out = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
        let asked = false;
        out._writeToOutput = (s: string) => {
            if (!asked) { process.stdout.write(s); asked = true; } else if (s.includes('\n')) process.stdout.write('\n');
        };
        rl.question(question, (answer) => { rl.close(); resolve(answer.trim()); });
    });
}

function ask(question: string): Promise<string> {
    return new Promise((resolve) => {
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        rl.question(question, (answer) => { rl.close(); resolve(answer.trim()); });
    });
}

function openBrowser(url: string): boolean {
    if (flags['no-browser'] || !process.stdout.isTTY || !sameOrigin(url, baseUrl)) return false;
    const [cmd, args] = process.platform === 'darwin' ? ['open', [url]]
        : process.platform === 'win32' ? ['rundll32', ['url.dll,FileProtocolHandler', url]]
        : ['xdg-open', [url]];
    try {
        const child = spawn(cmd, args as string[], { stdio: 'ignore', detached: true });
        child.on('error', () => {});
        child.unref();
        return true;
    } catch { return false; }
}

async function publicPost<T>(path: string, body: unknown): Promise<{ status: number; data: T }> {
    let res: Response;
    try {
        res = await fetch(`${baseUrl}${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'User-Agent': `cord-cli/${VERSION}` },
            body: JSON.stringify(body),
        });
    } catch (err) {
        throw new Error(`No se pudo contactar a Cord (${(err as Error).message}).`);
    }
    return { status: res.status, data: (await res.json().catch(() => ({}))) as T };
}

async function saveKey(key: string) {
    const check = checkTestKey(key);
    if (!check.ok) die(check.error);
    const me = await api<{ org: { nombre: string }; mode: string }>('GET', '/me', undefined, key);
    if (me.mode !== 'test') die('Cord reporta que la llave no es de prueba.');
    writeConfig({ apiKey: key });
    console.log(`${green('Listo.')} ${bold(me.org.nombre)} ${dim(`(modo prueba, ${maskKey(key)})`)}`);
    console.log(dim(`Guardada en ${configPath()} con permisos 0600.`));
}

async function login() {
    if (flags['api-key'] && flags['api-key'] !== true) return saveKey(String(flags['api-key']));
    if (flags['api-key'] === true) return saveKey(await promptHidden('Pega tu llave de prueba (sk_test_…): '));

    const start = await publicPost<{ device_code: string; user_code: string; verification_url: string; interval: number; expires_in: number; error?: string }>(
        '/api/cli/login', { host: hostname() });
    if (start.status !== 200 || !start.data.device_code) die(start.data.error || 'No se pudo iniciar sesión. Intenta en un momento.');
    const { device_code, user_code, verification_url } = start.data;
    const interval = Math.max(2, Number(start.data.interval) || 2) * 1000;
    const deadline = Date.now() + (Number(start.data.expires_in) || 600) * 1000;

    console.log(`\nTu código de confirmación: ${bold(user_code)}\n`);
    const opened = openBrowser(verification_url);
    console.log(opened ? `Abrimos tu navegador. Si no se abrió, entra a:\n  ${verification_url}` : `Abre esta dirección e inicia sesión en Cord:\n  ${verification_url}`);
    console.log(dim('\nConfirma que el código en pantalla es el mismo. Esperando… (Ctrl+C para cancelar)'));

    while (Date.now() < deadline) {
        await sleep(interval);
        let r: { status: number; data: { estado?: string; api_key?: string; error?: string } };
        try { r = await publicPost('/api/cli/login/claim', { device_code }); } catch { continue; }
        if (r.status === 429) { await sleep(interval); continue; }
        const estado = r.data.estado;
        if (estado === 'aprobado' && r.data.api_key) {
            console.log('');
            return saveKey(r.data.api_key);
        }
        if (estado === 'rechazado') die('Cancelaste el acceso desde el navegador.');
        if (estado === 'vencido') die('El código venció. Vuelve a correr cord login.');
        if (estado === 'reclamado' || estado === 'invalido') die(r.data.error || 'Ese código ya se usó. Vuelve a correr cord login.');
    }
    die('El código venció. Vuelve a correr cord login.');
}

interface SetupPlan {
    id: string; estado: string; review_url: string; resumen?: string;
    conteos?: Record<string, number>; avisos?: string[];
    descartado?: Array<{ campo: string; motivo: string }>;
    resultado?: Array<{ seccion: string; ok: boolean; detalle: string }> | null;
}

async function setup() {
    const interactive = process.stdin.isTTY && process.stdout.isTTY;
    let sitio = typeof flags.sitio === 'string' ? flags.sitio : '';
    let descripcion = typeof flags.descripcion === 'string' ? flags.descripcion : '';
    let archivo = typeof flags.archivo === 'string' ? flags.archivo : '';
    if (!sitio && !descripcion && !archivo) {
        if (!interactive) die('Pasa al menos --sitio, --descripcion o --archivo.');
        console.log(`${bold('Configura tu cuenta de Cord con IA')}\n${dim('Lee lo que le des y propone perfil, marca, impuestos, catálogo y plantillas. Nada se aplica sin que lo apruebes.')}\n`);
        sitio = await ask(`Tu sitio web ${dim('(Enter para omitir)')}: `);
        descripcion = await ask(`A qué se dedica tu negocio ${dim('(Enter para omitir)')}: `);
        archivo = await ask(`Ruta de tu lista de precios ${dim('(.csv, .xlsx, .pdf o foto; Enter para omitir)')}: `);
        if (!sitio && !descripcion && !archivo) die('Necesito al menos una de las tres para proponer algo.');
    }

    let file: { nombre: string; base64: string } | undefined;
    if (archivo) {
        const path = resolve(archivo.replace(/^['"]|['"]$/g, ''));
        let bytes: Buffer;
        try { bytes = readFileSync(path); } catch { die(`No pude leer ${path}.`); }
        if (bytes.length > MAX_SETUP_FILE) die('El archivo pesa más de 3 MB.');
        file = { nombre: basename(path), base64: bytes.toString('base64') };
    }

    process.stdout.write(dim('\nLeyendo tu negocio y armando la propuesta… '));
    const plan = await api<SetupPlan>('POST', '/setup/plans', { sitio: sitio || undefined, descripcion, archivo: file });
    process.stdout.write(dim('listo.\n\n'));

    if (plan.resumen) console.log(`${plan.resumen}\n`);
    const partes = describeCounts(plan.conteos ?? {});
    console.log(partes.length ? `${bold('Propuesta:')} ${partes.join(', ')}.` : 'No encontré nada que configurar con eso. Prueba con tu sitio o tu lista de precios.');
    for (const a of plan.avisos ?? []) console.log(`  ${dim('·')} ${a}`);
    if (plan.descartado?.length) console.log(dim(`  ${plan.descartado.length} dato(s) no pasaron la validación y se dejaron fuera.`));
    if (!partes.length) return;

    const opened = openBrowser(plan.review_url);
    console.log(`\n${opened ? 'Abrimos la revisión en tu navegador:' : 'Revísala y apruébala aquí:'}\n  ${plan.review_url}`);
    console.log(dim('\nEsperando tu aprobación… (Ctrl+C para salir; la propuesta sigue disponible 7 días)'));

    const deadline = Date.now() + 30 * 60 * 1000;
    let wait = 3000;
    while (Date.now() < deadline) {
        await sleep(wait);
        let cur: SetupPlan;
        try { cur = await api<SetupPlan>('GET', `/setup/plans/${encodeURIComponent(plan.id)}`); wait = 3000; } catch { wait = Math.min(15000, wait * 2); continue; }
        if (cur.estado === 'aplicado') {
            console.log(`\n${green('Configuración aplicada.')}`);
            for (const r of cur.resultado ?? []) console.log(`  ${r.ok ? green('ok') : red('error')}  ${r.seccion.padEnd(12)} ${dim(r.detalle)}`);
            console.log(`\nSiguiente: ${bold('cord init')} para conectar tu código, o crea tu primera cotización en ${baseUrl}/app`);
            return;
        }
        if (cur.estado === 'descartado') { console.log('\nDescartaste la propuesta. No se cambió nada.'); return; }
        if (cur.estado === 'fallido') die('No se pudo aplicar la propuesta. Revisa el detalle en el navegador.');
    }
    console.log(dim('\nDejé de esperar. La propuesta sigue en el link de arriba.'));
}

async function whoami() {
    const key = apiKey();
    const me = await api<{ org: { nombre: string; plan: string }; mode: string; scope: string }>('GET', '/me', undefined, key);
    console.log(`${bold(me.org.nombre)} · modo ${me.mode} · ${me.scope} · ${maskKey(key)}`);
}

interface CliDelivery { event_id: string; evento: string; body: string; headers: Record<string, string> }

async function listen() {
    if (!flags['forward-to'] || flags['forward-to'] === true) die('Falta --forward-to, por ejemplo --forward-to http://localhost:3000/api/webhooks/cord');
    const target = checkForwardUrl(String(flags['forward-to']), flags['allow-remote'] === true);
    if (!target.ok) die(target.error);
    const eventos = parseEventList(flags.events);
    const session = await api<{ id: string; secret: string; expira: string; eventos: string[] }>('POST', '/test_helpers/listen', { eventos });
    console.log(`${bold('Escuchando')} webhooks de prueba ${eventos.length ? `(${eventos.join(', ')})` : '(todos los eventos)'} → ${target.url.href}`);
    console.log(`Secreto de esta sesión: ${bold(session.secret)}`);
    console.log(dim('Ponlo en CORD_WEBHOOK_SECRET de tu servidor local. Vence en 24 h. Ctrl+C para salir.\n'));

    let stopping = false;
    const stop = async () => {
        if (stopping) return;
        stopping = true;
        try { await api('DELETE', `/test_helpers/listen/${session.id}`); } catch { /* vence sola */ }
        console.log(dim('\nSesión cerrada.'));
        process.exit(0);
    };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);

    let wait = 1500;
    while (!stopping) {
        let batch: CliDelivery[] = [];
        try {
            batch = await api<CliDelivery[]>('GET', `/test_helpers/listen/${session.id}`);
            wait = 1500;
        } catch (err) {
            process.stderr.write(`${red('!')} ${(err as Error).message}\n`);
            if (/no existe|venció/.test((err as Error).message)) process.exit(1);
            wait = Math.min(15000, wait * 2);
        }
        for (const d of batch) {
            const started = Date.now();
            let status = 'sin respuesta';
            try {
                const res = await fetch(target.url, { method: 'POST', headers: d.headers, body: d.body, redirect: 'manual' });
                status = String(res.status);
            } catch (err) {
                status = (err as Error).message;
            }
            const ok = /^2\d\d$/.test(status);
            console.log(`${new Date().toLocaleTimeString()}  ${bold(d.evento.padEnd(28))} ${dim(d.event_id)}  → ${ok ? status : red(status)} ${dim(`${Date.now() - started} ms`)}`);
        }
        await new Promise((r) => setTimeout(r, wait));
    }
}

async function trigger() {
    const evento = command[1];
    if (!evento) die('Uso: cord trigger <evento> [--objeto <id>]');
    const objeto = typeof flags.objeto === 'string' ? flags.objeto : undefined;
    const r = await api<{ datos: string }>('POST', '/test_helpers/webhooks', { evento, objeto_id: objeto });
    console.log(`Disparado ${bold(evento)} ${dim(`(datos ${r.datos})`)}`);
}

async function simulate() {
    const [, kind, a, b] = command;
    if (kind === 'fiscal' && a) {
        await api('POST', '/test_helpers/fiscal', { siguiente_resultado: a });
        console.log(`La próxima emisión fiscal de la sandbox resultará en ${bold(a)}.`);
        return;
    }
    if (kind === 'quote' && a && (b === 'vista' || b === 'vencer')) {
        await api('POST', `/test_helpers/cotizaciones/${encodeURIComponent(a)}`, { accion: b });
        console.log(`Cotización ${a}: ${bold(b === 'vista' ? 'abierta por el cliente' : 'vencida')}.`);
        return;
    }
    die('Uso: cord simulate fiscal <resultado> | cord simulate quote <id> <vista|vencer>');
}

async function eventsTail() {
    const type = typeof flags.type === 'string' ? flags.type : undefined;
    const seen = new Set<string>();
    let first = true;
    console.log(dim('Mostrando eventos nuevos. Ctrl+C para salir.'));
    for (;;) {
        try {
            const qs = new URLSearchParams({ limit: '50', ...(type ? { type } : {}) });
            const events = await api<Array<{ id: string; type: string; object_id?: string; created_at: string }>>('GET', `/events?${qs}`);
            for (const e of [...events].reverse()) {
                if (seen.has(e.id)) continue;
                seen.add(e.id);
                if (!first) console.log(`${new Date(e.created_at).toLocaleTimeString()}  ${bold(e.type.padEnd(28))} ${dim(e.object_id ?? '')}`);
            }
            first = false;
        } catch (err) {
            process.stderr.write(`${red('!')} ${(err as Error).message}\n`);
        }
        await new Promise((r) => setTimeout(r, 2000));
    }
}

function readJson(path: string): any {
    try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return undefined; }
}

function readText(path: string): string | undefined {
    try { return readFileSync(path, 'utf8'); } catch { return undefined; }
}

async function init() {
    const cwd = process.cwd();
    const project: ProjectFiles = {
        packageJson: readJson(`${cwd}/package.json`),
        composerJson: readJson(`${cwd}/composer.json`),
        pythonDeps: [readText(`${cwd}/requirements.txt`), readText(`${cwd}/pyproject.toml`)].filter(Boolean).join('\n'),
        hasAppDir: existsSync(`${cwd}/app`) || existsSync(`${cwd}/src/app`),
        hasSrcDir: existsSync(`${cwd}/src/app`),
        gitignore: readText(`${cwd}/.gitignore`),
        lockfiles: ['pnpm-lock.yaml', 'yarn.lock', 'bun.lockb', 'bun.lock', 'package-lock.json'].filter((f) => existsSync(`${cwd}/${f}`)),
    };
    const plan = planInit(project);
    if (plan.framework === 'unknown') die('No reconocí el framework de este proyecto. Mira https://docs.cordhq.app/docs/desarrolladores/empezar/resumen para instalar a mano.');
    console.log(`Framework: ${bold(plan.framework)}\n`);
    let step = 1;
    if (plan.install) console.log(`${step++}. Instala el SDK:\n   ${bold(plan.install)}\n`);

    for (const f of plan.files) {
        const full = `${cwd}/${f.path}`;
        if (existsSync(full)) { console.log(`   ${dim('ya existe, no lo toco:')} ${f.path}`); continue; }
        mkdirSync(dirname(full), { recursive: true });
        writeFileSync(full, f.content, { flag: 'wx' });
        console.log(`   creado ${bold(f.path)}`);
    }
    if (plan.snippet) console.log(`\n${step++}. Agrega la ruta del webhook:\n\n${plan.snippet}\n`);

    const key = String(flags['api-key'] || process.env.CORD_API_KEY || readConfig().apiKey || '');
    const lines = ['CORD_SECRET_KEY=' + (checkTestKey(key).ok ? key : 'sk_test_...'), 'CORD_WEBHOOK_SECRET=whsec_... # lo imprime cord listen'];
    if (plan.envFile) {
        const envPath = `${cwd}/${plan.envFile}`;
        const current = readText(envPath) ?? '';
        const missing = lines.filter((l) => !current.includes(l.split('=')[0] + '='));
        if (missing.length) appendFileSync(envPath, (current && !current.endsWith('\n') ? '\n' : '') + missing.join('\n') + '\n', { mode: 0o600 });
        console.log(`\n${step++}. Variables en ${bold(plan.envFile)} ${dim('(ignorado por git)')}`);
    } else {
        console.log(`\n${step++}. Agrega a tu archivo de entorno ${dim('(asegúrate de que git lo ignore)')}:\n   ${lines.join('\n   ')}`);
    }
    if (plan.webhookPath) {
        console.log(`\n${step++}. Prueba de punta a punta:\n   ${bold(`cord listen --forward-to http://localhost:3000${plan.webhookPath}`)}\n   ${bold('cord trigger quote.approved')}`);
    }
    console.log(dim(`\n¿Tu cuenta todavía está vacía? ${bold('cord setup')} propone perfil, impuestos y catálogo a partir de tu sitio.`));
}

async function main() {
    if (flags.version) return console.log(VERSION);
    const [cmd, sub] = command;
    if (!cmd || flags.help || cmd === 'help') return console.log(HELP);
    if (cmd === 'login') return login();
    if (cmd === 'init') return init();
    if (cmd === 'setup') return setup();
    if (cmd === 'logout') { rmSync(configPath(), { force: true }); return console.log('Llave borrada.'); }
    if (cmd === 'whoami') return whoami();
    if (cmd === 'listen') return listen();
    if (cmd === 'trigger') return trigger();
    if (cmd === 'simulate') return simulate();
    if (cmd === 'events' && sub === 'tail') return eventsTail();
    die(`Comando desconocido: ${command.join(' ')}. Corre \`cord help\`.`);
}

main().catch((err) => die((err as Error).message));

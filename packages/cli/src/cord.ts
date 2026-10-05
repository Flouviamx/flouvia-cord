// cord — CLI de desarrollo de Cord. Solo trabaja con llaves de prueba.
import { mkdirSync, readFileSync, writeFileSync, rmSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import { createInterface } from 'node:readline';
import { HELP, VERSION, checkForwardUrl, checkTestKey, configPath, maskKey, parseArgs, parseEventList } from './lib.js';

const API_VERSION = '2026-10-01';
const { command, flags } = parseArgs(process.argv.slice(2));
const baseUrl = String(flags['base-url'] || process.env.CORD_BASE_URL || 'https://cordhq.app').replace(/\/+$/, '');
const dim = (s: string) => (process.stdout.isTTY ? `\x1b[2m${s}\x1b[0m` : s);
const bold = (s: string) => (process.stdout.isTTY ? `\x1b[1m${s}\x1b[0m` : s);
const red = (s: string) => (process.stderr.isTTY ? `\x1b[31m${s}\x1b[0m` : s);

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

async function login() {
    const key = String(flags['api-key'] || (await promptHidden('Pega tu llave de prueba (sk_test_…): ')));
    const check = checkTestKey(key);
    if (!check.ok) die(check.error);
    const me = await api<{ org: { nombre: string }; mode: string }>('GET', '/me', undefined, key);
    if (me.mode !== 'test') die('Cord reporta que la llave no es de prueba.');
    writeConfig({ apiKey: key });
    console.log(`Listo. ${bold(me.org.nombre)} ${dim(`(modo prueba, ${maskKey(key)})`)}`);
    console.log(dim(`Guardada en ${configPath()} con permisos 0600.`));
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

async function main() {
    if (flags.version) return console.log(VERSION);
    const [cmd, sub] = command;
    if (!cmd || flags.help || cmd === 'help') return console.log(HELP);
    if (cmd === 'login') return login();
    if (cmd === 'logout') { rmSync(configPath(), { force: true }); return console.log('Llave borrada.'); }
    if (cmd === 'whoami') return whoami();
    if (cmd === 'listen') return listen();
    if (cmd === 'trigger') return trigger();
    if (cmd === 'simulate') return simulate();
    if (cmd === 'events' && sub === 'tail') return eventsTail();
    die(`Comando desconocido: ${command.join(' ')}. Corre \`cord help\`.`);
}

main().catch((err) => die((err as Error).message));

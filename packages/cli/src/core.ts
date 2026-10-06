// Operaciones del CLI sin interfaz: hablar con Cord, leer el proyecto y escribir
// archivos. Los flujos visuales (flows.ts) y el asistente las combinan.
import { mkdirSync, readFileSync, writeFileSync, chmodSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawn } from 'node:child_process';
import { hostname } from 'node:os';
import { VERSION, configPath, checkTestKey, sameOrigin, mergeEnv } from './lib.js';
import { planInit, type ProjectFiles, type InitPlan } from './init.js';

export const API_VERSION = '2026-10-01';

export class CliError extends Error {}

export interface Ctx {
    baseUrl: string;
    flags: Record<string, string | true>;
}

export function readConfig(): { apiKey?: string } {
    try { return JSON.parse(readFileSync(configPath(), 'utf8')); } catch { return {}; }
}

export function writeConfig(cfg: { apiKey?: string }) {
    const path = configPath();
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    writeFileSync(path, JSON.stringify(cfg, null, 2), { mode: 0o600 });
    chmodSync(path, 0o600);
}

export function storedKey(ctx: Ctx): string {
    const flag = ctx.flags['api-key'];
    return String((typeof flag === 'string' ? flag : '') || process.env.CORD_API_KEY || readConfig().apiKey || '');
}

export function requireKey(ctx: Ctx): string {
    const key = storedKey(ctx);
    if (!key) throw new CliError('No hay sesión. Corre `cord login` o `npx @flouviahq/cli` para el asistente.');
    const check = checkTestKey(key);
    if (!check.ok) throw new CliError(check.error);
    return key;
}

export async function api<T>(ctx: Ctx, method: string, path: string, body?: unknown, key = requireKey(ctx)): Promise<T> {
    let res: Response;
    try {
        res = await fetch(`${ctx.baseUrl}/api/v1${path}`, {
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
        throw new CliError(`No se pudo contactar a Cord (${(err as Error).message}).`);
    }
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) throw new CliError(`${json?.error || res.statusText}${json?.request_id ? ` (${json.request_id})` : ''}`);
    return json.data as T;
}

export async function publicPost<T>(ctx: Ctx, path: string, body: unknown): Promise<{ status: number; data: T }> {
    let res: Response;
    try {
        res = await fetch(`${ctx.baseUrl}${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'User-Agent': `cord-cli/${VERSION}` },
            body: JSON.stringify(body),
        });
    } catch (err) {
        throw new CliError(`No se pudo contactar a Cord (${(err as Error).message}).`);
    }
    return { status: res.status, data: (await res.json().catch(() => ({}))) as T };
}

export function openBrowser(ctx: Ctx, url: string): boolean {
    if (ctx.flags['no-browser'] || !process.stdout.isTTY || !sameOrigin(url, ctx.baseUrl)) return false;
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

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── Sesión ──────────────────────────────────────────────────────────────────

export interface Me { org: { nombre: string; plan?: string }; mode: string; scope: string }

export const whoami = (ctx: Ctx, key: string) => api<Me>(ctx, 'GET', '/me', undefined, key);

export interface DeviceStart { deviceCode: string; userCode: string; url: string; interval: number; deadline: number }

export async function startDeviceLogin(ctx: Ctx, proyecto: boolean): Promise<DeviceStart> {
    const r = await publicPost<{ device_code: string; user_code: string; verification_url: string; interval: number; expires_in: number; error?: string }>(
        ctx, '/api/cli/login', { host: hostname() });
    if (r.status !== 200 || !r.data.device_code) throw new CliError(r.data.error || 'No se pudo iniciar sesión. Intenta en un momento.');
    const url = new URL(r.data.verification_url);
    if (proyecto) url.searchParams.set('proyecto', '1');
    return {
        deviceCode: r.data.device_code, userCode: r.data.user_code, url: url.href,
        interval: Math.max(2, Number(r.data.interval) || 2) * 1000,
        deadline: Date.now() + (Number(r.data.expires_in) || 600) * 1000,
    };
}

export async function waitDeviceLogin(ctx: Ctx, start: DeviceStart): Promise<{ apiKey: string; projectKey?: string }> {
    while (Date.now() < start.deadline) {
        await sleep(start.interval);
        let r: { status: number; data: { estado?: string; api_key?: string; project_key?: string; error?: string } };
        try { r = await publicPost(ctx, '/api/cli/login/claim', { device_code: start.deviceCode }); } catch { continue; }
        if (r.status === 429) { await sleep(start.interval); continue; }
        const estado = r.data.estado;
        if (estado === 'aprobado' && r.data.api_key) return { apiKey: r.data.api_key, projectKey: r.data.project_key };
        if (estado === 'rechazado') throw new CliError('Cancelaste el acceso desde el navegador.');
        if (estado === 'vencido') throw new CliError('El código venció. Vuelve a intentarlo.');
        if (estado === 'reclamado' || estado === 'invalido') throw new CliError(r.data.error || 'Ese código ya se usó. Vuelve a intentarlo.');
    }
    throw new CliError('El código venció. Vuelve a intentarlo.');
}

/** Guarda la llave después de confirmar con Cord que es de prueba. */
export async function saveKey(ctx: Ctx, key: string): Promise<Me> {
    const check = checkTestKey(key);
    if (!check.ok) throw new CliError(check.error);
    const me = await whoami(ctx, key);
    if (me.mode !== 'test') throw new CliError('Cord reporta que la llave no es de prueba.');
    writeConfig({ apiKey: key });
    return me;
}

// ── Configuración con IA ────────────────────────────────────────────────────

export interface SetupPlan {
    id: string; estado: string; review_url: string; resumen?: string;
    conteos?: Record<string, number>; avisos?: string[];
    descartado?: Array<{ campo: string; motivo: string }>;
    resultado?: Array<{ seccion: string; ok: boolean; detalle: string }> | null;
}

export async function proposeSetup(ctx: Ctx, input: { sitio?: string; descripcion?: string; archivo?: { nombre: string; base64: string } }): Promise<SetupPlan> {
    return api<SetupPlan>(ctx, 'POST', '/setup/plans', { sitio: input.sitio || undefined, descripcion: input.descripcion ?? '', archivo: input.archivo });
}

export const getSetupPlan = (ctx: Ctx, id: string) => api<SetupPlan>(ctx, 'GET', `/setup/plans/${encodeURIComponent(id)}`);

// ── Proyecto ────────────────────────────────────────────────────────────────

function readJson(path: string): any {
    try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return undefined; }
}

export function readText(path: string): string | undefined {
    try { return readFileSync(path, 'utf8'); } catch { return undefined; }
}

export function scanProject(cwd: string): ProjectFiles {
    return {
        packageJson: readJson(join(cwd, 'package.json')),
        composerJson: readJson(join(cwd, 'composer.json')),
        pythonDeps: [readText(join(cwd, 'requirements.txt')), readText(join(cwd, 'pyproject.toml'))].filter(Boolean).join('\n'),
        hasAppDir: existsSync(join(cwd, 'app')) || existsSync(join(cwd, 'src/app')),
        hasSrcDir: existsSync(join(cwd, 'src/app')),
        gitignore: readText(join(cwd, '.gitignore')),
        lockfiles: ['pnpm-lock.yaml', 'yarn.lock', 'bun.lockb', 'bun.lock', 'package-lock.json'].filter((f) => existsSync(join(cwd, f))),
    };
}

export function projectPlan(cwd: string): InitPlan {
    return planInit(scanProject(cwd));
}

export function writePlanFiles(cwd: string, plan: InitPlan): Array<{ path: string; created: boolean }> {
    return plan.files.map((f) => {
        const full = join(cwd, f.path);
        if (existsSync(full)) return { path: f.path, created: false };
        mkdirSync(dirname(full), { recursive: true });
        writeFileSync(full, f.content, { flag: 'wx' });
        return { path: f.path, created: true };
    });
}

export function upsertEnv(cwd: string, file: string, vars: Record<string, string>) {
    const full = join(cwd, file);
    const current = readText(full) ?? '';
    const merged = mergeEnv(current, vars);
    if (merged.added.length || merged.updated.length) writeFileSync(full, merged.content, { mode: 0o600 });
    return merged;
}

/** Corre un comando del proyecto (instalar paquetes) y reporta cada línea de salida. */
export function runCommand(command: string, cwd: string, onLine: (line: string) => void): Promise<number> {
    const [cmd, ...args] = command.split(' ');
    return new Promise((resolve) => {
        const child = spawn(cmd, args, { cwd, shell: process.platform === 'win32', env: process.env });
        const feed = (buf: Buffer) => buf.toString().split(/\r?\n/).filter((l) => l.trim()).forEach(onLine);
        child.stdout?.on('data', feed);
        child.stderr?.on('data', feed);
        child.on('error', (e) => { onLine(e.message); resolve(127); });
        child.on('close', (code) => resolve(code ?? 1));
    });
}

// ── Webhooks en localhost ───────────────────────────────────────────────────

export interface ListenSession { id: string; secret: string; expira: string; eventos: string[] }
export interface CliDelivery { event_id: string; evento: string; body: string; headers: Record<string, string> }

export const openListen = (ctx: Ctx, eventos: string[]) => api<ListenSession>(ctx, 'POST', '/test_helpers/listen', { eventos });
export const pollListen = (ctx: Ctx, id: string) => api<CliDelivery[]>(ctx, 'GET', `/test_helpers/listen/${id}`);
export const closeListen = (ctx: Ctx, id: string) => api(ctx, 'DELETE', `/test_helpers/listen/${id}`);

export async function forwardDelivery(target: URL, d: CliDelivery): Promise<{ status: string; ms: number }> {
    const started = Date.now();
    try {
        const res = await fetch(target, { method: 'POST', headers: d.headers, body: d.body, redirect: 'manual' });
        return { status: String(res.status), ms: Date.now() - started };
    } catch (err) {
        const msg = (err as Error & { cause?: { code?: string } }).cause?.code === 'ECONNREFUSED' ? 'tu servidor no responde' : (err as Error).message;
        return { status: msg, ms: Date.now() - started };
    }
}

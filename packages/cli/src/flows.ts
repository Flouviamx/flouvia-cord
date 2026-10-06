// Los pasos visuales del CLI. Cada comando suelto y el asistente los usan igual.
import * as p from '@clack/prompts';
import { readFileSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import {
    CliError, type Ctx, type Me, type SetupPlan, closeListen, forwardDelivery, getSetupPlan, openBrowser, openListen,
    pollListen, projectPlan, proposeSetup, readText, runCommand, saveKey, sleep, startDeviceLogin, storedKey,
    upsertEnv, waitDeviceLogin, whoami, writePlanFiles,
} from './core.js';
import { MAX_SETUP_FILE, checkForwardUrl, checkTestKey, describeCounts, frameworkLabel, readEnvValue } from './lib.js';
import { amber, bold, codeChips, dim, green, kv, mint, PALETTE, fg, red, sky, slate, statusBadge } from './ui.js';
import type { InitPlan } from './init.js';

export function bail<T>(value: T | symbol): T {
    if (p.isCancel(value)) {
        p.cancel('Cancelado. No se cambió nada.');
        process.exit(0);
    }
    return value as T;
}

const border = (s: string) => fg(PALETTE.sky, s);
const connected = (me: Me) => `Conectado a ${bold(me.org.nombre)} ${dim(`· modo ${me.mode === 'test' ? 'prueba' : me.mode}`)}`;

/** Enter durante una espera la salta; Ctrl+C sale. Sin terminal, nunca resuelve. */
function enterToSkip(): { skipped: Promise<void>; stop: () => void } {
    const stdin = process.stdin;
    if (!stdin.isTTY) return { skipped: new Promise(() => {}), stop: () => {} };
    let onData: (b: Buffer) => void = () => {};
    const skipped = new Promise<void>((resolve) => {
        onData = (b: Buffer) => {
            const k = b.toString();
            if (k === '\u0003') { stdin.setRawMode(false); process.exit(130); }
            if (k === '\r' || k === '\n') resolve();
        };
    });
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on('data', onData);
    return { skipped, stop: () => { stdin.off('data', onData); stdin.setRawMode(false); stdin.pause(); } };
}

// ── Sesión ──────────────────────────────────────────────────────────────────

export async function currentSession(ctx: Ctx): Promise<{ key: string; me: Me } | null> {
    const key = storedKey(ctx);
    if (!key || !checkTestKey(key).ok) return null;
    try {
        const me = await whoami(ctx, key);
        return me.mode === 'test' ? { key, me } : null;
    } catch { return null; }
}

export async function flowLogin(ctx: Ctx, opts: { proyecto: boolean }): Promise<{ key: string; projectKey?: string; me: Me }> {
    const s = p.spinner();
    s.start('Generando tu código');
    const start = await startDeviceLogin(ctx, opts.proyecto);
    s.stop('Código listo');

    p.box(
        `${codeChips(start.userCode)}\n\n${slate('Revisa que sea el mismo que ves en Cord')}\n${slate('y pulsa Autorizar.')}`,
        ' Confirma en tu navegador ',
        { contentAlign: 'center', titleAlign: 'center', width: 'auto', rounded: true, formatBorder: border },
    );
    const opened = openBrowser(ctx, start.url);
    p.log.message(`${dim(opened ? 'Abrimos tu navegador. Si no se abrió:' : 'Abre esta dirección:')}\n${sky(start.url)}`);

    const w = p.spinner({ indicator: 'timer' });
    w.start('Esperando que autorices en el navegador');
    try {
        const r = await waitDeviceLogin(ctx, start);
        const me = await saveKey(ctx, r.apiKey);
        w.stop(connected(me));
        return { key: r.apiKey, projectKey: r.projectKey, me };
    } catch (e) {
        w.error((e as Error).message);
        throw e;
    }
}

export async function flowEnsureSession(ctx: Ctx, opts: { proyecto: boolean }) {
    const s = p.spinner();
    s.start('Revisando tu sesión');
    const current = await currentSession(ctx);
    if (current) {
        s.stop(connected(current.me));
        return { ...current, projectKey: undefined as string | undefined };
    }
    s.stop('Todavía no conectas esta terminal');
    return flowLogin(ctx, opts);
}

export async function flowPasteKey(ctx: Ctx): Promise<Me> {
    const key = bail(await p.password({
        message: 'Pega tu llave de prueba',
        validate: (v) => { const c = checkTestKey(String(v ?? '')); return c.ok ? undefined : c.error; },
    }));
    const s = p.spinner();
    s.start('Verificando con Cord');
    const me = await saveKey(ctx, key);
    s.stop(connected(me));
    return me;
}

// ── Configuración con IA ────────────────────────────────────────────────────

const PHASES = ['Leyendo tu sitio', 'Buscando tu logo y tus colores', 'Leyendo tu lista de precios', 'Armando la propuesta con IA', 'Validando cada dato con las reglas de tu país'];

function readSetupFile(path: string): { nombre: string; base64: string } {
    const full = resolve(path.replace(/^['"]|['"]$/g, ''));
    let bytes: Buffer;
    try { bytes = readFileSync(full); } catch { throw new CliError(`No pude leer ${full}.`); }
    if (bytes.length > MAX_SETUP_FILE) throw new CliError('El archivo pesa más de 3 MB.');
    return { nombre: basename(full), base64: bytes.toString('base64') };
}

export async function flowSetup(ctx: Ctx, preset: { sitio?: string; descripcion?: string; archivo?: string } = {}): Promise<SetupPlan | null> {
    let { sitio = '', descripcion = '', archivo = '' } = preset;
    if (!sitio && !descripcion && !archivo) {
        sitio = bail(await p.text({ message: '¿Cuál es tu sitio web?', placeholder: 'tuempresa.com  ·  Enter para omitir' })) ?? '';
        descripcion = bail(await p.text({ message: '¿A qué se dedica tu negocio?', placeholder: 'Ej. vendemos material de construcción a crédito 30 días y retenemos 4% en fletes' })) ?? '';
        const quiere = bail(await p.select({
            message: '¿Tienes tu lista de precios a la mano?',
            options: [
                { value: 'si', label: 'Sí, elegir el archivo', hint: 'Excel, CSV, PDF o foto · hasta 3 MB' },
                { value: 'no', label: 'No por ahora' },
            ],
        }));
        if (quiere === 'si') {
            archivo = bail(await p.path({
                message: 'Elige tu lista de precios',
                root: process.cwd(),
                validate: (v) => {
                    if (!v) return 'Escribe la ruta del archivo.';
                    try {
                        const st = statSync(resolve(v));
                        if (!st.isFile()) return 'Eso es una carpeta; elige un archivo.';
                        if (st.size > MAX_SETUP_FILE) return 'El archivo pesa más de 3 MB.';
                    } catch { return 'No encontré ese archivo.'; }
                    return undefined;
                },
            }));
        }
        if (!String(sitio).trim() && !String(descripcion).trim() && !archivo) {
            p.log.warn('Necesito al menos tu sitio, una descripción o tu lista de precios. Puedes hacerlo después con cord setup.');
            return null;
        }
    }

    const file = archivo ? readSetupFile(archivo) : undefined;
    const s = p.spinner();
    let phase = 0;
    s.start(PHASES[0]);
    const timer = setInterval(() => { phase = Math.min(phase + 1, PHASES.length - 1); s.message(PHASES[phase]); }, 2600);
    let plan: SetupPlan;
    try {
        plan = await proposeSetup(ctx, { sitio: String(sitio).trim(), descripcion: String(descripcion).trim(), archivo: file });
    } catch (e) {
        clearInterval(timer);
        s.error((e as Error).message);
        throw e;
    }
    clearInterval(timer);
    s.stop('Propuesta lista');

    const partes = describeCounts(plan.conteos ?? {});
    const lines = [
        ...(plan.resumen ? [plan.resumen, ''] : []),
        ...(partes.length ? partes.map((t) => `${mint('●')}  ${t}`) : [slate('No encontré nada que configurar con eso.')]),
        ...(plan.descartado?.length ? ['', dim(`${plan.descartado.length} dato(s) no pasaron la validación y se quedaron fuera.`)] : []),
    ];
    p.note(lines.join('\n'), 'Tu propuesta', { format: (l) => l });
    for (const a of plan.avisos ?? []) p.log.warn(a);
    if (!partes.length) return plan;

    const opened = openBrowser(ctx, plan.review_url);
    p.log.message(`${dim(opened ? 'Abrimos la revisión en tu navegador. Si no se abrió:' : 'Revísala y apruébala aquí:')}\n${sky(plan.review_url)}`);

    const w = p.spinner({ indicator: 'timer' });
    w.start(`Esperando tu aprobación  ${dim('· Enter para seguir sin esperar')}`);
    const skip = enterToSkip();
    let done = false;
    const watch = (async () => {
        const deadline = Date.now() + 30 * 60 * 1000;
        let wait = 3000;
        while (!done && Date.now() < deadline) {
            await sleep(wait);
            try { const cur = await getSetupPlan(ctx, plan.id); wait = 3000; if (['aplicado', 'descartado', 'fallido'].includes(cur.estado)) return cur; }
            catch { wait = Math.min(15000, wait * 2); }
        }
        return null;
    })();
    const result = await Promise.race([watch, skip.skipped.then(() => 'skip' as const)]);
    done = true;
    skip.stop();

    if (result === 'skip' || result === null) {
        w.stop(`La propuesta te espera en el link de arriba ${dim('(vence en 7 días)')}`);
        return plan;
    }
    const final = { ...plan, ...result, conteos: plan.conteos };
    if (result.estado === 'descartado') { w.stop('Descartaste la propuesta. No se cambió nada.'); return final; }
    if (result.estado === 'fallido') { w.error('No se pudo aplicar. Revisa el detalle en el navegador.'); return final; }
    w.stop(green('Configuración aplicada'));
    const rows = (result.resultado ?? []).map((r) => `${r.ok ? green('✔') : red('✖')}  ${r.seccion.padEnd(12)} ${dim(r.detalle)}`);
    if (rows.length) p.log.message(rows.join('\n'));
    return final;
}

// ── Integrar el proyecto ────────────────────────────────────────────────────

const FILE_DESC: Record<string, string> = {
    'webhooks/cord': 'verifica la firma de cada webhook',
    '[...path]': 'proxy seguro para Cord Elements',
};

const describeFile = (path: string) => Object.entries(FILE_DESC).find(([k]) => path.includes(k))?.[1] ?? '';

function packageManager(install: string | null): string {
    return install ? install.split(' ')[0] : '';
}

export interface IntegrateResult { plan: InitPlan; created: string[]; installed: boolean; keySaved: boolean }

export async function flowIntegrate(ctx: Ctx, opts: { projectKey?: string; askKey: boolean }): Promise<IntegrateResult | null> {
    const cwd = process.cwd();
    const s = p.spinner();
    s.start('Analizando tu proyecto');
    const plan = projectPlan(cwd);
    await sleep(400);
    s.stop(`Proyecto: ${bold(frameworkLabel(plan.framework))}`);

    if (plan.framework === 'unknown') {
        p.log.warn(`No reconocí el framework de esta carpeta. Corre el asistente dentro de tu proyecto (Next.js, Astro, Express, Laravel, Django, Flask o FastAPI) o sigue la guía:\n${sky('https://docs.cordhq.app/docs/desarrolladores/empezar/resumen')}`);
        return null;
    }

    const envContent = plan.envFile ? readText(join(cwd, plan.envFile)) ?? '' : '';
    const existingKey = readEnvValue(envContent, 'CORD_SECRET_KEY');
    const keyReady = !!existingKey && /^sk_test_/.test(existingKey);
    const fileRows = plan.files.map((f) => {
        const exists = !!readText(join(cwd, f.path));
        return exists ? `${dim('=')}  ${dim('ya existe')}   ${f.path}  ${dim('· no lo toco')}` : `${green('+')}  crear       ${bold(f.path)}  ${dim('· ' + describeFile(f.path))}`;
    });
    const steps = [
        ...(plan.install ? [`${green('+')}  instalar    ${bold(plan.install.split(' ').slice(2).join(' ') || plan.install)}  ${dim('· con ' + packageManager(plan.install))}`] : []),
        ...fileRows,
        ...(plan.envFile ? [`${amber('~')}  escribir    ${bold(plan.envFile)}  ${dim(keyReady ? '· CORD_SECRET_KEY ya está' : '· CORD_SECRET_KEY de prueba')}`] : []),
    ];
    p.note(steps.join('\n'), 'Esto es lo que voy a hacer', { format: (l) => l });
    if (!plan.envFile) p.log.warn('No encontré un archivo de entorno ignorado por git (.env.local o .env). No escribiré llaves en uno que se pueda subir al repositorio.');

    const go = bail(await p.confirm({ message: '¿Lo hago?', active: 'Sí', inactive: 'No', initialValue: true }));
    if (!go) { p.log.info('Sin cambios en tu proyecto.'); return null; }

    let installed = false;
    if (plan.install) {
        const tl = p.taskLog({ title: `Instalando el SDK con ${packageManager(plan.install)}`, limit: 6 });
        const code = await runCommand(plan.install, cwd, (l) => tl.message(l));
        if (code === 0) { tl.success('SDK instalado'); installed = true; }
        else tl.error(`No se pudo instalar. Córrelo tú: ${plan.install}`, { showLog: true });
    }

    const written = writePlanFiles(cwd, plan);
    const created = written.filter((f) => f.created).map((f) => f.path);
    if (created.length) p.log.success(`Archivos creados\n${created.map((f) => `${green('+')} ${f}`).join('\n')}`);

    let keySaved = keyReady;
    if (plan.envFile && !keyReady) {
        let key = opts.projectKey;
        if (!key && opts.askKey) {
            const how = bail(await p.select({
                message: 'Tu servidor necesita una Secret Key de prueba',
                options: [
                    { value: 'nueva', label: 'Crear una nueva', hint: 'se abre el navegador y la guardo yo' },
                    { value: 'pegar', label: 'Pegar una que ya tengo', hint: 'sk_test_…' },
                    { value: 'despues', label: 'Después' },
                ],
            }));
            if (how === 'nueva') key = (await flowLogin(ctx, { proyecto: true })).projectKey;
            if (how === 'pegar') {
                key = bail(await p.password({ message: 'Pega tu sk_test_', validate: (v) => (/^sk_test_[A-Za-z0-9]{16,}$/.test(String(v ?? '').trim()) ? undefined : 'Debe ser una Secret Key de prueba (sk_test_…).') })).trim();
            }
        }
        if (key) {
            upsertEnv(cwd, plan.envFile, { CORD_SECRET_KEY: key });
            p.log.success(`CORD_SECRET_KEY guardada en ${bold(plan.envFile)} ${dim('(ignorado por git)')}`);
            keySaved = true;
        } else {
            p.log.warn(`Falta CORD_SECRET_KEY en ${plan.envFile}. Créala en ${sky(`${ctx.baseUrl}/app?wb=api`)}`);
        }
    }

    if (plan.snippet) p.note(plan.snippet, 'Agrega esta ruta', { format: (l) => dim(l) });
    if (plan.framework === 'next-app' || plan.framework === 'astro') {
        p.note([
            `${slate('// en tu layout')}`,
            `<CordProvider ${sky('proxyUrl')}=${mint('"/api/cord"')}>`,
            `  <CordBuilder />`,
            `</CordProvider>`,
        ].join('\n'), 'Cord Elements, listo para usar', { format: (l) => l });
    }
    return { plan, created, installed, keySaved };
}

// ── Webhooks en localhost ───────────────────────────────────────────────────

export async function flowListen(ctx: Ctx, opts: { target: string; eventos: string[]; allowRemote?: boolean; envFile?: string | null }) {
    const target = checkForwardUrl(opts.target, opts.allowRemote === true);
    if (!target.ok) throw new CliError(target.error);
    const s = p.spinner();
    s.start('Abriendo una sesión de prueba');
    const session = await openListen(ctx, opts.eventos);
    s.stop('Sesión abierta');

    let secretRow = bold(session.secret);
    if (opts.envFile) {
        const r = upsertEnv(process.cwd(), opts.envFile, { CORD_WEBHOOK_SECRET: session.secret });
        secretRow = `${green('guardado')} en ${bold(opts.envFile)}${r.updated.length || r.added.length ? dim('  · reinicia tu servidor para que lo lea') : ''}`;
    }
    p.box(kv([
        ['Reenvío a', bold(target.url.href)],
        ['Eventos', opts.eventos.length ? opts.eventos.join(', ') : 'todos'],
        ['Secreto', secretRow],
        ['Vence', 'en 24 horas'],
    ]), ' Escuchando webhooks ', { formatBorder: border, width: 'auto', rounded: true });
    p.log.message(`${dim('En otra terminal:')}  ${bold('npx @flouviahq/cli trigger quote.approved')}\n${dim('Ctrl+C para cerrar la sesión.')}`);

    let stopping = false;
    const stop = async () => {
        if (stopping) return;
        stopping = true;
        try { await closeListen(ctx, session.id); } catch { /* vence sola */ }
        p.outro('Sesión cerrada.');
        process.exit(0);
    };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);

    const bar = slate('│');
    let wait = 1500;
    while (!stopping) {
        try {
            const batch = await pollListen(ctx, session.id);
            wait = 1500;
            for (const d of batch) {
                const r = await forwardDelivery(target.url, d);
                const time = new Date().toLocaleTimeString();
                console.log(`${bar}  ${dim(time)}  ${statusBadge(r.status)}  ${bold(d.evento.padEnd(26))} ${dim(d.event_id)}  ${dim(`${r.ms} ms`)}`);
            }
        } catch (e) {
            const msg = (e as Error).message;
            console.log(`${bar}  ${red('!')} ${msg}`);
            if (/no existe|venció/.test(msg)) process.exit(1);
            wait = Math.min(15000, wait * 2);
        }
        await sleep(wait);
    }
}

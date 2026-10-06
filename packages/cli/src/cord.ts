// cord — CLI de desarrollo de Cord. Solo trabaja con llaves de prueba.
import * as p from '@clack/prompts';
import { rmSync } from 'node:fs';
import { HELP, VERSION, configPath, maskKey, parseArgs, parseEventList } from './lib.js';
import { CliError, type Ctx, api, requireKey, saveKey, whoami } from './core.js';
import { flowEnsureSession, flowIntegrate, flowListen, flowLogin, flowPasteKey, flowSetup } from './flows.js';
import { wizard } from './wizard.js';
import { badge, banner, bold, dim, green, kv, red, sky, slate } from './ui.js';

const { command, flags } = parseArgs(process.argv.slice(2));
const ctx: Ctx = {
    baseUrl: String(flags['base-url'] || process.env.CORD_BASE_URL || 'https://cordhq.app').replace(/\/+$/, ''),
    flags,
};
const str = (v: string | true | undefined) => (typeof v === 'string' ? v : '');

async function login() {
    const flag = flags['api-key'];
    if (typeof flag === 'string') {
        const me = await saveKey(ctx, flag);
        console.log(`${green('✔')} ${bold(me.org.nombre)} ${dim(`(modo prueba, ${maskKey(flag)})`)}`);
        return;
    }
    p.intro(badge('cord login'));
    if (flag === true) await flowPasteKey(ctx);
    else await flowLogin(ctx, { proyecto: false });
    p.outro(`Llave guardada en ${dim(configPath())} ${dim('· permisos 0600')}`);
}

async function whoamiCmd() {
    const key = requireKey(ctx);
    const me = await whoami(ctx, key);
    p.box(kv([
        ['Empresa', bold(me.org.nombre)],
        ['Modo', me.mode === 'test' ? 'prueba' : me.mode],
        ['Permiso', me.scope],
        ['Llave', maskKey(key)],
    ]), ' Cord ', { width: 'auto', rounded: true });
}

async function setupCmd() {
    p.intro(badge('cord setup'));
    await flowEnsureSession(ctx, { proyecto: false });
    await flowSetup(ctx, { sitio: str(flags.sitio), descripcion: str(flags.descripcion), archivo: str(flags.archivo) });
    p.outro(`Siguiente: ${bold('npx @flouviahq/cli init')} para conectar tu código`);
}

async function initCmd() {
    p.intro(badge('cord init'));
    await flowIntegrate(ctx, { askKey: Boolean(process.stdin.isTTY) });
    p.outro(`Prueba de punta a punta: ${bold('npx @flouviahq/cli listen --forward-to http://localhost:3000/api/webhooks/cord')}`);
}

async function listenCmd() {
    const to = str(flags['forward-to']);
    if (!to) throw new CliError('Falta --forward-to, por ejemplo --forward-to http://localhost:3000/api/webhooks/cord');
    p.intro(badge('cord listen'));
    requireKey(ctx);
    await flowListen(ctx, { target: to, eventos: parseEventList(flags.events), allowRemote: flags['allow-remote'] === true, envFile: str(flags['env-file']) || null });
}

async function trigger() {
    const evento = command[1];
    if (!evento) throw new CliError('Uso: cord trigger <evento> [--objeto <id>]');
    const s = p.spinner();
    s.start(`Disparando ${evento}`);
    try {
        const r = await api<{ datos: string }>(ctx, 'POST', '/test_helpers/webhooks', { evento, objeto_id: str(flags.objeto) || undefined });
        s.stop(`${bold(evento)} enviado ${dim(r.datos === 'real' ? '· con los datos reales del objeto' : '· con datos de ejemplo')}`);
    } catch (e) { s.error((e as Error).message); process.exit(1); }
}

async function simulate() {
    const [, kind, a, b] = command;
    const s = p.spinner();
    if (kind === 'fiscal' && a) {
        s.start('Preparando el simulador fiscal');
        await api(ctx, 'POST', '/test_helpers/fiscal', { siguiente_resultado: a });
        s.stop(`La próxima emisión fiscal de prueba resultará en ${bold(a)}`);
        return;
    }
    if (kind === 'quote' && a && (b === 'vista' || b === 'vencer')) {
        s.start('Simulando');
        await api(ctx, 'POST', `/test_helpers/cotizaciones/${encodeURIComponent(a)}`, { accion: b });
        s.stop(`Cotización ${a}: ${bold(b === 'vista' ? 'abierta por el cliente' : 'vencida')}`);
        return;
    }
    throw new CliError('Uso: cord simulate fiscal <resultado> | cord simulate quote <id> <vista|vencer>');
}

async function eventsTail() {
    const type = str(flags.type);
    const seen = new Set<string>();
    let first = true;
    p.intro(badge('cord events tail'));
    p.log.message(dim(`Mostrando eventos nuevos${type ? ` de ${type}` : ''}. Ctrl+C para salir.`));
    const bar = slate('│');
    for (;;) {
        try {
            const qs = new URLSearchParams({ limit: '50', ...(type ? { type } : {}) });
            const events = await api<Array<{ id: string; type: string; object_id?: string; created_at: string }>>(ctx, 'GET', `/events?${qs}`);
            for (const e of [...events].reverse()) {
                if (seen.has(e.id)) continue;
                seen.add(e.id);
                if (!first) console.log(`${bar}  ${dim(new Date(e.created_at).toLocaleTimeString())}  ${sky('●')}  ${bold(e.type.padEnd(28))} ${dim(e.object_id ?? '')}`);
            }
            first = false;
        } catch (err) {
            console.log(`${bar}  ${red('!')} ${(err as Error).message}`);
        }
        await new Promise((r) => setTimeout(r, 2000));
    }
}

async function main() {
    if (flags.version) return console.log(VERSION);
    const [cmd, sub] = command;
    if (!cmd) return process.stdout.isTTY && process.stdin.isTTY && !flags.help ? wizard(ctx) : console.log(HELP);
    if (flags.help || cmd === 'help') { console.log(banner(VERSION)); return console.log(HELP); }
    if (cmd === 'wizard') return wizard(ctx);
    if (cmd === 'login') return login();
    if (cmd === 'logout') { rmSync(configPath(), { force: true }); return console.log(`${green('✔')} Llave borrada.`); }
    if (cmd === 'whoami') return whoamiCmd();
    if (cmd === 'setup') return setupCmd();
    if (cmd === 'init') return initCmd();
    if (cmd === 'listen') return listenCmd();
    if (cmd === 'trigger') return trigger();
    if (cmd === 'simulate') return simulate();
    if (cmd === 'events' && sub === 'tail') return eventsTail();
    throw new CliError(`Comando desconocido: ${command.join(' ')}. Corre \`cord help\`.`);
}

main().catch((err) => {
    const msg = err instanceof CliError ? err.message : `${(err as Error).message}`;
    process.stderr.write(`${red('✖')} ${msg}\n`);
    process.exit(1);
});

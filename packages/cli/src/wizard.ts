// `npx @flouviahq/cli`: el asistente completo. Conecta la terminal, configura la
// cuenta con IA, integra el proyecto y deja los webhooks escuchando.
import * as p from '@clack/prompts';
import { join } from 'node:path';
import { CliError, type Ctx, projectPlan, readText } from './core.js';
import { bail, flowEnsureSession, flowIntegrate, flowListen, flowSetup, type IntegrateResult } from './flows.js';
import { VERSION, defaultPort, frameworkLabel, readEnvValue } from './lib.js';
import { badge, banner, bold, dim, green, kv, PALETTE, fg, sky, slate } from './ui.js';

type Paso = 'setup' | 'integrar' | 'webhooks';

function resumenConteos(c: Record<string, number>): string {
    const total = Object.values(c).reduce((a, b) => a + (Number(b) || 0), 0);
    const productos = Number(c.productos) || 0;
    return productos ? `${productos} productos y ${total - productos} ajustes` : `${total} ajustes`;
}

const titulo = (n: number, total: number, texto: string) => p.log.step(`${dim(`${n}/${total}`)}  ${bold(texto)}`);

export async function wizard(ctx: Ctx) {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
        throw new CliError('El asistente necesita una terminal interactiva. Para scripts usa los comandos: cord help');
    }
    console.log(banner(VERSION));
    p.intro(badge('Asistente de Cord'));
    p.log.message(slate('Tu cuenta, tu proyecto y tus webhooks listos en unos minutos.\nTodo en modo prueba, y nada se aplica sin que lo apruebes.'));

    const cwd = process.cwd();
    const plan = projectPlan(cwd);
    const conocido = plan.framework !== 'unknown';
    const envKey = plan.envFile ? readEnvValue(readText(join(cwd, plan.envFile)) ?? '', 'CORD_SECRET_KEY') : null;
    const necesitaLlaveProyecto = conocido && !!plan.envFile && !(envKey && envKey.startsWith('sk_test_'));

    p.log.step(bold('Tu cuenta'));
    const sesion = await flowEnsureSession(ctx, { proyecto: necesitaLlaveProyecto });

    const pasos = bail(await p.multiselect<Paso>({
        message: '¿Qué hacemos hoy?  ' + dim('(espacio para marcar, Enter para seguir)'),
        options: [
            { value: 'setup', label: 'Configurar mi cuenta con IA', hint: 'perfil, impuestos y catálogo desde tu sitio' },
            { value: 'integrar', label: 'Integrar Cord en este proyecto', hint: conocido ? `${frameworkLabel(plan.framework)} detectado` : 'no reconocí el framework de esta carpeta', disabled: !conocido },
            { value: 'webhooks', label: 'Probar webhooks en mi localhost', hint: 'reenvío con firma real' },
        ],
        initialValues: conocido ? ['setup', 'integrar', 'webhooks'] : ['setup'],
        required: true,
    }));

    const total = pasos.length;
    let n = 0;
    const resumen: string[] = [`${green('✔')}  Terminal conectada a ${bold(sesion.me.org.nombre)} ${dim('· modo prueba')}`];

    if (pasos.includes('setup')) {
        titulo(++n, total, 'Configurar tu cuenta con IA');
        try {
            const r = await flowSetup(ctx);
            if (r?.estado === 'aplicado') resumen.push(`${green('✔')}  Cuenta configurada ${dim('· ' + resumenConteos(r.conteos ?? {}))}`);
            else if (r) resumen.push(`${fg(PALETTE.amber, '○')}  Propuesta pendiente de aprobar ${dim('· ' + r.review_url)}`);
        } catch (e) {
            p.log.error((e as Error).message);
        }
    }

    let integ: IntegrateResult | null = null;
    if (pasos.includes('integrar')) {
        titulo(++n, total, 'Integrar Cord en tu proyecto');
        integ = await flowIntegrate(ctx, { projectKey: sesion.projectKey, askKey: true });
        if (integ) {
            resumen.push(`${green('✔')}  ${frameworkLabel(integ.plan.framework)} integrado ${dim(`· ${integ.created.length} archivo(s)${integ.installed ? ', SDK instalado' : ''}`)}`);
            if (!integ.keySaved) resumen.push(`${fg(PALETTE.amber, '○')}  Falta CORD_SECRET_KEY ${dim('· ' + `${ctx.baseUrl}/app?wb=api`)}`);
        }
    }

    let escuchar: { target: string; envFile: string | null } | null = null;
    if (pasos.includes('webhooks')) {
        titulo(++n, total, 'Webhooks en tu localhost');
        const ruta = plan.webhookPath ?? '/api/webhooks/cord';
        const puerto = bail(await p.text({
            message: '¿En qué puerto corre tu servidor?',
            placeholder: String(defaultPort(plan.framework)),
            defaultValue: String(defaultPort(plan.framework)),
            validate: (v) => (!v || /^\d{2,5}$/.test(v) ? undefined : 'Escribe solo el número del puerto.'),
        }));
        escuchar = { target: `http://localhost:${puerto}${ruta}`, envFile: plan.envFile };
        resumen.push(`${green('✔')}  Webhooks hacia ${bold(escuchar.target)}`);
    }

    const siguiente = [
        ...(integ ? [`${dim('$')} ${bold(integ.plan.framework === 'astro' ? 'npm run dev' : integ.plan.framework.startsWith('next') ? 'npm run dev' : 'arranca tu servidor')}`] : []),
        `${dim('$')} ${bold('npx @flouviahq/cli trigger quote.approved')}   ${dim('dispara un evento de prueba')}`,
        '',
        kv([['Panel', sky(`${ctx.baseUrl}/app`)], ['Guía', sky('https://docs.cordhq.app/docs/desarrolladores/herramientas/cli')]]),
    ];
    p.box(`${resumen.join('\n')}\n\n${slate('Siguiente')}\n${siguiente.join('\n')}`, ' Todo listo ', {
        formatBorder: (s) => fg(PALETTE.mint, s), width: 'auto', titleAlign: 'left', rounded: true,
    });

    if (escuchar) {
        await flowListen(ctx, { target: escuchar.target, eventos: [], envFile: escuchar.envFile });
    } else {
        p.outro(`Listo. ${dim('Vuelve cuando quieras con')} ${bold('npx @flouviahq/cli')}`);
    }
}

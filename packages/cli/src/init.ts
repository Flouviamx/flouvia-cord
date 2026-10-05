// `cord init`: detecta el framework y propone los archivos mínimos. Funciones
// puras (sin tocar disco) para poder probarlas; cord.ts aplica el plan.

export type Framework = 'next-app' | 'next-pages' | 'astro' | 'express' | 'laravel' | 'django' | 'flask' | 'fastapi' | 'unknown';

export interface ProjectFiles {
    packageJson?: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    composerJson?: { require?: Record<string, string> };
    pythonDeps?: string;
    hasAppDir: boolean;
    hasSrcDir: boolean;
    gitignore?: string;
    lockfiles: string[];
}

export function detectFramework(p: ProjectFiles): Framework {
    const deps = { ...p.packageJson?.dependencies, ...p.packageJson?.devDependencies };
    if (deps.next) return p.hasAppDir ? 'next-app' : 'next-pages';
    if (deps.astro) return 'astro';
    if (deps.express) return 'express';
    if (p.composerJson?.require?.['laravel/framework']) return 'laravel';
    const py = (p.pythonDeps ?? '').toLowerCase();
    if (/\bdjango\b/.test(py)) return 'django';
    if (/\bfastapi\b/.test(py)) return 'fastapi';
    if (/\bflask\b/.test(py)) return 'flask';
    return 'unknown';
}

export function installCommand(f: Framework, lockfiles: string[]): string | null {
    if (f === 'laravel') return 'composer require flouviahq/cord';
    if (f === 'django' || f === 'flask' || f === 'fastapi') return 'pip install cord-sdk';
    if (f === 'unknown') return null;
    if (lockfiles.includes('pnpm-lock.yaml')) return 'pnpm add @flouviahq/node @flouviahq/elements';
    if (lockfiles.includes('yarn.lock')) return 'yarn add @flouviahq/node @flouviahq/elements';
    if (lockfiles.includes('bun.lockb') || lockfiles.includes('bun.lock')) return 'bun add @flouviahq/node @flouviahq/elements';
    return 'npm install @flouviahq/node @flouviahq/elements';
}

/** ¿El archivo de entorno está ignorado por git? Solo así se escribe la llave ahí. */
export function envIsIgnored(gitignore: string | undefined, file: string): boolean {
    if (!gitignore) return false;
    return gitignore.split('\n').map((l) => l.trim()).some((l) => l === file || l === `/${file}` || l === '.env*' || l === '.env*.local' || l === '*.local' || (l === '.env.*' && file !== '.env'));
}

const NODE_WEBHOOK = `import { constructEvent, CordWebhookSignatureError } from '@flouviahq/node';

export async function POST(request: Request) {
  let event;
  try {
    event = await constructEvent(await request.text(), request.headers, process.env.CORD_WEBHOOK_SECRET!);
  } catch (err) {
    if (err instanceof CordWebhookSignatureError) return new Response('firma inválida', { status: 400 });
    throw err;
  }
  switch (event.event) {
    case 'quote.approved':
      // event.data: la cotización aprobada
      break;
    case 'invoice.paid':
      // event.data.saldo, event.data.moneda…
      break;
  }
  return new Response('ok');
}
`;

const NODE_PROXY = `import { createElementsProxy } from '@flouviahq/node';

const proxy = createElementsProxy({ secretKey: process.env.CORD_SECRET_KEY! });
export const GET = proxy;
export const POST = proxy;
`;

export interface PlannedFile { path: string; content: string }

export interface InitPlan {
    framework: Framework;
    install: string | null;
    files: PlannedFile[];
    envFile: string | null;
    snippet: string | null;
    webhookPath: string | null;
}

export function planInit(p: ProjectFiles): InitPlan {
    const framework = detectFramework(p);
    const install = installCommand(framework, p.lockfiles);
    const files: PlannedFile[] = [];
    let snippet: string | null = null;
    let webhookPath: string | null = null;
    let envFile: string | null = '.env.local';

    switch (framework) {
        case 'next-app': {
            const base = p.hasSrcDir ? 'src/app' : 'app';
            files.push({ path: `${base}/api/webhooks/cord/route.ts`, content: NODE_WEBHOOK });
            files.push({ path: `${base}/api/cord/[...path]/route.ts`, content: NODE_PROXY });
            webhookPath = '/api/webhooks/cord';
            break;
        }
        case 'astro': {
            files.push({ path: 'src/pages/api/webhooks/cord.ts', content: `export const prerender = false;\n\n${NODE_WEBHOOK.replace('process.env.CORD_WEBHOOK_SECRET!', 'import.meta.env.CORD_WEBHOOK_SECRET')}` });
            webhookPath = '/api/webhooks/cord';
            break;
        }
        case 'next-pages':
        case 'express':
            snippet = `// El cuerpo debe llegar CRUDO: usa express.raw({ type: 'application/json' }) en esta ruta.\nimport { constructEvent } from '@flouviahq/node';\n\napp.post('/api/webhooks/cord', express.raw({ type: 'application/json' }), async (req, res) => {\n  try {\n    const event = await constructEvent(req.body, req.headers, process.env.CORD_WEBHOOK_SECRET);\n    res.sendStatus(200);\n  } catch {\n    res.sendStatus(400);\n  }\n});`;
            envFile = '.env';
            webhookPath = '/api/webhooks/cord';
            break;
        case 'laravel':
            snippet = `// routes/web.php (excluye esta ruta de VerifyCsrfToken)\nuse Flouvia\\Cord\\Webhook;\n\nRoute::post('/webhooks/cord', function (Illuminate\\Http\\Request $request) {\n    $event = Webhook::constructEvent($request->getContent(), $request->headers->all(), env('CORD_WEBHOOK_SECRET'));\n    return response('ok');\n});`;
            envFile = '.env';
            webhookPath = '/webhooks/cord';
            break;
        case 'django':
        case 'flask':
        case 'fastapi':
            snippet = `from cord import construct_event\n\n# Usa el cuerpo crudo de la petición (request.body / await request.body()).\nevent = construct_event(raw_body, headers, os.environ["CORD_WEBHOOK_SECRET"])`;
            envFile = '.env';
            webhookPath = '/webhooks/cord';
            break;
        default:
            envFile = null;
    }
    if (envFile && !envIsIgnored(p.gitignore, envFile)) envFile = null;
    return { framework, install, files, envFile, snippet, webhookPath };
}

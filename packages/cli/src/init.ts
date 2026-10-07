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
    // Los SDK de PHP y Python aún no están publicados: la ruta verifica la firma sin dependencias.
    if (f === 'laravel' || f === 'django' || f === 'flask' || f === 'fastapi' || f === 'unknown') return null;
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

const PYTHON_WEBHOOK = `# Verifica la firma X-Cord-Signature-V1 sin dependencias. Usa el cuerpo CRUDO.
import hashlib, hmac, os, time

def verify_cord(raw_body: bytes, header: str, tolerance: int = 300) -> bool:
    parts = [p.split("=", 1) for p in header.split(",") if "=" in p]
    t = next((v for k, v in parts if k == "t"), None)
    sigs = [v for k, v in parts if k == "v1"]
    if not t or not sigs or abs(time.time() - int(t)) > tolerance:
        return False
    secret = os.environ["CORD_WEBHOOK_SECRET"].encode()
    expected = hmac.new(secret, f"{t}.".encode() + raw_body, hashlib.sha256).hexdigest()
    return any(hmac.compare_digest(expected, s) for s in sigs)

# En tu vista: if not verify_cord(request.body, request.headers["X-Cord-Signature-V1"]): responde 400`;

const PHP_WEBHOOK = `// routes/web.php (excluye esta ruta de VerifyCsrfToken). Verifica la firma sin dependencias.
Route::post('/webhooks/cord', function (Illuminate\\Http\\Request $request) {
    $body = $request->getContent();
    $t = null; $sigs = [];
    foreach (explode(',', (string) $request->header('X-Cord-Signature-V1')) as $part) {
        [$k, $v] = array_pad(explode('=', $part, 2), 2, '');
        if ($k === 't') $t = $v; elseif ($k === 'v1') $sigs[] = $v;
    }
    if (!$t || !$sigs || abs(time() - (int) $t) > 300) abort(400);
    $expected = hash_hmac('sha256', $t . '.' . $body, env('CORD_WEBHOOK_SECRET'));
    foreach ($sigs as $s) {
        if (hash_equals($expected, $s)) { $event = json_decode($body, true); return response('ok'); }
    }
    abort(400);
});`;

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
            snippet = PHP_WEBHOOK;
            envFile = '.env';
            webhookPath = '/webhooks/cord';
            break;
        case 'django':
        case 'flask':
        case 'fastapi':
            snippet = PYTHON_WEBHOOK;
            envFile = '.env';
            webhookPath = '/webhooks/cord';
            break;
        default:
            envFile = null;
    }
    if (envFile && !envIsIgnored(p.gitignore, envFile)) envFile = null;
    return { framework, install, files, envFile, snippet, webhookPath };
}

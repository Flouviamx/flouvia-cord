// Piezas puras del CLI (sin efectos), para poder probarlas.
import { homedir } from 'node:os';
import { join } from 'node:path';

export const VERSION = '1.1.0';

export interface ParsedArgs {
    command: string[];
    flags: Record<string, string | true>;
}

export function parseArgs(argv: string[]): ParsedArgs {
    const command: string[] = [];
    const flags: Record<string, string | true> = {};
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a.startsWith('--')) {
            const eq = a.indexOf('=');
            if (eq > 0) flags[a.slice(2, eq)] = a.slice(eq + 1);
            else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) flags[a.slice(2)] = argv[++i];
            else flags[a.slice(2)] = true;
        } else if (a === '-h') flags.help = true;
        else if (a === '-v') flags.version = true;
        else command.push(a);
    }
    return { command, flags };
}

export function configPath(env: NodeJS.ProcessEnv = process.env): string {
    const base = env.XDG_CONFIG_HOME || join(homedir(), '.config');
    return join(base, 'cord', 'config.json');
}

export function maskKey(key: string): string {
    if (key.length < 12) return '••••';
    return `${key.slice(0, 8)}…${key.slice(-4)}`;
}

export type KeyCheck = { ok: true } | { ok: false; error: string };

/** El CLI es una herramienta de desarrollo: solo acepta llaves de prueba. */
export function checkTestKey(key: string): KeyCheck {
    const k = key.trim();
    if (/^(sk|rk)_live_/.test(k)) return { ok: false, error: 'Esa es una llave en vivo. El CLI solo usa llaves de prueba (sk_test_), así nada de lo que hagas toca datos reales.' };
    if (k.startsWith('pk_')) return { ok: false, error: 'Esa es una llave publicable. El CLI necesita una Secret Key de prueba (sk_test_).' };
    if (!/^(sk|rk)_test_[A-Za-z0-9]{16,}$/.test(k)) return { ok: false, error: 'La llave no tiene la forma sk_test_… (o rk_test_… si es restringida).' };
    return { ok: true };
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export type ForwardCheck = { ok: true; url: URL } | { ok: false; error: string };

/** Reenvía solo a tu máquina, salvo que lo pidas explícitamente. */
export function checkForwardUrl(value: string, allowRemote = false): ForwardCheck {
    let url: URL;
    try { url = new URL(value); } catch { return { ok: false, error: `--forward-to no es una URL válida: ${value}` }; }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return { ok: false, error: '--forward-to debe ser http:// o https://' };
    if (url.username || url.password) return { ok: false, error: '--forward-to no puede llevar usuario ni contraseña.' };
    if (!allowRemote && !LOCAL_HOSTS.has(url.hostname) && !url.hostname.endsWith('.localhost')) {
        return { ok: false, error: `--forward-to apunta a ${url.hostname}. Por seguridad solo se reenvía a localhost; usa --allow-remote si de verdad lo necesitas.` };
    }
    return { ok: true, url };
}

export function parseEventList(value: string | true | undefined): string[] {
    if (!value || value === true) return [];
    return value.split(',').map((s) => s.trim()).filter(Boolean);
}

/** Solo se abre en el navegador una URL del mismo origen que la API: el servidor no decide a dónde te manda. */
export function sameOrigin(url: string, baseUrl: string): boolean {
    try {
        const u = new URL(url);
        const b = new URL(baseUrl);
        return u.origin === b.origin && (u.protocol === 'https:' || u.hostname === 'localhost' || u.hostname === '127.0.0.1');
    } catch { return false; }
}

export interface SetupCounts { perfil: number; marca: number; impuestos: number; productos: number; plantillas: number; cotizaciones: number }

const COUNT_LABELS: Array<[keyof SetupCounts, string, string]> = [
    ['perfil', 'dato del perfil', 'datos del perfil'],
    ['marca', 'ajuste de marca', 'ajustes de marca'],
    ['impuestos', 'impuesto', 'impuestos'],
    ['productos', 'producto', 'productos'],
    ['plantillas', 'plantilla', 'plantillas'],
    ['cotizaciones', 'preferencia de cotización', 'preferencias de cotización'],
];

export function describeCounts(c: Partial<SetupCounts>): string[] {
    return COUNT_LABELS.filter(([k]) => (c[k] ?? 0) > 0).map(([k, one, many]) => `${c[k]} ${c[k] === 1 ? one : many}`);
}

export const MAX_SETUP_FILE = 3 * 1024 * 1024;

export const HELP = `cord ${VERSION} — CLI de desarrollo de Cord

Uso:
  cord init                               Detecta tu framework y deja la integración lista
  cord login                              Inicia sesión desde el navegador (o --api-key para pegar una llave)
  cord setup                              Propone la configuración de tu cuenta con IA; tú la apruebas
        [--sitio <url>]                   Tu sitio web: nombre, marca y contacto
        [--descripcion <texto>]           A qué se dedica el negocio
        [--archivo <ruta>]                Lista de precios (.csv, .xlsx, .pdf o foto, hasta 3 MB)
  cord logout                             Borra la llave guardada
  cord whoami                             Muestra la organización de la llave
  cord listen --forward-to <url>          Reenvía los webhooks de prueba a tu servidor local
        [--events quote.paid,invoice.paid] Solo esos eventos
        [--allow-remote]                  Permite reenviar a un host que no es localhost
  cord trigger <evento> [--objeto <id>]   Dispara un webhook de prueba
  cord simulate fiscal <resultado>        exito | pac_caido | receptor_invalido | certificado_vencido | timbre_duplicado
  cord simulate quote <id> <vista|vencer> El cliente abre el link o la cotización vence
  cord events tail [--type <evento>]      Muestra los eventos conforme ocurren

Opciones globales:
  --api-key <sk_test_…>                   O la variable CORD_API_KEY
  --base-url <url>                        O CORD_BASE_URL (default https://cordhq.app)
`;

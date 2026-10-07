// Navegación de la app — fuente ÚNICA de la sidebar.
//
// De aquí salen el menú (Sidebar.astro), los atajos `G` + letra y sus filas en
// el panel de atajos (AppLayout.astro), el icono que hereda cada fijado y la
// validación de lo que el endpoint de preferencias acepta guardar. Antes las
// rutas de los atajos vivían en un mapa aparte dentro de AppLayout y la sidebar
// no los mostraba: dos listas que tarde o temprano dicen cosas distintas.
//
// Sin imports de valor a propósito (solo tipos): lo consumen el servidor y el
// endpoint de preferencias.

import type { IconName } from './icons';
import type { AppStringKey } from '../i18n/app';

export type SidebarBadge = 'seguimiento' | 'vencidas';

export interface SidebarNavItem {
    /** id de página que cada ruta pasa a AppLayout (`page="..."`). */
    id: string;
    href: string;
    label: AppStringKey;
    icon: IconName;
    /** Segunda tecla del atajo `G` + letra (minúscula). */
    key?: string;
    badge?: SidebarBadge;
    /** Sub-páginas: se despliegan con sangría cuando la sección está activa. */
    children?: SidebarNavItem[];
}

export interface SidebarNavGroup {
    id: string;
    /** `null` = lista plana de accesos diarios, sin encabezado ni acordeón. */
    label: AppStringKey | null;
    items: SidebarNavItem[];
}

export const SIDEBAR_NAV: SidebarNavGroup[] = [
    {
        id: 'principal',
        label: null,
        items: [
            { id: 'dashboard', href: '/app', label: 'sidebar.item.inicio', icon: 'overview', key: 'd' },
            { id: 'cotizaciones', href: '/app/cotizaciones', label: 'sidebar.item.cotizaciones', icon: 'quote', key: 'c', badge: 'seguimiento' },
            { id: 'clientes', href: '/app/clientes', label: 'sidebar.item.clientes', icon: 'clients', key: 'l' },
            { id: 'productos', href: '/app/productos', label: 'sidebar.item.productos', icon: 'products', key: 'p' },
        ],
    },
    {
        id: 'ingresos',
        label: 'sidebar.grupo.ingresos',
        items: [
            { id: 'facturas', href: '/app/facturas', label: 'sidebar.item.facturas', icon: 'invoice', key: 'f' },
            { id: 'cobros', href: '/app/cobros', label: 'sidebar.item.cobros', icon: 'coin', key: 'o' },
            {
                id: 'cobranza', href: '/app/cobranza', label: 'sidebar.item.cobranza', icon: 'tray', key: 'b', badge: 'vencidas',
                children: [
                    { id: 'ai-ar', href: '/app/cobranza/agente', label: 'sidebar.item.agente_ia', icon: 'cpu' },
                ],
            },
        ],
    },
    {
        id: 'analisis',
        label: 'sidebar.grupo.analisis',
        items: [
            { id: 'informes', href: '/app/informes', label: 'sidebar.item.analitica', icon: 'chart', key: 'a' },
            { id: 'desempeno', href: '/app/desempeno', label: 'sidebar.item.desempeno', icon: 'pulse', key: 'e' },
        ],
    },
    {
        id: 'automatizacion',
        label: 'sidebar.grupo.automatizacion',
        items: [
            { id: 'workflows', href: '/app/workflows', label: 'sidebar.item.workflows', icon: 'workflow', key: 'w' },
        ],
    },
];

/** Todos los ítems, hijos incluidos, en orden de aparición. */
export function sidebarItems(): SidebarNavItem[] {
    return SIDEBAR_NAV.flatMap((g) => g.items.flatMap((it) => [it, ...(it.children ?? [])]));
}

/** Grupos que se pueden plegar (los que tienen encabezado). */
export const SIDEBAR_COLLAPSIBLE_GROUPS: readonly string[] = SIDEBAR_NAV.filter((g) => g.label).map((g) => g.id);

/** Ítems con atajo `G` + letra, en orden de aparición. */
export function sidebarShortcuts(): SidebarNavItem[] {
    return sidebarItems().filter((it) => !!it.key);
}

/**
 * Icono de la sección a la que pertenece una ruta de /app: la coincidencia de
 * prefijo más larga. Un fijado de `/app/clientes/123` lleva el icono de Clientes,
 * no un pin genérico. `/app` solo coincide consigo mismo (si no, todo sería Inicio).
 */
export function sidebarIconFor(href: string): IconName {
    const path = href.split(/[?#]/)[0].replace(/\/+$/, '') || '/app';
    let best: SidebarNavItem | null = null;
    for (const it of sidebarItems()) {
        const hit = it.href === '/app' ? path === '/app' : path === it.href || path.startsWith(it.href + '/');
        if (hit && (!best || it.href.length > best.href.length)) best = it;
    }
    return best?.icon ?? 'pin';
}

// ── Preferencias por miembro: org_members.widget_prefs[SIDEBAR_PREFS_KEY] ──

export const SIDEBAR_PREFS_KEY = 'cord.sidebar.v1';
export const SIDEBAR_MAX_PINS = 12;
const PIN_LABEL_MAX = 80;
// Solo rutas internas de /app: sin esquema, sin `//`, sin comillas ni espacios.
// (\x60 es el acento grave: escrito literal descuadra el emparejado de plantillas
// que hace scripts/i18n-check.mjs sobre todo el código.)
const PIN_HREF_RE = /^\/app(?:[/?#][^\s"'<>\\\x60]*)?$/;

export interface SidebarPin { href: string; label: string }
export interface SidebarPrefs { pins: SidebarPin[]; collapsed: string[] }

/**
 * Normaliza lo que llega del navegador (y lo que se lee de la base): descarta
 * lo inválido en vez de fallar, para que una entrada rota no tumbe el menú.
 * `pins: undefined` (nunca guardado) se distingue de `[]` (vaciado a propósito)
 * porque de eso depende migrar los fijados que vivían en localStorage.
 */
export function sanitizeSidebarPrefs(input: unknown): { pins: SidebarPin[] | undefined; collapsed: string[] } {
    const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
    let pins: SidebarPin[] | undefined;
    if (Array.isArray(raw.pins)) {
        const seen = new Set<string>();
        pins = [];
        for (const p of raw.pins) {
            if (!p || typeof p !== 'object') continue;
            const href = String((p as any).href ?? '');
            const label = String((p as any).label ?? '').replace(/\s+/g, ' ').trim().slice(0, PIN_LABEL_MAX);
            if (href.length > 300 || !PIN_HREF_RE.test(href) || href.includes('//') || !label || seen.has(href)) continue;
            seen.add(href);
            pins.push({ href, label });
            if (pins.length >= SIDEBAR_MAX_PINS) break;
        }
    }
    const collapsed = Array.isArray(raw.collapsed)
        ? [...new Set(raw.collapsed.filter((g): g is string => typeof g === 'string' && SIDEBAR_COLLAPSIBLE_GROUPS.includes(g)))]
        : [];
    return { pins, collapsed };
}

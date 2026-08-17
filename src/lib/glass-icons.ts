// Registro único de iconos Glass Duotone (Regla 9: stroke currentColor 1.5,
// relleno currentColor 0.12–0.15). Consumido por WidgetEmpty.astro (SSR) y
// empty-state.ts (DOM inyectado en runtime) — un solo lugar por icono evita
// que los dos caminos diverjan visualmente.

export type GlassIcon =
    | 'chart' | 'list' | 'money' | 'clients' | 'products' | 'funnel'
    | 'calendar' | 'check' | 'alert' | 'inbox';

export const GLASS_ICON_PATHS: Record<GlassIcon, string> = {
    chart: '<path d="M4 20h16"/><rect x="5" y="12" width="3" height="8" rx="1" fill="currentColor" fill-opacity="0.12"/><rect x="10.5" y="7" width="3" height="13" rx="1" fill="currentColor" fill-opacity="0.15"/><rect x="16" y="10" width="3" height="10" rx="1" fill="currentColor" fill-opacity="0.12"/>',
    list: '<rect x="3" y="5" width="18" height="14" rx="3" fill="currentColor" fill-opacity="0.12"/><path d="M3 10h18"/><path d="M7 15h4" opacity=".55"/>',
    money: '<rect x="2.5" y="6" width="19" height="12" rx="3" fill="currentColor" fill-opacity="0.12"/><circle cx="12" cy="12" r="2.8"/><path d="M6 9v.01M18 15v.01" opacity=".55"/>',
    clients: '<circle cx="9" cy="8" r="3" fill="currentColor" fill-opacity="0.15"/><path d="M3 20v-2a5 5 0 0110 0v2"/><path d="M15 5a3 3 0 010 6M17 15a5 5 0 014 4" opacity=".55"/>',
    products: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" fill="currentColor" fill-opacity="0.12"/><path d="M4 7.5l8 4.5 8-4.5M12 12v9"/><path d="M8 5l8 4.5" opacity=".55"/>',
    funnel: '<path d="M4 5h16l-6 8v6l-4-2v-4z" fill="currentColor" fill-opacity="0.13"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="3" fill="currentColor" fill-opacity="0.12"/><path d="M3 10h18M8 2v4M16 2v4"/>',
    check: '<circle cx="12" cy="12" r="9" fill="currentColor" fill-opacity="0.13"/><path d="M8 12.5l2.6 2.6L16 9.5"/>',
    alert: '<path d="M12 3l9 16H3z" fill="currentColor" fill-opacity="0.12"/><path d="M12 10v4" /><path d="M12 17v.01" stroke-width="2.2"/>',
    inbox: '<path d="M3 12h5l1.6 3h4.8l1.6-3h5" /><rect x="3" y="12" width="18" height="8" rx="2" fill="currentColor" fill-opacity="0.12"/><path d="M6 7l1-3h10l1 3" opacity=".55"/>',
};

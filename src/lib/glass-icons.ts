// Estados vacíos (WidgetEmpty.astro en SSR, empty-state.ts en DOM inyectado): mismos iconos que el resto de la app.
import { iconInner, type IconName } from './icons';

export type GlassIcon =
    | 'chart' | 'list' | 'money' | 'clients' | 'products' | 'funnel'
    | 'calendar' | 'check' | 'alert' | 'inbox';

const MAP: Record<GlassIcon, IconName> = {
    chart: 'chart', list: 'template', money: 'wallet', clients: 'clients', products: 'products',
    funnel: 'filter', calendar: 'calendar', check: 'check-circle', alert: 'alert', inbox: 'tray',
};

export const GLASS_ICON_PATHS = Object.fromEntries(
    (Object.keys(MAP) as GlassIcon[]).map((k) => [k, iconInner(MAP[k])]),
) as Record<GlassIcon, string>;

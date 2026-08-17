// Allowlist de storageKey válidas para los 5 grids de widgets — NO es un
// registro de los ~90 widgets individuales (esos ya viven en el markup:
// data-widget/data-title/data-span/data-size-*, y duplicarlos aquí solo
// generaría drift). Único consumidor real: src/pages/api/app/widget-prefs.ts,
// que necesita validar la clave de grid antes de escribir en
// org_members.widget_prefs.
import { REPORT_IDS } from './informes';

export const STATIC_GRID_KEYS = [
    'cord.dash.v1',
    'cord.cobros.v1',
    'cord.cobranza.v1',
    'cord.cobranza-ia.v1',
] as const;

export const REPORT_GRID_KEYS = REPORT_IDS.map((id) => `cord.report.${id}.v1`);

export const ALL_GRID_KEYS: readonly string[] = [...STATIC_GRID_KEYS, ...REPORT_GRID_KEYS];

export function isGridKey(key: unknown): key is string {
    return typeof key === 'string' && ALL_GRID_KEYS.includes(key);
}

// Modelo de permisos por sección (custom por miembro). Constantes PURAS —
// sin tocar la DB; lo consumen tanto el server (queries/APIs) como las páginas.
// El owner siempre tiene todo (override en memberCan), aunque su matriz esté vacía.

export const PERMISOS = [
    { key: 'cotizar',   label: 'Cotizaciones', desc: 'Crear, editar, enviar y duplicar cotizaciones' },
    { key: 'aprobar',   label: 'Aprobaciones', desc: 'Aprobar/rechazar descuentos, montos y cambios de estado' },
    { key: 'cobranza',  label: 'Cobranza',     desc: 'Ver y gestionar cuentas por cobrar' },
    { key: 'clientes',  label: 'Clientes',     desc: 'Crear y editar clientes' },
    { key: 'productos', label: 'Productos',    desc: 'Crear y editar el catálogo' },
    { key: 'analitica', label: 'Analítica',    desc: 'Ver métricas, forecast y reportes' },
    { key: 'ajustes',   label: 'Ajustes',      desc: 'Cambiar marca, fiscal, PDF y reglas del negocio' },
    { key: 'equipo',    label: 'Equipo',       desc: 'Invitar miembros y gestionar permisos' },
] as const;

export type PermKey = typeof PERMISOS[number]['key'];
export const ALL_PERM_KEYS: PermKey[] = PERMISOS.map((p) => p.key);

export type PermMap = Partial<Record<PermKey, boolean>>;

function fromKeys(keys: PermKey[]): PermMap {
    const m: PermMap = {};
    for (const k of ALL_PERM_KEYS) m[k] = keys.includes(k);
    return m;
}
export const allPerms = (v: boolean): PermMap => fromKeys(v ? ALL_PERM_KEYS : []);

// Presets = punto de partida; el owner puede afinar por sección después.
export const PRESETS: Record<string, { label: string; desc: string; permisos: PermMap }> = {
    admin:    { label: 'Administrador', desc: 'Casi todo el control, incluido el equipo.', permisos: allPerms(true) },
    vendedor: { label: 'Vendedor',      desc: 'Cotiza y gestiona clientes/productos; no toca ajustes ni aprueba.', permisos: fromKeys(['cotizar', 'clientes', 'productos', 'analitica']) },
    lectura:  { label: 'Solo lectura',  desc: 'Puede ver la app pero no modifica nada.', permisos: allPerms(false) },
};
export const PRESET_KEYS = Object.keys(PRESETS);

export interface Membership { rol: string; permisos: PermMap; esOwner: boolean; }

/** ¿Este miembro puede ejecutar acciones de `key`? Owner siempre sí. */
export function memberCan(m: Membership | null | undefined, key: PermKey): boolean {
    if (!m) return false;
    if (m.esOwner || m.rol === 'owner') return true;
    return !!m.permisos?.[key];
}

export const ROL_LABEL: Record<string, string> = {
    owner: 'Dueño', admin: 'Administrador', vendedor: 'Vendedor', lectura: 'Solo lectura', miembro: 'Personalizado',
};

// Planes que incluyen multi-usuario. Matriz jun 2026: Pro (5), Scale (15),
// Developer (ilimitados). Free/Starter = 1 usuario. Se aceptan los códigos
// legacy 'business'/'negocio' por compatibilidad.
export const TEAM_PLANS = ['pro', 'scale', 'developer', 'business', 'negocio'];
export const planTieneEquipo = (plan: string) => TEAM_PLANS.includes(plan);

// Planes con acceso a la API pública + webhooks. Matriz jun 2026: todos los de
// pago (Starter en adelante) la incluyen con cuota mensual; Developer es el
// tier de infraestructura.
export const API_PLANS = ['starter', 'pro', 'scale', 'developer', 'business', 'negocio'];
export const planTieneApi = (plan: string) => API_PLANS.includes(plan);

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

// Presupuestos (jul 2026) — modelo FREEMIUM, no bloqueo total: todos los planes
// pueden probar la magia con un límite de cédulas; Profesional en adelante
// desbloquea cédulas ilimitadas + las features "pro" (Presupuesto vs. Real,
// wizard de plan completo, herramientas de análisis VPN/EOQ/variaciones —
// mismo umbral que "CFO Dashboard" en /precios).
export const PRESUPUESTOS_PLANS = ['pro', 'scale', 'developer', 'business', 'negocio'];
export const planTienePresupuestos = (plan: string) => PRESUPUESTOS_PLANS.includes(plan);
// Máximo de cédulas por plan (Infinity = sin tope).
export const cedulasLimit = (plan: string): number =>
    planTienePresupuestos(plan) ? Infinity : plan === 'starter' ? 3 : 1;

// ── Límites por plan: API pública + webhooks (jun 2026) ──
// Decisión de André: la API y los webhooks YA NO se bloquean por plan. TODOS los
// planes (incluido free) los tienen, pero LIMITADOS por cantidad — free = prueba
// real (muy poquito), de pago = progresivamente más. El CONSUMO de la API además
// se mide por uso (Stripe Billing) de Pro en adelante.
export const PLAN_LABELS: Record<string, string> = {
    free: 'Gratis', starter: 'Starter', pro: 'Profesional', scale: 'Scale',
    developer: 'Developer', business: 'Negocio', negocio: 'Negocio',
};
export const planLabel = (plan: string): string => PLAN_LABELS[plan] ?? 'Gratis';

// Máximo de endpoints de webhook por plan.
export const WEBHOOK_LIMITS: Record<string, number> = {
    free: 1, starter: 3, pro: 10, scale: 25, developer: 100, business: 10, negocio: 10,
};
export const webhookLimit = (plan: string): number => WEBHOOK_LIMITS[plan] ?? WEBHOOK_LIMITS.free;

// Máximo de API keys ACTIVAS (no revocadas) por plan. Las de prueba y en vivo
// cuentan igual; el consumo se mide aparte.
export const APIKEY_LIMITS: Record<string, number> = {
    free: 2, starter: 5, pro: 20, scale: 50, developer: 200, business: 20, negocio: 20,
};
export const apiKeyLimit = (plan: string): number => APIKEY_LIMITS[plan] ?? APIKEY_LIMITS.free;

// Configuración en 2 niveles (estilo Stripe): CATEGORÍAS → pestañas (sub-páginas).
// El índice /app/ajustes lista las categorías; cada categoría abre su primera
// pestaña y muestra una barra de pestañas horizontal (NO un rail lateral).

export interface SettingsTab { id: string; label: string; href: string; }
export interface SettingsCategory { id: string; label: string; desc: string; icon: string; tabs: SettingsTab[]; }

export const SETTINGS_CATEGORIES: SettingsCategory[] = [
    {
        id: 'empresa', label: 'Empresa',
        desc: 'Marca, datos fiscales y tu plan de Trato.',
        icon: '<rect x="3" y="3" width="7" height="18" rx="1.5"/><path d="M10 9h7a2 2 0 0 1 2 2v10H10"/><line x1="14" y1="13" x2="15" y2="13"/><line x1="14" y1="17" x2="15" y2="17"/><line x1="6" y1="7" x2="7" y2="7"/><line x1="6" y1="11" x2="7" y2="11"/>',
        tabs: [
            { id: 'marca',  label: 'Marca y contacto', href: '/app/ajustes/marca' },
            { id: 'fiscal', label: 'Datos fiscales',   href: '/app/ajustes/fiscal' },
            { id: 'plan',   label: 'Plan y facturación', href: '/app/ajustes/plan' },
        ],
    },
    {
        id: 'cotizaciones', label: 'Cotizaciones',
        desc: 'Folio, impuestos, documento PDF y reglas de aprobación.',
        icon: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/>',
        tabs: [
            { id: 'cotizaciones', label: 'Folio e impuestos', href: '/app/ajustes/cotizaciones' },
            { id: 'pdf',          label: 'Documento PDF',      href: '/app/ajustes/pdf' },
            { id: 'aprobaciones', label: 'Aprobaciones',       href: '/app/ajustes/aprobaciones' },
        ],
    },
    {
        id: 'equipo', label: 'Equipo y roles',
        desc: 'Invita a tu equipo y define permisos por sección.',
        icon: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
        tabs: [
            { id: 'equipo', label: 'Miembros', href: '/app/ajustes/equipo' },
        ],
    },
    {
        id: 'avanzado', label: 'Avanzado',
        desc: 'Integraciones con ecommerce y registro de auditoría.',
        icon: '<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>',
        tabs: [
            { id: 'integraciones', label: 'Integraciones', href: '/app/ajustes/integraciones' },
            { id: 'auditoria',     label: 'Auditoría',     href: '/app/ajustes/auditoria' },
        ],
    },
    {
        id: 'cuenta', label: 'Tu cuenta',
        desc: 'Tu perfil, sesiones activas, seguridad y autenticación.',
        icon: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>',
        tabs: [
            { id: 'cuenta', label: 'Perfil y seguridad', href: '/app/ajustes/cuenta' },
        ],
    },
];

/** Categoría que contiene la pestaña `tabId`. */
export function categoryOfTab(tabId: string): SettingsCategory | undefined {
    return SETTINGS_CATEGORIES.find((c) => c.tabs.some((t) => t.id === tabId));
}

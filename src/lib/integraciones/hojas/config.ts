// Credenciales y permisos de las dos hojas. Un proveedor sin credenciales no se
// ofrece (regla 15): una tarjeta "Conectar" sin app detrás manda a la persona a
// una pantalla de error del proveedor.

const env = (k: string): string | undefined =>
    (import.meta.env as Record<string, string | undefined>)[k] || process.env[k];

export type ProveedorHoja = 'google_sheets' | 'excel';

/**
 * Google: SOLO `drive.file`. Es el permiso estrecho —la app ve únicamente los
 * archivos que ella creó o que la persona eligió— y por eso Cord queda fuera de
 * la auditoría de seguridad anual que Google exige a los permisos restringidos.
 * Pedir `spreadsheets` a secas habría dado acceso a TODA la hoja de cálculo de
 * la cuenta y metido al producto en esa revisión.
 */
export const GOOGLE_SCOPES = 'openid email https://www.googleapis.com/auth/drive.file';

/**
 * Excel usa la MISMA app de Entra que Teams ("Cord"): los permisos se piden por
 * autorización, no por aplicación, así que una cuenta que solo conecta Excel
 * nunca ve los permisos de Teams.
 */
export const EXCEL_SCOPES = 'offline_access User.Read Files.ReadWrite';

export const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
export const GOOGLE_API = 'https://www.googleapis.com';
export const MS_LOGIN = 'https://login.microsoftonline.com/organizations/oauth2/v2.0';
export const MS_GRAPH = 'https://graph.microsoft.com/v1.0';

export interface CredencialesHoja {
    clientId: string;
    clientSecret: string;
}

export function credencialesHoja(proveedor: ProveedorHoja): CredencialesHoja | null {
    const id = proveedor === 'google_sheets' ? env('GOOGLE_SHEETS_CLIENT_ID') : env('TEAMS_CLIENT_ID');
    const secret = proveedor === 'google_sheets' ? env('GOOGLE_SHEETS_CLIENT_SECRET') : env('TEAMS_CLIENT_SECRET');
    return id && secret ? { clientId: id, clientSecret: secret } : null;
}

export const GOOGLE_SHEETS_LISTO = Boolean(credencialesHoja('google_sheets'));
export const EXCEL_LISTO = Boolean(credencialesHoja('excel'));

export function esProveedorHoja(v: unknown): v is ProveedorHoja {
    return v === 'google_sheets' || v === 'excel';
}

/** Nombre del archivo que Cord crea. Lleva el año porque una hoja de ventas se corta por ejercicio. */
export function nombreLibro(negocio: string, anio: number): string {
    const limpio = String(negocio || 'Cord').replace(/[\\/:*?"<>|]/g, ' ').trim().slice(0, 60) || 'Cord';
    return `${limpio} — Cord ${anio}`;
}

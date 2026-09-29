// Credenciales, permisos y extremos de las dos contabilidades. Sin credenciales
// el proveedor no se ofrece (regla 15).

const env = (k: string): string | undefined =>
    (import.meta.env as Record<string, string | undefined>)[k] || process.env[k];

export type ProveedorConta = 'quickbooks' | 'xero';

/**
 * QuickBooks tiene UN permiso para toda la contabilidad: no se puede pedir solo
 * facturas. Xero sí los separa, y por eso Cord pide contactos, facturas y la
 * lectura de sus tasas de impuesto — nada de nóminas ni de escribir en su
 * configuración.
 */
export const QBO_SCOPES = 'com.intuit.quickbooks.accounting';
/**
 * Permisos GRANULARES de Xero. Las apps creadas desde el 2 de marzo de 2026 solo
 * los aceptan: `accounting.transactions` —el permiso amplio de antes— quedó
 * reemplazado por `accounting.invoices`, `.payments`, `.banktransactions` y
 * `.manualjournals`, y pedirlo en una app nueva devuelve `invalid_scope` antes
 * de mostrar siquiera la pantalla de autorización. Las apps anteriores pueden
 * seguir con el amplio hasta septiembre de 2027.
 *
 * Cord pide el mínimo que necesita: crear la factura y su contacto, leer las
 * tasas de impuesto y las cuentas de banco, y registrar los pagos de esas
 * facturas. Nada de movimientos bancarios ni asientos manuales.
 */
export const XERO_SCOPES = 'offline_access openid profile email accounting.invoices accounting.contacts accounting.settings.read accounting.payments';

export const QBO_AUTH = 'https://appcenter.intuit.com/connect/oauth2';
export const QBO_TOKEN = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
/** El sandbox de Intuit vive en otro host; la app de producción usa el normal. */
export const QBO_API = () => env('QUICKBOOKS_SANDBOX') === 'true'
    ? 'https://sandbox-quickbooks.api.intuit.com'
    : 'https://quickbooks.api.intuit.com';
export const QBO_MINOR = '75';

export const XERO_AUTH = 'https://login.xero.com/identity/connect/authorize';
export const XERO_TOKEN = 'https://identity.xero.com/connect/token';
export const XERO_CONNECTIONS = 'https://api.xero.com/connections';
export const XERO_API = 'https://api.xero.com/api.xro/2.0';

export interface CredencialesConta {
    clientId: string;
    clientSecret: string;
}

export function credencialesConta(proveedor: ProveedorConta): CredencialesConta | null {
    const id = proveedor === 'quickbooks' ? env('QUICKBOOKS_CLIENT_ID') : env('XERO_CLIENT_ID');
    const secret = proveedor === 'quickbooks' ? env('QUICKBOOKS_CLIENT_SECRET') : env('XERO_CLIENT_SECRET');
    return id && secret ? { clientId: id, clientSecret: secret } : null;
}

export const QUICKBOOKS_LISTO = Boolean(credencialesConta('quickbooks'));
export const XERO_LISTO = Boolean(credencialesConta('xero'));

export function esProveedorConta(v: unknown): v is ProveedorConta {
    return v === 'quickbooks' || v === 'xero';
}

export const REDIRECT_CONTA = '/api/integraciones/contabilidad/callback';

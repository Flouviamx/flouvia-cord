// Apple Pay y Google Pay en las superficies de cobro de Cord Payments.
//
// Puro y sin imports a propósito: lo leen el middleware (cabeceras), las tres
// páginas que montan el formulario de pago (/q/[token]/pay, /i/[token] y
// /portal/[token]), el webhook de cuentas conectadas y el script
// `npm run stripe:payment-domains`, que lo carga con Node plano.
//
// Cómo funcionan (verificado contra las fuentes primarias el 2026-10-10):
//
//   - Las billeteras NO son un método del PaymentIntent: viajan sobre `card`.
//     El Payment Element las muestra cuando el intento admite `card`, el
//     dispositivo tiene una tarjeta en su billetera y la opción `wallets` está
//     en `auto` (su valor por omisión).
//     https://docs.stripe.com/js/elements_object/create_payment_element
//   - Cord cobra con CARGOS DIRECTOS (`Stripe-Account: acct_…` en
//     /api/q/[token]/payment-intent, /api/i/[token]/payment-intent y el cobro
//     agrupado del portal). Con cargos directos el dominio donde se muestra el
//     formulario se registra EN CADA CUENTA CONECTADA, por API y con el header
//     `Stripe-Account`; el registro en el Dashboard de la plataforma no cuenta.
//     https://docs.stripe.com/payments/payment-methods/pmd-registration
//     https://docs.stripe.com/apple-pay?platform=web
//   - El proveedor hace la validación de comercio de Apple; la documentación
//     vigente ya no pide alojar el archivo
//     `/.well-known/apple-developer-merchantid-domain-association`. Si un
//     dominio queda `inactive`, su `status_details.error_message` lo dice y el
//     endpoint `/validate` lo revisa otra vez.
//     https://docs.stripe.com/api/payment_method_domains/validate
//   - "No registres tu dominio más de una vez por cuenta": por eso primero se
//     busca por `domain_name` y solo se crea si no existe, con una clave de
//     idempotencia determinística por cuenta y dominio.
//   - Los iframes de Stripe.js piden `allow="payment *"`. Una cabecera
//     `Permissions-Policy: payment=(self)` en la página impide delegarles el
//     permiso, así que Google Pay (y Apple Pay por Payment Request) no se
//     dibujaba aunque el dominio estuviera registrado: es el mismo error que la
//     regla 34 documenta con la cámara.
//     https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Permissions_Policy

/** Opción `wallets` del Payment Element en las superficies de cobro del cliente. */
export const WALLETS_PAYMENT_ELEMENT = { applePay: 'auto', googlePay: 'auto' } as const;

/** Orígenes de los marcos de Stripe.js (guía de CSP de docs.stripe.com/security/guide). */
export const ORIGENES_MARCOS_STRIPE = ['https://js.stripe.com', 'https://*.js.stripe.com'] as const;

/**
 * Las páginas que montan el formulario de pago de Cord Payments: la página de
 * pago de la cotización, la factura hospedada y el portal del cliente. El link
 * de la cotización (/q/[token]) y los embeds no lo montan: abren /pay o /i en
 * una ventana propia de Cord.
 */
export function esSuperficieDeCobro(path: string): boolean {
    return /^\/q\/[^/]+\/pay\/?$/.test(path)
        || /^\/i\/[^/]+\/?$/.test(path)
        || /^\/portal\/[^/]+\/?$/.test(path);
}

/** Directiva `payment` de Permissions-Policy para la ruta. */
export function politicaDePago(path: string): string {
    if (!esSuperficieDeCobro(path)) return 'payment=(self)';
    return `payment=(self ${ORIGENES_MARCOS_STRIPE.map((o) => `"${o}"`).join(' ')})`;
}

const HOSTNAME = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$/;

/**
 * Un dominio registrable: hostname público en minúsculas, sin esquema, puerto
 * ni ruta. `localhost` e IPs no sirven: las billeteras exigen HTTPS con un
 * certificado de dominio.
 */
export function normalizarDominioDeCobro(entrada: unknown): string | null {
    if (typeof entrada !== 'string') return null;
    const host = entrada.trim().toLowerCase().replace(/\.$/, '');
    if (!HOSTNAME.test(host)) return null;
    if (/^\d+(\.\d+){3}$/.test(host)) return null;
    return host;
}

/** Lista única y válida de dominios: el canónico de Cord, el propio del negocio y los extra. */
export function dominiosDeCobro(entrada: { canonico: string; propio?: string | null; extra?: readonly string[] }): string[] {
    const out: string[] = [];
    for (const d of [entrada.canonico, entrada.propio, ...(entrada.extra ?? [])]) {
        const host = normalizarDominioDeCobro(d);
        if (host && !out.includes(host)) out.push(host);
    }
    return out;
}

/** Llamada al proveedor sobre una cuenta conectada. La inyecta quien llama. */
export type LlamadaStripe = (ruta: string, opciones: {
    metodo?: 'GET' | 'POST';
    params?: Record<string, string>;
    cuenta: string;
    idempotencia?: string;
}) => Promise<any>;

export type EstadoBilletera = 'active' | 'inactive' | null;

export interface EstadoDominioDeCobro {
    dominio: string;
    id: string | null;
    accion: 'creado' | 'existente' | 'validado' | 'crearia' | 'deshabilitado' | 'error';
    habilitado: boolean | null;
    applePay: EstadoBilletera;
    googlePay: EstadoBilletera;
    /**
     * Motivo operativo del proveedor (inactivo o error). Va al log y al script,
     * NUNCA a la interfaz del negocio (regla 14).
     */
    motivo: string | null;
}

const estado = (v: any): EstadoBilletera => (v?.status === 'active' || v?.status === 'inactive' ? v.status : null);

function leerDominio(dominio: string, pmd: any, accion: EstadoDominioDeCobro['accion']): EstadoDominioDeCobro {
    const motivo = [pmd?.apple_pay?.status_details?.error_message, pmd?.google_pay?.status_details?.error_message]
        .filter((m) => typeof m === 'string' && m).join(' · ') || null;
    return {
        dominio, id: typeof pmd?.id === 'string' ? pmd.id : null, accion,
        habilitado: typeof pmd?.enabled === 'boolean' ? pmd.enabled : null,
        applePay: estado(pmd?.apple_pay), googlePay: estado(pmd?.google_pay), motivo,
    };
}

/** Clave de idempotencia del alta: una por cuenta y dominio, siempre la misma. */
export const claveDeRegistro = (cuenta: string, dominio: string) => `cord-pmd:${cuenta}:${dominio}`;

/**
 * Deja cada dominio registrado en la cuenta conectada, sin duplicarlo.
 *
 * - No existe → se crea (o, sin `aplicar`, se reporta `crearia`).
 * - Existe y está deshabilitado → se reporta y NO se reactiva: alguien lo
 *   apagó a propósito por API, y deshacerlo en silencio no es decisión de Cord.
 * - Existe con una billetera `inactive` y `validar` → se pide la revisión.
 *
 * Un fallo en un dominio no detiene los demás: se reporta como `error`.
 */
export async function asegurarDominiosDeCobro(entrada: {
    cuenta: string;
    dominios: readonly string[];
    llamar: LlamadaStripe;
    aplicar?: boolean;
    validar?: boolean;
}): Promise<EstadoDominioDeCobro[]> {
    const { cuenta, llamar, aplicar = true, validar = false } = entrada;
    if (!/^acct_[A-Za-z0-9]+$/.test(cuenta)) throw new Error('Cuenta conectada inválida.');
    const resultados: EstadoDominioDeCobro[] = [];
    for (const crudo of entrada.dominios) {
        const dominio = normalizarDominioDeCobro(crudo);
        if (!dominio) {
            resultados.push({ dominio: String(crudo), id: null, accion: 'error', habilitado: null, applePay: null, googlePay: null, motivo: 'dominio inválido' });
            continue;
        }
        try {
            const lista = await llamar('/v1/payment_method_domains', { params: { domain_name: dominio, limit: '10' }, cuenta });
            const existente = (Array.isArray(lista?.data) ? lista.data : []).find((d: any) => d?.domain_name === dominio);
            if (!existente) {
                if (!aplicar) {
                    resultados.push({ dominio, id: null, accion: 'crearia', habilitado: null, applePay: null, googlePay: null, motivo: null });
                    continue;
                }
                const creado = await llamar('/v1/payment_method_domains', {
                    metodo: 'POST', params: { domain_name: dominio }, cuenta, idempotencia: claveDeRegistro(cuenta, dominio),
                });
                resultados.push(leerDominio(dominio, creado, 'creado'));
                continue;
            }
            if (existente.enabled === false) {
                resultados.push(leerDominio(dominio, existente, 'deshabilitado'));
                continue;
            }
            const inactivo = estado(existente.apple_pay) === 'inactive' || estado(existente.google_pay) === 'inactive';
            if (inactivo && validar && aplicar) {
                const revisado = await llamar(`/v1/payment_method_domains/${encodeURIComponent(existente.id)}/validate`, { metodo: 'POST', cuenta });
                resultados.push(leerDominio(dominio, revisado, 'validado'));
                continue;
            }
            resultados.push(leerDominio(dominio, existente, 'existente'));
        } catch (error: any) {
            const codigo = error?.code || error?.stripeStatus || error?.status || '';
            resultados.push({
                dominio, id: null, accion: 'error', habilitado: null, applePay: null, googlePay: null,
                motivo: String(codigo || error?.message || 'error del proveedor').slice(0, 200),
            });
        }
    }
    return resultados;
}

/** ¿Hay algo que revisar? Un error, un dominio apagado o una billetera inactiva. */
export function requiereAtencion(r: EstadoDominioDeCobro): boolean {
    return r.accion === 'error' || r.accion === 'deshabilitado' || r.applePay === 'inactive' || r.googlePay === 'inactive';
}

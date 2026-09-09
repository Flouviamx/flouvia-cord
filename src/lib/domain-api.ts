import { getActiveOrgId } from './db';
import { currentLocale } from './context';
import { requirePerm } from './queries';
import { requireFreshAuth } from './step-up';
import { strictRateLimit, strictLimitResponse } from './ratelimit';
import { DomainError } from './customer-domains';
import { log } from './log';

export function domainJson(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: {
        'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store',
    } });
}
export async function domainApiAccess(write = false): Promise<string | Response> {
    const denied = await requirePerm('ajustes');
    if (denied) return denied;
    const orgId = await getActiveOrgId();
    if (write) {
        const fresh = await requireFreshAuth();
        if (fresh) return fresh;
        const limit = await strictRateLimit('domains:write:' + orgId, 6, 60);
        const limited = strictLimitResponse(limit);
        if (limited) return limited;
    }
    return orgId;
}
export function domainApiError(error: unknown): Response {
    const en = currentLocale() === 'en';
    const messages: Record<string, [string, string]> = {
        invalid_hostname: ['Escribe un subdominio propio, como cotizaciones.tuempresa.com, sin https:// ni rutas.', 'Enter your own subdomain, such as quotes.yourcompany.com, without https:// or paths.'],
        domain_already_registered: ['Ya hay una conexión registrada para este negocio o dominio. Desconéctala primero o contacta a soporte.', 'A connection is already registered for this business or domain. Disconnect it first or contact support.'],
        domain_busy: ['Hay una operación en curso. Espera unos minutos y actualiza el estado.', 'An operation is in progress. Wait a few minutes and refresh the status.'],
        subscription_required: ['El dominio propio requiere Profesional o superior y no está disponible en modo de prueba.', 'Custom domains require Professional or higher and are unavailable in test mode.'],
        domains_unavailable: ['La conexión de dominios todavía no está disponible. Contacta a soporte.', 'Domain connections are not available yet. Contact support.'],
        domain_requires_support: ['Este dominio requiere revisión. Contacta a soporte antes de cambiar su configuración.', 'This domain needs a review. Contact support before changing its configuration.'],
        provider_scope_changed: ['La conexión requiere revisión de soporte.', 'This connection needs a support review.'],
    };
    const code = error instanceof DomainError ? error.code : 'provider_unavailable';
    const message = messages[code]?.[en ? 1 : 0] || (en ? 'We could not complete the connection. Refresh the status and try again later.' : 'No pudimos completar la conexión. Actualiza el estado e inténtalo más tarde.');
    // Do not log provider response payloads, tokens or document URLs.
    log.warn('Customer domain operation failed', { route: 'domains', code });
    return domainJson({ error: message, code }, error instanceof DomainError ? error.status : 503);
}

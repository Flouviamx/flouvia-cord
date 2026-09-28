// Xero.
//
// Tres diferencias con QuickBooks que no son de estilo:
//
//  - **Xero sí tiene borradores.** La factura se crea en `DRAFT` y la aprueba
//    el contador. Es el comportamiento correcto cuando un sistema externo
//    escribe en los libros de alguien más.
//  - **El refresh token es de UN SOLO USO.** Cada renovación devuelve uno
//    nuevo; guardar el viejo deja la conexión muerta en la siguiente hora.
//  - **La empresa no viene en el callback.** Después del token hay que
//    preguntar por las conexiones para saber a qué organización de Xero se
//    autorizó, y ese tenantId viaja en un encabezado en cada llamada.

import { apiJson, ProveedorError } from '../proveedor-http';
import { credencialesConta, XERO_API, XERO_CONNECTIONS, XERO_SCOPES, XERO_TOKEN } from './config';
import type { ContaCliente, FacturaConta, TokensConta } from './tipos';

function basico(): string {
    const c = credencialesConta('xero');
    if (!c) throw new ProveedorError('auth', 'sin credenciales');
    return Buffer.from(`${c.clientId}:${c.clientSecret}`).toString('base64');
}

export function xeroAuthorizeUrl(redirectUri: string, state: string): string | null {
    const c = credencialesConta('xero');
    if (!c) return null;
    const url = new URL('https://login.xero.com/identity/connect/authorize');
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', c.clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('scope', XERO_SCOPES);
    url.searchParams.set('state', state);
    return url.toString();
}

async function tokenRequest(params: Record<string, string>): Promise<TokensConta> {
    const data = await apiJson(XERO_TOKEN, {
        method: 'POST',
        headers: {
            Authorization: `Basic ${basico()}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams(params).toString(),
    });
    if (!data?.access_token) throw new ProveedorError('auth');
    return {
        accessToken: String(data.access_token),
        refreshToken: data.refresh_token ? String(data.refresh_token) : null,
        expiresIn: Number(data.expires_in) || 1800,
    };
}

export const xeroExchange = (code: string, redirectUri: string) =>
    tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri });

export const xeroRefresh = (refreshToken: string) =>
    tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken });

/** A qué organización de Xero se autorizó. Sin esto no se puede llamar a nada. */
export async function xeroTenant(token: string): Promise<{ id: string; nombre: string } | null> {
    const lista = await apiJson(XERO_CONNECTIONS, { token });
    const primera = Array.isArray(lista) ? lista[0] : null;
    if (!primera?.tenantId) return null;
    return { id: String(primera.tenantId), nombre: String(primera.tenantName ?? '') };
}

const cabeceras = (tenantId: string) => ({ 'Xero-tenant-id': tenantId });

export async function xeroAsegurarContacto(token: string, tenantId: string, cliente: ContaCliente): Promise<string> {
    const busqueda = cliente.email
        ? await apiJson(
            `${XERO_API}/Contacts?where=${encodeURIComponent(`EmailAddress=="${cliente.email.replace(/"/g, '')}"`)}`,
            { token, headers: cabeceras(tenantId) },
        ).catch(() => null)
        : null;
    const encontrado = busqueda?.Contacts?.[0]?.ContactID;
    if (encontrado) return String(encontrado);

    const creado = await apiJson(`${XERO_API}/Contacts`, {
        token,
        method: 'POST',
        headers: cabeceras(tenantId),
        body: JSON.stringify({
            Contacts: [{
                Name: cliente.nombre.slice(0, 255),
                ...(cliente.email ? { EmailAddress: cliente.email } : {}),
                ...(cliente.telefono ? { Phones: [{ PhoneType: 'DEFAULT', PhoneNumber: cliente.telefono }] } : {}),
            }],
        }),
    });
    const id = creado?.Contacts?.[0]?.ContactID;
    if (!id) throw new ProveedorError('proveedor', 'no se creó el contacto');
    return String(id);
}

export async function xeroCrearFactura(
    token: string, tenantId: string, contactoId: string, factura: FacturaConta,
): Promise<{ id: string; numero: string | null }> {
    const creada = await apiJson(`${XERO_API}/Invoices`, {
        token,
        method: 'POST',
        headers: cabeceras(tenantId),
        body: JSON.stringify({
            Invoices: [{
                Type: 'ACCREC',
                Contact: { ContactID: contactoId },
                Date: factura.fecha,
                ...(factura.vence ? { DueDate: factura.vence } : {}),
                CurrencyCode: factura.moneda,
                Reference: `Cord ${factura.folio}`,
                // Borrador a propósito: la aprueba el contador. Un sistema
                // externo no asienta en los libros de alguien más por su cuenta.
                Status: 'DRAFT',
                // Los importes de Cord ya traen su impuesto calculado por línea;
                // declararlos como exclusivos evita que Xero vuelva a aplicar el
                // impuesto por defecto de la cuenta encima.
                LineAmountTypes: 'Exclusive',
                LineItems: factura.lineas.map((l) => ({
                    Description: l.descripcion.slice(0, 4000),
                    Quantity: l.cantidad,
                    UnitAmount: l.precio,
                    LineAmount: l.importe,
                })),
            }],
        }),
    });
    const inv = creada?.Invoices?.[0];
    if (!inv?.InvoiceID) throw new ProveedorError('proveedor', 'no se creó la factura');
    return { id: String(inv.InvoiceID), numero: inv.InvoiceNumber ? String(inv.InvoiceNumber) : null };
}

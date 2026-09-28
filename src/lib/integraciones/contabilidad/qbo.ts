// QuickBooks Online.
//
// Dos cosas que marcan el diseño:
//
//  - **QuickBooks no tiene facturas en borrador.** Lo que se crea por la API
//    queda asentado en los libros. Por eso Cord solo manda facturas que YA son
//    definitivas de su lado, nunca borradores, y el vínculo es lo que impide
//    asentar dos veces la misma.
//  - **Una línea de venta necesita un producto.** QuickBooks no acepta una
//    línea suelta con importe, así que Cord se asegura de tener un servicio
//    llamado "Cord" en el catálogo y cuelga de ahí las líneas. Inventar un
//    producto por cada concepto ensuciaría el catálogo del contador.

import { apiJson, ProveedorError } from '../proveedor-http';
import {
    credencialesConta, QBO_API, QBO_MINOR, QBO_SCOPES, QBO_TOKEN,
} from './config';
import type { ContaCliente, FacturaConta, TokensConta } from './tipos';

const ITEM_CORD = 'Cord';

function basico(): string {
    const c = credencialesConta('quickbooks');
    if (!c) throw new ProveedorError('auth', 'sin credenciales');
    return Buffer.from(`${c.clientId}:${c.clientSecret}`).toString('base64');
}

export function qboAuthorizeUrl(redirectUri: string, state: string): string | null {
    const c = credencialesConta('quickbooks');
    if (!c) return null;
    const url = new URL('https://appcenter.intuit.com/connect/oauth2');
    url.searchParams.set('client_id', c.clientId);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', QBO_SCOPES);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('state', state);
    return url.toString();
}

async function tokenRequest(params: Record<string, string>): Promise<TokensConta> {
    const data = await apiJson(QBO_TOKEN, {
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
        expiresIn: Number(data.expires_in) || 3600,
    };
}

export const qboExchange = (code: string, redirectUri: string) =>
    tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri });

export const qboRefresh = (refreshToken: string) =>
    tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken });

const ruta = (realmId: string, recurso: string) =>
    `${QBO_API()}/v3/company/${encodeURIComponent(realmId)}/${recurso}`
    + `${recurso.includes('?') ? '&' : '?'}minorversion=${QBO_MINOR}`;

/** El endpoint de consulta habla un SQL propio; el texto se escapa con comillas dobles. */
const escapar = (v: string) => v.replace(/['\\]/g, ' ').slice(0, 100);

async function consultar(token: string, realmId: string, query: string): Promise<any> {
    const url = `${QBO_API()}/v3/company/${encodeURIComponent(realmId)}/query`
        + `?minorversion=${QBO_MINOR}&query=${encodeURIComponent(query)}`;
    return apiJson(url, { token });
}

/** Devuelve el id del servicio "Cord", creándolo la primera vez. */
async function asegurarItem(token: string, realmId: string): Promise<string> {
    const r = await consultar(token, realmId, `select Id from Item where Name = '${escapar(ITEM_CORD)}'`);
    const existente = r?.QueryResponse?.Item?.[0]?.Id;
    if (existente) return String(existente);

    // Una cuenta de ingresos es obligatoria para crear un servicio. Se toma la
    // primera de tipo Income que tenga la empresa en vez de inventar uno.
    const cuentas = await consultar(token, realmId, "select Id from Account where AccountType = 'Income' maxresults 1");
    const cuentaId = cuentas?.QueryResponse?.Account?.[0]?.Id;
    if (!cuentaId) throw new ProveedorError('proveedor', 'sin cuenta de ingresos');

    const creado = await apiJson(ruta(realmId, 'item'), {
        token,
        method: 'POST',
        body: JSON.stringify({
            Name: ITEM_CORD,
            Type: 'Service',
            IncomeAccountRef: { value: String(cuentaId) },
        }),
    });
    const id = creado?.Item?.Id;
    if (!id) throw new ProveedorError('proveedor', 'no se creó el servicio');
    return String(id);
}

export async function qboAsegurarCliente(token: string, realmId: string, cliente: ContaCliente): Promise<string> {
    if (cliente.email) {
        const r = await consultar(
            token, realmId,
            `select Id from Customer where PrimaryEmailAddr = '${escapar(cliente.email)}'`,
        );
        const id = r?.QueryResponse?.Customer?.[0]?.Id;
        if (id) return String(id);
    }
    const porNombre = await consultar(
        token, realmId,
        `select Id from Customer where DisplayName = '${escapar(cliente.nombre)}'`,
    );
    const yaEsta = porNombre?.QueryResponse?.Customer?.[0]?.Id;
    if (yaEsta) return String(yaEsta);

    const creado = await apiJson(ruta(realmId, 'customer'), {
        token,
        method: 'POST',
        body: JSON.stringify({
            DisplayName: cliente.nombre.slice(0, 100),
            ...(cliente.email ? { PrimaryEmailAddr: { Address: cliente.email } } : {}),
            ...(cliente.telefono ? { PrimaryPhone: { FreeFormNumber: cliente.telefono } } : {}),
        }),
    });
    const id = creado?.Customer?.Id;
    if (!id) throw new ProveedorError('proveedor', 'no se creó el cliente');
    return String(id);
}

export async function qboCrearFactura(
    token: string, realmId: string, clienteExternoId: string, factura: FacturaConta,
): Promise<{ id: string; numero: string | null }> {
    const itemId = await asegurarItem(token, realmId);
    const creada = await apiJson(ruta(realmId, 'invoice'), {
        token,
        method: 'POST',
        body: JSON.stringify({
            CustomerRef: { value: clienteExternoId },
            TxnDate: factura.fecha,
            ...(factura.vence ? { DueDate: factura.vence } : {}),
            CurrencyRef: { value: factura.moneda },
            // El folio de Cord viaja en una nota privada y no en DocNumber: la
            // numeración de la contabilidad es del contador, y pisarla puede
            // chocar con su propia secuencia.
            PrivateNote: `Cord ${factura.folio}`,
            Line: factura.lineas.map((l) => ({
                Amount: l.importe,
                DetailType: 'SalesItemLineDetail',
                Description: l.descripcion.slice(0, 4000),
                SalesItemLineDetail: {
                    ItemRef: { value: itemId },
                    Qty: l.cantidad,
                    UnitPrice: l.precio,
                },
            })),
        }),
    });
    const id = creada?.Invoice?.Id;
    if (!id) throw new ProveedorError('proveedor', 'no se creó la factura');
    return { id: String(id), numero: creada?.Invoice?.DocNumber ? String(creada.Invoice.DocNumber) : null };
}

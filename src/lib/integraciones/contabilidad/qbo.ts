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
import { buscarTasa, cuadra, subtotalDe, tasasDe, type TasaExterna } from './impuestos';
import { ContaImpuestoError, type ContaCliente, type FacturaConta, type LineaConta, type TokensConta } from './tipos';

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

type ModeloQbo = { tipo: 'ast'; configurado: boolean } | { tipo: 'legacy_us' } | { tipo: 'global' };

// Las empresas de EE.UU. calculan sales tax con el motor automático de Intuit
// (AST); las demás usan códigos de impuesto propios con su tasa.
async function modeloImpuesto(token: string, realmId: string): Promise<ModeloQbo> {
    const pref = await apiJson(ruta(realmId, 'preferences'), { token });
    const partner = pref?.Preferences?.TaxPrefs?.PartnerTaxEnabled;
    if (typeof partner === 'boolean') return { tipo: 'ast', configurado: partner };
    const info = await apiJson(ruta(realmId, `companyinfo/${encodeURIComponent(realmId)}`), { token });
    return String(info?.CompanyInfo?.Country ?? '').toUpperCase() === 'US' ? { tipo: 'legacy_us' } : { tipo: 'global' };
}

async function codigosDeVenta(token: string, realmId: string): Promise<TasaExterna[]> {
    const [codigos, tasas] = await Promise.all([
        consultar(token, realmId, 'select * from TaxCode where Active = true maxresults 1000'),
        consultar(token, realmId, 'select * from TaxRate where Active = true maxresults 1000'),
    ]);
    const pctDe = new Map<string, number>(
        (tasas?.QueryResponse?.TaxRate ?? []).map((r: any) => [String(r?.Id), Number(r?.RateValue)]),
    );
    return (codigos?.QueryResponse?.TaxCode ?? []).flatMap((c: any): TasaExterna[] => {
        const detalle = c?.SalesTaxRateList?.TaxRateDetail;
        if (!Array.isArray(detalle) || !detalle.length) return [];
        // Un impuesto sobre impuesto no es una suma de tasas: no se usa.
        if (detalle.some((d: any) => d?.TaxTypeApplicable === 'TaxOnTax')) return [];
        const pct = detalle.reduce((s: number, d: any) => s + (pctDe.get(String(d?.TaxRateRef?.value)) ?? NaN), 0);
        return Number.isFinite(pct) ? [{ id: String(c.Id), pct }] : [];
    });
}

interface ImpuestoQbo {
    cabecera: Record<string, unknown>;
    codigo: (l: LineaConta) => string | undefined;
}

async function impuestoQbo(token: string, realmId: string, f: FacturaConta): Promise<ImpuestoQbo> {
    const tasas = tasasDe(f.lineas);
    const gravadas = tasas.filter((t) => t > 0);
    const modelo = await modeloImpuesto(token, realmId);
    const tasaONada = (l: LineaConta) => (l.tasa > 0 ? 'TAX' : 'NON');

    if (modelo.tipo === 'ast') {
        if (!gravadas.length && f.impuestos <= 0) return { cabecera: {}, codigo: () => 'NON' };
        if (!modelo.configurado) throw new ContaImpuestoError('impuesto', gravadas[0]);
        // TotalTax fija el impuesto de Cord; sin él, Intuit lo recalcula con su propia tasa.
        return { cabecera: { TxnTaxDetail: { TotalTax: f.impuestos } }, codigo: tasaONada };
    }

    const codigos = await codigosDeVenta(token, realmId);
    if (modelo.tipo === 'legacy_us') {
        if (!gravadas.length && f.impuestos <= 0) return { cabecera: {}, codigo: () => 'NON' };
        // El sales tax manual de EE.UU. lleva UNA tasa por factura.
        if (gravadas.length !== 1) throw new ContaImpuestoError('impuesto', gravadas[0]);
        const id = buscarTasa(codigos, gravadas[0]);
        if (!id) throw new ContaImpuestoError('impuesto', gravadas[0]);
        return {
            cabecera: { TxnTaxDetail: { TxnTaxCodeRef: { value: id }, TotalTax: f.impuestos } },
            codigo: tasaONada,
        };
    }

    const porTasa = new Map<number, string>();
    for (const t of tasas) {
        const id = buscarTasa(codigos, t);
        if (!id) throw new ContaImpuestoError('impuesto', t);
        porTasa.set(t, id);
    }
    return {
        cabecera: { GlobalTaxCalculation: 'TaxExcluded' },
        codigo: (l) => porTasa.get(Math.round(l.tasa * 1e6) / 1e6),
    };
}

export async function qboCrearFactura(
    token: string, realmId: string, clienteExternoId: string, factura: FacturaConta,
): Promise<{ id: string; numero: string | null; descuadre?: boolean }> {
    const itemId = await asegurarItem(token, realmId);
    const impuesto = await impuestoQbo(token, realmId, factura);
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
            ...impuesto.cabecera,
            Line: factura.lineas.map((l) => {
                const codigo = impuesto.codigo(l);
                return {
                    Amount: l.importe,
                    DetailType: 'SalesItemLineDetail',
                    Description: l.descripcion.slice(0, 4000),
                    SalesItemLineDetail: {
                        ItemRef: { value: itemId },
                        Qty: l.cantidad,
                        UnitPrice: l.precio,
                        ...(codigo ? { TaxCodeRef: { value: codigo } } : {}),
                    },
                };
            }),
        }),
    });
    const inv = creada?.Invoice;
    if (!inv?.Id) throw new ProveedorError('proveedor', 'no se creó la factura');
    const resultado = { id: String(inv.Id), numero: inv.DocNumber ? String(inv.DocNumber) : null };

    // QuickBooks asienta al crear: si su total no es el de Cord, la factura se borra.
    const esperado = subtotalDe(factura.lineas) + factura.impuestos;
    if (cuadra(inv.TotalAmt, esperado, factura.lineas.length)) return resultado;
    try {
        await apiJson(ruta(realmId, 'invoice?operation=delete'), {
            token, method: 'POST', body: JSON.stringify({ Id: inv.Id, SyncToken: inv.SyncToken }),
        });
    } catch {
        return { ...resultado, descuadre: true };
    }
    throw new ContaImpuestoError('descuadre');
}

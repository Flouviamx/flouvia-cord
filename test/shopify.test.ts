import { describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';

vi.mock('../src/lib/log', () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('../src/lib/db', () => ({ sql: vi.fn(() => ''), withOrgTx: vi.fn() }));
vi.mock('../src/lib/crypto-secret', () => ({ decryptSecret: (v: string) => v, encryptRequiredSecret: (v: string) => v }));

const { isShopDomain, normalizeShopDomain } = await import('../src/lib/integraciones/shopify/config');
const { oauthTimestampFresh, parseTokenResponse, verifyOAuthHmac, verifyWebhookHmac } =
    await import('../src/lib/integraciones/shopify/oauth');
const { idFromGid } = await import('../src/lib/integraciones/shopify/client');
const { huellaDe, mapCustomer, mapProductVariants } = await import('../src/lib/integraciones/shopify/mapping');
const { mapLineItems } = await import('../src/lib/integraciones/shopify/orders');

const SECRET = 'shpss_secreto';

describe('dominio de la tienda', () => {
    it('acepta solo dominios de Shopify', () => {
        expect(isShopDomain('mi-tienda.myshopify.com')).toBe(true);
        expect(isShopDomain('mi-tienda.myshopify.com.evil.test')).toBe(false);
        expect(isShopDomain('evil.test/mi-tienda.myshopify.com')).toBe(false);
        expect(isShopDomain('MI-TIENDA.myshopify.com')).toBe(false);
        expect(isShopDomain('')).toBe(false);
    });

    it('normaliza lo que teclea la persona', () => {
        expect(normalizeShopDomain('  Mi-Tienda  ')).toBe('mi-tienda.myshopify.com');
        expect(normalizeShopDomain('https://mi-tienda.myshopify.com/admin')).toBe('mi-tienda.myshopify.com');
        expect(normalizeShopDomain('mi-tienda.myshopify.com')).toBe('mi-tienda.myshopify.com');
        // Un dominio propio no sirve para la API: Shopify autentica contra el suyo.
        expect(normalizeShopDomain('tienda.com')).toBeNull();
        expect(normalizeShopDomain('https://evil.test?shop=x.myshopify.com')).toBeNull();
    });
});

describe('firma del regreso de OAuth', () => {
    const firmar = (params: URLSearchParams) => {
        const partes = [...params.entries()]
            .filter(([k]) => k !== 'hmac' && k !== 'signature')
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
            .map(([k, v]) => `${k}=${v}`);
        return createHmac('sha256', SECRET).update(partes.join('&')).digest('hex');
    };

    it('acepta la firma que cuadra, sin importar el orden de los parámetros', () => {
        const p = new URLSearchParams({ shop: 'mi-tienda.myshopify.com', code: 'abc', state: 'st', timestamp: '1700000000' });
        p.set('hmac', firmar(p));
        expect(verifyOAuthHmac(p, SECRET)).toBe(true);

        const revuelto = new URLSearchParams({ timestamp: '1700000000', state: 'st', code: 'abc', shop: 'mi-tienda.myshopify.com' });
        revuelto.set('hmac', p.get('hmac')!);
        expect(verifyOAuthHmac(revuelto, SECRET)).toBe(true);
    });

    it('rechaza un parámetro alterado, otro secreto o la firma ausente', () => {
        const p = new URLSearchParams({ shop: 'mi-tienda.myshopify.com', code: 'abc', timestamp: '1700000000' });
        p.set('hmac', firmar(p));
        const alterada = new URLSearchParams(p);
        alterada.set('shop', 'otra-tienda.myshopify.com');
        expect(verifyOAuthHmac(alterada, SECRET)).toBe(false);
        expect(verifyOAuthHmac(p, 'otro')).toBe(false);
        p.delete('hmac');
        expect(verifyOAuthHmac(p, SECRET)).toBe(false);
    });

    it('un regreso viejo no se acepta: sería un replay de la instalación', () => {
        const ahora = 1_700_000_000_000;
        const reciente = new URLSearchParams({ timestamp: String(Math.floor(ahora / 1000) - 60) });
        const viejo = new URLSearchParams({ timestamp: String(Math.floor(ahora / 1000) - 3600) });
        expect(oauthTimestampFresh(reciente, ahora)).toBe(true);
        expect(oauthTimestampFresh(viejo, ahora)).toBe(false);
        expect(oauthTimestampFresh(new URLSearchParams(), ahora)).toBe(false);
    });
});

describe('firma de los webhooks', () => {
    it('se calcula sobre el cuerpo crudo, en base64', () => {
        const body = JSON.stringify({ id: 1, title: 'Camisa' });
        const firma = createHmac('sha256', SECRET).update(body, 'utf8').digest('base64');
        expect(verifyWebhookHmac(body, firma, SECRET)).toBe(true);
        // Re-serializar cambia el cuerpo: por eso se firma el texto tal cual llegó.
        expect(verifyWebhookHmac(JSON.stringify(JSON.parse(body)) + ' ', firma, SECRET)).toBe(false);
        expect(verifyWebhookHmac(body, firma, 'otro')).toBe(false);
        expect(verifyWebhookHmac(body, null, SECRET)).toBe(false);
        expect(verifyWebhookHmac(body, firma, '')).toBe(false);
    });
});

describe('token de la instalación', () => {
    it('sin access_token no hay conexión', () => {
        expect(parseTokenResponse({ scope: 'read_products' })).toBeNull();
        expect(parseTokenResponse(null)).toBeNull();
        expect(parseTokenResponse({ access_token: 'shpat_x', scope: 'read_products,read_customers' }))
            .toEqual({ accessToken: 'shpat_x', scopes: ['read_products', 'read_customers'] });
    });
});

describe('mapeo a la forma de Cord', () => {
    it('cada variante es un producto, con su precio y su SKU', () => {
        const productos = mapProductVariants({
            id: 'gid://shopify/Product/1', title: 'Camisa', description: 'Algodón', status: 'ACTIVE',
            variants: { nodes: [
                { id: 'gid://shopify/ProductVariant/11', title: 'Chica', sku: 'CAM-CH', price: '199.00', availableForSale: true },
                { id: 'gid://shopify/ProductVariant/12', title: 'Default Title', sku: 'CAM', price: '249.50', availableForSale: true },
            ] },
        });
        expect(productos).toEqual([
            { externoId: '11', sku: 'CAM-CH', nombre: 'Camisa · Chica', descripcion: 'Algodón', precio: 199, moneda: null, activo: true },
            { externoId: '12', sku: 'CAM', nombre: 'Camisa', descripcion: 'Algodón', precio: 249.5, moneda: null, activo: true },
        ]);
    });

    it('un producto borrador llega inactivo y un precio inválido no queda en NaN', () => {
        const [p] = mapProductVariants({
            id: 'gid://shopify/Product/2', title: 'Borrador', status: 'DRAFT',
            variants: { nodes: [{ id: 'gid://shopify/ProductVariant/21', title: 'Default Title', price: 'x' }] },
        });
        expect(p).toMatchObject({ activo: false, precio: 0 });
    });

    it('el cliente toma su empresa de la compañía, y si no, de la persona', () => {
        expect(mapCustomer({
            id: 'gid://shopify/Customer/5', firstName: 'Ana', lastName: 'López',
            defaultEmailAddress: { emailAddress: 'ana@acme.test' },
            defaultPhoneNumber: { phoneNumber: '+52 55 1234 5678' },
            defaultAddress: { company: 'ACME' },
        })).toEqual({ externoId: '5', empresa: 'ACME', contacto: 'Ana López', email: 'ana@acme.test', telefono: '+52 55 1234 5678' });

        expect(mapCustomer({ id: 'gid://shopify/Customer/6', firstName: 'Ana', lastName: 'López' }))
            .toMatchObject({ empresa: 'Ana López', contacto: 'Ana López', email: null });

        // Sin nombre ni correo no hay nada que nombrar: no se inventa una fila vacía.
        expect(mapCustomer({ id: 'gid://shopify/Customer/7' })).toBeNull();
        expect(mapCustomer({ id: 'no-es-un-gid' })).toBeNull();
    });

    it('el id sale del gid y solo si tiene la forma esperada', () => {
        expect(idFromGid('gid://shopify/Product/123')).toBe('123');
        expect(idFromGid('gid://shopify/Product/12a')).toBeNull();
        expect(idFromGid(undefined)).toBeNull();
    });

    it('la huella cambia solo cuando cambia el dato', () => {
        expect(huellaDe(['a', 1])).toBe(huellaDe(['a', 1]));
        expect(huellaDe(['a', 1])).not.toBe(huellaDe(['a', 2]));
    });
});

describe('líneas de la cotización hacia el pedido', () => {
    it('viaja el precio negociado con su descuento, no el de lista', () => {
        expect(mapLineItems([
            { descripcion: 'Camisa', cantidad: 10, precio_unitario: 200, precio_negociado: 150, descuento_pct: 10, variante: '11' },
        ], 'MXN')).toEqual([
            { variantId: 'gid://shopify/ProductVariant/11', quantity: 10, priceOverride: { amount: '135.00', currencyCode: 'MXN' } },
        ]);
    });

    it('una línea sin producto de la tienda no se pierde: va como concepto', () => {
        expect(mapLineItems([{ descripcion: 'Instalación', cantidad: 1, precio_unitario: 1200 }], 'MXN')).toEqual([
            { title: 'Instalación', quantity: 1, originalUnitPrice: '1200.00' },
        ]);
    });

    it('un precio negociado de cero es un precio, no un campo vacío', () => {
        const [linea] = mapLineItems([
            { descripcion: 'Muestra', cantidad: 2, precio_unitario: 500, precio_negociado: 0 },
        ], 'MXN');
        expect(linea).toMatchObject({ originalUnitPrice: '0.00', quantity: 2 });
    });

    it('cantidades raras no rompen el pedido', () => {
        expect(mapLineItems([{ descripcion: 'X', cantidad: 2.4, precio_unitario: 10 }], 'MXN')[0]).toMatchObject({ quantity: 2 });
        expect(mapLineItems([{ descripcion: 'X', cantidad: 0, precio_unitario: 10 }], 'MXN')[0]).toMatchObject({ quantity: 1 });
        expect(mapLineItems([{ descripcion: 'X', cantidad: 'dos', precio_unitario: 'mil' }], 'MXN')[0])
            .toMatchObject({ quantity: 1, originalUnitPrice: '0.00' });
    });

    it('un descuento del 100 por ciento no produce un precio negativo', () => {
        expect(mapLineItems([{ descripcion: 'Regalo', cantidad: 1, precio_unitario: 300, descuento_pct: 120 }], 'MXN')[0])
            .toMatchObject({ originalUnitPrice: '0.00' });
    });
});

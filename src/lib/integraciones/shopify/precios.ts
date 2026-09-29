// Precios B2B de Shopify por cliente. Una tienda con B2B (Shopify Plus) asigna a
// cada ubicación de empresa un catálogo con su lista de precios; si el cliente de
// Cord está ligado a un cliente de Shopify que compra por una empresa, su lista
// manda en el editor como precio pactado. Sin B2B, sin empresa o sin lista, no
// hay nada que aplicar y la cotización sigue como siempre.

import { sql, withOrgTx } from '../../db';
import { idFromGid, shopifyGraphQL } from './client';
import { accessToken } from './service';

const PRECIOS_QUERY = `query($id: ID!, $cursor: String) {
  customer(id: $id) {
    companyContactProfiles {
      company { name }
      roleAssignments(first: 5) { nodes { companyLocation { name catalogs(first: 5) { nodes {
        ... on CompanyLocationCatalog { priceList { id currency prices(first: 250, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          nodes { variant { id } price { amount currencyCode } }
        } } }
      } } } } }
    }
  }
}`;

export interface PreciosB2B {
    empresa: string | null;
    moneda: string;
    /** productoId de Cord → precio de la lista, en `moneda`. */
    precios: Record<string, number>;
}

/** La primera lista de precios de las ubicaciones de empresa del cliente. */
export function primeraLista(customer: any): { empresa: string | null; lista: any } | null {
    for (const perfil of customer?.companyContactProfiles ?? []) {
        for (const rol of perfil?.roleAssignments?.nodes ?? []) {
            for (const cat of rol?.companyLocation?.catalogs?.nodes ?? []) {
                if (cat?.priceList?.currency) return { empresa: perfil?.company?.name ?? null, lista: cat.priceList };
            }
        }
    }
    return null;
}

export async function preciosB2B(orgId: string, clienteId: string): Promise<PreciosB2B | null> {
    if (!/^[0-9a-f-]{36}$/i.test(clienteId)) return null;
    const cred = await accessToken(orgId);
    if (!cred) return null;
    const [[vc]] = await withOrgTx(orgId, sql`
        select externo_id from integracion_vinculos
         where org_id = ${orgId} and conexion_id = ${cred.conexionId}
           and objeto = 'client' and externo_tipo = 'shopify_customer' and local_id = ${clienteId}`);
    if (!vc) return null;

    const porVariante = new Map<string, number>();
    let empresa: string | null = null;
    let moneda = '';
    let cursor: string | null = null;
    for (let pagina = 0; pagina < 4; pagina++) {
        const res: any = await shopifyGraphQL<any>(cred.shop, cred.token, PRECIOS_QUERY, { id: `gid://shopify/Customer/${vc.externo_id}`, cursor });
        if (!res.ok) return null;
        const hallada = primeraLista(res.data?.customer);
        if (!hallada) return null;
        empresa = hallada.empresa;
        moneda = String(hallada.lista.currency).toUpperCase();
        for (const n of hallada.lista.prices?.nodes ?? []) {
            const variante = idFromGid(n?.variant?.id);
            const precio = Number(n?.price?.amount);
            if (variante && Number.isFinite(precio) && String(n?.price?.currencyCode).toUpperCase() === moneda) porVariante.set(variante, precio);
        }
        const info = hallada.lista.prices?.pageInfo;
        if (!info?.hasNextPage) break;
        cursor = info.endCursor;
    }
    if (!porVariante.size) return { empresa, moneda, precios: {} };

    const [vinculos] = await withOrgTx(orgId, sql`
        select local_id, externo_id from integracion_vinculos
         where org_id = ${orgId} and conexion_id = ${cred.conexionId}
           and externo_tipo = 'shopify_product' and externo_id = any(${[...porVariante.keys()]}::text[])`);
    const precios: Record<string, number> = {};
    for (const v of vinculos as any[]) {
        const p = porVariante.get(String(v.externo_id));
        if (p !== undefined) precios[String(v.local_id)] = p;
    }
    return { empresa, moneda, precios };
}

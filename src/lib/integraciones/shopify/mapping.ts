// De la forma de Shopify a la de Cord, y la huella que evita el eco.
//
// Un producto de Shopify tiene variantes y uno de Cord no: cada VARIANTE es un
// producto de Cord, porque es lo que se cotiza y lo que tiene precio y SKU.
// Aplanar por producto perdería el precio de cada talla o presentación.

import { createHash } from 'node:crypto';
import { idFromGid } from './client';

export interface ProductoExterno {
    externoId: string;
    sku: string | null;
    nombre: string;
    descripcion: string | null;
    precio: number;
    moneda: string | null;
    activo: boolean;
}

export interface ClienteExterno {
    externoId: string;
    empresa: string;
    contacto: string | null;
    email: string | null;
    telefono: string | null;
}

const texto = (v: unknown, max: number): string | null => {
    const s = typeof v === 'string' ? v.trim() : '';
    return s ? s.slice(0, max) : null;
};

/** Cada variante es un producto de Cord; el nombre lleva el del producto cuando aporta. */
export function mapProductVariants(node: any): ProductoExterno[] {
    const base = texto(node?.title, 140) ?? '';
    const descripcion = texto(node?.description, 2000);
    const activo = String(node?.status ?? '').toUpperCase() === 'ACTIVE';
    const variantes = Array.isArray(node?.variants?.nodes) ? node.variants.nodes : [];
    const out: ProductoExterno[] = [];
    for (const v of variantes) {
        const externoId = idFromGid(v?.id);
        if (!externoId) continue;
        const titulo = texto(v?.title, 80);
        const nombre = titulo && titulo.toLowerCase() !== 'default title' ? `${base} · ${titulo}` : base;
        if (!nombre) continue;
        const precio = Number(v?.price);
        out.push({
            externoId,
            sku: texto(v?.sku, 60),
            nombre: nombre.slice(0, 200),
            descripcion,
            precio: Number.isFinite(precio) && precio >= 0 ? precio : 0,
            moneda: null,
            activo: activo && v?.availableForSale !== false,
        });
    }
    return out;
}

/**
 * Un cliente de Cord es una EMPRESA con un contacto. Shopify trae personas, así
 * que la empresa sale de su compañía B2B si existe y, si no, del nombre de la
 * persona: inventar una empresa vacía dejaría el catálogo lleno de filas "—".
 */
export function mapCustomer(node: any): ClienteExterno | null {
    const externoId = idFromGid(node?.id);
    if (!externoId) return null;
    const persona = [texto(node?.firstName, 60), texto(node?.lastName, 60)].filter(Boolean).join(' ').trim();
    const compania = texto(node?.defaultAddress?.company, 140);
    const email = texto(node?.defaultEmailAddress?.emailAddress ?? node?.email, 160);
    const empresa = compania || persona || email;
    if (!empresa) return null;
    return {
        externoId,
        empresa: empresa.slice(0, 200),
        contacto: persona || null,
        email,
        telefono: texto(node?.defaultPhoneNumber?.phoneNumber ?? node?.phone, 40),
    };
}

/**
 * Huella de lo último sincronizado. Si Shopify manda otra vez lo mismo —y lo
 * hace: un webhook por cada campo que toque el comerciante—, no se reescribe la
 * fila ni se dispara nada. Es el mismo anti-eco que ya usa HubSpot.
 */
export const huellaDe = (valor: unknown): string =>
    createHash('sha256').update(JSON.stringify(valor ?? null)).digest('hex');

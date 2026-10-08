// Portal del cliente: un link por cliente con todas sus facturas, su saldo por
// divisa, el pago de varias a la vez y el cobro automático.
//
// El link es una credencial portadora, igual que /i/[token]: se genera con 32
// bytes aleatorios, se puede rotar (el anterior deja de abrir) y se puede
// apagar. Vive en cordhq.app y no en el dominio propio del negocio: el dominio
// propio solo sirve documentos (/q, /i), nunca una superficie con métodos de
// pago guardados.

import { randomBytes } from 'node:crypto';
import { sql, resolvePortal, withOrgTx } from '../db';
import { canonicalPublicOrigin } from '../public-links';
import { setRequestCurrency, setRequestFormatLocale, setRequestLocale } from '../context';
import { getCountryProfile } from '../countries';
import { normalizeCurrency } from '../currency';
import { facturasDelCliente, metodosDelCobro, saldoPorDivisa, type FacturaCliente, type OrgParaCobro } from './agrupados';
import { DOMICILIACION, type MetodoCobro, type ResumenMetodo } from './metodos';

export function nuevoTokenPortal(): string {
    return randomBytes(32).toString('base64url');
}

export function portalUrl(token: string): string {
    return `${canonicalPublicOrigin()}/portal/${encodeURIComponent(token)}`;
}

/** El link del portal del cliente; lo crea si no existe, o lo rota si se pide. */
export async function linkPortal(orgId: string, clienteId: string, opts: { rotar?: boolean } = {}): Promise<string | null> {
    const [[c]] = await withOrgTx(orgId, sql`
        select portal_token from clientes where id = ${clienteId} and org_id = ${orgId}`);
    if (!c) return null;
    if (c.portal_token && !opts.rotar) return portalUrl(String(c.portal_token));
    const token = nuevoTokenPortal();
    const [rows] = await withOrgTx(orgId, sql`
        update clientes set portal_token = ${token}, portal_token_at = now()
         where id = ${clienteId} and org_id = ${orgId}
           and portal_token is not distinct from ${c.portal_token ?? null}
         returning portal_token`);
    // Dos pestañas generando a la vez: gana una y la otra lee la que quedó.
    if (!rows.length) {
        const [[actual]] = await withOrgTx(orgId, sql`select portal_token from clientes where id = ${clienteId} and org_id = ${orgId}`);
        return actual?.portal_token ? portalUrl(String(actual.portal_token)) : null;
    }
    return portalUrl(token);
}

/** Apaga el link: el cliente deja de poder abrir el portal hasta que se genere otro. */
export async function apagarLinkPortal(orgId: string, clienteId: string): Promise<boolean> {
    const [rows] = await withOrgTx(orgId, sql`
        update clientes set portal_token = null, portal_token_at = null
         where id = ${clienteId} and org_id = ${orgId} returning id`);
    return rows.length > 0;
}

export interface AutopayEstado {
    activo: boolean;
    metodo: ResumenMetodo | null;
    desde: string | null;
    /** Por qué se detuvo el ciclo actual o por qué se apagó. */
    detenido: { motivo: string; currency: string; siguienteAt: string | null; intentos: number }[];
    desactivado: { por: string; motivo: string | null; at: string } | null;
}

export interface DatosPortal {
    orgId: string;
    clienteId: string;
    cliente: { nombre: string; email: string | null };
    org: {
        nombre: string; color: string; logoUrl: string | null; email: string | null; telefono: string | null;
        powered: boolean; pais: string; idioma: string;
    };
    facturas: FacturaCliente[];
    saldos: ReturnType<typeof saldoPorDivisa>;
    /** Métodos por divisa con saldo; vacío si el negocio no cobra en línea. */
    metodos: Record<string, MetodoCobro[]>;
    pagoEnLinea: boolean;
    autopayPermitido: boolean;
    /** Métodos que se pueden guardar para el cobro automático. */
    metodosGuardables: MetodoCobro[];
    autopay: AutopayEstado;
    prueba: boolean;
}

const fechaIso = (v: unknown) => (v ? new Date(String(v)).toISOString() : null);

/**
 * Todo lo que la página del portal necesita, resuelto desde el token. Fija la
 * divisa, el idioma y el formato del request con los del NEGOCIO (no los del
 * navegador del cliente), como la factura pública.
 */
export async function datosPortal(token: string, stripeConfigurado: boolean): Promise<DatosPortal | null> {
    const identidad = await resolvePortal(token);
    if (!identidad) return null;
    const { orgId, clienteId } = identidad;
    const [[r], estados] = await withOrgTx(orgId,
        sql`select c.empresa, c.contacto, c.email, c.autopay_activo, c.autopay_metodo, c.autopay_consentimiento,
                   c.autopay_desactivado,
                   o.nombre, o.logo_url, o.color_marca, o.email_contacto, o.telefono, o.portal_powered,
                   o.country_code, o.idioma, o.moneda, (o.sandbox_of is not null) as es_prueba, o.is_demo,
                   o.stripe_account_id, o.stripe_charges_enabled, o.acepta_tarjeta, o.acepta_domiciliacion,
                   o.stripe_capacidades, o.fee_enabled, o.fee_terms_version, o.cobro_automatico_permitido
              from clientes c join orgs o on o.id = c.org_id
             where c.id = ${clienteId} and c.org_id = ${orgId}`,
        sql`select currency, intentos, siguiente_at, detenido_motivo from cobro_automatico_estado
             where org_id = ${orgId} and cliente_id = ${clienteId}`);
    if (!r) return null;

    setRequestLocale(r.idioma as string);
    setRequestFormatLocale(getCountryProfile(String(r.country_code || 'MX')).locale);
    setRequestCurrency(normalizeCurrency(r.moneda as string));

    const facturas = await facturasDelCliente(orgId, clienteId);
    const saldos = saldoPorDivisa(facturas);
    const prueba = !!r.es_prueba || !!r.is_demo;
    const pagoEnLinea = stripeConfigurado && !prueba && !!r.stripe_account_id && !!r.stripe_charges_enabled;
    const org: OrgParaCobro = {
        nombre: String(r.nombre || ''),
        stripeAccountId: String(r.stripe_account_id || ''),
        aceptaTarjeta: !!r.acepta_tarjeta,
        aceptaDomiciliacion: !!r.acepta_domiciliacion,
        capacidades: r.stripe_capacidades,
        feeEnabled: r.fee_enabled,
        feeTermsVersion: r.fee_terms_version,
    };
    const metodos: Record<string, MetodoCobro[]> = {};
    if (pagoEnLinea) for (const s of saldos) metodos[s.currency] = metodosDelCobro(org, s.currency);

    // Para guardar: la tarjeta (cubre cualquier divisa) y la domiciliación de
    // las divisas en las que este cliente recibe facturas.
    const divisas = new Set([...facturas.map((f) => f.currency), normalizeCurrency(r.moneda as string)]);
    const guardables = new Set<MetodoCobro>();
    if (pagoEnLinea) for (const d of divisas) for (const m of metodosDelCobro(org, d)) guardables.add(m);

    const consentimiento = (r.autopay_consentimiento ?? null) as { aceptado_at?: string } | null;
    const desactivado = (r.autopay_desactivado ?? null) as AutopayEstado['desactivado'];
    return {
        orgId, clienteId,
        cliente: { nombre: String(r.empresa || r.contacto || ''), email: r.email ? String(r.email) : null },
        org: {
            nombre: String(r.nombre || 'Cord'),
            color: /^#[0-9a-fA-F]{6}$/.test(String(r.color_marca || '')) ? String(r.color_marca) : '#0a192f',
            logoUrl: r.logo_url ? String(r.logo_url) : null,
            email: r.email_contacto ? String(r.email_contacto) : null,
            telefono: r.telefono ? String(r.telefono) : null,
            powered: r.portal_powered !== false,
            pais: String(r.country_code || 'MX').toUpperCase(),
            idioma: String(r.idioma || 'es'),
        },
        facturas, saldos, metodos, pagoEnLinea,
        autopayPermitido: pagoEnLinea && r.cobro_automatico_permitido !== false,
        metodosGuardables: [...guardables],
        autopay: {
            activo: !!r.autopay_activo,
            metodo: (r.autopay_metodo ?? null) as ResumenMetodo | null,
            desde: r.autopay_activo ? (consentimiento?.aceptado_at ?? null) : null,
            detenido: estados.filter((e: any) => e.detenido_motivo || e.siguiente_at).map((e: any) => ({
                motivo: String(e.detenido_motivo || 'reintento'),
                currency: String(e.currency),
                siguienteAt: fechaIso(e.siguiente_at),
                intentos: Number(e.intentos || 0),
            })),
            desactivado,
        },
        prueba,
    };
}

/** Divisa que liquida cada método guardable (null = cualquiera). */
export function divisaDelMetodo(tipo: MetodoCobro): string | null {
    return tipo === 'card' ? null : DOMICILIACION[tipo].divisa;
}

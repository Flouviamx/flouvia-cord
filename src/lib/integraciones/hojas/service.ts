// El motor de las hojas: una fila por documento, encontrada por folio.
//
// Por qué por folio y no por número de fila guardado: la hoja es de la persona,
// y la persona ordena, filtra, inserta y borra filas. Un número de fila guardado
// en Cord apunta a otra cosa en cuanto alguien ordena por total, y entonces Cord
// sobrescribe la venta equivocada. El folio está en la columna A y sobrevive a
// todo eso; si no aparece, la fila se agrega al final.

import { sql, withOrgTx } from '../../db';
import { log } from '../../log';
import { decryptSecret, encryptRequiredSecret } from '../../crypto-secret';
import { siteOrigin } from '../../email';
import {
    CABECERAS, cabecerasPara, filaCotizacion, filaFactura, type Celda, type Pestana,
} from './columnas';
import { HojaError, type ClienteHoja, type HojaRef, type TokensHoja } from './cliente';
import { credencialesHoja, esProveedorHoja, nombreLibro, type ProveedorHoja } from './config';
import { googleRefresh, googleSheets } from './google';
import { excel, excelRefresh } from './excel';

const MAX_BACKFILL = 500;

export function clienteDe(proveedor: ProveedorHoja): ClienteHoja {
    return proveedor === 'google_sheets' ? googleSheets : excel;
}

/** El título lo ve la persona dentro de su archivo, así que va en su idioma. */
export function titulosPara(idioma: string): Record<Pestana, string> {
    return String(idioma || '').startsWith('en')
        ? { cotizaciones: 'Quotes', facturas: 'Invoices' }
        : { cotizaciones: 'Cotizaciones', facturas: 'Facturas' };
}

export function hojasDe(titulos: Record<Pestana, string>): HojaRef[] {
    // El idioma quedó fijado al conectar, en los títulos de las pestañas.
    const en = titulos.cotizaciones === titulosPara('en').cotizaciones;
    return (['cotizaciones', 'facturas'] as const).map((clave) => ({
        clave, titulo: titulos[clave], cabeceras: cabecerasPara(clave, en),
    }));
}

export interface ConexionHoja {
    id: string;
    proveedor: ProveedorHoja;
    token: string;
    libroId: string;
    libroUrl: string;
    titulos: Record<Pestana, string>;
    cuenta: string;
    ultimaSync: string | null;
    estado: string;
}

interface Ajustes {
    libroId?: unknown;
    libroUrl?: unknown;
    titulos?: unknown;
}

/**
 * Lee la conexión y garantiza un access token vivo. Los dos proveedores dan
 * tokens de una hora, así que renovar es el caso NORMAL, no la excepción.
 */
export async function leerConexionHoja(orgId: string, proveedor: ProveedorHoja): Promise<ConexionHoja | null> {
    const [[row]] = await withOrgTx(orgId, sql`
        select id, proveedor, estado, cuenta_externa, ajustes, ultima_sync_at,
               access_token_enc, access_expires_at, refresh_token_enc
          from integracion_conexiones
         where org_id = ${orgId} and proveedor = ${proveedor}
           and estado <> 'desconectada'
         limit 1`);
    if (!row || !esProveedorHoja(row.proveedor)) return null;

    const ajustes = (row.ajustes ?? {}) as Ajustes;
    const libroId = typeof ajustes.libroId === 'string' ? ajustes.libroId : '';
    if (!libroId) return null;
    const titulos = (ajustes.titulos && typeof ajustes.titulos === 'object'
        ? ajustes.titulos : titulosPara('es')) as Record<Pestana, string>;

    const vence = row.access_expires_at ? new Date(row.access_expires_at as string).getTime() : 0;
    let token = row.access_token_enc ? decryptSecret(row.access_token_enc as string) : '';

    if (!token || vence < Date.now() + 60_000) {
        const refresh = row.refresh_token_enc ? decryptSecret(row.refresh_token_enc as string) : '';
        if (!refresh) {
            await marcarError(orgId, proveedor, 'auth');
            return null;
        }
        const frescos = proveedor === 'google_sheets' ? await googleRefresh(refresh) : await excelRefresh(refresh);
        token = frescos.accessToken;
        await guardarTokens(orgId, row.id as string, frescos, refresh);
    }

    return {
        id: row.id as string,
        proveedor,
        token,
        libroId,
        libroUrl: typeof ajustes.libroUrl === 'string' ? ajustes.libroUrl : clienteDe(proveedor).urlDelLibro(libroId),
        titulos,
        cuenta: String(row.cuenta_externa ?? ''),
        ultimaSync: row.ultima_sync_at ? new Date(row.ultima_sync_at as string).toISOString() : null,
        estado: String(row.estado ?? 'activa'),
    };
}

export interface EstadoHoja {
    proveedor: ProveedorHoja;
    cuenta: string;
    libroUrl: string;
    ultimaSync: string | null;
    estado: string;
}

/**
 * Lo que necesita la tarjeta de Ajustes. NO renueva tokens ni llama al
 * proveedor: pintar una pantalla no puede depender de que Google esté arriba.
 */
export async function estadoHoja(orgId: string, proveedor: ProveedorHoja): Promise<EstadoHoja | null> {
    const [[row]] = await withOrgTx(orgId, sql`
        select proveedor, estado, cuenta_externa, ajustes, ultima_sync_at
          from integracion_conexiones
         where org_id = ${orgId} and proveedor = ${proveedor} and estado <> 'desconectada'
         limit 1`);
    if (!row || !esProveedorHoja(row.proveedor)) return null;
    const ajustes = (row.ajustes ?? {}) as Ajustes;
    const libroId = typeof ajustes.libroId === 'string' ? ajustes.libroId : '';
    return {
        proveedor: row.proveedor,
        cuenta: String(row.cuenta_externa ?? ''),
        libroUrl: typeof ajustes.libroUrl === 'string' && ajustes.libroUrl
            ? ajustes.libroUrl
            : (libroId ? clienteDe(row.proveedor).urlDelLibro(libroId) : ''),
        ultimaSync: row.ultima_sync_at ? new Date(row.ultima_sync_at as string).toISOString() : null,
        estado: String(row.estado ?? 'activa'),
    };
}

async function guardarTokens(orgId: string, conexionId: string, t: TokensHoja, refreshPrevio: string): Promise<void> {
    // Google solo manda refresh token en la PRIMERA autorización: si esta
    // respuesta no trae uno, se conserva el que ya estaba en vez de borrarlo.
    const refresh = t.refreshToken || refreshPrevio;
    await withOrgTx(orgId, sql`
        update integracion_conexiones
           set access_token_enc = ${encryptRequiredSecret(t.accessToken)},
               access_expires_at = now() + (${Math.max(60, t.expiresIn)} * interval '1 second'),
               refresh_token_enc = ${encryptRequiredSecret(refresh)},
               estado = 'activa', ultimo_error = null, ultimo_error_at = null, updated_at = now()
         where id = ${conexionId} and org_id = ${orgId}`);
}

async function marcarError(orgId: string, proveedor: ProveedorHoja, motivo: string): Promise<void> {
    await withOrgTx(orgId, sql`
        update integracion_conexiones
           set estado = 'error', ultimo_error = ${motivo.slice(0, 500)}, ultimo_error_at = now(), updated_at = now()
         where org_id = ${orgId} and proveedor = ${proveedor} and estado <> 'desconectada'`);
}

/** Los proveedores con hoja viva. Las dos pueden estar conectadas a la vez. */
export async function proveedoresConectados(orgId: string): Promise<ProveedorHoja[]> {
    const [rows] = await withOrgTx(orgId, sql`
        select proveedor from integracion_conexiones
         where org_id = ${orgId} and proveedor in ('google_sheets', 'excel') and estado = 'activa'`);
    return rows.map((r: any) => r.proveedor).filter(esProveedorHoja);
}

/** Guarda la conexión recién autorizada y crea el archivo. */
export async function conectarHoja(
    orgId: string, userId: string, proveedor: ProveedorHoja, tokens: TokensHoja, cuenta: string,
): Promise<{ libroUrl: string }> {
    if (!tokens.refreshToken) throw new HojaError('auth', 'sin refresh');
    const [[org]] = await withOrgTx(orgId, sql`select nombre, idioma from orgs where id = ${orgId}`);
    const titulos = titulosPara(String(org?.idioma ?? 'es'));
    const libro = await clienteDe(proveedor).crearLibro(
        tokens.accessToken,
        nombreLibro(String(org?.nombre ?? 'Cord'), new Date().getUTCFullYear()),
        hojasDe(titulos),
    );

    const ajustes = JSON.stringify({ libroId: libro.id, libroUrl: libro.url, titulos });
    await withOrgTx(orgId, sql`
        insert into integracion_conexiones
            (org_id, proveedor, estado, cuenta_externa, cuenta_nombre, scopes,
             access_token_enc, access_expires_at, refresh_token_enc, ajustes, conectada_por)
        values (${orgId}, ${proveedor}, 'activa', ${cuenta}, ${cuenta}, ${tokens.scopes},
                ${encryptRequiredSecret(tokens.accessToken)},
                now() + (${Math.max(60, tokens.expiresIn)} * interval '1 second'),
                ${encryptRequiredSecret(tokens.refreshToken)}, ${ajustes}::jsonb, ${userId})
        on conflict (org_id, proveedor) do update
           set estado = 'activa', cuenta_externa = excluded.cuenta_externa,
               cuenta_nombre = excluded.cuenta_nombre, scopes = excluded.scopes,
               access_token_enc = excluded.access_token_enc,
               access_expires_at = excluded.access_expires_at,
               refresh_token_enc = excluded.refresh_token_enc,
               ajustes = excluded.ajustes, ultimo_error = null, ultimo_error_at = null,
               updated_at = now()`);
    return { libroUrl: libro.url };
}

export async function desconectarHoja(orgId: string, proveedor: ProveedorHoja): Promise<void> {
    await withOrgTx(orgId, sql`
        update integracion_conexiones
           set estado = 'desconectada', access_token_enc = null, refresh_token_enc = null,
               access_expires_at = null, updated_at = now()
         where org_id = ${orgId} and proveedor = ${proveedor}`);
}

async function zonaDe(orgId: string): Promise<string> {
    const [[org]] = await withOrgTx(orgId, sql`select zona_horaria from orgs where id = ${orgId}`);
    return String(org?.zona_horaria ?? 'America/Mexico_City');
}

/** Escribe una fila: la reemplaza si su folio ya está, y si no la agrega al final. */
async function ponerFila(cx: ConexionHoja, clave: Pestana, folio: string, celdas: Celda[]): Promise<void> {
    const cliente = clienteDe(cx.proveedor);
    const hoja = hojasDe(cx.titulos).find((h) => h.clave === clave)!;
    const folios = await cliente.leerFolios(cx.token, cx.libroId, hoja);
    const idx = folios.findIndex((f) => f === folio);
    if (idx >= 0) await cliente.escribirFila(cx.token, cx.libroId, hoja, idx + 2, celdas);
    else await cliente.agregarFila(cx.token, cx.libroId, hoja, celdas);
}

// `cotizaciones.subtotal` es la base NETA (ya con el descuento de documento):
// la hoja lee subtotal − descuento + impuestos = total, así que su columna
// `subtotal` es el bruto.
const COTIZACION = (orgId: string, quoteId: string) => sql`
    select c.folio, coalesce(cl.empresa, '') as cliente, c.status, c.created_at, c.vigencia,
           c.base_currency, c.subtotal + coalesce(c.descuento, 0) as subtotal, c.descuento, c.iva, c.total, c.public_token,
           coalesce((select sum(cb.monto) from cotizacion_cobros cb
                      where cb.cotizacion_id = c.id and cb.org_id = ${orgId} and cb.status = 'pagado'), 0) as cobrado
      from cotizaciones c
      left join clientes cl on cl.id = c.cliente_id and cl.org_id = c.org_id
     where c.org_id = ${orgId} and c.id = ${quoteId}`;

const FACTURA = (orgId: string, docId: string) => sql`
    select d.invoice_number, coalesce(cl.empresa, cq.empresa, '') as cliente, d.lifecycle, d.status,
           d.created_at, d.due_date, d.currency, d.total, d.amount_paid, d.amount_remaining, d.public_token
      from documentos_fiscales d
      left join cotizaciones c on c.id = d.cotizacion_id and c.org_id = d.org_id
      left join clientes cl on cl.id = d.cliente_id and cl.org_id = d.org_id
      left join clientes cq on cq.id = c.cliente_id and cq.org_id = d.org_id
     where d.org_id = ${orgId} and d.id = ${docId}`;

/**
 * Escribe la fila en TODAS las hojas conectadas. Google y Excel son dos
 * integraciones distintas para quien las usa y se pueden tener las dos a la vez;
 * el documento es el mismo, así que se lee una vez y se escribe en cada una.
 */
async function difundir(orgId: string, clave: Pestana, folio: string, celdas: Celda[]): Promise<number> {
    const proveedores = await proveedoresConectados(orgId);
    let escritas = 0;
    for (const proveedor of proveedores) {
        try {
            const cx = await leerConexionHoja(orgId, proveedor);
            if (!cx) continue;
            await ponerFila(cx, clave, folio, celdas);
            await tocarSync(orgId, cx.id);
            escritas += 1;
        } catch (err) {
            // Que la hoja de Google esté caída no puede impedir que se escriba
            // la de Excel: cada una falla por su cuenta.
            const motivo = err instanceof HojaError ? err.motivo : 'proveedor';
            if (motivo === 'auth' || motivo === 'permiso') await marcarError(orgId, proveedor, motivo).catch(() => null);
            log.error('no se pudo escribir en la hoja', {
                route: 'hojas', orgId, proveedor, motivo,
                detalle: err instanceof HojaError ? err.detalle : undefined,
            });
        }
    }
    return escritas;
}

export async function sincronizarCotizacion(orgId: string, quoteId: string): Promise<boolean> {
    const [[q]] = await withOrgTx(orgId, COTIZACION(orgId, quoteId));
    if (!q?.folio) return false;
    const celdas = filaCotizacion(q as any, await zonaDe(orgId), siteOrigin());
    return (await difundir(orgId, 'cotizaciones', String(q.folio), celdas)) > 0;
}

export async function sincronizarFactura(orgId: string, docId: string): Promise<boolean> {
    const [[f]] = await withOrgTx(orgId, FACTURA(orgId, docId));
    // Una factura sin folio todavía no existe para el negocio: es un borrador.
    if (!f?.invoice_number) return false;
    const celdas = filaFactura(f as any, await zonaDe(orgId), siteOrigin());
    return (await difundir(orgId, 'facturas', String(f.invoice_number), celdas)) > 0;
}

async function tocarSync(orgId: string, conexionId: string): Promise<void> {
    await withOrgTx(orgId, sql`
        update integracion_conexiones set ultima_sync_at = now(), updated_at = now()
         where id = ${conexionId} and org_id = ${orgId}`);
}

/** Rellena el archivo con lo que ya existía cuando se conectó. */
export async function sincronizarTodo(
    orgId: string, proveedor: ProveedorHoja,
): Promise<{ cotizaciones: number; facturas: number }> {
    const cx = await leerConexionHoja(orgId, proveedor);
    if (!cx) return { cotizaciones: 0, facturas: 0 };
    const zona = await zonaDe(orgId);
    const origen = siteOrigin();
    const cliente = clienteDe(cx.proveedor);

    const [quotes] = await withOrgTx(orgId, sql`
        select c.folio, coalesce(cl.empresa, '') as cliente, c.status, c.created_at, c.vigencia,
               c.base_currency, c.subtotal + coalesce(c.descuento, 0) as subtotal, c.descuento, c.iva, c.total, c.public_token,
               coalesce((select sum(cb.monto) from cotizacion_cobros cb
                          where cb.cotizacion_id = c.id and cb.org_id = ${orgId} and cb.status = 'pagado'), 0) as cobrado
          from cotizaciones c
          left join clientes cl on cl.id = c.cliente_id and cl.org_id = c.org_id
         where c.org_id = ${orgId} and c.status <> 'draft'
         order by c.created_at desc
         limit ${MAX_BACKFILL}`);

    const [facturas] = await withOrgTx(orgId, sql`
        select d.invoice_number, coalesce(cl.empresa, cq.empresa, '') as cliente, d.lifecycle, d.status,
               d.created_at, d.due_date, d.currency, d.total, d.amount_paid, d.amount_remaining, d.public_token
          from documentos_fiscales d
          left join cotizaciones c on c.id = d.cotizacion_id and c.org_id = d.org_id
          left join clientes cl on cl.id = d.cliente_id and cl.org_id = d.org_id
          left join clientes cq on cq.id = c.cliente_id and cq.org_id = d.org_id
         where d.org_id = ${orgId} and d.invoice_number is not null
         order by d.created_at desc
         limit ${MAX_BACKFILL}`);

    // El relleno reescribe las dos pestañas de una vez: van en orden ascendente
    // para que la hoja quede cronológica, como la leería cualquiera.
    await cliente.prepararPestanas(cx.token, cx.libroId, hojasDe(cx.titulos));
    for (const q of [...quotes].reverse()) {
        await ponerFila(cx, 'cotizaciones', String(q.folio), filaCotizacion(q as any, zona, origen));
    }
    for (const f of [...facturas].reverse()) {
        await ponerFila(cx, 'facturas', String(f.invoice_number), filaFactura(f as any, zona, origen));
    }
    await tocarSync(orgId, cx.id);
    return { cotizaciones: quotes.length, facturas: facturas.length };
}

const EVENTOS_COTIZACION = new Set([
    'quote.sent', 'quote.approved', 'quote.rejected', 'quote.expired', 'quote.paid',
    'quote.updated', 'payment.partial',
]);
const EVENTOS_FACTURA = new Set([
    'invoice.finalized', 'invoice.sent', 'invoice.paid', 'invoice.voided',
    'invoice.overdue', 'invoice.marked_uncollectible',
]);

/**
 * Lo que dispara el evento de dominio. Nunca lanza: que la hoja de alguien esté
 * llena, sin permiso o caída no puede tumbar la venta que la produjo.
 */
export async function onAbonoFactura(orgId: string, docId: string): Promise<void> {
    try {
        await sincronizarFactura(orgId, docId);
    } catch (err) {
        log.error('no se pudo preparar la fila de la hoja', { route: 'hojas', orgId, type: 'abono', err });
    }
}

export async function onDomainEventHoja(orgId: string, type: string, objectId: string | null): Promise<void> {
    if (!objectId) return;
    const esCotizacion = EVENTOS_COTIZACION.has(type);
    if (!esCotizacion && !EVENTOS_FACTURA.has(type)) return;
    try {
        if (esCotizacion) await sincronizarCotizacion(orgId, objectId);
        else await sincronizarFactura(orgId, objectId);
    } catch (err) {
        // difundir() ya aísla el fallo de cada proveedor; esto solo atrapa lo
        // que pueda romperse antes, al leer el documento.
        log.error('no se pudo preparar la fila de la hoja', { route: 'hojas', orgId, type, err });
    }
}

/** Para la tarjeta de Ajustes: qué proveedores tienen app detrás. */
export function proveedorDisponible(proveedor: ProveedorHoja): boolean {
    return Boolean(credencialesHoja(proveedor));
}

export const COLUMNAS_POR_PESTANA = CABECERAS;

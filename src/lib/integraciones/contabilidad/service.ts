// Cord → contabilidad. Una factura de Cord pasa una sola vez a los libros.
//
// Lo que sostiene el contrato:
//
//  - **La idempotencia es el vínculo, no un `if`.** `integracion_vinculos` con
//    `objeto = 'invoice'` es la llave: si ya existe, no se vuelve a contabilizar.
//    Una factura duplicada en la contabilidad de alguien es un problema que se
//    arregla a mano, con su contador.
//  - **Solo viajan facturas DEFINITIVAS de Cord.** Un borrador no tiene folio ni
//    existe para el negocio, y QuickBooks no sabe de borradores: lo que se crea
//    ahí ya queda asentado.
//  - **El refresh token de Xero es de un solo uso.** Cada renovación trae uno
//    nuevo y hay que guardarlo; conservar el viejo mata la conexión en la
//    siguiente hora.

import { sql, withOrgTx } from '../../db';
import { log } from '../../log';
import { decryptSecret, encryptRequiredSecret } from '../../crypto-secret';
import { ProveedorError } from '../proveedor-http';
import { esProveedorConta, type ProveedorConta } from './config';
import { qboAsegurarCliente, qboCrearFactura, qboRefresh } from './qbo';
import { xeroAsegurarContacto, xeroCrearFactura, xeroRefresh, xeroTenant } from './xero';
import type { ContaCliente, FacturaConta, LineaConta, TokensConta } from './tipos';

export interface ConexionConta {
    id: string;
    proveedor: ProveedorConta;
    token: string;
    /** realmId en QuickBooks, tenantId en Xero. */
    cuenta: string;
    cuentaNombre: string | null;
    ultimaSync: string | null;
    estado: string;
}

export async function leerConexionConta(orgId: string, proveedor: ProveedorConta): Promise<ConexionConta | null> {
    const [[row]] = await withOrgTx(orgId, sql`
        select id, proveedor, estado, cuenta_externa, cuenta_nombre, ultima_sync_at,
               access_token_enc, access_expires_at, refresh_token_enc
          from integracion_conexiones
         where org_id = ${orgId} and proveedor = ${proveedor} and estado <> 'desconectada'
         limit 1`);
    if (!row) return null;

    const vence = row.access_expires_at ? new Date(row.access_expires_at as string).getTime() : 0;
    let token = row.access_token_enc ? decryptSecret(row.access_token_enc as string) : '';

    if (!token || vence < Date.now() + 60_000) {
        const refresh = row.refresh_token_enc ? decryptSecret(row.refresh_token_enc as string) : '';
        if (!refresh) {
            await marcarError(orgId, proveedor, 'auth');
            return null;
        }
        const frescos = proveedor === 'quickbooks' ? await qboRefresh(refresh) : await xeroRefresh(refresh);
        token = frescos.accessToken;
        await guardarTokens(orgId, row.id as string, frescos, refresh);
    }

    return {
        id: row.id as string,
        proveedor,
        token,
        cuenta: String(row.cuenta_externa ?? ''),
        cuentaNombre: (row.cuenta_nombre as string) ?? null,
        ultimaSync: row.ultima_sync_at ? new Date(row.ultima_sync_at as string).toISOString() : null,
        estado: String(row.estado ?? 'activa'),
    };
}

async function guardarTokens(orgId: string, conexionId: string, t: TokensConta, refreshPrevio: string): Promise<void> {
    const refresh = t.refreshToken || refreshPrevio;
    await withOrgTx(orgId, sql`
        update integracion_conexiones
           set access_token_enc = ${encryptRequiredSecret(t.accessToken)},
               access_expires_at = now() + (${Math.max(60, t.expiresIn)} * interval '1 second'),
               refresh_token_enc = ${encryptRequiredSecret(refresh)},
               estado = 'activa', ultimo_error = null, ultimo_error_at = null, updated_at = now()
         where id = ${conexionId} and org_id = ${orgId}`);
}

async function marcarError(orgId: string, proveedor: ProveedorConta, motivo: string): Promise<void> {
    await withOrgTx(orgId, sql`
        update integracion_conexiones
           set estado = 'error', ultimo_error = ${motivo.slice(0, 500)}, ultimo_error_at = now(), updated_at = now()
         where org_id = ${orgId} and proveedor = ${proveedor} and estado <> 'desconectada'`);
}

export interface EstadoConta {
    proveedor: ProveedorConta;
    cuenta: string;
    cuentaNombre: string | null;
    ultimaSync: string | null;
    estado: string;
}

/** Para la tarjeta de Ajustes: no renueva tokens ni llama al proveedor. */
export async function estadoConta(orgId: string, proveedor: ProveedorConta): Promise<EstadoConta | null> {
    const [[row]] = await withOrgTx(orgId, sql`
        select proveedor, estado, cuenta_externa, cuenta_nombre, ultima_sync_at
          from integracion_conexiones
         where org_id = ${orgId} and proveedor = ${proveedor} and estado <> 'desconectada'
         limit 1`);
    if (!row || !esProveedorConta(row.proveedor)) return null;
    return {
        proveedor: row.proveedor,
        cuenta: String(row.cuenta_externa ?? ''),
        cuentaNombre: (row.cuenta_nombre as string) ?? null,
        ultimaSync: row.ultima_sync_at ? new Date(row.ultima_sync_at as string).toISOString() : null,
        estado: String(row.estado ?? 'activa'),
    };
}

export async function conectarConta(
    orgId: string, userId: string, proveedor: ProveedorConta, tokens: TokensConta,
    cuenta: string, cuentaNombre: string | null, scopes: string[],
): Promise<void> {
    if (!tokens.refreshToken) throw new ProveedorError('auth', 'sin refresh');
    // Reconectar a OTRA empresa reutiliza la misma fila de conexión, y los
    // vínculos cuelgan de ella. Sin borrarlos, Cord creería que las facturas ya
    // enviadas a la empresa anterior (por ejemplo, la de pruebas) están en la
    // nueva, y nunca las mandaría. Reconectar a la MISMA empresa los conserva:
    // ahí son justo lo que impide duplicar.
    await withOrgTx(orgId, sql`
        delete from integracion_vinculos
         where org_id = ${orgId}
           and conexion_id in (
               select id from integracion_conexiones
                where org_id = ${orgId} and proveedor = ${proveedor}
                  and cuenta_externa <> ${cuenta})`);
    await withOrgTx(orgId, sql`
        insert into integracion_conexiones
            (org_id, proveedor, estado, cuenta_externa, cuenta_nombre, scopes,
             access_token_enc, access_expires_at, refresh_token_enc, conectada_por)
        values (${orgId}, ${proveedor}, 'activa', ${cuenta}, ${cuentaNombre}, ${scopes},
                ${encryptRequiredSecret(tokens.accessToken)},
                now() + (${Math.max(60, tokens.expiresIn)} * interval '1 second'),
                ${encryptRequiredSecret(tokens.refreshToken)}, ${userId})
        on conflict (org_id, proveedor) do update
           set estado = 'activa', cuenta_externa = excluded.cuenta_externa,
               cuenta_nombre = excluded.cuenta_nombre, scopes = excluded.scopes,
               access_token_enc = excluded.access_token_enc,
               access_expires_at = excluded.access_expires_at,
               refresh_token_enc = excluded.refresh_token_enc,
               ultimo_error = null, ultimo_error_at = null, updated_at = now()`);
}

export async function desconectarConta(orgId: string, proveedor: ProveedorConta): Promise<void> {
    await withOrgTx(orgId, sql`
        update integracion_conexiones
           set estado = 'desconectada', access_token_enc = null, refresh_token_enc = null,
               access_expires_at = null, updated_at = now()
         where org_id = ${orgId} and proveedor = ${proveedor}`);
}

export const TIPOS: Record<ProveedorConta, { cliente: string; factura: string }> = {
    quickbooks: { cliente: 'qbo_customer', factura: 'qbo_invoice' },
    xero: { cliente: 'xero_contact', factura: 'xero_invoice' },
};

/** El precio que se contabiliza es el negociado, con su descuento aplicado. */
export function lineasDe(items: Record<string, unknown>[]): LineaConta[] {
    return items.map((i) => {
        const negociado = Number(i.precio_negociado);
        const base = Number.isFinite(negociado) && i.precio_negociado !== null && i.precio_negociado !== undefined
            ? negociado
            : Number(i.precio_unitario) || 0;
        const descuento = Number(i.descuento_pct) || 0;
        const crudo = Math.max(0, (Number.isFinite(base) ? base : 0) * (1 - descuento / 100));
        const cantidad = Math.max(0, Number(i.cantidad) || 0);
        // El importe se calcula sobre el precio YA redondeado, no sobre el
        // crudo: si no, la línea no cuadra consigo misma (33.333 x 3 daría un
        // precio de 33.33 y un importe de 100.00) y el contador deja de confiar
        // en todo lo que mande Cord. La diferencia de centavos contra el total
        // de Cord es inherente a redondear, y es preferible a un renglón que se
        // contradice.
        const precio = Math.round(crudo * 100) / 100;
        return {
            descripcion: String(i.descripcion || 'Concepto'),
            cantidad,
            precio,
            importe: Math.round(precio * cantidad * 100) / 100,
        };
    });
}

/**
 * Las líneas TAL COMO quedaron en la factura, no como estaban en la cotización.
 *
 * `line_items_snapshot` es el snapshot al emitir, y existe en TODA factura —
 * venga o no de una cotización. Cord Invoicing emite facturas directas, con
 * `cotizacion_id` en nulo, y leer las líneas de la cotización las dejaba en
 * cero: se descartaban en silencio como "sin líneas" y jamás llegaban a la
 * contabilidad. Además es la fuente correcta aunque haya cotización, porque una
 * factura emitida no debe cambiar si alguien edita la cotización después.
 */
export function lineasDeSnapshot(snapshot: unknown): LineaConta[] {
    if (!Array.isArray(snapshot)) return [];
    return snapshot.map((l: Record<string, unknown>) => {
        const cantidad = Math.max(0, Number(l?.quantity) || 0);
        const crudo = Number(l?.unitPrice);
        // Mismo contrato que el otro camino: el importe se calcula sobre el
        // precio YA redondeado, para que la línea cuadre consigo misma.
        const precio = Math.round(Math.max(0, Number.isFinite(crudo) ? crudo : 0) * 100) / 100;
        return {
            descripcion: String(l?.description || 'Concepto'),
            cantidad,
            precio,
            importe: Math.round(precio * cantidad * 100) / 100,
        };
    });
}

const fechaISO = (valor: unknown, zona: string): string => {
    const d = valor ? new Date(String(valor)) : new Date();
    const real = Number.isNaN(d.getTime()) ? new Date() : d;
    try {
        return new Intl.DateTimeFormat('en-CA', { timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit' }).format(real);
    } catch {
        return real.toISOString().slice(0, 10);
    }
};

export interface ResultadoConta {
    ok: boolean;
    externoId?: string;
    motivo?: 'sin_conexion' | 'sin_factura' | 'ya_existe' | 'sin_lineas' | 'proveedor';
}

export async function contabilizarFactura(
    orgId: string, docId: string, proveedor: ProveedorConta,
): Promise<ResultadoConta> {
    const cx = await leerConexionConta(orgId, proveedor);
    if (!cx) return { ok: false, motivo: 'sin_conexion' };

    const [[doc]] = await withOrgTx(orgId, sql`
        select d.id, d.invoice_number, d.created_at, d.due_date, d.currency, d.cotizacion_id,
               d.line_items_snapshot,
               coalesce(cl.empresa, cq.empresa, '') as cliente_nombre,
               coalesce(cl.email, cq.email) as cliente_email,
               coalesce(cl.telefono, cq.telefono) as cliente_telefono,
               coalesce(d.cliente_id, c.cliente_id) as cliente_id,
               o.zona_horaria
          from documentos_fiscales d
          join orgs o on o.id = d.org_id
          left join cotizaciones c on c.id = d.cotizacion_id and c.org_id = d.org_id
          left join clientes cl on cl.id = d.cliente_id and cl.org_id = d.org_id
          left join clientes cq on cq.id = c.cliente_id and cq.org_id = d.org_id
         where d.org_id = ${orgId} and d.id = ${docId} and d.invoice_number is not null`);
    if (!doc) return { ok: false, motivo: 'sin_factura' };

    const [[yaEsta]] = await withOrgTx(orgId, sql`
        select externo_id from integracion_vinculos
         where conexion_id = ${cx.id} and org_id = ${orgId}
           and objeto = 'invoice' and local_id = ${docId}`);
    if (yaEsta) return { ok: false, motivo: 'ya_existe' };

    // El snapshot manda. La cotización solo se consulta si la factura no tiene
    // snapshot, que son las filas anteriores a que existiera.
    let lineas = lineasDeSnapshot(doc.line_items_snapshot);
    if (!lineas.length && doc.cotizacion_id) {
        const [items] = await withOrgTx(orgId, sql`
            select descripcion, cantidad, precio_unitario, precio_negociado, descuento_pct
              from cotizacion_items
             where cotizacion_id = ${doc.cotizacion_id}
             order by orden asc`);
        lineas = lineasDe(items as Record<string, unknown>[]);
    }
    if (!lineas.length) return { ok: false, motivo: 'sin_lineas' };

    const zona = String(doc.zona_horaria ?? 'America/Mexico_City');
    const cliente: ContaCliente = {
        nombre: String(doc.cliente_nombre || 'Cliente'),
        email: (doc.cliente_email as string) || null,
        telefono: (doc.cliente_telefono as string) || null,
    };
    const factura: FacturaConta = {
        folio: String(doc.invoice_number),
        fecha: fechaISO(doc.created_at, zona),
        vence: doc.due_date ? fechaISO(doc.due_date, zona) : null,
        moneda: String(doc.currency || 'MXN').toUpperCase(),
        lineas,
    };

    // El cliente se resuelve una vez y se recuerda: sin el vínculo, cada factura
    // crearía un cliente nuevo en la contabilidad con el mismo nombre.
    const tipos = TIPOS[proveedor];
    let clienteExterno: string | null = null;
    if (doc.cliente_id) {
        const [[v]] = await withOrgTx(orgId, sql`
            select externo_id from integracion_vinculos
             where conexion_id = ${cx.id} and org_id = ${orgId}
               and objeto = 'client' and local_id = ${doc.cliente_id} and externo_tipo = ${tipos.cliente}`);
        if (v?.externo_id) clienteExterno = String(v.externo_id);
    }
    if (!clienteExterno) {
        clienteExterno = proveedor === 'quickbooks'
            ? await qboAsegurarCliente(cx.token, cx.cuenta, cliente)
            : await xeroAsegurarContacto(cx.token, cx.cuenta, cliente);
        if (doc.cliente_id) {
            await withOrgTx(orgId, sql`
                insert into integracion_vinculos (org_id, conexion_id, objeto, local_id, externo_tipo, externo_id, sincronizado_at)
                values (${orgId}, ${cx.id}, 'client', ${doc.cliente_id}, ${tipos.cliente}, ${clienteExterno}, now())
                on conflict (conexion_id, objeto, local_id) do nothing`);
        }
    }

    const creada = proveedor === 'quickbooks'
        ? await qboCrearFactura(cx.token, cx.cuenta, clienteExterno, factura)
        : await xeroCrearFactura(cx.token, cx.cuenta, clienteExterno, factura);

    await withOrgTx(orgId,
        sql`insert into integracion_vinculos (org_id, conexion_id, objeto, local_id, externo_tipo, externo_id, sincronizado_at)
            values (${orgId}, ${cx.id}, 'invoice', ${docId}, ${tipos.factura}, ${creada.id}, now())
            on conflict (conexion_id, objeto, local_id) do nothing`,
        sql`update integracion_conexiones set ultima_sync_at = now(), updated_at = now()
             where id = ${cx.id} and org_id = ${orgId}`);
    return { ok: true, externoId: creada.id };
}

/**
 * Manda las facturas definitivas que todavía no están en la contabilidad. El
 * tope existe porque cada una son varias llamadas al proveedor, y porque una
 * cuenta con años de historia no debe volcarse entera de un clic.
 */
export async function contabilizarPendientes(
    orgId: string, proveedor: ProveedorConta, limite = 50,
): Promise<{ facturas: number }> {
    const cx = await leerConexionConta(orgId, proveedor);
    if (!cx) return { facturas: 0 };
    const [filas] = await withOrgTx(orgId, sql`
        select d.id
          from documentos_fiscales d
     left join integracion_vinculos v
            on v.local_id = d.id and v.org_id = d.org_id
           and v.conexion_id = ${cx.id} and v.objeto = 'invoice'
         where d.org_id = ${orgId} and d.invoice_number is not null and v.id is null
      order by d.created_at desc
         limit ${limite}`);

    let hechas = 0;
    const motivos: string[] = [];
    let primerFallo: unknown = null;
    for (const f of filas) {
        try {
            const r = await contabilizarFactura(orgId, String(f.id), proveedor);
            if (r.ok) hechas += 1;
            else motivos.push(r.motivo ?? 'desconocido');
        } catch (err) {
            // Una factura que revienta no puede llevarse las demás: antes, la
            // primera que fallaba abortaba el lote entero y las siguientes ni
            // se intentaban.
            motivos.push(err instanceof ProveedorError ? err.motivo : 'desconocido');
            primerFallo = primerFallo ?? err;
        }
    }
    // Un "0 enviadas" habiendo candidatas es un fallo SILENCIOSO: la pantalla
    // dice que todo salió bien y nadie sabe qué las descartó. Así se escondió
    // que las facturas sin cotización se iban por "sin líneas".
    if (filas.length && !hechas) {
        log.error('ninguna factura llegó a la contabilidad', {
            route: 'contabilidad', orgId, proveedor,
            candidatas: filas.length, motivos: [...new Set(motivos)],
            err: primerFallo ?? undefined,
        });
        // Si NINGUNA salió por un error, se propaga para que la pantalla lo
        // diga. Devolver cero en silencio es cómo se escondió el fallo de las
        // facturas sin cotización.
        if (primerFallo) throw primerFallo;
    }
    return { facturas: hechas };
}

/** Los proveedores de contabilidad conectados en esta organización. */
export async function contabilidadesConectadas(orgId: string): Promise<ProveedorConta[]> {
    const [rows] = await withOrgTx(orgId, sql`
        select proveedor from integracion_conexiones
         where org_id = ${orgId} and proveedor in ('quickbooks', 'xero') and estado = 'activa'`);
    return rows.map((r: any) => r.proveedor).filter(esProveedorConta);
}

// Solo cuando la factura ya es definitiva del lado de Cord. Lo que entra a los
// libros de alguien no se manda "por si acaso".
const EVENTOS = new Set(['invoice.finalized', 'invoice.sent']);

export async function onDomainEventConta(orgId: string, type: string, objectId: string | null): Promise<void> {
    if (!objectId || !EVENTOS.has(type)) return;
    let proveedores: ProveedorConta[];
    try {
        proveedores = await contabilidadesConectadas(orgId);
    } catch (err) {
        log.error('no se pudo leer la contabilidad conectada', { route: 'contabilidad', orgId, err });
        return;
    }
    for (const proveedor of proveedores) {
        try {
            await contabilizarFactura(orgId, objectId, proveedor);
        } catch (err) {
            const esDelProveedor = err instanceof ProveedorError;
            const motivo = esDelProveedor ? err.motivo : 'desconocido';
            if (motivo === 'auth' || motivo === 'permiso') await marcarError(orgId, proveedor, motivo).catch(() => null);
            log.error('no se pudo contabilizar la factura', {
                route: 'contabilidad', orgId, proveedor, motivo,
                // El detalle trae el código del proveedor y su id de traza: es
                // con lo que su soporte encuentra la llamada exacta. El error
                // crudo va aparte porque un fallo del CÓDIGO no trae ninguno de
                // los dos, y ahí es donde se investiga a ciegas.
                detalle: esDelProveedor ? err.detalle : undefined,
                err,
            });
        }
    }
}

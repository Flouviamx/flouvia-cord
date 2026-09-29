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
import { impuestoDe } from './impuestos';
import { ContaImpuestoError, type ContaCliente, type FacturaConta, type LineaConta, type MotivoImpuesto, type TokensConta } from './tipos';

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
    /** La última factura que no se asentó por su impuesto, con la tasa que faltó. */
    aviso: { motivo: MotivoImpuesto; tasa: number | null } | null;
}

const MOTIVOS_IMPUESTO = new Set<string>(['impuesto', 'retenciones', 'descuadre']);

export function avisoDe(ultimoError: unknown): EstadoConta['aviso'] {
    const [motivo, tasa] = String(ultimoError ?? '').split(':');
    if (!MOTIVOS_IMPUESTO.has(motivo)) return null;
    const n = Number(tasa);
    return { motivo: motivo as MotivoImpuesto, tasa: tasa && Number.isFinite(n) ? n : null };
}

/** Para la tarjeta de Ajustes: no renueva tokens ni llama al proveedor. */
export async function estadoConta(orgId: string, proveedor: ProveedorConta): Promise<EstadoConta | null> {
    const [[row]] = await withOrgTx(orgId, sql`
        select proveedor, estado, cuenta_externa, cuenta_nombre, ultima_sync_at, ultimo_error
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
        aviso: row.estado === 'activa' ? avisoDe(row.ultimo_error) : null,
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

const tasaValida = (v: unknown): number | null => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 && n < 1 ? n : null;
};
const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * El precio que se contabiliza es el negociado, con su descuento aplicado. Una
 * línea sin tasa propia es anterior al impuesto por línea y lleva la del documento.
 */
export function lineasDe(items: Record<string, unknown>[], tasaDocumento = 0): LineaConta[] {
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
        const importe = r2(precio * cantidad);
        const tasa = tasaValida(i.tax_rate) ?? tasaDocumento;
        return {
            descripcion: String(i.descripcion || 'Concepto'),
            cantidad,
            precio,
            importe,
            tasa,
            impuesto: r2(importe * tasa),
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
        const importe = r2(precio * cantidad);
        const tasa = tasaValida(l?.taxRate) ?? 0;
        // El impuesto de la línea es el que quedó en la factura, no uno recalculado.
        const guardado = Number(l?.taxAmount);
        return {
            descripcion: String(l?.description || 'Concepto'),
            cantidad,
            precio,
            importe,
            tasa,
            impuesto: Number.isFinite(guardado) && l?.taxAmount !== null ? r2(guardado) : r2(importe * tasa),
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
    motivo?: 'sin_conexion' | 'sin_factura' | 'ya_existe' | 'sin_lineas' | 'proveedor' | MotivoImpuesto;
    tasa?: number;
}

async function guardarAviso(orgId: string, conexionId: string, aviso: string | null): Promise<void> {
    await withOrgTx(orgId, aviso
        ? sql`update integracion_conexiones set ultimo_error = ${aviso}, ultimo_error_at = now(), updated_at = now()
               where id = ${conexionId} and org_id = ${orgId} and estado = 'activa'`
        : sql`update integracion_conexiones set ultimo_error = null, ultimo_error_at = null, updated_at = now()
               where id = ${conexionId} and org_id = ${orgId} and estado = 'activa'
                 and split_part(coalesce(ultimo_error, ''), ':', 1) in ('impuesto', 'retenciones', 'descuadre')`);
}

export async function contabilizarFactura(
    orgId: string, docId: string, proveedor: ProveedorConta,
): Promise<ResultadoConta> {
    const cx = await leerConexionConta(orgId, proveedor);
    if (!cx) return { ok: false, motivo: 'sin_conexion' };

    const [[doc]] = await withOrgTx(orgId, sql`
        select d.id, d.invoice_number, d.created_at, d.issued_at, d.due_date, d.currency, d.cotizacion_id,
               d.line_items_snapshot, d.subtotal, d.tax_total, d.retencion_total,
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
         where d.org_id = ${orgId} and d.id = ${docId} and d.invoice_number is not null
           and coalesce(d.lifecycle, '') not in ('draft', 'void') and coalesce(d.status, '') <> 'cancelled'`);
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
            select descripcion, cantidad, precio_unitario, precio_negociado, descuento_pct, tax_rate
              from cotizacion_items
             where cotizacion_id = ${doc.cotizacion_id}
             order by orden asc`);
        const subtotal = Number(doc.subtotal);
        const tasaDoc = subtotal > 0 ? Math.round((Number(doc.tax_total) || 0) / subtotal * 1e4) / 1e4 : 0;
        lineas = lineasDe(items as Record<string, unknown>[], tasaDoc);
    }
    if (!lineas.length) return { ok: false, motivo: 'sin_lineas' };

    // Ninguna de las dos contabilidades sabe de retenciones en una factura de
    // venta: asentarla sin ellas inflaría la cuenta por cobrar.
    if ((Number(doc.retencion_total) || 0) > 0) {
        await guardarAviso(orgId, cx.id, 'retenciones');
        return { ok: false, motivo: 'retenciones' };
    }

    const zona = String(doc.zona_horaria ?? 'America/Mexico_City');
    const cliente: ContaCliente = {
        nombre: String(doc.cliente_nombre || 'Cliente'),
        email: (doc.cliente_email as string) || null,
        telefono: (doc.cliente_telefono as string) || null,
    };
    const factura: FacturaConta = {
        folio: String(doc.invoice_number),
        // La fecha de la factura es la de emisión; created_at es la del borrador.
        fecha: fechaISO(doc.issued_at ?? doc.created_at, zona),
        vence: doc.due_date ? fechaISO(doc.due_date, zona) : null,
        moneda: String(doc.currency || 'MXN').toUpperCase(),
        lineas,
        impuestos: Number.isFinite(Number(doc.tax_total)) && doc.tax_total !== null ? r2(Number(doc.tax_total)) : impuestoDe(lineas),
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

    let creada: { id: string; numero: string | null; descuadre?: boolean };
    try {
        creada = proveedor === 'quickbooks'
            ? await qboCrearFactura(cx.token, cx.cuenta, clienteExterno, factura)
            : await xeroCrearFactura(cx.token, cx.cuenta, clienteExterno, factura);
    } catch (err) {
        if (!(err instanceof ContaImpuestoError)) throw err;
        await guardarAviso(orgId, cx.id, err.tasa === undefined ? err.motivo : `${err.motivo}:${err.tasa}`);
        return { ok: false, motivo: err.motivo, tasa: err.tasa };
    }
    if (creada.descuadre) {
        // No se pudo borrar: se vincula igual para no asentarla dos veces, y se avisa.
        log.error('la factura quedó en la contabilidad con otro total', {
            route: 'contabilidad', orgId, proveedor, docId, externoId: creada.id,
        });
        await guardarAviso(orgId, cx.id, 'descuadre');
    }

    await withOrgTx(orgId,
        sql`insert into integracion_vinculos (org_id, conexion_id, objeto, local_id, externo_tipo, externo_id, sincronizado_at)
            values (${orgId}, ${cx.id}, 'invoice', ${docId}, ${tipos.factura}, ${creada.id}, now())
            on conflict (conexion_id, objeto, local_id) do nothing`,
        sql`update integracion_conexiones set ultima_sync_at = now(), updated_at = now()
             where id = ${cx.id} and org_id = ${orgId}`);
    if (!creada.descuadre) await guardarAviso(orgId, cx.id, null);
    return { ok: true, externoId: creada.id };
}

/**
 * Manda las facturas definitivas que todavía no están en la contabilidad. El
 * tope existe porque cada una son varias llamadas al proveedor, y porque una
 * cuenta con años de historia no debe volcarse entera de un clic.
 */
export interface ResultadoPendientes {
    facturas: number;
    /** Las que no se asentaron por su impuesto, con la primera tasa que faltó. */
    omitidas: number;
    aviso: EstadoConta['aviso'];
}

export async function contabilizarPendientes(
    orgId: string, proveedor: ProveedorConta, limite = 50,
): Promise<ResultadoPendientes> {
    const cx = await leerConexionConta(orgId, proveedor);
    if (!cx) return { facturas: 0, omitidas: 0, aviso: null };
    const [filas] = await withOrgTx(orgId, sql`
        select d.id
          from documentos_fiscales d
     left join integracion_vinculos v
            on v.local_id = d.id and v.org_id = d.org_id
           and v.conexion_id = ${cx.id} and v.objeto = 'invoice'
         where d.org_id = ${orgId} and d.invoice_number is not null and v.id is null
           and coalesce(d.lifecycle, '') not in ('draft', 'void') and coalesce(d.status, '') <> 'cancelled'
      order by d.created_at desc
         limit ${limite}`);

    let hechas = 0;
    let omitidas = 0;
    let aviso: EstadoConta['aviso'] = null;
    const motivos: string[] = [];
    let primerFallo: unknown = null;
    for (const f of filas) {
        try {
            const r = await contabilizarFactura(orgId, String(f.id), proveedor);
            if (r.ok) hechas += 1;
            else motivos.push(r.motivo ?? 'desconocido');
            if (!r.ok && r.motivo && MOTIVOS_IMPUESTO.has(r.motivo)) {
                omitidas += 1;
                aviso = aviso ?? { motivo: r.motivo as MotivoImpuesto, tasa: r.tasa ?? null };
            }
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
    // La última que se asentó limpia el aviso; si alguna quedó fuera, el aviso es el suyo.
    if (aviso) await guardarAviso(orgId, cx.id, aviso.tasa === null ? aviso.motivo : `${aviso.motivo}:${aviso.tasa}`);
    return { facturas: hechas, omitidas, aviso };
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

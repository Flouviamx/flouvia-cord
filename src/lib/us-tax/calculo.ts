// Sales tax de EE. UU. por dirección: la mitad que toca base y proveedor.
//
// Flujo de un documento (cotización o factura) de un negocio de EE. UU. con la
// preferencia encendida y un cliente en EE. UU.:
//
//   1. `prepareUsTaxForDocument()` saca con el motor único las bases de cada
//      línea (ya con el descuento de documento repartido), arma la huella y
//      reusa un cálculo guardado de las últimas 24 h con esa misma huella —
//      el que pidió el editor para su vista previa— o hace uno nuevo en la
//      cuenta de cobros del negocio. Devuelve el id del cálculo GUARDADO.
//   2. El llamador pasa ese id a `taxCatalogFor(orgId, { usTaxCalculoId })`,
//      que lee la fila y da a cada línea su tasa efectiva y su desglose. La
//      tasa nunca viene del navegador.
//   3. Al emitir la factura (o al cobrar la cotización, vía el cron
//      `/api/cron/us-tax`), `recordUsTaxTransaction()` registra la venta para
//      la declaración del negocio, una sola vez por cálculo.
//
// Cualquier hueco —sin cuenta de cobros, sin domicilio, sin estados, dirección
// del cliente incompleta o no ubicable, proveedor caído— es `UsTaxError`: el
// documento no se guarda y dice qué falta (regla 22). La excepción legítima es
// un estado donde el negocio NO está registrado: 0 % con su motivo, y el
// documento imprime "sin obligación de recaudar en <estado>".

import { createHash } from 'node:crypto';
import { sql, withOrgTx, withSystemTx } from '../db';
import { checkEntitlement } from '../org-entitlements';
import { strictRateLimit } from '../ratelimit';
import { currentLocale } from '../context';
import { log } from '../log';
import { calculateDocumentTotals, type DescuentoInput, type InvoiceItemInput } from '../../../packages/elements/src/engine';
import { currencyDecimals, normalizeCurrency, toMinorUnits } from '../currency';
import { taxRoundingFor, taxRoundingGuardado } from '../countries';
import { descuentoDesdeJson, descuentoParaMotor } from '../descuentos';
import {
    US_TAX_DEFAULT_CODE, US_TAX_MAX_LINEAS, US_TAX_REUSO_MS, UsTaxError, huellaTexto, isUsTaxCode,
    lineasFromStripe, normalizeUsAddress, usAddressFaltante, usTaxApplies,
    type UsAddress, type UsTaxLinea,
} from './core';
import { createUsTaxCalculation, createUsTaxTransaction, reverseUsTaxTransaction } from './stripe';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export interface UsTaxConfig {
    country: string;
    /** La preferencia guardada (Ajustes › Impuestos). */
    auto: boolean;
    account: string | null;
    origen: UsAddress | null;
    taxCode: string;
    /** Última sincronización con la cuenta de cobros. */
    estado: { status: 'active' | 'pending'; faltantes: string[]; sincronizado_at?: string | null } | null;
    registros: { id: string; estado: string; stripeRegistrationId: string | null }[];
}

export async function loadUsTaxConfig(orgId: string): Promise<UsTaxConfig> {
    const [orgRows, regRows] = await withOrgTx(orgId,
        sql`select country_code, us_tax_auto, us_tax_origen, us_tax_codigo, us_tax_estado, stripe_account_id
              from orgs where id = ${orgId}`,
        sql`select id, estado, stripe_registration_id from us_tax_registros
             where org_id = ${orgId} and baja_at is null order by estado`,
    );
    const o = orgRows[0] ?? {};
    const estado = o.us_tax_estado && typeof o.us_tax_estado === 'object' ? o.us_tax_estado : null;
    return {
        country: String(o.country_code || '').toUpperCase(),
        auto: o.us_tax_auto === true,
        account: (o.stripe_account_id as string) || null,
        origen: normalizeUsAddress(o.us_tax_origen),
        taxCode: isUsTaxCode(o.us_tax_codigo) ? o.us_tax_codigo : US_TAX_DEFAULT_CODE,
        estado: estado ? {
            status: estado.status === 'active' ? 'active' : 'pending',
            faltantes: Array.isArray(estado.faltantes) ? estado.faltantes.map(String) : [],
            sincronizado_at: estado.sincronizado_at ?? null,
        } : null,
        registros: regRows.map((r: any) => ({
            id: String(r.id), estado: String(r.estado), stripeRegistrationId: (r.stripe_registration_id as string) || null,
        })),
    };
}

/** ¿Puede esta organización usar el cálculo hoy? (plan efectivo, regla 17) */
export async function usTaxEntitled(orgId: string): Promise<boolean> {
    try {
        return (await checkEntitlement(orgId, 'us_sales_tax')).ok;
    } catch {
        // Sin poder demostrar el plan, la capacidad pagada no corre.
        return false;
    }
}

/** El primer hueco de configuración del negocio, o null si está listo. */
export function usTaxConfigProblem(cfg: UsTaxConfig): 'cuenta_cobros' | 'origen_incompleto' | 'sin_registros' | 'configuracion_pendiente' | null {
    if (!cfg.account) return 'cuenta_cobros';
    if (usAddressFaltante(cfg.origen, true)) return 'origen_incompleto';
    if (!cfg.registros.length) return 'sin_registros';
    if (cfg.estado?.status !== 'active') return 'configuracion_pendiente';
    return null;
}

interface ClienteFiscal {
    pais: string | null;
    destino: UsAddress | null;
    exento: boolean;
    certificado: string | null;
    certificadoVencido: boolean;
}

async function clienteFiscal(orgId: string, clienteId: string): Promise<ClienteFiscal | null> {
    if (!UUID_RE.test(clienteId)) return null;
    const [rows] = await withOrgTx(orgId, sql`
        select country_code, direccion_line1, direccion_line2, ciudad, region, cp_fiscal, tax_exempt, tax_exempt_cert
          from clientes where id = ${clienteId} and org_id = ${orgId}`);
    const c = rows[0];
    if (!c) return null;
    const cert = c.tax_exempt_cert && typeof c.tax_exempt_cert === 'object' ? c.tax_exempt_cert : null;
    const numero = typeof cert?.numero === 'string' ? cert.numero.trim() : '';
    const vence = typeof cert?.vence === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(cert.vence) ? cert.vence : null;
    return {
        pais: (c.country_code as string) || null,
        destino: normalizeUsAddress({
            line1: c.direccion_line1, line2: c.direccion_line2, city: c.ciudad, state: c.region, postal_code: c.cp_fiscal,
        }),
        exento: c.tax_exempt === true,
        certificado: numero || null,
        certificadoVencido: !!vence && vence < new Date().toISOString().slice(0, 10),
    };
}

export interface PrepareUsTaxInput {
    clienteId: string | null | undefined;
    currency: string;
    ivaIncluido: boolean;
    descuento?: DescuentoInput | null;
    /** Líneas en la forma del motor; su `tax_rate` se ignora. */
    items: InvoiceItemInput[];
    /** El cálculo que pidió el editor para su vista previa (no es de confianza). */
    calculoId?: unknown;
    /** Un documento que se ENVÍA necesita cliente: sin destino no hay tasa. */
    requireClient?: boolean;
    /**
     * La venta a la que pertenece el documento, si ya existe
     * ('cotizacion:<id>' o 'documento:<id>'). Un documento nuevo no la tiene
     * todavía: la reclama con `claimUsTaxCalculo()` después de insertarse.
     */
    venta?: string | null;
}

/** Clave de venta de un documento: una factura que salió de una cotización es la venta de la cotización. */
export function usTaxVentaKey(doc: { cotizacionId?: string | null; documentoId?: string | null }): string | null {
    if (doc.cotizacionId) return `cotizacion:${doc.cotizacionId}`;
    if (doc.documentoId) return `documento:${doc.documentoId}`;
    return null;
}

/**
 * El documento recién guardado reclama su cálculo. Un cálculo ya reclamado por
 * OTRA venta no se le quita: el registro de la transacción lo detecta y
 * recalcula para esta (dos documentos iguales del mismo día son dos ventas).
 */
export async function claimUsTaxCalculo(orgId: string, calculoId: string | null | undefined, venta: string | null): Promise<void> {
    if (!calculoId || !venta || !UUID_RE.test(calculoId)) return;
    await withOrgTx(orgId, sql`
        update us_tax_calculos set venta = ${venta}
         where org_id = ${orgId} and id = ${calculoId}::uuid and venta is null`);
}

/**
 * Asegura un cálculo guardado para este documento. `null` = no aplica (otro
 * país, preferencia apagada, plan sin la capacidad o borrador sin cliente):
 * el documento sigue con el catálogo de siempre.
 */
export async function prepareUsTaxForDocument(orgId: string, input: PrepareUsTaxInput): Promise<{ calculoId: string } | null> {
    const locale = currentLocale();
    const cfg = await loadUsTaxConfig(orgId);
    if (cfg.country !== 'US' || !cfg.auto) return null;
    // Un plan que ya no la incluye conserva la preferencia guardada, pero la
    // capacidad queda inoperante hasta recuperarlo (regla 17): el documento
    // usa el catálogo manual, como antes de encenderla.
    if (!(await usTaxEntitled(orgId))) return null;

    if (!input.clienteId) {
        if (input.requireClient) throw new UsTaxError('direccion_cliente', locale);
        return null;
    }
    const cliente = await clienteFiscal(orgId, String(input.clienteId));
    if (!cliente) return null;
    if (!usTaxApplies({ orgCountry: cfg.country, auto: true, clienteCountry: cliente.pais })) return null;

    const problema = usTaxConfigProblem(cfg);
    if (problema) throw new UsTaxError(problema, locale);
    if (usAddressFaltante(cliente.destino)) throw new UsTaxError('direccion_cliente', locale);
    if (cliente.exento && (!cliente.certificado || cliente.certificadoVencido)) throw new UsTaxError('certificado', locale);
    if (input.items.length > US_TAX_MAX_LINEAS) throw new UsTaxError('demasiadas_lineas', locale);

    const currency = normalizeCurrency(input.currency);
    const montos = basesMinor(input.items, currency, input.ivaIncluido, input.descuento ?? null);
    const params = {
        currency,
        destino: cliente.destino!,
        exento: cliente.exento,
        incluido: input.ivaIncluido,
        taxCode: cfg.taxCode,
        montos,
    };
    const huella = sha256(huellaTexto(params));

    // Reuso: el cálculo de la vista previa (o el de un reintento) con esta
    // misma huella, reciente y de esta organización. Si el navegador mandó un
    // id que no coincide, simplemente no se usa.
    const pedido = typeof input.calculoId === 'string' && UUID_RE.test(input.calculoId) ? input.calculoId : null;
    const venta = input.venta ?? null;
    const desde = new Date(Date.now() - US_TAX_REUSO_MS).toISOString();
    // Solo un cálculo libre (la vista previa) o uno de ESTA misma venta: el de
    // otro documento idéntico es otra venta y no se comparte.
    const [previos] = await withOrgTx(orgId, sql`
        select id from us_tax_calculos
         where org_id = ${orgId} and huella = ${huella} and stripe_account_id = ${cfg.account}
           and created_at > ${desde}::timestamptz and expires_at > now()
           and transaccion_ref is null
           and (venta is null or venta = ${venta})
         order by (id = ${pedido}::uuid) desc nulls last, created_at desc
         limit 1`);
    if (previos[0]) return { calculoId: String(previos[0].id) };

    const fila = await calcularYGuardar(orgId, {
        account: cfg.account!, params, huella, clienteId: String(input.clienteId),
        registrados: new Set(cfg.registros.map((r) => r.estado)), certificado: cliente.certificado, locale,
        idempotencyScope: venta ?? 'nueva', venta,
    });
    return { calculoId: fila.id };
}

/** Bases de cada línea en unidades mínimas (con impuesto si `incluido`). */
function basesMinor(items: InvoiceItemInput[], currency: string, incluido: boolean, descuento: DescuentoInput | null): number[] {
    // Con tasa 0, la base que da el motor es el importe neto de la línea —ya
    // con el descuento de documento repartido— en los términos capturados:
    // sin impuesto, o con él si los precios lo incluyen. Es el mismo reparto
    // que el motor hará después con la tasa calculada.
    // `taxRounding` es la regla de EE. UU. (por línea, como el proveedor):
    // con tasa 0 no cambia nada, pero la base sale del mismo motor y con la
    // misma regla que el documento.
    const t = calculateDocumentTotals(items.map((it) => ({ ...it, tax_rate: 0 })), {
        ivaIncluido: incluido, roundLines: currencyDecimals(currency), taxRounding: taxRoundingFor('US'), descuento,
    });
    return t.lineas.map((l) => toMinorUnits(l.base, currency));
}

interface CalcParams {
    currency: string;
    destino: UsAddress;
    exento: boolean;
    incluido: boolean;
    taxCode: string;
    montos: number[];
}

/**
 * Pide el cálculo en la cuenta de cobros y lo guarda. Cada llamada le cuesta a
 * Cord, así que el límite por organización vive AQUÍ, donde se gasta, y no en
 * cada ruta que llega a este punto (editor, API, MCP, recurrencias).
 */
async function calcularYGuardar(orgId: string, input: {
    account: string; params: CalcParams; huella: string; clienteId: string | null;
    registrados: Set<string>; certificado: string | null; locale: string;
    /** Parte de la clave de idempotencia: la venta, o el cálculo que se concilia. */
    idempotencyScope: string; venta?: string | null;
}): Promise<{ id: string; lineas: UsTaxLinea[]; stripeCalculationId: string }> {
    const { account, params, huella, locale } = input;
    const [porMinuto, porHora] = await Promise.all([
        strictRateLimit(`us-tax-calc:m:${orgId}`, 30, 60),
        strictRateLimit(`us-tax-calc:h:${orgId}`, 300, 3600),
    ]);
    if (!porMinuto.ok || !porHora.ok) {
        throw new UsTaxError(porMinuto.unavailable || porHora.unavailable ? 'no_disponible' : 'limite', locale);
    }

    const calc = await createUsTaxCalculation(account, {
        ...params,
        // Determinística: la misma venta con los mismos datos, dentro de la
        // ventana del proveedor, devuelve el MISMO cálculo en vez de cobrar
        // otro (la huella cubre todo lo que se manda).
        idempotencyKey: `us-tax-calc:${orgId}:${input.idempotencyScope}:${huella}`,
    }, locale);

    const decimals = currencyDecimals(params.currency);
    const stripeLines = Array.isArray(calc?.line_items?.data) ? calc.line_items.data : [];
    if (calc?.line_items?.has_more) throw new UsTaxError('demasiadas_lineas', locale);
    const lineas = lineasFromStripe(stripeLines, params.montos, {
        estado: params.destino.state, decimals, incluido: params.incluido, certificado: input.certificado,
    });
    // Un 0 % "porque no recaudas aquí" en un estado donde el negocio SÍ dijo
    // que recauda es una configuración rota, no un dato: no se congela.
    if (lineas.some((l) => l.desglose?.motivo === 'sin_registro' && input.registrados.has(l.desglose.estado))) {
        throw new UsTaxError('registro_desincronizado', locale);
    }
    const taxTotal = lineas.reduce((s, l) => s + l.impuesto, 0);
    const amountTotal = Math.round(Number(calc?.amount_total) || 0);
    const expires = Number(calc?.expires_at) > 0
        ? new Date(Number(calc.expires_at) * 1000).toISOString()
        : new Date(Date.now() + 89 * 24 * 60 * 60 * 1000).toISOString();

    const [rows] = await withOrgTx(orgId, sql`
        insert into us_tax_calculos
            (org_id, stripe_calculation_id, stripe_account_id, huella, currency, cliente_id, destino, exento, incluido,
             lineas, amount_total, tax_total, expires_at, venta)
        values
            (${orgId}, ${String(calc.id)}, ${account}, ${huella}, ${params.currency}, ${input.clienteId},
             ${JSON.stringify(params.destino)}::jsonb, ${params.exento}, ${params.incluido},
             ${JSON.stringify(lineas)}::jsonb, ${amountTotal}, ${taxTotal}, ${expires}::timestamptz, ${input.venta ?? null})
        on conflict (org_id, stripe_calculation_id) do update set huella = us_tax_calculos.huella
        returning id, lineas`);
    return { id: String(rows[0].id), lineas: rows[0].lineas as UsTaxLinea[], stripeCalculationId: String(calc.id) };
}

/** Líneas de un cálculo guardado (vista previa del editor). */
export async function usTaxCalculoLineas(orgId: string, calculoId: string): Promise<UsTaxLinea[] | null> {
    if (!UUID_RE.test(calculoId)) return null;
    const [rows] = await withOrgTx(orgId, sql`
        select lineas from us_tax_calculos where org_id = ${orgId} and id = ${calculoId}::uuid and expires_at > now()`);
    return rows[0] ? (rows[0].lineas as UsTaxLinea[]) : null;
}

// ── Registro de la venta (Tax Transaction) ──────────────────────────────────

export type UsTaxTxResultado = 'registrada' | 'ya_registrada' | 'no_aplica' | 'no_concilia' | 'error';

interface DocParaTx {
    calculoId: string;
    /** La venta del documento: la cotización de la que salió, o él mismo. */
    venta: string;
    currency: string;
    /** Por línea del documento: base e impuesto ya redondeados, en la divisa. */
    lineas: { base: number; impuesto: number }[];
}

async function documentoParaTx(orgId: string, target: { documentoId?: string; cotizacionId?: string }): Promise<DocParaTx | null> {
    if (target.documentoId) {
        if (!UUID_RE.test(target.documentoId)) return null;
        const [rows] = await withOrgTx(orgId, sql`
            select us_tax_calculo_id, cotizacion_id, currency, line_items_snapshot from documentos_fiscales
             where org_id = ${orgId} and id = ${target.documentoId} and status = 'issued'
               and lifecycle not in ('draft', 'void') and credit_note_of is null`);
        const d = rows[0];
        if (!d?.us_tax_calculo_id) return null;
        const lineas = (Array.isArray(d.line_items_snapshot) ? d.line_items_snapshot : [])
            .map((l: any) => ({ base: Number(l.subtotal) || 0, impuesto: Number(l.taxAmount) || 0 }));
        return {
            calculoId: String(d.us_tax_calculo_id),
            venta: usTaxVentaKey({ cotizacionId: d.cotizacion_id as string | null, documentoId: target.documentoId })!,
            currency: normalizeCurrency(d.currency as string), lineas,
        };
    }
    if (!target.cotizacionId || !UUID_RE.test(target.cotizacionId)) return null;
    const [head, items] = await withOrgTx(orgId,
        sql`select us_tax_calculo_id, base_currency, iva_incluido, descuento_def, tax_rounding from cotizaciones
             where org_id = ${orgId} and id = ${target.cotizacionId} and (status = 'paid' or paid_at is not null)`,
        sql`select ci.cantidad, ci.precio_unitario, ci.precio_negociado, ci.tax_rate, ci.aprobado
              from cotizacion_items ci join cotizaciones c on c.id = ci.cotizacion_id
             where ci.cotizacion_id = ${target.cotizacionId} and c.org_id = ${orgId} order by ci.orden asc`,
    );
    const q = head[0];
    if (!q?.us_tax_calculo_id) return null;
    const currency = normalizeCurrency(q.base_currency as string);
    const t = calculateDocumentTotals(
        items.filter((it: any) => it.aprobado !== false).map((it: any) => ({
            cantidad: it.cantidad, precio_unitario: it.precio_unitario, precio_negociado: it.precio_negociado,
            tax_rate: Number(it.tax_rate) || 0,
        })),
        {
            // La regla con la que se GUARDARON los totales (cotizaciones.tax_rounding).
            ivaIncluido: !!q.iva_incluido, roundLines: currencyDecimals(currency), taxRounding: taxRoundingGuardado(q.tax_rounding),
            descuento: descuentoParaMotor(descuentoDesdeJson(q.descuento_def)),
        },
    );
    return {
        calculoId: String(q.us_tax_calculo_id), venta: `cotizacion:${target.cotizacionId}`,
        currency, lineas: t.lineas.map((l) => ({ base: l.base, impuesto: l.impuesto })),
    };
}

const iguales = (a: number[], b: number[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * Registra la venta del documento para la declaración del negocio, UNA vez por
 * cálculo. Si el documento ya no es exactamente lo que se calculó (aprobación
 * parcial, un cálculo de más de 90 días, una factura reemitida después de
 * anular la anterior), se recalcula con lo que de verdad se cobró y solo se
 * registra si el impuesto coincide al centavo: el total legal es el que el
 * documento cobró, y la declaración no puede decir otro. Si no coincide, queda
 * `no_concilia` para revisión — nunca se reporta una cifra distinta.
 */
export async function recordUsTaxTransaction(
    orgId: string,
    target: { documentoId?: string; cotizacionId?: string },
): Promise<UsTaxTxResultado> {
    const locale = currentLocale();
    const doc = await documentoParaTx(orgId, target);
    if (!doc) return 'no_aplica';
    const [calcRows] = await withOrgTx(orgId, sql`
        select id, stripe_calculation_id, stripe_account_id, currency, destino, exento, incluido, lineas,
               expires_at, transaccion_id, reverso_id, transaccion_error, venta
          from us_tax_calculos where org_id = ${orgId} and id = ${doc.calculoId}::uuid`);
    const calc = calcRows[0];
    if (!calc) return 'no_aplica';
    // El cálculo es de OTRA venta (dos documentos idénticos del mismo día que
    // compartieron vista previa): esta venta se registra con su propio cálculo.
    const deOtraVenta = !!calc.venta && calc.venta !== doc.venta;
    if (!calc.venta) await claimUsTaxCalculo(orgId, String(calc.id), doc.venta);
    if (!deOtraVenta && calc.transaccion_id && !calc.reverso_id) return 'ya_registrada';

    const decimals = currencyDecimals(doc.currency);
    const f = 10 ** decimals;
    const incluido = calc.incluido === true;
    const montos = doc.lineas.map((l) => Math.round((incluido ? l.base + l.impuesto : l.base) * f));
    const impuestos = doc.lineas.map((l) => Math.round(l.impuesto * f));
    const guardadas = (Array.isArray(calc.lineas) ? calc.lineas : []) as UsTaxLinea[];
    const vigente = new Date(calc.expires_at as string).getTime() > Date.now() + 60_000;
    const coincide = !deOtraVenta && !calc.reverso_id && vigente
        && iguales(montos, guardadas.map((l) => Number(l.monto)))
        && iguales(impuestos, guardadas.map((l) => Number(l.impuesto)));

    let objetivo = { id: String(calc.id), stripeCalculationId: String(calc.stripe_calculation_id) };
    if (!coincide) {
        const destino = normalizeUsAddress(calc.destino);
        if (!destino) return 'no_concilia';
        const params: CalcParams = {
            currency: doc.currency, destino, exento: calc.exento === true, incluido,
            taxCode: await taxCodeDe(orgId), montos,
        };
        let nuevo;
        try {
            nuevo = await calcularYGuardar(orgId, {
                account: String(calc.stripe_account_id), params, huella: sha256(huellaTexto(params)),
                clienteId: null, registrados: new Set(), certificado: null, locale,
                idempotencyScope: `concilia:${calc.id}:${doc.venta}`, venta: doc.venta,
            });
        } catch (error) {
            const code = error instanceof UsTaxError ? error.code : 'no_disponible';
            await withOrgTx(orgId, sql`update us_tax_calculos set transaccion_error = ${code} where id = ${calc.id} and org_id = ${orgId}`);
            return 'error';
        }
        if (!iguales(impuestos, nuevo.lineas.map((l) => Number(l.impuesto)))) {
            log.warn('us-tax: el impuesto cobrado no coincide con el recalculado; la venta no se registra', { orgId, route: 'us-tax/transaction' });
            await withOrgTx(orgId, sql`update us_tax_calculos set transaccion_error = 'no_concilia' where id = ${calc.id} and org_id = ${orgId}`);
            return 'no_concilia';
        }
        objetivo = { id: nuevo.id, stripeCalculationId: nuevo.stripeCalculationId };
        // El documento apunta al cálculo con el que de verdad se registró.
        if (target.documentoId) {
            await withOrgTx(orgId, sql`update documentos_fiscales set us_tax_calculo_id = ${nuevo.id}::uuid where id = ${target.documentoId} and org_id = ${orgId}`);
        } else if (target.cotizacionId) {
            await withOrgTx(orgId, sql`update cotizaciones set us_tax_calculo_id = ${nuevo.id}::uuid where id = ${target.cotizacionId} and org_id = ${orgId}`);
        }
    }

    // Reserva ANTES de llamar al proveedor. La referencia es determinística:
    // un reintento tras una caída vuelve a pasar con la misma, y el proveedor
    // la rechaza si ya existe una igual.
    const reference = `cord:${objetivo.id}`;
    const [reservada] = await withOrgTx(orgId, sql`
        update us_tax_calculos set transaccion_ref = ${reference}
         where id = ${objetivo.id}::uuid and org_id = ${orgId} and transaccion_id is null
           and (transaccion_ref is null or transaccion_ref = ${reference})
        returning id`);
    if (!reservada.length) return 'ya_registrada';
    try {
        const txId = await createUsTaxTransaction(String(calc.stripe_account_id), {
            calculationId: objetivo.stripeCalculationId, reference,
        }, locale);
        await withOrgTx(orgId, sql`
            update us_tax_calculos set transaccion_id = ${txId}, transaccion_at = now(), transaccion_error = null
             where id = ${objetivo.id}::uuid and org_id = ${orgId}`);
        return 'registrada';
    } catch (error) {
        const code = error instanceof UsTaxError ? error.code : 'no_disponible';
        log.warn('us-tax: no se pudo registrar la venta; se reintenta', { orgId, route: 'us-tax/transaction', code });
        await withOrgTx(orgId, sql`update us_tax_calculos set transaccion_error = ${code} where id = ${objetivo.id}::uuid and org_id = ${orgId}`);
        return 'error';
    }
}

async function taxCodeDe(orgId: string): Promise<string> {
    const [rows] = await withOrgTx(orgId, sql`select us_tax_codigo from orgs where id = ${orgId}`);
    return isUsTaxCode(rows[0]?.us_tax_codigo) ? rows[0].us_tax_codigo : US_TAX_DEFAULT_CODE;
}

/**
 * Factura anulada: la venta registrada se revierte completa, salvo que su
 * cálculo siga respaldando una cotización COBRADA (el dinero entró: la venta
 * existe aunque la factura se rehaga). Idempotente por referencia.
 */
export async function reverseUsTaxForDocument(orgId: string, documentoId: string): Promise<'revertida' | 'no_aplica' | 'error'> {
    if (!UUID_RE.test(documentoId)) return 'no_aplica';
    const [rows] = await withOrgTx(orgId, sql`
        select c.id, c.stripe_account_id, c.transaccion_id, c.reverso_id,
               exists (select 1 from cotizaciones q
                        where q.org_id = ${orgId} and q.us_tax_calculo_id = c.id
                          and (q.status = 'paid' or q.paid_at is not null)) as cotizacion_cobrada
          from documentos_fiscales d
          join us_tax_calculos c on c.id = d.us_tax_calculo_id and c.org_id = d.org_id
         where d.org_id = ${orgId} and d.id = ${documentoId} and d.lifecycle = 'void'`);
    const c = rows[0];
    if (!c?.transaccion_id || c.reverso_id || c.cotizacion_cobrada) return 'no_aplica';
    try {
        const id = await reverseUsTaxTransaction(String(c.stripe_account_id), {
            transactionId: String(c.transaccion_id), reference: `cord:${c.id}:anulada`,
        }, currentLocale());
        await withOrgTx(orgId, sql`update us_tax_calculos set reverso_id = ${id}, reverso_at = now() where id = ${c.id} and org_id = ${orgId}`);
        return 'revertida';
    } catch (error) {
        log.warn('us-tax: no se pudo revertir la venta de una factura anulada', { orgId, route: 'us-tax/reversal', code: error instanceof UsTaxError ? error.code : 'error' });
        return 'error';
    }
}

// ── Barrido (cron) ──────────────────────────────────────────────────────────

/** Carril de SISTEMA: solo descubre qué organizaciones tienen la preferencia. */
export async function orgsConUsTax(): Promise<string[]> {
    const [rows] = await withSystemTx(sql`
        select id from orgs
         where us_tax_auto = true and upper(coalesce(country_code, '')) = 'US' and sandbox_of is null
         order by id`);
    return rows.map((r: any) => String(r.id));
}

/**
 * Las ventas pendientes de registrar de UNA organización, en su carril:
 * facturas emitidas y cotizaciones cobradas cuyo cálculo aún no tiene su
 * transacción (o la tenía revertida y el documento sigue vivo). Lo que quedó
 * `no_concilia` espera revisión humana: reintentarlo daría lo mismo.
 */
export async function sweepUsTaxForOrg(orgId: string, limite = 25): Promise<{ registradas: number; pendientes: number; errores: number }> {
    const [rows] = await withOrgTx(orgId, sql`
        select 'documento' as tipo, d.id
          from documentos_fiscales d
          join us_tax_calculos c on c.id = d.us_tax_calculo_id and c.org_id = d.org_id
         where d.org_id = ${orgId} and d.status = 'issued' and d.lifecycle not in ('draft', 'void')
           and d.credit_note_of is null
           and (c.transaccion_id is null or c.reverso_id is not null
                or c.venta is distinct from coalesce('cotizacion:' || d.cotizacion_id::text, 'documento:' || d.id::text))
           and coalesce(c.transaccion_error, '') <> 'no_concilia'
        union all
        select 'cotizacion' as tipo, q.id
          from cotizaciones q
          join us_tax_calculos c on c.id = q.us_tax_calculo_id and c.org_id = q.org_id
         where q.org_id = ${orgId} and (q.status = 'paid' or q.paid_at is not null)
           and (c.transaccion_id is null or c.venta is distinct from 'cotizacion:' || q.id::text)
           and coalesce(c.transaccion_error, '') <> 'no_concilia'
         limit ${limite}`);
    const out = { registradas: 0, pendientes: rows.length, errores: 0 };
    for (const r of rows) {
        const res = await recordUsTaxTransaction(orgId, r.tipo === 'documento' ? { documentoId: String(r.id) } : { cotizacionId: String(r.id) });
        if (res === 'registrada') out.registradas++;
        else if (res === 'error' || res === 'no_concilia') out.errores++;
    }
    return out;
}

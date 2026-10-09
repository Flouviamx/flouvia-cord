// Impuestos: la mitad que toca la base de datos.
//
// Vive separada de `impuestos.ts` a propósito. Ese archivo es puro y lo cargan
// los scripts de `test:payments` con el runtime de Node; si importara `./db`
// arrastraría el driver de Neon a un check que no debe tocar la red.

import { sql, withOrgTx } from './db';
import { taxPresetsFor, usStateTaxPresets, isUsState } from './countries';
import { retencionBase } from '../../packages/elements/src/engine';
import { canonicalTaxRate } from './tax-components';
import { UsTaxError, type UsTaxDesglose, type UsTaxLinea } from './us-tax/core';

/**
 * Un catálogo genuinamente vacío (org nueva, sin sembrar aún) es distinto de
 * un catálogo que NO SE PUDO LEER (timeout de Neon, pool agotado, RLS mal
 * puesta). Antes ambos se veían iguales: el `catch` de `taxCatalogFor` dejaba
 * `rows=[]` Y `orgRate=0`, así que un fallo de base de datos generaba
 * cotizaciones con 0% de impuesto, status 200, sin log — regla 22 aplicada al
 * impuesto: una tasa que no se puede confirmar no se inventa (aquí, "0" es
 * tan inventado como "16").
 */
export class TaxCatalogUnavailableError extends Error {
    constructor(cause?: unknown) {
        super('No pudimos leer el catálogo de impuestos. Intenta de nuevo en un momento.');
        this.name = 'TaxCatalogUnavailableError';
        if (cause) this.cause = cause;
    }
}
/**
 * Crea los perfiles estándar del país (o del ESTADO, en Estados Unidos) para
 * una organización recién nacida.
 *
 * Idempotente por construcción: no siembra si el catálogo ya tiene algo, para
 * no pisar lo que el negocio configuró con su contador. Nunca lanza — un
 * catálogo vacío es recuperable desde Ajustes y no debe tumbar la creación de
 * la cuenta.
 *
 * `region` solo importa para US: sales tax es estatal, no nacional (por eso
 * US no está en TAX_PRESETS), así que sin el estado del negocio no hay tasa
 * que sembrar — se cae al mismo "Exento" de siempre hasta que la org indique
 * su estado (Ajustes › Fiscal).
 */
export async function seedTaxCatalog(orgId: string, countryCode: string, region?: string | null): Promise<number> {
    try {
        const [[existente]] = await withOrgTx(orgId, sql`select count(*)::int as n from impuestos where org_id = ${orgId}`);
        if (Number(existente?.n ?? 0) > 0) return 0;

        const presets = countryCode.toUpperCase() === 'US' && region && isUsState(region)
            ? usStateTaxPresets(region)
            : taxPresetsFor(countryCode, region);
        for (const p of presets) {
            await withOrgTx(orgId, sql`
                insert into impuestos (org_id, nombre, tipo, kind, tasa, es_default, retencion_base, exemption_reason)
                values (${orgId}, ${p.nombre}, ${p.tipo}, ${p.kind}, ${p.tasa}, ${!!p.esDefault}, ${p.base ?? 'subtotal'}, ${p.exemptionReason ?? null})`);
        }
        return presets.length;
    } catch {
        return 0;
    }
}

/**
 * Catálogo de impuestos de una org, resuelto en SERVIDOR y sin sesión.
 *
 * `getImpuestos()` depende del contexto del request (org activa, locale) y por
 * eso no sirve en la API pública ni en el MCP, que llegan con una API key. Esta
 * versión toma el orgId explícito.
 *
 * `resolve()` es el punto importante: la tasa que manda el cliente se VALIDA
 * contra las tasas que el negocio configuró. Sin eso, un POST a /api/v1 podría
 * declarar `tax_rate: 0` en una venta gravada y la factura saldría mal — el
 * emisor no es de confianza aunque traiga una llave válida.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function taxCatalogFor(orgId: string, opts: { usTaxCalculoId?: string | null } = {}) {
    let rows: any[];
    let orgRate: number;
    let country: string;
    // Sales tax de EE. UU. por dirección: la tasa de cada línea sale de un
    // cálculo REAL guardado en `us_tax_calculos`, de esta organización y
    // vigente. Nunca de lo que mande el navegador: una tasa calculada (9.5 %)
    // no está en el catálogo, y la única forma de que el servidor la acepte es
    // que exista la fila que la prueba (src/lib/us-tax/calculo.ts).
    const calculoId = opts.usTaxCalculoId && UUID_RE.test(opts.usTaxCalculoId) ? opts.usTaxCalculoId : null;
    if (opts.usTaxCalculoId && !calculoId) throw new UsTaxError('calculo_vencido');
    let calculo: { id: string; lineas: UsTaxLinea[] } | null = null;
    try {
        const [impuestoRows, orgRows, calculoRows] = await withOrgTx(orgId,
            sql`select tasa, kind, tipo, nombre, es_default, activo, retencion_base from impuestos where org_id = ${orgId} and activo = true`,
            sql`select iva_pct, country_code from orgs where id = ${orgId}`,
            ...(calculoId ? [sql`select id, lineas from us_tax_calculos
                                  where org_id = ${orgId} and id = ${calculoId}::uuid and expires_at > now()`] : []),
        );
        rows = impuestoRows;
        orgRate = Number(orgRows?.[0]?.iva_pct ?? 0) || 0;
        country = String(orgRows?.[0]?.country_code || '').toUpperCase();
        if (calculoId) {
            const fila = calculoRows?.[0];
            calculo = fila ? { id: String(fila.id), lineas: Array.isArray(fila.lineas) ? fila.lineas : [] } : null;
        }
    } catch (cause) {
        // Falla CERRADA: un catálogo que no se pudo leer no es un catálogo
        // vacío. El llamador traduce esto a un 503 accionable, nunca a un
        // documento con 0% de impuesto.
        throw new TaxCatalogUnavailableError(cause);
    }
    // Un cálculo que no existe, es de otra organización o ya venció no prueba
    // ninguna tasa: el documento no se guarda con una inventada.
    if (calculoId && !calculo) throw new UsTaxError('calculo_vencido');

    const consumo = rows.filter((r) => (r.kind ?? 'consumo') !== 'retencion');
    // Toda tasa que el negocio configuró, más la plana heredada y el 0 (exento,
    // que es legal en todos lados y no requiere estar capturado).
    const permitidas = new Set<number>([0, orgRate / 100]);
    for (const r of consumo) permitidas.add(Number(r.tasa) / 100);

    const def = rows.find((r) => r.es_default && (r.kind ?? 'consumo') === 'consumo');
    const defaultRate = def ? Number(def.tasa) / 100 : orgRate / 100;

    const retenciones = rows
        .filter((r) => r.kind === 'retencion' && r.es_default && Number(r.tasa) > 0)
        .map((r) => ({
            nombre: String(r.nombre), tipo: String(r.tipo || 'ret_iva'), tasa: Number(r.tasa) / 100,
            base: retencionBase(r.retencion_base),
        }));

    const lineaCalculada = (linea: number | undefined): UsTaxLinea => {
        const l = linea === undefined ? undefined : calculo!.lineas[linea];
        const tasa = Number(l?.tasa);
        // El cálculo guardado se hizo sobre ESTE documento (su huella); una
        // línea que no está en él es un documento distinto.
        if (!l || !Number.isFinite(tasa) || tasa < 0 || tasa > 1) throw new UsTaxError('calculo_vencido');
        return l;
    };

    return {
        defaultRate,
        retenciones,
        /** País de la organización: decide si un concepto conserva su causa de exención. */
        country,
        /** Cálculo por dirección que respalda las tasas (EE. UU.), o null. */
        usTaxCalculoId: calculo?.id ?? null,
        /** Desglose por jurisdicción de la línea `linea` del cálculo, o null sin cálculo. */
        breakdown(linea: number): UsTaxDesglose | null {
            return calculo ? (lineaCalculada(linea).desglose ?? null) : null;
        },
        /**
         * Tasa validada, o el fallback si la propuesta no está en el catálogo.
         * Con un cálculo por dirección, la tasa de la línea `linea` es la del
         * cálculo guardado y la propuesta del cliente se ignora.
         */
        resolve(proposed: unknown, fallback: number, linea?: number): number {
            if (calculo) return Number(lineaCalculada(linea).tasa);
            if (proposed === null || proposed === undefined || proposed === '') return fallback;
            // Canadá: una tasa provincial suelta congelada antes (QST 9.975 %)
            // se lee como la combinada con GST que hoy está en el catálogo.
            const rate = canonicalTaxRate(country, Number(proposed));
            if (!Number.isFinite(rate) || rate < 0 || rate > 1) return fallback;
            for (const allowed of permitidas) {
                if (Math.abs(allowed - rate) < 1e-9) return rate;
            }
            return fallback;
        },
    };
}

const sameRate = (a: unknown, b: unknown) => Math.abs(Number(a) - Number(b)) < 1e-9;

/**
 * El catálogo es el de ARRANQUE del país anterior, sin tocar: cada fila
 * coincide (nombre, clase y tasa) con un preset de ese país. Solo entonces se
 * puede reemplazar al cambiar de país sin pisar algo que el negocio configuró.
 */
function isUntouchedSeed(rows: any[], presets: { nombre: string; kind: string; tasa: number }[]): boolean {
    if (!rows.length) return true;
    return rows.every((r) => presets.some((p) =>
        p.nombre === String(r.nombre) && p.kind === String(r.kind ?? 'consumo') && sameRate(p.tasa, r.tasa)));
}

function presetsFor(country: string, region?: string | null) {
    const code = country.toUpperCase();
    return code === 'US' && region && isUsState(region) ? usStateTaxPresets(region) : taxPresetsFor(code, region);
}

/**
 * Al cambiar el país (o el estado / la provincia que decide el impuesto), el
 * catálogo de arranque del territorio anterior se reemplaza por el del nuevo.
 *
 * Sin esto, una organización que pasaba de México a Francia seguía ofreciendo
 * "IVA 16%" e "IVA 8% región fronteriza" en su selector, con las retenciones
 * mexicanas, y `taxCatalogFor` las aceptaba como tasas válidas. Solo se
 * reemplaza un catálogo INTACTO: si el negocio ya editó, agregó o borró algo,
 * no se toca (el banner de Ajustes › Impuestos le ofrece hacerlo a mano).
 * Devuelve cuántos perfiles sembró (0 = no se tocó nada).
 */
export async function reseedTaxCatalogForTerritory(
    orgId: string,
    previous: { country: string; region?: string | null },
    next: { country: string; region?: string | null },
): Promise<number> {
    try {
        const [rows] = await withOrgTx(orgId, sql`select nombre, kind, tasa from impuestos where org_id = ${orgId}`);
        const oldPresets = presetsFor(previous.country, previous.region);
        // Estados Unidos nace con solo "Exempt / Resale" hasta que declara su
        // estado: ese catálogo también cuenta como intacto.
        const usExemptOnly = previous.country.toUpperCase() === 'US' && rows.every((r: any) => String(r.kind) === 'exento');
        // Un catálogo sembrado ANTES de declarar la provincia es el nacional del
        // mismo país, y también está intacto: sin esto, una cuenta canadiense
        // que elige "Quebec" después del alta se quedaba con la lista nacional.
        const nationalSeed = previous.country.toUpperCase() === next.country.toUpperCase()
            && isUntouchedSeed(rows, taxPresetsFor(previous.country, null));
        if (!isUntouchedSeed(rows, oldPresets) && !usExemptOnly && !nationalSeed) return 0;
        const newPresets = presetsFor(next.country, next.region);
        if (isUntouchedSeed(rows, newPresets) && rows.length === newPresets.length) return 0;
        await withOrgTx(orgId, sql`delete from impuestos where org_id = ${orgId}`);
        const seeded = await seedTaxCatalog(orgId, next.country, next.region);
        // La columna heredada sigue la tasa predeterminada del catálogo nuevo:
        // `taxCatalogFor` la acepta como tasa válida y como respaldo.
        const def = newPresets.find((p) => p.esDefault);
        await withOrgTx(orgId, sql`update orgs set iva_pct = ${def ? def.tasa : 0} where id = ${orgId}`);
        return seeded;
    } catch {
        return 0;
    }
}

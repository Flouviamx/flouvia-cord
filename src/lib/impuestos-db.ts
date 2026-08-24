// Impuestos: la mitad que toca la base de datos.
//
// Vive separada de `impuestos.ts` a propósito. Ese archivo es puro y lo cargan
// los scripts de `test:payments` con el runtime de Node; si importara `./db`
// arrastraría el driver de Neon a un check que no debe tocar la red.

import { sql, withOrgTx } from './db';
import { taxPresetsFor, usStateTaxPresets, isUsState } from './countries';

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
            : taxPresetsFor(countryCode);
        for (const p of presets) {
            await withOrgTx(orgId, sql`
                insert into impuestos (org_id, nombre, tipo, kind, tasa, es_default, retencion_base)
                values (${orgId}, ${p.nombre}, ${p.tipo}, ${p.kind}, ${p.tasa}, ${!!p.esDefault}, ${p.base ?? 'subtotal'})`);
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
export async function taxCatalogFor(orgId: string) {
    let rows: any[];
    let orgRate: number;
    try {
        const [impuestoRows, orgRows] = await withOrgTx(orgId,
            sql`select tasa, kind, tipo, nombre, es_default, activo, retencion_base from impuestos where org_id = ${orgId} and activo = true`,
            sql`select iva_pct from orgs where id = ${orgId}`,
        );
        rows = impuestoRows;
        orgRate = Number(orgRows?.[0]?.iva_pct ?? 0) || 0;
    } catch (cause) {
        // Falla CERRADA: un catálogo que no se pudo leer no es un catálogo
        // vacío. El llamador traduce esto a un 503 accionable, nunca a un
        // documento con 0% de impuesto.
        throw new TaxCatalogUnavailableError(cause);
    }

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
            base: (r.retencion_base === 'impuesto' ? 'impuesto' : 'subtotal') as 'subtotal' | 'impuesto',
        }));

    return {
        defaultRate,
        retenciones,
        /** Tasa validada, o el fallback si la propuesta no está en el catálogo. */
        resolve(proposed: unknown, fallback: number): number {
            if (proposed === null || proposed === undefined || proposed === '') return fallback;
            const rate = Number(proposed);
            if (!Number.isFinite(rate) || rate < 0 || rate > 1) return fallback;
            for (const allowed of permitidas) {
                if (Math.abs(allowed - rate) < 1e-9) return rate;
            }
            return fallback;
        },
    };
}

// Configuración que dibuja Cord Elements (UI dirigida por el servidor). El
// Builder no decide divisas, impuestos, términos ni vocabulario: los lee de aquí,
// así que un cambio en Ajustes llega al sitio del negocio sin republicar nada.
// Solo datos que ya son públicos en cualquier cotización; nunca costos ni CRM.
import { sql, withOrgTx } from './db';
import { mapImpuestoRow } from './queries';
import { buildTaxOptions, defaultTaxRate, retencionesFrom } from './impuestos';
import { listOfferedCurrencies, normalizeCurrency } from './currency';
import { taxKindLabel } from './countries.ts';
import { TaxCatalogUnavailableError } from './impuestos-db';
import { FISCAL_COUNTRIES } from '../../packages/elements/src/fiscal/receptor';

export const TERMINOS = ['contado', 'net30', 'net60'] as const;

export async function buildElementsConfig(orgId: string) {
    let org: any;
    let impuestoRows: any[];
    try {
        const [orgRows, rows] = await withOrgTx(orgId,
            sql`select nombre, country_code, idioma, moneda, iva_pct, iva_incluido_defecto, color_marca, logo_url,
                       vigencia_default_dias, terminos_default
                  from orgs where id = ${orgId}`,
            sql`select * from impuestos where org_id = ${orgId} order by es_default desc, kind, tasa desc`,
        );
        org = orgRows[0];
        impuestoRows = rows;
    } catch (cause) {
        throw new TaxCatalogUnavailableError(cause);
    }
    if (!org) throw new TaxCatalogUnavailableError(new Error('org no encontrada'));

    const pais = String(org.country_code || 'MX').toUpperCase();
    const locale: 'es' | 'en' = String(org.idioma || '').toLowerCase().startsWith('en') ? 'en' : 'es';
    const moneda = normalizeCurrency(org.moneda);
    const impuestos = impuestoRows.map((r) => mapImpuestoRow(r, locale, pais));
    const orgTaxRate = Number(org.iva_pct) || 0;
    const terminosDefault = (TERMINOS as readonly string[]).includes(org.terminos_default) ? org.terminos_default : 'contado';

    return {
        object: 'elements_config' as const,
        org: {
            nombre: String(org.nombre),
            pais,
            locale,
            moneda,
            color_primario: (org.color_marca as string) || null,
            logo_url: (org.logo_url as string) || null,
        },
        monedas: listOfferedCurrencies(moneda),
        impuestos: {
            etiqueta: taxKindLabel('consumo', locale, pais),
            opciones: buildTaxOptions(impuestos, { locale, countryCode: pais, orgTaxRate })
                .map((o) => ({ id: o.id, label: o.label, rate: o.rate, kind: o.kind })),
            tasa_default: defaultTaxRate(impuestos, orgTaxRate),
            retenciones: retencionesFrom(impuestos).map((r) => ({ nombre: r.nombre, tasa: r.tasa, base: r.base })),
            precios_incluyen_impuesto: !!org.iva_incluido_defecto,
        },
        terminos: [...TERMINOS],
        terminos_default: terminosDefault,
        vigencia_dias_default: Math.min(365, Math.max(1, Number(org.vigencia_default_dias) || 30)),
        fiscal: {
            pais,
            reglas_propias: (FISCAL_COUNTRIES as readonly string[]).includes(pais),
        },
    };
}

export type ElementsConfig = Awaited<ReturnType<typeof buildElementsConfig>>;

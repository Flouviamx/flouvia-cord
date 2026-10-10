import type { PlatformCurrency } from './plan-currency';
import { EUR_METER_MINOR } from './plan-eur-rates';

export type OverageDimension = 'usuario' | 'ia' | 'timbrado' | 'api' | 'us_tax';
type MinorTable = Record<string, Partial<Record<OverageDimension, number | string>>>;

// Unidades mínimas por evento, iguales a los Price de Stripe (scripts/verify-stripe-billing.mjs).
// `us_tax` = venta registrada con sales tax automático de EE. UU.: MXN 15.00 y
// USD 0.75 en todos los planes (su costo en el proveedor es USD 0.50). Su
// Price lo crea scripts/stripe-us-tax-meter.mjs con estas mismas cifras.
export const US_TAX_OVERAGE_MINOR = { MXN: 1500, USD: 75, EUR: 70 } as const;
const MXN_MINOR: MinorTable = {
    starter: { api: 0.6, ia: 400, timbrado: 300, us_tax: US_TAX_OVERAGE_MINOR.MXN },
    pro: { api: 0.6, usuario: 30000, ia: 350, timbrado: 300, us_tax: US_TAX_OVERAGE_MINOR.MXN },
    scale: { api: 0.4, usuario: 30000, ia: 300, timbrado: 200, us_tax: US_TAX_OVERAGE_MINOR.MXN },
    developer: { api: 0.4, usuario: 20000, ia: 250, timbrado: 150, us_tax: US_TAX_OVERAGE_MINOR.MXN },
};
const USD_MINOR: MinorTable = {
    starter: { api: 0.03, ia: 20, timbrado: 15, us_tax: US_TAX_OVERAGE_MINOR.USD },
    pro: { api: 0.03, usuario: 1500, ia: 17.5, timbrado: 15, us_tax: US_TAX_OVERAGE_MINOR.USD },
    scale: { api: 0.02, usuario: 1500, ia: 15, timbrado: 10, us_tax: US_TAX_OVERAGE_MINOR.USD },
    developer: { api: 0.02, usuario: 1000, ia: 12.5, timbrado: 7.5, us_tax: US_TAX_OVERAGE_MINOR.USD },
};
const MINOR: Record<PlatformCurrency, MinorTable> = { MXN: MXN_MINOR, USD: USD_MINOR, EUR: EUR_METER_MINOR };

// Developer incluye usuarios e IA sin tope: su meter existe en Stripe pero nunca recibe consumo.
const INCLUDED_UNLIMITED: Partial<Record<string, OverageDimension[]>> = { developer: ['usuario', 'ia'] };

/** Exact overage display: never round a 0.175 EUR tariff to 0.18 EUR. */
export function overagePriceLabel(plan: string, dim: OverageDimension, currency: PlatformCurrency, locale: string) {
    const en = locale === 'en';
    if (INCLUDED_UNLIMITED[plan]?.includes(dim)) return en ? 'Unlimited' : 'Ilimitado';
    if (plan === 'developer' && currency === 'EUR') return en ? 'Custom' : 'A medida';
    if (plan === 'free' && (dim === 'timbrado' || dim === 'us_tax')) return en ? 'From Starter' : 'Desde Starter';
    const minor = MINOR[currency][plan]?.[dim];
    if (minor === undefined) return en ? 'Hard limit' : 'Tope duro';
    const amount = Number(minor) / (dim === 'api' ? 1 : 100);
    return new Intl.NumberFormat(en ? 'en-US' : 'es-MX', {
        style: 'currency', currency, currencyDisplay: 'code', maximumFractionDigits: 3,
    }).format(amount) + (dim === 'usuario' ? (en ? ' / month' : ' / mes') : '');
}

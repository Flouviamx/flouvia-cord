import type { PlatformCurrency } from './plan-currency';
import { EUR_METER_MINOR } from './plan-eur-rates';

export type OverageDimension = 'usuario' | 'ia' | 'timbrado' | 'api';
type MinorTable = Record<string, Partial<Record<OverageDimension, number | string>>>;

// Unidades mínimas por evento, iguales a los Price de Stripe (scripts/verify-stripe-billing.mjs).
const MXN_MINOR: MinorTable = {
    starter: { api: 0.6, ia: 400, timbrado: 300 },
    pro: { api: 0.6, usuario: 30000, ia: 350, timbrado: 300 },
    scale: { api: 0.4, usuario: 30000, ia: 300, timbrado: 200 },
    developer: { api: 0.4, usuario: 20000, ia: 250, timbrado: 150 },
};
const USD_MINOR: MinorTable = {
    starter: { api: 0.03, ia: 20, timbrado: 15 },
    pro: { api: 0.03, usuario: 1500, ia: 17.5, timbrado: 15 },
    scale: { api: 0.02, usuario: 1500, ia: 15, timbrado: 10 },
    developer: { api: 0.02, usuario: 1000, ia: 12.5, timbrado: 7.5 },
};
const MINOR: Record<PlatformCurrency, MinorTable> = { MXN: MXN_MINOR, USD: USD_MINOR, EUR: EUR_METER_MINOR };

// Developer incluye usuarios e IA sin tope: su meter existe en Stripe pero nunca recibe consumo.
const INCLUDED_UNLIMITED: Partial<Record<string, OverageDimension[]>> = { developer: ['usuario', 'ia'] };

/** Exact overage display: never round a 0.175 EUR tariff to 0.18 EUR. */
export function overagePriceLabel(plan: string, dim: OverageDimension, currency: PlatformCurrency, locale: string) {
    const en = locale === 'en';
    if (INCLUDED_UNLIMITED[plan]?.includes(dim)) return en ? 'Unlimited' : 'Ilimitado';
    if (plan === 'developer' && currency === 'EUR') return en ? 'Custom' : 'A medida';
    if (plan === 'free' && dim === 'timbrado') return en ? 'From Starter' : 'Desde Starter';
    const minor = MINOR[currency][plan]?.[dim];
    if (minor === undefined) return en ? 'Hard limit' : 'Tope duro';
    const amount = Number(minor) / (dim === 'api' ? 1 : 100);
    return new Intl.NumberFormat(en ? 'en-US' : 'es-MX', {
        style: 'currency', currency, currencyDisplay: 'code', maximumFractionDigits: 3,
    }).format(amount) + (dim === 'usuario' ? (en ? ' / month' : ' / mes') : '');
}

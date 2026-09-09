import type { PlatformCurrency } from './plan-currency';
import { EUR_METER_MINOR } from './plan-eur-rates';

export type OverageDimension = 'usuario' | 'ia' | 'timbrado' | 'api';
const USD_MINOR: Record<string, Partial<Record<OverageDimension, number>>> = {
    starter: { api: 0.03, ia: 20, timbrado: 15 },
    pro: { api: 0.03, usuario: 1500, ia: 17.5, timbrado: 15 },
    scale: { api: 0.02, usuario: 1500, ia: 15, timbrado: 10 },
    developer: { api: 0.02, usuario: 1000, ia: 12.5, timbrado: 7.5 },
};

/** Exact overage display: never round a 0.175 EUR tariff to 0.18 EUR. */
export function overagePriceLabel(plan: string, dim: OverageDimension, currency: PlatformCurrency, locale: string) {
    const en = locale === 'en';
    if (plan === 'developer' && currency === 'EUR') return en ? 'Custom' : 'A medida';
    const eur = EUR_METER_MINOR as Record<string, Partial<Record<OverageDimension, string>>>;
    const minor = currency === 'EUR' ? eur[plan]?.[dim] : USD_MINOR[plan]?.[dim];
    if (minor === undefined) return en ? 'Hard limit' : 'Tope duro';
    const amount = Number(minor) * (currency === 'MXN' ? 20 : 1) / (dim === 'api' ? 1 : 100);
    return new Intl.NumberFormat(en ? 'en-US' : 'es-MX', {
        style: 'currency', currency, currencyDisplay: 'code', maximumFractionDigits: 3,
    }).format(amount) + (dim === 'usuario' ? (en ? ' / month' : ' / mes') : '');
}

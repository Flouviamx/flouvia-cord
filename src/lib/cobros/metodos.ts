// Qué métodos de pago ofrece Cord en un cobro en línea, y cómo se nombran.
//
// Puro y sin imports: lo leen el endpoint que crea el cobro, el portal del
// cliente, la factura pública y el cron de cobro automático, y los cuatro
// tienen que ofrecer exactamente lo mismo. Un método ofrecido en una
// superficie y rechazado por el proveedor en otra es la regla 21 rota: una
// capacidad de un solo país se detecta y se dice, no se ofrece y falla.
//
// Domiciliación bancaria:
//   - SEPA Direct Debit (`sepa_debit`): solo EUR, cuentas IBAN de la zona SEPA.
//     El cargo tarda hasta 6 días hábiles en confirmarse y el titular puede
//     devolverlo sin dar motivo durante 8 semanas.
//   - ACH Direct Debit (`us_bank_account`): solo USD, cuentas de EE. UU. Hasta
//     4 días hábiles; reembolsos solo completos.
// Ambos los decide el negocio (`orgs.acepta_domiciliacion`) y exigen la
// capacidad activa en su cuenta conectada (`orgs.stripe_capacidades`).
// https://docs.stripe.com/payments/sepa-debit
// https://docs.stripe.com/payments/ach-direct-debit

export type MetodoCobro = 'card' | 'sepa_debit' | 'us_bank_account';
export type MetodoDomiciliacion = Exclude<MetodoCobro, 'card'>;

export interface Domiciliacion {
    /** Capacidad de la cuenta conectada que habilita el método. */
    capacidad: string;
    /** Única divisa en la que el método liquida. */
    divisa: string;
    /** Países de la cuenta del negocio a los que Cord le pide la capacidad. */
    paises: readonly string[];
}

export const DOMICILIACION: Readonly<Record<MetodoDomiciliacion, Domiciliacion>> = {
    sepa_debit: { capacidad: 'sepa_debit_payments', divisa: 'EUR', paises: ['ES', 'DE', 'FR'] },
    us_bank_account: { capacidad: 'us_bank_account_ach_payments', divisa: 'USD', paises: ['US'] },
};

/** El método de domiciliación que corresponde al país del negocio, si existe. */
export function domiciliacionDelPais(country: string | null | undefined): MetodoDomiciliacion | null {
    const pais = String(country || '').toUpperCase();
    for (const [metodo, d] of Object.entries(DOMICILIACION) as [MetodoDomiciliacion, Domiciliacion][]) {
        if (d.paises.includes(pais)) return metodo;
    }
    return null;
}

/** Estado de una capacidad en la cuenta conectada: active | pending | inactive | unrequested. */
export function estadoCapacidad(capacidades: unknown, capacidad: string): string {
    const caps = (capacidades && typeof capacidades === 'object' ? capacidades : {}) as Record<string, unknown>;
    const valor = caps[capacidad];
    return typeof valor === 'string' ? valor : 'unrequested';
}

export interface OrgCobro {
    aceptaTarjeta: boolean;
    aceptaDomiciliacion: boolean;
    capacidades: unknown;
}

/**
 * Métodos que se ofrecen para cobrar en `currency`. La tarjeta va primero
 * porque es la que confirma al instante; la domiciliación solo en su divisa y
 * con la capacidad ACTIVA (una capacidad `pending` todavía no cobra).
 */
export function metodosPara(org: OrgCobro, currency: string): MetodoCobro[] {
    const divisa = String(currency || '').toUpperCase();
    const out: MetodoCobro[] = [];
    if (org.aceptaTarjeta) out.push('card');
    if (org.aceptaDomiciliacion) {
        for (const [metodo, d] of Object.entries(DOMICILIACION) as [MetodoDomiciliacion, Domiciliacion][]) {
            if (d.divisa === divisa && estadoCapacidad(org.capacidades, d.capacidad) === 'active') out.push(metodo);
        }
    }
    return out;
}

/** Un débito bancario: confirma en días, no al instante. */
export function esDomiciliacion(metodo: string | null | undefined): metodo is MetodoDomiciliacion {
    return metodo === 'sepa_debit' || metodo === 'us_bank_account';
}

/**
 * Lo que Cord guarda de un método: tipo, marca y últimos cuatro. Nunca el
 * número completo, el IBAN ni la cuenta: para cobrar basta el id del método en
 * el proveedor.
 */
export interface ResumenMetodo {
    tipo: MetodoCobro;
    marca: string | null;
    last4: string | null;
    banco: string | null;
    vence: string | null;
}

export function resumenMetodo(pm: any): ResumenMetodo | null {
    const tipo = String(pm?.type || '');
    if (tipo === 'card') {
        const c = pm.card || {};
        const mes = Number(c.exp_month), anio = Number(c.exp_year);
        return {
            tipo, marca: c.brand ? String(c.brand) : null, last4: c.last4 ? String(c.last4) : null, banco: null,
            vence: mes >= 1 && mes <= 12 && anio > 2000 ? `${String(mes).padStart(2, '0')}/${anio}` : null,
        };
    }
    if (tipo === 'sepa_debit') {
        const s = pm.sepa_debit || {};
        return { tipo, marca: null, last4: s.last4 ? String(s.last4) : null, banco: s.bank_code ? String(s.bank_code) : null, vence: null };
    }
    if (tipo === 'us_bank_account') {
        const u = pm.us_bank_account || {};
        return { tipo, marca: null, last4: u.last4 ? String(u.last4) : null, banco: u.bank_name ? String(u.bank_name) : null, vence: null };
    }
    return null;
}

const MARCAS: Record<string, string> = {
    visa: 'Visa', mastercard: 'Mastercard', amex: 'American Express', discover: 'Discover',
    diners: 'Diners Club', jcb: 'JCB', unionpay: 'UnionPay', cartes_bancaires: 'Cartes Bancaires', eftpos_au: 'eftpos',
};

/** "Visa •••• 4242", "Cuenta SEPA •••• 3000", "Chase •••• 6789". */
export function etiquetaMetodo(m: Partial<ResumenMetodo> | null | undefined, locale: 'es' | 'en' = 'es'): string {
    if (!m?.tipo) return locale === 'en' ? 'Saved payment method' : 'Método de pago guardado';
    const fin = m.last4 ? ` •••• ${m.last4}` : '';
    if (m.tipo === 'card') return `${MARCAS[String(m.marca)] ?? (locale === 'en' ? 'Card' : 'Tarjeta')}${fin}`;
    if (m.tipo === 'sepa_debit') return `${locale === 'en' ? 'SEPA account' : 'Cuenta SEPA'}${fin}`;
    return `${m.banco || (locale === 'en' ? 'Bank account' : 'Cuenta bancaria')}${fin}`;
}

/** Etiqueta del método para la analítica y el ledger. */
export function metodoAnalitica(tipo: string | null | undefined): string {
    if (tipo === 'sepa_debit') return 'sepa';
    if (tipo === 'us_bank_account') return 'ach';
    if (tipo === 'customer_balance') return 'spei';
    return 'tarjeta';
}

import { createHash } from 'node:crypto';

export const QUOTE_STATUSES = ['sent', 'viewed', 'approved', 'rejected', 'expired', 'paid', 'invoiced'] as const;
export type SyncedQuoteStatus = typeof QUOTE_STATUSES[number];

export const DEFAULT_PIPELINE = 'default';
export const DEFAULT_STAGES: Record<SyncedQuoteStatus, string> = {
    sent: 'presentationscheduled',
    viewed: 'decisionmakerboughtin',
    approved: 'contractsent',
    rejected: 'closedlost',
    expired: 'closedlost',
    paid: 'closedwon',
    invoiced: 'closedwon',
};

const CLOSED: SyncedQuoteStatus[] = ['rejected', 'expired', 'paid', 'invoiced'];

export interface HubSpotAjustes {
    pipeline: string;
    etapas: Record<SyncedQuoteStatus, string>;
}

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function sanitizeAjustes(input: unknown): HubSpotAjustes {
    const raw = (input && typeof input === 'object' ? input : {}) as Record<string, any>;
    const pipeline = typeof raw.pipeline === 'string' && ID_RE.test(raw.pipeline) ? raw.pipeline : DEFAULT_PIPELINE;
    const etapasRaw = raw.etapas && typeof raw.etapas === 'object' ? raw.etapas : {};
    const usaDefault = pipeline === DEFAULT_PIPELINE;
    const etapas = {} as Record<SyncedQuoteStatus, string>;
    for (const status of QUOTE_STATUSES) {
        const v = etapasRaw[status];
        etapas[status] = typeof v === 'string' && ID_RE.test(v) ? v : (usaDefault ? DEFAULT_STAGES[status] : '');
    }
    return { pipeline, etapas };
}

export function stagesComplete(ajustes: HubSpotAjustes): boolean {
    return QUOTE_STATUSES.every((s) => Boolean(ajustes.etapas[s]));
}

const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, max) : '');

export interface ClienteRow {
    empresa: string;
    contacto?: string | null;
    email?: string | null;
    telefono?: string | null;
}

export function companyProps(c: ClienteRow): Record<string, string> {
    return { name: clean(c.empresa, 200) };
}

export function contactProps(c: ClienteRow): Record<string, string> | null {
    const email = clean(c.email, 254).toLowerCase();
    const nombre = clean(c.contacto, 200);
    if (!email && !nombre) return null;
    const [firstname, ...rest] = nombre.split(/\s+/).filter(Boolean);
    return {
        email,
        firstname: firstname ?? '',
        lastname: rest.join(' '),
        phone: clean(c.telefono, 40),
    };
}

export interface CotizacionRow {
    folio: string;
    status: string;
    total: number | string;
    moneda: string | null;
    cliente: string | null;
    vigencia?: string | null;
}

export function isSyncedStatus(status: string): status is SyncedQuoteStatus {
    return (QUOTE_STATUSES as readonly string[]).includes(status);
}

export function dealProps(q: CotizacionRow, ajustes: HubSpotAjustes, now = new Date()): Record<string, string> | null {
    if (!isSyncedStatus(q.status)) return null;
    const stage = ajustes.etapas[q.status];
    const moneda = clean(q.moneda, 3).toUpperCase();
    if (!stage || !/^[A-Z]{3}$/.test(moneda)) return null;
    const total = Number(q.total);
    const props: Record<string, string> = {
        dealname: clean(q.cliente ? `${q.folio} · ${q.cliente}` : q.folio, 200),
        amount: Number.isFinite(total) ? String(total) : '0',
        deal_currency_code: moneda,
        pipeline: ajustes.pipeline,
        dealstage: stage,
    };
    if (CLOSED.includes(q.status)) props.closedate = now.toISOString().slice(0, 10);
    return props;
}

export function clienteFromCompany(props: Record<string, unknown>): { empresa: string } | null {
    const empresa = clean(props.name, 200);
    return empresa ? { empresa } : null;
}

export function clienteFromContact(props: Record<string, unknown>): { contacto: string; email: string; telefono: string } {
    const contacto = [clean(props.firstname, 100), clean(props.lastname, 100)].filter(Boolean).join(' ');
    const emailRaw = clean(props.email, 254).toLowerCase();
    return {
        contacto,
        email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw) ? emailRaw : '',
        telefono: clean(props.phone, 40),
    };
}

export function huella(props: Record<string, string> | null): string {
    const ordered = props ? Object.fromEntries(Object.entries(props).sort(([a], [b]) => a.localeCompare(b))) : null;
    return createHash('sha256').update(JSON.stringify(ordered)).digest('hex');
}

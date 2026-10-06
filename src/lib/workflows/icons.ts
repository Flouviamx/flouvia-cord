import { iconSvg, type IconName } from '../icons';

const NAMES: Record<string, IconName> = {
    quotes: 'quote',
    approvals: 'shield',
    payments: 'card',
    invoices: 'invoice',
    clients: 'user',
    products: 'products',
    tasks: 'check-square',
    trigger: 'bolt',
    plus: 'plus',
    create_task: 'check-square',
    notify_team: 'bell',
    slack_message: 'chat',
    send_client_email: 'mail-forward',
    expire_quote: 'clock',
    approve_quote_request: 'shield',
    void_invoice: 'invoice-x',
    http_webhook: 'share',
    teams_message: 'chat',
    whatsapp_client: 'chat',
    action: 'bolt',
    condition: 'decision',
    wait: 'clock',
    query: 'search-insight',
    wait_until: 'history',
    schedule: 'calendar',
    dots: 'more',
    search: 'search',
    close: 'x',
};

export const WORKFLOW_ICONS: Record<string, string> = Object.fromEntries(
    Object.entries(NAMES).map(([k, n]) => [k, iconSvg(n)]),
);

export { BRAND_LOGOS, BRAND_TILES } from '../integraciones/catalogo';

// @flouviahq/node — SDK de servidor de Cord.
//
//   import { Cord } from '@flouviahq/node';
//   const cord = new Cord(process.env.CORD_SECRET_KEY!);
//   const quote = await cord.quotes.create({ cliente: { empresa: 'Acme' }, items: [...] });
//   for await (const invoice of cord.invoices.listAll({ estado: 'open' })) { … }
//   const event = await cord.webhooks.constructEvent(await req.text(), req.headers, secret);
import { HttpClient, type CordOptions } from './http.js';
import { createResources } from './resources.js';
import { constructEvent, signPayload } from './webhooks.js';

export class Cord {
    readonly mode: 'live' | 'test';
    readonly me: ReturnType<typeof createResources>['me'];
    readonly quotes: ReturnType<typeof createResources>['quotes'];
    readonly clients: ReturnType<typeof createResources>['clients'];
    readonly products: ReturnType<typeof createResources>['products'];
    readonly invoices: ReturnType<typeof createResources>['invoices'];
    readonly collections: ReturnType<typeof createResources>['collections'];
    readonly events: ReturnType<typeof createResources>['events'];
    readonly tasks: ReturnType<typeof createResources>['tasks'];
    readonly webhookEndpoints: ReturnType<typeof createResources>['webhookEndpoints'];
    readonly elements: ReturnType<typeof createResources>['elements'];
    readonly testHelpers: ReturnType<typeof createResources>['testHelpers'];
    readonly webhooks = { constructEvent, signPayload };

    constructor(secretKey: string, opts: CordOptions = {}) {
        const http = new HttpClient(secretKey, opts);
        const r = createResources(http);
        this.mode = http.mode;
        this.me = r.me;
        this.quotes = r.quotes;
        this.clients = r.clients;
        this.products = r.products;
        this.invoices = r.invoices;
        this.collections = r.collections;
        this.events = r.events;
        this.tasks = r.tasks;
        this.webhookEndpoints = r.webhookEndpoints;
        this.elements = r.elements;
        this.testHelpers = r.testHelpers;
    }
}

export default Cord;
export { CordError, newIdempotencyKey } from './http.js';
export { CORD_API_VERSION } from '../../elements/src/contract/api-version.js';
export type { CordOptions, RequestOptions, ApiResponse } from './http.js';
export type { CreateQuoteParams, CreatedQuote, QuoteItemInput, OffsetPage, CursorPage } from './resources.js';
export { constructEvent, signPayload, CordWebhookSignatureError } from './webhooks.js';
export type { ConstructEventOptions, WebhookErrorCode } from './webhooks.js';
export { createElementsProxy } from './proxy.js';
export type { ElementsProxyOptions } from './proxy.js';
export { WEBHOOK_EVENT_TYPES, WEBHOOK_EVENT_OBJECTS, isWebhookEventType } from '../../elements/src/contract/webhook-events.js';
export type * from '../../elements/src/contract/webhook-events.js';
export { validateFiscalReceptor, validRfc, validSpainTaxId, validEin } from '../../elements/src/fiscal/index.js';
export type { FiscalReceptorInput, FiscalReceptor, FiscalValidation } from '../../elements/src/fiscal/index.js';

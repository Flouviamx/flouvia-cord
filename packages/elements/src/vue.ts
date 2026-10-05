// Adaptador de Vue 3: el visor de cotizaciones como componente y el núcleo
// headless como composables. Mismo estado y mismas reglas que React.
import { defineComponent, h, ref, shallowRef, onMounted, onUnmounted, watch, type PropType, type ShallowRef } from 'vue';
import { mountCotizador } from './core.js';
import { createCordClient, type CordClientOptions } from './headless/client.js';
import { createQuoteBuilder, type QuoteBuilder, type QuoteBuilderOptions, type QuoteBuilderState } from './headless/quote-builder.js';
import { createFiscalForm, type FiscalForm, type FiscalFormState } from './headless/fiscal-form.js';
import type { ReadableStore } from './headless/store.js';
import type { FiscalReceptorInput } from './fiscal/receptor.js';
import type { CordAppearance, CordElementOptions, CordEvent, CordController } from './types.js';

export const CordCotizador = defineComponent({
    name: 'CordCotizador',
    props: {
        token: { type: String, required: true },
        baseUrl: { type: String, required: false },
        minHeight: { type: Number, required: false },
        appearance: { type: Object as PropType<CordAppearance>, required: false },
    },
    emits: ['ready', 'viewed', 'approved', 'signed', 'rejected', 'message', 'item-comment', 'pay', 'updated', 'status-changed', 'state', 'event'],
    setup(props, { emit, attrs }) {
        const rootEl = ref<HTMLDivElement | null>(null);
        let controller: CordController | null = null;
        let unsubscribe: (() => void) | null = null;

        const teardown = () => {
            unsubscribe?.();
            unsubscribe = null;
            controller?.destroy();
            controller = null;
        };

        const mount = () => {
            if (!rootEl.value) return;
            teardown();
            const opts: CordElementOptions = {
                token: props.token,
                baseUrl: props.baseUrl,
                minHeight: props.minHeight,
                appearance: props.appearance,
                onReady: () => emit('ready'),
                onViewed: (d) => emit('viewed', d),
                onApproved: (d) => emit('approved', d),
                onSigned: (d) => emit('signed', d),
                onRejected: (d) => emit('rejected', d),
                onMessage: (d) => emit('message', d),
                onItemComment: (d) => emit('item-comment', d),
                onPay: (d) => emit('pay', d),
                onUpdated: (d) => emit('updated', d),
                onStatusChanged: (d) => emit('status-changed', d),
                onEvent: (event: CordEvent) => emit('event', event),
            };
            controller = mountCotizador(rootEl.value, opts);
            unsubscribe = controller.state.subscribe((s) => emit('state', s));
        };

        onMounted(mount);
        onUnmounted(teardown);
        watch(() => [props.token, props.baseUrl, props.minHeight, JSON.stringify(props.appearance ?? null)], mount);

        return () => h('div', { ref: rootEl, ...attrs });
    },
});

/** Conecta cualquier store del núcleo headless a un shallowRef de Vue. */
export function useCordStore<T>(store: ReadableStore<T>): ShallowRef<T> {
    const state = shallowRef(store.get());
    const stop = store.subscribe((s) => { state.value = s; });
    onUnmounted(stop);
    return state;
}

export function useCordQuoteBuilder(
    client: CordClientOptions,
    opts: Omit<QuoteBuilderOptions, 'client'> = {},
): { state: ShallowRef<QuoteBuilderState>; builder: QuoteBuilder } {
    const builder = createQuoteBuilder({ ...opts, client: createCordClient(client) });
    return { state: useCordStore(builder), builder };
}

export function useCordFiscalForm(initial?: FiscalReceptorInput): { state: ShallowRef<FiscalFormState>; form: FiscalForm } {
    const form = createFiscalForm(initial);
    return { state: useCordStore(form), form };
}

export default CordCotizador;
export type { CordEvent } from './types.js';
export type { QuoteBuilderState, QuoteBuilder, FiscalFormState, FiscalForm };

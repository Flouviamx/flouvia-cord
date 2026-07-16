import { defineComponent, h, ref, onMounted, onUnmounted, watch } from 'vue';
import { mountCotizador } from './core.js';
import type { CordElementOptions, CordEvent, CordController } from './types.js';

export const CordCotizador = defineComponent({
  name: 'CordCotizador',
  props: {
    token: {
      type: String,
      required: true,
    },
    baseUrl: {
      type: String,
      required: false,
    },
    minHeight: {
      type: Number,
      required: false,
    },
  },
  emits: ['ready', 'viewed', 'approved', 'signed', 'rejected', 'message', 'item-comment', 'pay', 'event'],
  setup(props, { emit, attrs }) {
    const rootEl = ref<HTMLDivElement | null>(null);
    let controller: CordController | null = null;

    const mount = () => {
      if (!rootEl.value) return;
      if (controller) {
        controller.destroy();
      }

      const opts: CordElementOptions = {
        token: props.token,
        baseUrl: props.baseUrl,
        minHeight: props.minHeight,
        onReady: () => emit('ready'),
        onViewed: (d) => emit('viewed', d),
        onApproved: (d) => emit('approved', d),
        onSigned: (d) => emit('signed', d),
        onRejected: (d) => emit('rejected', d),
        onMessage: (d) => emit('message', d),
        onItemComment: (d) => emit('item-comment', d),
        onPay: (d) => emit('pay', d),
        onEvent: (event: CordEvent) => emit('event', event.type, event.detail),
      };

      controller = mountCotizador(rootEl.value, opts);
    };

    onMounted(() => {
      mount();
    });

    onUnmounted(() => {
      if (controller) {
        controller.destroy();
        controller = null;
      }
    });

    watch(() => [props.token, props.baseUrl, props.minHeight], () => {
      mount();
    });

    return () => h('div', { ref: rootEl, ...attrs });
  },
});

export default CordCotizador;
export type { CordEvent } from './types.js';

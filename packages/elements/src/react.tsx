// Wrapper de React para @flouviahq/elements. React es peer dependency OPCIONAL:
// solo se carga si importas '@flouviahq/elements/react'.
//
//   import { CordCotizador } from '@flouviahq/elements/react';
//   <CordCotizador token="abc123" onApproved={(d) => …} />
import { useRef, useEffect } from 'react';
import { mountCotizador } from './core';
import type { CordElementOptions, CordEventDetail } from './types';

export interface CordCotizadorProps {
    token: string;
    baseUrl?: string;
    minHeight?: number;
    className?: string;
    style?: React.CSSProperties;
    onReady?: () => void;
    onApproved?: (detail: CordEventDetail) => void;
    onRejected?: (detail: CordEventDetail) => void;
    onMessage?: (detail: CordEventDetail) => void;
    onPay?: (detail: CordEventDetail) => void;
    onEvent?: (type: string, detail: CordEventDetail) => void;
}

export function CordCotizador(props: CordCotizadorProps) {
    const ref = useRef<HTMLDivElement>(null);
    // Callbacks en un ref para no re-montar el iframe cuando cambian de identidad.
    const cbs = useRef(props);
    cbs.current = props;

    useEffect(() => {
        if (!ref.current) return;
        const opts: CordElementOptions = {
            token: props.token,
            baseUrl: props.baseUrl,
            minHeight: props.minHeight,
            onReady: () => cbs.current.onReady?.(),
            onApproved: (d) => cbs.current.onApproved?.(d),
            onRejected: (d) => cbs.current.onRejected?.(d),
            onMessage: (d) => cbs.current.onMessage?.(d),
            onPay: (d) => cbs.current.onPay?.(d),
            onEvent: (t, d) => cbs.current.onEvent?.(t, d),
        };
        const controller = mountCotizador(ref.current, opts);
        return () => controller.destroy();
        // Solo re-montar si cambia la identidad de la cotización o el origen.
    }, [props.token, props.baseUrl, props.minHeight]);

    return <div ref={ref} className={props.className} style={props.style} />;
}

export default CordCotizador;
export type { CordEventDetail } from './types';

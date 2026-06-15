// Tipos del wrapper de React (@flouviahq/elements/react).
import type { TratoEventDetail } from './index';

export interface TratoCotizadorProps {
    token: string;
    baseUrl?: string;
    minHeight?: number;
    className?: string;
    style?: Record<string, string | number>;
    onReady?: () => void;
    onApproved?: (detail: TratoEventDetail) => void;
    onRejected?: (detail: TratoEventDetail) => void;
    onMessage?: (detail: TratoEventDetail) => void;
    onPay?: (detail: TratoEventDetail) => void;
    onEvent?: (type: string, detail: TratoEventDetail) => void;
}

/** Componente React que monta el cotizador embebido de Trato. */
export declare function TratoCotizador(props: TratoCotizadorProps): any;
export default TratoCotizador;
export type { TratoEventDetail } from './index';

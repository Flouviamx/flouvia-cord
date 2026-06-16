// Tipos del wrapper de React (@flouviahq/elements/react).
import type { CordEventDetail } from './index';

export interface CordCotizadorProps {
    token: string;
    baseUrl?: string;
    minHeight?: number;
    className?: string;
    style?: Record<string, string | number>;
    onReady?: () => void;
    onApproved?: (detail: CordEventDetail) => void;
    onRejected?: (detail: CordEventDetail) => void;
    onMessage?: (detail: CordEventDetail) => void;
    onPay?: (detail: CordEventDetail) => void;
    onEvent?: (type: string, detail: CordEventDetail) => void;
}

/** Componente React que monta el cotizador embebido de Cord. */
export declare function CordCotizador(props: CordCotizadorProps): any;
export default CordCotizador;
export type { CordEventDetail } from './index';

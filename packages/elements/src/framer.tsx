import * as React from 'react';
import { addPropertyControls, ControlType } from 'framer';
import { CordCotizador } from './react.js';

export interface FramerCordCotizadorProps {
    token: string;
    baseUrl?: string;
    style?: React.CSSProperties;
}

export function FramerCordCotizador(props: FramerCordCotizadorProps) {
    const { token, baseUrl, style } = props;

    if (!token || token.trim() === '') {
        return (
            <div style={{
                ...style,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#f3f4f6',
                border: '1px dashed #9ca3af',
                color: '#6b7280',
                padding: '20px',
                textAlign: 'center',
                fontFamily: 'sans-serif'
            }}>
                <div>
                    <strong>Cord Cotizador</strong><br />
                    Select this component and enter your Token in the properties panel.
                </div>
            </div>
        );
    }

    return (
        <CordCotizador
            token={token}
            baseUrl={baseUrl}
            style={{ width: '100%', height: '100%', ...style }}
        />
    );
}

addPropertyControls(FramerCordCotizador, {
    token: {
        type: ControlType.String,
        title: 'Token',
        defaultValue: '',
        placeholder: 'Ej. abc123def456',
    },
    baseUrl: {
        type: ControlType.String,
        title: 'Base URL',
        defaultValue: 'https://cordhq.app',
        placeholder: 'https://cordhq.app',
        hidden(props) {
            return false; // Show for advanced cases like staging
        }
    }
});

export default FramerCordCotizador;

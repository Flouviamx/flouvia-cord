// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { enableDebug, debugLog, setDebugLocale, debugText } from '../packages/elements/src/debug';

describe('barra de depuración', () => {
    it('sigue el idioma de la página y el del Provider', () => {
        document.documentElement.lang = 'en-US';
        expect(debugText().title).toBe('Cord · test mode');
        enableDebug('pk_test_x');
        const panel = document.querySelector('cord-debug-panel')!.shadowRoot!;
        expect(panel.querySelector('strong')!.textContent).toBe('Cord · test mode');
        expect(panel.querySelector('.empty')!.textContent).toBe('No activity yet.');

        setDebugLocale('es');
        expect(panel.querySelector('strong')!.textContent).toBe('Cord · modo prueba');
        debugLog('warning', debugText().testKeyHost('tienda.mx'));
        expect(panel.querySelector('.sum')!.textContent).toContain('Llave de prueba en tienda.mx');
    });

    it('con una llave en vivo no dibuja nada', () => {
        document.body.innerHTML = '';
        enableDebug('pk_live_x');
        expect(document.querySelector('cord-debug-panel')).toBeNull();
    });
});

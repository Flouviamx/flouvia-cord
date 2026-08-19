import { defineConfig } from 'vitest/config';

// Tests UNITARIOS: sin red, sin base de datos, sin Stripe. Cubren las funciones
// puras donde un error cuesta dinero real (divisa, límites de plan, FX, fees).
// La verificación contra servicios reales vive en los scripts `security:*` y
// `test:payments`, que sí tocan Neon y Stripe — son complementarios, no lo mismo.
export default defineConfig({
    test: {
        include: ['test/**/*.test.ts'],
        environment: 'node',
        // Un test que tarda más de esto está hablando con algo que no debería.
        testTimeout: 5000,
    },
});

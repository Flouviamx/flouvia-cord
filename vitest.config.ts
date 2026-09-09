import { defineConfig } from 'vitest/config';

// Regresiones locales: funciones puras, rutas con proveedores simulados y SQL
// en PGlite. test:payments añade contratos estáticos sin secretos de producción.
// Auditorías LIVE de Neon/Stripe y migraciones son scripts separados y explícitos.
export default defineConfig({
    test: {
        include: ['test/**/*.test.ts'],
        environment: 'node',
        // PGlite boots PostgreSQL/WASM: bound CI concurrency to avoid memory
        // pressure and timeout failures when many database suites start together.
        maxWorkers: process.env.CI ? 2 : undefined,
        // Un test que tarda más de esto está hablando con algo que no debería.
        testTimeout: 5000,
    },
});

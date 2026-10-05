// Guarda de los test helpers de la API v1: solo llaves de prueba, y la base
// vuelve a confirmar que la organización es sandbox antes de tocar nada.
import type { ApiAuth } from './apikey';
import { fail } from './apiv1';
import { NotSandboxError } from './sandbox-sim';

export function testModeOnly(auth: ApiAuth): Response | null {
    if (auth.mode !== 'test') return fail('Los simuladores solo funcionan con una llave de prueba (sk_test_).', 'test_mode_only', 403);
    if (auth.type !== 'secret') return fail('Los simuladores requieren una Secret Key desde tu servidor.', 'insufficient_scope', 403);
    return null;
}

export function simulationError(e: unknown): Response {
    if (e instanceof NotSandboxError) return fail(e.message, 'test_mode_only', 403);
    throw e;
}

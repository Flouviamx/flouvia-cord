// Interruptor ÚNICO del envío a la solución pública de facturación electrónica
// de la AEAT (SPFE). Mismo contrato que los rieles fiscales de LatAm
// (`latam/config.ts`) y que Verifactu (`verifactu/sif.ts`):
//
//   SPFE_ENABLED=true        sin esto Cord no envía nada a la SPFE y la
//                            pantalla lo dice. Falla cerrado.
//   SPFE_ENTORNO=produccion  'pruebas' es el valor por defecto a propósito:
//                            subir a producción exige escribirlo. Un valor
//                            desconocido APAGA el riel en vez de adivinar.
//
// Encenderlo no basta: además hace falta que exista el transporte real
// (`transporte.ts`), que depende de especificaciones que la AEAT todavía no
// publicó. El estado que ve el negocio sale de `spfeEstadoRiel()`, que combina
// las dos cosas.
//
// Puro: sin base de datos ni log.

export type EntornoSpfe = 'pruebas' | 'produccion';

export interface SpfeConfig {
    habilitado: boolean;
    entorno: EntornoSpfe;
    /** Por qué está apagado, en vocabulario operativo (log, nunca la UI). */
    motivo?: 'apagado' | 'entorno_invalido';
}

function env(name: string): string {
    const fromMeta = (import.meta as { env?: Record<string, string | undefined> }).env?.[name];
    return String(fromMeta || (typeof process !== 'undefined' ? process.env?.[name] : '') || '').trim();
}

export function spfeConfig(): SpfeConfig {
    const habilitado = env('SPFE_ENABLED').toLowerCase() === 'true';
    const raw = env('SPFE_ENTORNO').toLowerCase();
    const entorno: EntornoSpfe = raw === 'produccion' ? 'produccion' : 'pruebas';
    if (raw && raw !== 'produccion' && raw !== 'pruebas') return { habilitado: false, entorno, motivo: 'entorno_invalido' };
    return habilitado ? { habilitado, entorno } : { habilitado, entorno, motivo: 'apagado' };
}

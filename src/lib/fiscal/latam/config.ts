// Interruptor ÚNICO de cada riel fiscal de LatAm: si Cord habla con la
// autoridad y en qué entorno. Mismo contrato que `verifactuEnvioConfig()`
// (verifactu/sif.ts):
//
//   <PREFIJO>_ENABLED=true          sin esto el riel NO existe: las facturas del
//                                   país siguen como documento comercial y la
//                                   UI lo dice (regla 15). Falla cerrado.
//   <PREFIJO>_ENTORNO=produccion    homologación es el valor por defecto a
//                                   propósito: subir a producción exige
//                                   escribirlo. Un valor desconocido APAGA el
//                                   riel en vez de adivinar el entorno.
//
// El entorno es del despliegue, no de la organización: un despliegue de
// pruebas nunca puede autorizar en producción por un dato que el usuario
// cambió en Ajustes. Las credenciales se guardan por entorno, así que una
// cuenta que subió un certificado de homologación no queda "lista" en un
// despliegue de producción.
//
// Puro: sin base de datos ni log, lo cargan los scripts con Node plano.

// Extensión .ts explícita: este módulo también se carga desde Node plano.
import { RIELES, type EntornoRail, type RailDefinicion, type RailId } from './rieles.ts';

export interface RailConfig {
    habilitado: boolean;
    entorno: EntornoRail;
    /** Por qué está apagado, en vocabulario operativo (solo para el log, nunca para la UI). */
    motivo?: 'apagado' | 'entorno_invalido';
}

function env(name: string): string {
    const fromMeta = (import.meta as { env?: Record<string, string | undefined> }).env?.[name];
    return String(fromMeta || (typeof process !== 'undefined' ? process.env?.[name] : '') || '').trim();
}

export function railConfig(rail: RailId | RailDefinicion): RailConfig {
    const def = typeof rail === 'string' ? RIELES[rail] : rail;
    const habilitado = env(`${def.envPrefijo}_ENABLED`).toLowerCase() === 'true';
    const raw = env(`${def.envPrefijo}_ENTORNO`).toLowerCase();
    const entorno: EntornoRail = raw === 'produccion' ? 'produccion' : 'homologacion';
    if (raw && raw !== 'produccion' && raw !== 'homologacion') {
        return { habilitado: false, entorno, motivo: 'entorno_invalido' };
    }
    return habilitado ? { habilitado, entorno } : { habilitado, entorno, motivo: 'apagado' };
}

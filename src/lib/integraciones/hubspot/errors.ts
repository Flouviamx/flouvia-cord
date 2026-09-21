// Mensajes de HubSpot que sí lee una persona. Igual que en los workflows, lo
// que se GUARDA es el código (`integracion_conexiones.ultimo_error`, la cola de
// sincronización) y el idioma se decide al leer: la fila sobrevive al cambio de
// idioma de la cuenta (regla 36). Los que se devuelven en la misma petición se
// traducen en el borde, con el locale del request.
import { t, type AppLocale } from '../../../i18n/app';

export const HS_ERROR_PREFIX = 'hs.err.';

export type HubSpotErrorCode =
    | 'timeout' | 'rate' | 'temporal' | 'permisos' | 'divisa' | 'pipeline' | 'datos'
    | 'id_inesperado' | 'recurso'
    | 'autorizacion' | 'autorizacion_rechazada' | 'acceso_retirado' | 'renovacion'
    | 'conexion_inactiva' | 'no_disponible'
    | 'sin_conexion' | 'reconectar' | 'sin_sincronizar' | 'registro_ausente'
    | 'integracion_no_disponible' | 'sesion' | 'no_conectado' | 'conecta_para_sync' | 'conecta_para_config'
    | 'pipeline_inexistente' | 'etapa_ajena' | 'pipelines_no_consultables'
    | 'cliente_no_actualizado' | 'interno';

export const hsError = (code: HubSpotErrorCode) => 'hs.err.' + code;

/** Traduce lo guardado o lanzado. Un texto anterior al catálogo se devuelve tal cual. */
export function hubspotErrorText(locale: AppLocale, stored: unknown): string | null {
    if (typeof stored !== 'string' || !stored) return null;
    if (!stored.startsWith(HS_ERROR_PREFIX)) return stored;
    return t(locale, stored as any);
}

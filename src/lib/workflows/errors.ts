// Errores de una ejecución de workflow. Se guardan como CÓDIGO en
// `workflow_runs.error` y en el log de pasos, no como frase: la fila vive para
// siempre y el idioma se decide al LEER (regla 36). Traducirlos al escribir
// dejaba en inglés una cuenta que luego cambió a español, y al revés.
import { t, type AppLocale } from '../../i18n/app';

export const WF_ERROR_PREFIX = 'wf.err.';

export type WorkflowErrorCode =
    | 'evento_ausente' | 'workflow_ausente' | 'plan_workflow' | 'max_pasos' | 'interno' | 'accion_retirada' | 'consulta_retirada'
    | 'limite_tareas' | 'limite_correos' | 'limite_slack' | 'limite_hubspot' | 'limite_cliente' | 'limite_http'
    | 'tarea_titulo' | 'tarea_fallo' | 'sin_destinatarios' | 'correo_no_disponible' | 'mensaje_vacio'
    | 'slack_sin_conexion' | 'slack_rechazo' | 'nota_vacia'
    | 'teams_sin_conexion' | 'teams_rechazo' | 'limite_teams'
    | 'wa_sin_conexion' | 'wa_sin_telefono' | 'wa_plantilla' | 'wa_rechazo' | 'limite_wa'
    | 'hubspot_conexion' | 'hubspot_datos' | 'hubspot_temporal'
    | 'sin_cotizacion' | 'sin_factura' | 'cliente_sin_correo' | 'correo_cliente_fallo' | 'cuota_envios'
    | 'cotizacion_estado' | 'aprobacion_ausente' | 'aprobacion_plan' | 'factura_no_anulable'
    | 'url_invalida' | 'http_rechazo';

export const wfError = (code: WorkflowErrorCode) => 'wf.err.' + code;

/** Traduce lo guardado. Una fila anterior al catálogo trae la frase ya escrita: se devuelve tal cual. */
export function workflowErrorText(locale: AppLocale, stored: unknown): string | null {
    if (typeof stored !== 'string' || !stored) return null;
    if (!stored.startsWith(WF_ERROR_PREFIX)) return stored;
    return t(locale, stored as any);
}

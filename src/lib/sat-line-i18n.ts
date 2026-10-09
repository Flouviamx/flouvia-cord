// Textos del selector de clave SAT por línea (src/lib/sat-line-picker.ts),
// resueltos en servidor para los tres editores. Un solo armado: con uno por
// pantalla, cada editor terminaba con su propia versión del aviso.
import { t } from '../i18n/app';
import type { SatPickerI18n } from './sat-line-picker';

export function satLineI18n(L: 'es' | 'en'): SatPickerI18n & { resumenGenericas: string } {
    return {
        etiqueta: t(L, 'satl.etiqueta'),
        sinClave: t(L, 'satl.sin_clave'),
        avisoGenerica: t(L, 'satl.aviso_generica'),
        editar: t(L, 'satl.editar'),
        producto: t(L, 'pmod.clave_sat'),
        unidad: t(L, 'pmod.clave_unidad'),
        placeholder: t(L, 'pmod.clave_sat_ph'),
        buscando: t(L, 'pmod.sat_buscando'),
        sinResultados: t(L, 'pmod.sat_sin_resultados'),
        noDisponible: t(L, 'pmod.sat_no_disponible'),
        formatoProducto: t(L, 'pmod.sat_formato'),
        formatoUnidad: t(L, 'pmod.sat_unidad_formato'),
        aplicar: t(L, 'satl.aplicar'),
        quitar: t(L, 'satl.quitar'),
        resumenGenericas: t(L, 'satl.resumen_genericas'),
    };
}

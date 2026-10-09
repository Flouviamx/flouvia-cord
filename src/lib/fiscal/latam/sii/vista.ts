// Lo que comparten las rutas de Ajustes del SII (/api/fiscal/sii y
// /api/fiscal/sii-folios): si la cuenta puede configurar el riel y la vista
// del estado que vuelve al navegador. Nunca un PEM ni el contenido de un CAF.

import { sql, withOrgTx } from '../../../db';
import { railConfig } from '../config';
import { estadoSii } from './estado';

/** Motivo (apto para el usuario) por el que esta cuenta no puede configurar el SII; null si puede. */
export async function motivoSinSii(orgId: string): Promise<string | null> {
    // Sin el SII activo en el despliegue nada consume lo que se guardaría
    // (regla 15): la pantalla dice "Próximamente" y el endpoint, lo mismo.
    if (!railConfig('sii').habilitado) {
        return 'La factura electrónica con el SII todavía no está disponible en Cord. Te avisaremos cuando puedas conectarla.';
    }
    const [[org]] = await withOrgTx(orgId, sql`select country_code from orgs where id = ${orgId}`);
    if (String(org?.country_code || '').toUpperCase() !== 'CL') {
        return 'La factura electrónica con el SII es una capacidad de Chile. Esta cuenta no está configurada con ese país.';
    }
    return null;
}

export async function vistaSii(orgId: string) {
    const e = await estadoSii(orgId);
    return {
        habilitado: e.habilitado,
        entorno: e.entorno,
        listo: e.listo,
        faltantes: e.faltantes,
        rut: e.rut,
        ajustes: e.ajustes,
        folios: e.folios,
        cafs: e.cafs,
        credencial: e.credencial ? {
            identificador: e.credencial.identificador,
            nombre: e.credencial.nombreArchivo,
            sujeto: e.credencial.sujeto,
            caduca: e.credencial.caduca.slice(0, 10),
            vencida: e.credencial.vencida,
            verificado_at: e.credencial.verificadoAt,
            verificacion_error: e.credencial.verificacionError,
        } : null,
    };
}

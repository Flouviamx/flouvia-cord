// ¿Está listo el riel de la DIAN para esta organización? Una sola respuesta
// para la UI (Ajustes › Datos fiscales), para document-kind.ts (qué tipo de
// documento nace) y para el proveedor (si emite o degrada a comercial).
//
// Listo = el despliegue tiene la DIAN encendida (DIAN_ENABLED) + los datos del
// emisor (NIT, razón social, dirección de Cord; tipo de persona,
// responsabilidades, tributo y municipio del riel) + el software registrado
// ante la DIAN, la resolución de numeración DEL ENTORNO del despliegue y el
// prefijo de las notas + un certificado de firma vigente, con su cadena, a
// nombre del NIT y con el PIN del software y la clave técnica del rango.
// Faltando cualquiera, las facturas siguen como documento comercial y la
// pantalla dice qué falta (regla 15).

import { sql, withOrgTx } from '../../../db';
import { railConfig } from '../config';
import { credencialActiva, leerAjustes, type ResumenCredencial } from '../credenciales';
import type { EntornoRail } from '../rieles';
import { metadata } from '../../parties';
import {
    claveSecuencia, faltantesAjustes, faltantesCredencial, ultimoUsado, type AjustesDian, type FaltanteDian, type IdentidadEmisor,
} from './autorizacion';
import { avisoNumeracion, nitValido, type AvisoNumeracion } from './comprobante';

export interface EstadoDian {
    /** El despliegue habla con la DIAN. */
    habilitado: boolean;
    entorno: EntornoRail;
    credencial: ResumenCredencial | null;
    /** Si el PIN y la clave técnica están guardados (nunca su valor). */
    secretos: { pin: boolean; claveTecnica: boolean };
    ajustes: Partial<AjustesDian>;
    identidad: IdentidadEmisor;
    /** NIT del negocio normalizado, sin DV; null si falta o no es válido. */
    nit: string | null;
    dv: string | null;
    /** Lo que falta, como código (la pantalla lo traduce). Vacío = listo. */
    faltantes: FaltanteDian[];
    /** Aviso de fin de rango o de vigencia de la resolución del entorno. */
    numeracion: AvisoNumeracion | null;
    listo: boolean;
}

/** Identidad fiscal de la organización (Ajustes › Datos fiscales), la misma que congela parties.ts. */
export async function identidadDeOrg(orgId: string): Promise<IdentidadEmisor> {
    const [[o]] = await withOrgTx(orgId, sql`
        select fiscal_metadata, rfc, razon_social, nombre, direccion from orgs where id = ${orgId} limit 1`);
    const m = metadata(o?.fiscal_metadata);
    return {
        taxId: m.tax_id || (o?.rfc ? String(o.rfc) : null),
        legalName: m.legal_name || String(o?.razon_social || o?.nombre || ''),
        line1: m.address_line1 || (o?.direccion ? String(o.direccion) : null),
        line2: m.address_line2 || null,
        postalCode: m.postal_code || null,
    };
}

export async function estadoDian(orgId: string): Promise<EstadoDian> {
    const config = railConfig('dian');
    const [identidad, ajustes, credencial] = await Promise.all([
        identidadDeOrg(orgId),
        leerAjustes<AjustesDian>(orgId, 'dian'),
        credencialActiva(orgId, 'dian', config.entorno),
    ]);
    const nit = nitValido(identidad.taxId);
    const faltantes: FaltanteDian[] = [
        ...faltantesAjustes(identidad, ajustes, config.entorno),
        ...faltantesCredencial(credencial, credencial?.secretos ?? null, nit?.nit),
    ];
    const resolucion = ajustes.numeracion?.[config.entorno];
    let numeracion: AvisoNumeracion | null = null;
    if (resolucion && !faltantes.includes('resolucion')) {
        numeracion = avisoNumeracion(resolucion, await ultimoUsado(orgId, claveSecuencia(config.entorno, { prefijo: resolucion.prefijo, clase: 'factura' })));
    }
    // El resumen nunca lleva el PEM ni los secretos.
    const resumen: ResumenCredencial | null = credencial ? {
        entorno: credencial.entorno, identificador: credencial.identificador, nombreArchivo: credencial.nombreArchivo,
        sujeto: credencial.sujeto, huellaSha256: credencial.huellaSha256, vigenteDesde: credencial.vigenteDesde,
        caduca: credencial.caduca, subidoAt: credencial.subidoAt, verificadoAt: credencial.verificadoAt,
        verificacionError: credencial.verificacionError, vencida: credencial.vencida,
    } : null;
    return {
        habilitado: config.habilitado,
        entorno: config.entorno,
        credencial: resumen,
        secretos: { pin: /^\d{5}$/.test(String(credencial?.secretos.pin ?? '')), claveTecnica: !!credencial?.secretos.claveTecnica },
        ajustes,
        identidad,
        nit: nit?.nit ?? null,
        dv: nit?.dv ?? null,
        faltantes,
        numeracion,
        // Un rango agotado o vencido NO degrada a comercial en silencio: la
        // emisión falla con el mensaje de qué renovar (conNumero).
        listo: config.habilitado && faltantes.length === 0,
    };
}

export async function dianListo(orgId: string): Promise<boolean> {
    if (!railConfig('dian').habilitado) return false;
    return (await estadoDian(orgId)).listo;
}

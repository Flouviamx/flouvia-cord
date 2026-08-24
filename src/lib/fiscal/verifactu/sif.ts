// Identidad del SIF (Sistema Informático de Facturación) que Cord declara
// ante la AEAT como DESARROLLADOR del software — nunca el NIF del cliente.
// Verificado contra el ejemplo oficial del bloque `SistemaInformatico` en
// "Descripción de los servicios web" (AEAT, v1.0.3, §9.1.1.1): NombreRazon,
// NIF, NombreSistemaInformatico, IdSistemaInformatico, Version,
// NumeroInstalacion, TipoUsoPosibleSoloVerifactu, TipoUsoPosibleMultiOT,
// IndicadorMultiplesOT — en ese orden.

export interface SistemaInformaticoIdentity {
    nombreRazon: string;
    nif: string;
    nombreSistemaInformatico: string;
    idSistemaInformatico: string;
    version: string;
    numeroInstalacion: string;
    /** Cord solo opera remisión en tiempo real (VERI*FACTU) — nunca el modo diferido "no VERI*FACTU". */
    tipoUsoPosibleSoloVerifactu: 'S' | 'N';
    /** Cord es SaaS multi-tenant: SIEMPRE 'S' — una instalación sirve a muchos obligados tributarios. */
    tipoUsoPosibleMultiOT: 'S' | 'N';
    indicadorMultiplesOT: 'S' | 'N';
}

export class SifNotConfiguredError extends Error {}

/**
 * Lee la identidad del SIF desde el entorno. Lanza si faltan las piezas que
 * identifican a Cord ante la AEAT — sin ellas, `SistemaInformatico` (elemento
 * OBLIGATORIO del registro, RegistroFacturacionAltaType) no se puede rellenar
 * con datos reales, y un registro Verifactu con ese bloque inventado sería un
 * registro inválido escrito de forma permanente (la cadena es append-only).
 */
export function requireSifIdentity(): SistemaInformaticoIdentity {
    const nif = String(import.meta.env?.VERIFACTU_SIF_NIF || process.env.VERIFACTU_SIF_NIF || '').trim().toUpperCase();
    const nombreRazon = String(import.meta.env?.VERIFACTU_SIF_NOMBRE || process.env.VERIFACTU_SIF_NOMBRE || '').trim();
    const idSistemaInformatico = String(import.meta.env?.VERIFACTU_SIF_ID || process.env.VERIFACTU_SIF_ID || '').trim();
    if (!nif || !nombreRazon || !idSistemaInformatico) {
        throw new SifNotConfiguredError(
            'Cord no tiene configurada su identidad de Sistema Informático de Facturación (VERIFACTU_SIF_NIF / VERIFACTU_SIF_NOMBRE / VERIFACTU_SIF_ID) — ' +
            'sin ella no se puede generar un registro Verifactu válido.',
        );
    }
    const version = String(import.meta.env?.VERIFACTU_SIF_VERSION || process.env.VERIFACTU_SIF_VERSION || '1.0').trim().slice(0, 50);
    const numeroInstalacion = String(import.meta.env?.VERIFACTU_SIF_INSTALACION || process.env.VERIFACTU_SIF_INSTALACION || 'CORD-PROD').trim().slice(0, 100);
    return {
        nombreRazon: nombreRazon.slice(0, 120),
        nif,
        nombreSistemaInformatico: 'Cord',
        idSistemaInformatico: idSistemaInformatico.slice(0, 2),
        version,
        numeroInstalacion,
        tipoUsoPosibleSoloVerifactu: 'S',
        tipoUsoPosibleMultiOT: 'S',
        indicadorMultiplesOT: 'S',
    };
}

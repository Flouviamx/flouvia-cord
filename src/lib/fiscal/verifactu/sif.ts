// Identidad del SIF (Sistema Informático de Facturación) que Cord declara
// ante la AEAT como PRODUCTOR del software — nunca el NIF del cliente.
// Verificado contra `SistemaInformaticoType` de SuministroInformacion.xsd y las
// validaciones de negocio §3.1.5 de "Validaciones y errores" (AEAT v1.2.2):
// NombreRazon, NIF o IDOtro, NombreSistemaInformatico, IdSistemaInformatico,
// Version, NumeroInstalacion, TipoUsoPosibleSoloVerifactu,
// TipoUsoPosibleMultiOT, IndicadorMultiplesOT — en ese orden.
//
// Puro (sin base de datos ni log) a propósito: verifactu-check.mjs lo carga con
// Node plano. Lo que depende de la organización (número de instalación,
// indicador de múltiples obligados) lo resuelve chain.ts y se combina aquí con
// `identidadSifParaOrg`.

// Extensión .ts explícita: este módulo también se carga desde Node plano.
import { exigirNifEs, textoAEAT, validarIdOtro, VerifactuDatosError, type IdOtro } from './validacion.ts';

export interface SistemaInformaticoIdentity {
    nombreRazon: string;
    /** NIF español del productor. Exactamente uno de `nif` / `idOtro` (choice del esquema). */
    nif?: string;
    /** Productor sin NIF español: país + tipo + identificador (IDOtroType). */
    idOtro?: IdOtro;
    nombreSistemaInformatico: string;
    idSistemaInformatico: string;
    version: string;
    numeroInstalacion: string;
    /** Cord solo opera remisión en tiempo real (VERI*FACTU) — nunca el modo "no VERI*FACTU". */
    tipoUsoPosibleSoloVerifactu: 'S' | 'N';
    /** El producto puede llevar la facturación de varios obligados: Cord es SaaS multi-organización. */
    tipoUsoPosibleMultiOT: 'S' | 'N';
    /** Si ESTE usuario del SaaS lleva más de una facturación (FAQ desarrolladores §4). Se calcula por organización. */
    indicadorMultiplesOT: 'S' | 'N';
}

/**
 * La identidad del productor no está configurada (o es inválida). `message` es
 * apto para el dueño del negocio (regla 14: no nombra variables ni
 * proveedores); `detalle` es vocabulario operativo y solo va al log.
 */
export class SifNotConfiguredError extends Error {
    readonly detalle: string;
    constructor(detalle: string) {
        super('El registro de facturas ante la AEAT (Verifactu) no está disponible en este momento. La factura se conserva sin emitir; escríbenos a soporte@flouvia.com.');
        this.name = 'SifNotConfiguredError';
        this.detalle = detalle;
    }
}

function env(name: string): string {
    const fromMeta = import.meta.env?.[name] as string | undefined;
    return String(fromMeta || (typeof process !== 'undefined' ? process.env?.[name] : '') || '').trim();
}

/** Interruptor ÚNICO de Verifactu: si se envía y a qué entorno de la AEAT. */
export interface VerifactuEnvioConfig {
    /** Remisión a la AEAT activada. Sin esto Cord NO genera registros (ver SpainVerifactuProvider). */
    habilitado: boolean;
    /** 'pruebas' = portal de pruebas externas (prewww1/prewww2); 'produccion' = sede real. */
    entorno: 'pruebas' | 'produccion';
}

/**
 * Una sola fuente para "¿Cord registra facturas en la AEAT?" y "¿en qué
 * entorno?". El QR impreso, el endpoint del envío y la decisión de encadenar
 * salen de aquí: antes el QR apuntaba a producción mientras el envío iba al
 * entorno de pruebas, y se encadenaban registros con el envío apagado — una
 * factura con QR de VERI*FACTU que nunca iba a llegar a la AEAT.
 *
 * El entorno de pruebas es el valor por defecto a propósito: subir a
 * producción exige escribir `false` explícitamente.
 */
export function verifactuEnvioConfig(): VerifactuEnvioConfig {
    return {
        habilitado: env('VERIFACTU_AEAT_ENABLED').toLowerCase() === 'true',
        entorno: env('VERIFACTU_AEAT_SANDBOX').toLowerCase() === 'false' ? 'produccion' : 'pruebas',
    };
}

/** Identidad del productor SIN los dos campos que dependen de la organización. */
export type SifIdentidadBase = Omit<SistemaInformaticoIdentity, 'numeroInstalacion' | 'indicadorMultiplesOT'> & {
    /** Prefijo del número de instalación por organización (estable entre despliegues). */
    prefijoInstalacion: string;
};

/**
 * Lee y VALIDA la identidad del productor desde el entorno. Lanza
 * `SifNotConfiguredError` si falta o es inválida: `SistemaInformatico` es
 * obligatorio en cada registro y la cadena es append-only, así que un registro
 * con este bloque inventado o mal formado mentiría para siempre.
 *
 * El productor se identifica con NIF español (`VERIFACTU_SIF_NIF`) o, si no lo
 * tiene, con `VERIFACTU_SIF_ID_OTRO_PAIS` + `_TIPO` + `_ID` (IDOtroType): una
 * empresa extranjera que desarrolla el software no necesita NIF español para
 * declararse productora ante la AEAT.
 */
export function requireSifIdentity(): SifIdentidadBase {
    const nombreRazon = textoAEAT(env('VERIFACTU_SIF_NOMBRE'), 120);
    const idSistemaInformatico = env('VERIFACTU_SIF_ID').toUpperCase();
    const nifRaw = env('VERIFACTU_SIF_NIF');
    const otroPais = env('VERIFACTU_SIF_ID_OTRO_PAIS');
    const otroTipo = env('VERIFACTU_SIF_ID_OTRO_TIPO');
    const otroId = env('VERIFACTU_SIF_ID_OTRO_ID');

    if (!nombreRazon) throw new SifNotConfiguredError('Falta VERIFACTU_SIF_NOMBRE (razón social del productor del SIF).');
    // §3.1.5: dos posiciones, cada una letra mayúscula (sin Ñ) o dígito. Antes
    // se recortaba con slice(0, 2) sin validar: "C" o "c1" llegaban tal cual.
    if (!/^[A-Z0-9]{2}$/.test(idSistemaInformatico)) {
        throw new SifNotConfiguredError('VERIFACTU_SIF_ID debe tener exactamente 2 caracteres [A-Z0-9].');
    }

    let identificacion: { nif: string } | { idOtro: IdOtro };
    try {
        if (nifRaw) {
            identificacion = { nif: exigirNifEs(nifRaw, 'del productor del software') };
        } else if (otroTipo || otroId || otroPais) {
            if (otroTipo === '07') throw new VerifactuDatosError('IDType 07 (no censado) no se admite para el productor.');
            identificacion = { idOtro: validarIdOtro({ codigoPais: otroPais, idType: otroTipo, id: otroId }, 'del productor del software') };
        } else {
            throw new SifNotConfiguredError(
                'Falta la identificación del productor: VERIFACTU_SIF_NIF, o VERIFACTU_SIF_ID_OTRO_PAIS + VERIFACTU_SIF_ID_OTRO_TIPO + VERIFACTU_SIF_ID_OTRO_ID.',
            );
        }
    } catch (error) {
        if (error instanceof SifNotConfiguredError) throw error;
        throw new SifNotConfiguredError(
            `Identificación del productor inválida (${nifRaw ? 'VERIFACTU_SIF_NIF' : 'VERIFACTU_SIF_ID_OTRO_PAIS/_TIPO/_ID'}): ${error instanceof Error ? error.message : String(error)}`,
        );
    }

    const version = textoAEAT(env('VERIFACTU_SIF_VERSION') || '1.0', 50);
    const prefijoInstalacion = textoAEAT(env('VERIFACTU_SIF_INSTALACION') || 'CORD', 50).replace(/\s+/g, '-');
    return {
        nombreRazon,
        ...identificacion,
        nombreSistemaInformatico: 'Cord',
        idSistemaInformatico,
        version,
        prefijoInstalacion,
        tipoUsoPosibleSoloVerifactu: 'S',
        tipoUsoPosibleMultiOT: 'S',
    };
}

/**
 * Número de instalación de una organización que todavía no tiene registros.
 * La FAQ de desarrolladores (§4) exige que no se repita NUNCA entre las
 * facturaciones de un mismo obligado y que cada facturación de un SaaS sea su
 * propio "SIF virtual": el id de la organización cumple las dos cosas. El
 * valor fijo anterior ('CORD-PROD') hacía que dos organizaciones con el mismo
 * NIF se declararan como el MISMO sistema con dos cadenas distintas.
 */
export function numeroInstalacionPorOrg(prefijo: string, orgId: string): string {
    return textoAEAT(`${prefijo}-${orgId}`, 100);
}

/** Identidad completa para el registro de una organización concreta. */
export function identidadSifParaOrg(
    base: SifIdentidadBase,
    org: { numeroInstalacion: string; multiplesOT: boolean },
): SistemaInformaticoIdentity {
    const { prefijoInstalacion: _prefijo, ...rest } = base;
    return {
        ...rest,
        numeroInstalacion: textoAEAT(org.numeroInstalacion, 100),
        indicadorMultiplesOT: org.multiplesOT ? 'S' : 'N',
    };
}

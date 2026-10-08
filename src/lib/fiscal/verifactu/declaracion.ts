// Declaración responsable del sistema informático de facturación (SIF).
//
// RD 1007/2023, art. 13, y Orden HAC/1177/2024, art. 15: el productor del
// software declara que el sistema, en una versión concreta, cumple el
// Reglamento. La declaración tiene contenido mínimo y orden fijos (apartado
// 1.a a 1.l, cada dato precedido de su texto explicativo), un anexo
// recomendado (apartado 2) y debe estar "disponible de manera legible e
// individualizada dentro del propio sistema informático" (apartado 3). No se
// presenta ante la AEAT.
//
// Los textos explicativos siguen literalmente el documento de la AEAT
// "Ejemplos de declaraciones responsables de sistemas informáticos de
// facturación" (v0.5.1), incluida la variante del apartado 1.i para un
// productor sin NIF español (Identificación: número, tipo y país).
//
// Se construye desde la MISMA identidad que viaja en cada registro
// (`requireSifIdentity`): nombre, código, versión y productor no pueden
// diferir entre lo declarado y lo que el sistema le dice a la AEAT. Una
// versión nueva exige una declaración nueva (fecha nueva).
//
// Puro (sin base de datos): también lo carga Node plano desde los scripts.

import { countryName } from '../../countries.ts';
import { rfcPersona } from '../../../../packages/elements/src/fiscal/tax-id.ts';
import { datosDeclaracion, requireSifIdentity, type SifIdentidadBase } from './sif.ts';

export const DECLARACION_TITULO = 'DECLARACIÓN RESPONSABLE DEL SISTEMA INFORMÁTICO DE FACTURACIÓN';

/** Ruta pública de la declaración dentro del sistema (apartado 3). */
export const DECLARACION_RUTA = '/verifactu/declaracion-responsable';

/** Tipos de identificación de la AEAT (L7 de las listas de valores) que admite el productor. */
const TIPO_IDENTIFICACION: Record<string, string> = {
    '02': 'NIF-IVA (número de IVA comunitario)',
    '03': 'Pasaporte',
    '04': 'Documento oficial de identificación expedido por el país o territorio de residencia',
    '05': 'Certificado de residencia',
    '06': 'Otro documento probatorio',
};

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** "2026-10-08" → "8 de octubre de 2026". */
export function fechaDeclaracionTexto(iso: string): string {
    const [y, m, d] = iso.split('-').map(Number);
    return `${d} de ${MESES[m - 1]} de ${y}`;
}

export interface ApartadoDeclaracion {
    /** "1.a", "1.b"… "2.c". */
    clave: string;
    /** Título corto para el índice de la página (no forma parte del texto legal). */
    corto: string;
    /** Texto explicativo que precede al dato (literal del modelo de la AEAT). */
    texto: string;
    /** El dato: uno o varios párrafos. */
    valor: string[];
}

export interface DeclaracionResponsable {
    titulo: string;
    /** aaaa-mm-dd en que se suscribe. */
    fecha: string;
    fechaTexto: string;
    /** 'persona' si el productor es una persona física (cambia los textos, nota i del modelo de la AEAT). */
    productor: 'persona' | 'entidad';
    nombreSistema: string;
    idSistema: string;
    version: string;
    apartados: ApartadoDeclaracion[];
    anexo: ApartadoDeclaracion[];
}

const SISTEMA = 'del sistema informático a que se refiere esta declaración responsable';

/**
 * ¿El productor es una persona física o una entidad? Lo dice su propio
 * identificador: un NIF español de persona (DNI, NIE, K/L/M) o un RFC
 * mexicano de 13 caracteres. `VERIFACTU_SIF_PRODUCTOR` ('persona' | 'entidad')
 * lo fija a mano cuando el identificador no lo deja claro.
 */
export function tipoProductor(sif: Pick<SifIdentidadBase, 'nif' | 'idOtro'>): 'persona' | 'entidad' {
    const forzado = String((typeof process !== 'undefined' ? process.env?.VERIFACTU_SIF_PRODUCTOR : '') || '').trim().toLowerCase();
    if (forzado === 'persona' || forzado === 'entidad') return forzado;
    if (sif.nif) return /^[0-9XYZKLM]/.test(sif.nif) ? 'persona' : 'entidad';
    if (sif.idOtro?.codigoPais === 'MX' && rfcPersona(sif.idOtro.id) === 'fisica') return 'persona';
    return 'entidad';
}

function identificacionProductor(sif: SifIdentidadBase, quien: string): ApartadoDeclaracion {
    if (sif.nif) {
        return {
            clave: '1.i',
            corto: 'Identificación del productor',
            texto: `Número de identificación fiscal (NIF) español de la ${quien} ${SISTEMA}:`,
            valor: [sif.nif],
        };
    }
    const otro = sif.idOtro!;
    const pais = otro.codigoPais || otro.id.slice(0, 2);
    return {
        clave: '1.i',
        corto: 'Identificación del productor',
        texto: `Identificación de la ${quien} ${SISTEMA}:`,
        valor: [
            `Número de identificación: ${otro.id}`,
            `Tipo de identificación: ${otro.idType} – ${TIPO_IDENTIFICACION[otro.idType] ?? 'Otro documento probatorio'}.`,
            `País de emisión de la identificación: ${pais} - ${countryName(pais, 'es')}.`,
        ],
    };
}

/**
 * La declaración completa. Lanza `SifNotConfiguredError` si falta cualquier
 * dato obligatorio: sin declaración, el sistema no debe registrar facturas
 * (`requireSifIdentity` aplica la misma regla a la emisión).
 */
export function declaracionResponsable(): DeclaracionResponsable {
    const sif = requireSifIdentity();
    const datos = datosDeclaracion();
    // Nota i del modelo de la AEAT: con una persona productora, "Razón social de
    // la entidad productora" pasa a "Nombre y apellidos de la persona
    // productora", y "entidad productora" a "persona productora" en 1.i–1.l.
    const productor = tipoProductor(sif);
    const quien = productor === 'persona' ? 'persona productora' : 'entidad productora';
    const apartados: ApartadoDeclaracion[] = [
        {
            clave: '1.a',
            corto: 'Nombre del sistema',
            texto: 'Nombre del sistema informático a que se refiere esta declaración responsable:',
            valor: [sif.nombreSistemaInformatico],
        },
        {
            clave: '1.b',
            corto: 'Código identificador',
            texto: 'Código identificador del sistema informático a que se refiere el apartado a) de esta declaración responsable:',
            valor: [sif.idSistemaInformatico],
        },
        {
            clave: '1.c',
            corto: 'Versión',
            texto: 'Identificador completo de la versión concreta del sistema informático a que se refiere esta declaración responsable:',
            valor: [sif.version],
        },
        {
            clave: '1.d',
            corto: 'Componentes y funciones',
            texto: 'Componentes, hardware y software, de que consta el sistema informático a que se refiere esta declaración responsable, junto con una breve descripción de lo que hace dicho sistema informático y de sus principales funcionalidades:',
            valor: [
                `${sif.nombreSistemaInformatico} es un sistema de software que se presta como servicio en la nube: el usuario accede a él con un navegador web o mediante su interfaz de programación (API), sin instalar software ni aportar hardware propio. Se ejecuta en servidores y en una base de datos transaccional contratados y operados por la ${quien}; el usuario no tiene acceso a ellos ni puede modificar el sistema.`,
                'Permite capturar la información de facturación, expedir facturas y facturas rectificativas, enviarlas y cobrarlas, consultarlas y exportar los datos de facturación. Para cada factura expedida en España genera el registro de facturación de alta (y, en su caso, de anulación), lo encadena mediante su huella con el registro anterior y lo remite automáticamente a los servicios electrónicos de la Agencia Tributaria, y representa en la factura el código QR y la leyenda que exige la normativa.',
                'El sistema gestiona de forma independiente la facturación de cada organización usuaria, con su propia cadena de registros y su propio número de instalación, cumpliendo separadamente para cada una con la normativa mencionada en el apartado 1.k) de esta declaración responsable, como si, en la práctica, se tratara de sistemas informáticos de facturación distintos.',
            ],
        },
        {
            clave: '1.e',
            corto: 'Uso exclusivo VERI*FACTU',
            texto: 'Indicación de si el sistema informático a que se refiere esta declaración responsable se ha producido de tal manera que, a los efectos de cumplir con el Reglamento, solo pueda funcionar exclusivamente como «VERI*FACTU»:',
            valor: [sif.tipoUsoPosibleSoloVerifactu === 'S' ? 'S - Sí' : 'N - No'],
        },
        {
            clave: '1.f',
            corto: 'Varios obligados tributarios',
            texto: 'Indicación de si el sistema informático a que se refiere la declaración responsable permite ser usado por varios obligados tributarios o por un mismo usuario para dar soporte a la facturación de varios obligados tributarios:',
            valor: [sif.tipoUsoPosibleMultiOT === 'S' ? 'S - Sí' : 'N - No'],
        },
        {
            clave: '1.g',
            corto: 'Tipos de firma',
            texto: 'Tipos de firma utilizados para firmar los registros de facturación y de evento en el caso de que el sistema informático a que se refiere esta declaración responsable no sea utilizado como «VERI*FACTU»:',
            valor: ['Dado que se trata de un sistema de facturación que solo puede ser utilizado exclusivamente en la modalidad de «VERI*FACTU», no se realiza una firma electrónica expresa de los registros de facturación generados, ya que la normativa considera que quedan firmados al ser remitidos correctamente a los servicios electrónicos de la Agencia Tributaria con la debida autenticación mediante el adecuado certificado electrónico cualificado.'],
        },
        {
            clave: '1.h',
            corto: productor === 'persona' ? 'Persona productora' : 'Entidad productora',
            texto: productor === 'persona'
                ? `Nombre y apellidos de la persona productora ${SISTEMA}:`
                : `Razón social de la entidad productora ${SISTEMA}:`,
            valor: [sif.nombreRazon],
        },
        identificacionProductor(sif, quien),
        {
            clave: '1.j',
            corto: 'Dirección postal',
            texto: `Dirección postal completa de contacto de la ${quien} ${SISTEMA}:`,
            valor: datos.direccion,
        },
        {
            clave: '1.k',
            corto: 'Cumplimiento normativo',
            texto: `La ${quien} del sistema informático a que se refiere esta declaración responsable hace constar que dicho sistema informático, en la versión indicada en ella, cumple con lo dispuesto en el artículo 29.2.j) de la Ley 58/2003, de 17 de diciembre, General Tributaria, en el Reglamento que establece los requisitos que deben adoptar los sistemas y programas informáticos o electrónicos que soporten los procesos de facturación de empresarios y profesionales, y la estandarización de formatos de los registros de facturación, aprobado por el Real Decreto 1007/2023, de 5 de diciembre, en la Orden HAC/1177/2024, de 17 de octubre, y en la sede electrónica de la Agencia Estatal de Administración Tributaria para todo aquello que complete las especificaciones de dicha orden.`,
            valor: [],
        },
        {
            clave: '1.l',
            corto: 'Fecha y lugar',
            texto: `Fecha y lugar en que la ${quien} de este sistema informático suscribe esta declaración responsable del mismo:`,
            valor: [`Fecha: ${fechaDeclaracionTexto(datos.fecha)}.`, `Lugar: ${datos.lugar}.`],
        },
    ];

    const anexo: ApartadoDeclaracion[] = [
        {
            clave: '2.a',
            corto: 'Otras formas de contacto',
            texto: `Otras formas de contacto con la ${quien} ${SISTEMA}:`,
            valor: ['Correo electrónico: soporte@flouvia.com'],
        },
        {
            clave: '2.b',
            corto: 'Direcciones de internet',
            texto: `Direcciones de internet de la ${quien} ${SISTEMA}:`,
            valor: [
                'Sitio web del sistema: https://cordhq.app/',
                `Esta declaración responsable: https://cordhq.app${DECLARACION_RUTA}`,
            ],
        },
        {
            clave: '2.c',
            corto: 'Cómo cumple la Orden',
            texto: 'El sistema informático a que se refiere esta declaración responsable cumple las diferentes especificaciones técnicas y funcionales contenidas en la Orden HAC/1177/2024, de 17 de octubre, y en la sede electrónica de la Agencia Estatal de Administración Tributaria para todo aquello que complete las especificaciones de dicha orden, de la siguiente manera:',
            valor: [
                'Además del modo que es de obligado cumplimiento en ciertos casos (como el algoritmo de huella a emplear), otras implementaciones utilizadas son:',
                'El registro de facturación se genera y se encadena antes de que la factura conste como expedida: si no se puede generar, la factura no se expide. Los registros ya generados no pueden modificarse ni borrarse; una corrección se hace siempre con un registro nuevo.',
                'La remisión a la Agencia Tributaria es automática y respeta el tiempo de espera entre envíos que indica la propia Agencia. Un fallo de comunicación no impide expedir facturas: los registros quedan pendientes y se remiten en cuanto el servicio responde.',
                'Antes de generar cada registro se validan sus datos (identificadores fiscales, formatos, longitudes y tipos impositivos) conforme a los esquemas y las validaciones publicados por la Agencia Tributaria.',
            ],
        },
    ];

    return {
        titulo: DECLARACION_TITULO,
        fecha: datos.fecha,
        fechaTexto: fechaDeclaracionTexto(datos.fecha),
        productor,
        nombreSistema: sif.nombreSistemaInformatico,
        idSistema: sif.idSistemaInformatico,
        version: sif.version,
        apartados,
        anexo,
    };
}

/** La declaración, o `null` si el sistema todavía no tiene una completa. */
export function declaracionResponsableONull(): DeclaracionResponsable | null {
    try { return declaracionResponsable(); } catch { return null; }
}

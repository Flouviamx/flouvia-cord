// Qué documento pedirle a una persona, y cómo se llama en su país.
//
// ── Qué está VERIFICADO y qué no ────────────────────────────────────────────
//
// Verificado literal en la documentación del proveedor (consultada el
// 26-ago-2026, `acceptable-verification-documents`):
//
//   · Las tres categorías aceptadas son «pasaporte, licencia de conducir o
//     documento de identidad emitido por un organismo público».
//   · «Si el país de residencia difiere del país de la cuenta, se requerirá un
//     pasaporte para verificar la identidad.»
//   · «No puedes usar un único documento para cumplir con varios requisitos al
//     mismo tiempo» — identidad y domicilio deben ser documentos DISTINTOS.
//   · «Cuando el reverso de un documento contenga información requerida […]
//     incluye una imagen del reverso.»
//   · Las identificaciones con foto deben ser a COLOR; un escaneo que no sea
//     identificación con foto puede ir en blanco y negro.
//   · Fotos en JPEG o PNG; los escaneos, en PDF.
//
// **NO verificado**: el listado exacto de documentos que el proveedor acepta en
// cada país. Esa página construye el desplegable en el cliente, así que no se
// puede leer sin un navegador. Por eso este catálogo NO afirma "el proveedor
// acepta exactamente esto": sólo traduce las tres categorías confirmadas al
// NOMBRE LOCAL con el que la persona reconoce su documento, y dice si esa
// familia suele llevar reverso. Es vocabulario, no una promesa de aceptación.
//
// Qué documentos FALTAN lo sigue diciendo `requirements` del proveedor
// (`connect-requirements.ts`). Esto sólo sugiere cuál traer — no decide nada.

export type TipoDocumento = 'pasaporte' | 'id_nacional' | 'licencia' | 'residencia';

export interface OpcionDocumento {
    tipo: TipoDocumento;
    /** Nombre con el que la persona reconoce su documento. */
    nombre: string;
    nombreEn: string;
    /**
     * Si esa familia de documentos lleva información en el reverso. El pasaporte
     * nunca; las tarjetas de identidad y las licencias, casi siempre.
     */
    reverso: boolean;
}

const PASAPORTE: OpcionDocumento = { tipo: 'pasaporte', nombre: 'Pasaporte', nombreEn: 'Passport', reverso: false };

/** Documento de residencia: para quien vive en el país sin ser nacional. */
const RESIDENCIA = (nombre: string, nombreEn: string): OpcionDocumento =>
    ({ tipo: 'residencia', nombre, nombreEn, reverso: true });

const CATALOGO: Record<string, OpcionDocumento[]> = {
    MX: [
        { tipo: 'id_nacional', nombre: 'Credencial para votar (INE)', nombreEn: 'Voter ID (INE)', reverso: true },
        PASAPORTE,
        { tipo: 'licencia', nombre: 'Licencia de conducir', nombreEn: 'Driving licence', reverso: true },
    ],
    US: [
        { tipo: 'licencia', nombre: 'Licencia de conducir estatal', nombreEn: 'State driving licence', reverso: true },
        { tipo: 'id_nacional', nombre: 'Identificación estatal', nombreEn: 'State ID card', reverso: true },
        PASAPORTE,
    ],
    CA: [
        PASAPORTE,
        { tipo: 'licencia', nombre: 'Licencia de conducir provincial', nombreEn: 'Provincial driving licence', reverso: true },
        { tipo: 'id_nacional', nombre: 'Identificación provincial', nombreEn: 'Provincial ID card', reverso: true },
    ],
    BR: [
        { tipo: 'licencia', nombre: 'CNH (Carteira Nacional de Habilitação)', nombreEn: 'CNH (driving licence)', reverso: true },
        { tipo: 'id_nacional', nombre: 'RG (Registro Geral)', nombreEn: 'RG (national ID)', reverso: true },
        PASAPORTE,
    ],
    ES: [
        { tipo: 'id_nacional', nombre: 'DNI', nombreEn: 'DNI (national ID)', reverso: true },
        RESIDENCIA('NIE / TIE', 'NIE / TIE (residence card)'),
        PASAPORTE,
        { tipo: 'licencia', nombre: 'Permiso de conducir', nombreEn: 'Driving licence', reverso: true },
    ],
    GB: [
        PASAPORTE,
        { tipo: 'licencia', nombre: 'Photocard driving licence', nombreEn: 'Photocard driving licence', reverso: true },
        RESIDENCIA('Biometric residence permit', 'Biometric residence permit'),
    ],
    DE: [
        { tipo: 'id_nacional', nombre: 'Personalausweis', nombreEn: 'Personalausweis (national ID)', reverso: true },
        PASAPORTE,
        RESIDENCIA('Elektronischer Aufenthaltstitel', 'Electronic residence permit'),
    ],
    FR: [
        { tipo: 'id_nacional', nombre: "Carte nationale d'identité", nombreEn: 'National identity card', reverso: true },
        PASAPORTE,
        RESIDENCIA('Titre de séjour', 'Residence permit'),
    ],
};

/** Genérico para cualquier país fuera del catálogo: las tres categorías confirmadas. */
const GENERICO: OpcionDocumento[] = [
    PASAPORTE,
    { tipo: 'id_nacional', nombre: 'Identificación oficial con foto', nombreEn: 'Government-issued photo ID', reverso: true },
    { tipo: 'licencia', nombre: 'Licencia de conducir', nombreEn: 'Driving licence', reverso: true },
];

/**
 * Documentos que se le sugieren a una persona en ese país.
 *
 * `soloPasaporte` implementa la regla confirmada del proveedor: cuando el país
 * de residencia difiere del de la cuenta, **sólo** se acepta pasaporte. Ofrecer
 * una INE en ese caso lleva al usuario a un rechazo garantizado.
 */
export function documentosPara(
    paisPersona: string,
    opts: { soloPasaporte?: boolean; locale?: 'es' | 'en' } = {},
): OpcionDocumento[] {
    if (opts.soloPasaporte) return [PASAPORTE];
    return CATALOGO[String(paisPersona || '').toUpperCase()] ?? GENERICO;
}

/** La opción por defecto: la primera del catálogo del país. */
export function documentoSugerido(paisPersona: string, soloPasaporte = false): OpcionDocumento {
    return documentosPara(paisPersona, { soloPasaporte })[0];
}

/** ¿Este tipo de documento lleva reverso? Decide si el paso se salta solo. */
export function llevaReverso(paisPersona: string, tipo: TipoDocumento): boolean {
    const opcion = documentosPara(paisPersona).find((o) => o.tipo === tipo);
    return opcion?.reverso ?? true;
}

/**
 * Regla transfronteriza del proveedor, verificada literal:
 * «Si el país de residencia difiere del país de la cuenta, se requerirá un
 * pasaporte para verificar la identidad.»
 *
 * Cord NO persiste el domicilio de la persona a propósito, así que ambos países
 * se leen en vivo del proveedor y aquí sólo se compara.
 */
export function exigePasaporte(paisCuenta: string, paisResidencia: string | null | undefined): boolean {
    const cuenta = String(paisCuenta || '').toUpperCase();
    const residencia = String(paisResidencia || '').toUpperCase();
    if (!cuenta || !residencia) return false;
    return cuenta !== residencia;
}

/** Relación de aspecto del marco guía, por familia de documento. */
export function relacionDeAspecto(tipo: TipoDocumento): number {
    // ID-1 (INE, DNI, licencias, CNH): 85.6 × 54 mm.
    // La página de datos de un pasaporte (ID-3) es más cuadrada.
    // El marco medía 1.23:1, que no corresponde a ningún documento real — y un
    // marco con la forma equivocada es la causa nº1 de fotos mal encuadradas.
    return tipo === 'pasaporte' ? 1.42 : 1.586;
}

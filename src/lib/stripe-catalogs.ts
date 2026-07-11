export const STRIPE_MX_STATES = [
    { codigo: 'AGU', nombre: 'Aguascalientes' },
    { codigo: 'BCN', nombre: 'Baja California' },
    { codigo: 'BCS', nombre: 'Baja California Sur' },
    { codigo: 'CAM', nombre: 'Campeche' },
    { codigo: 'CHP', nombre: 'Chiapas' },
    { codigo: 'CHH', nombre: 'Chihuahua' },
    { codigo: 'CMX', nombre: 'Ciudad de México' },
    { codigo: 'COA', nombre: 'Coahuila' },
    { codigo: 'COL', nombre: 'Colima' },
    { codigo: 'DUR', nombre: 'Durango' },
    { codigo: 'GUA', nombre: 'Guanajuato' },
    { codigo: 'GRO', nombre: 'Guerrero' },
    { codigo: 'HID', nombre: 'Hidalgo' },
    { codigo: 'JAL', nombre: 'Jalisco' },
    { codigo: 'MEX', nombre: 'Estado de México' },
    { codigo: 'MIC', nombre: 'Michoacán' },
    { codigo: 'MOR', nombre: 'Morelos' },
    { codigo: 'NAY', nombre: 'Nayarit' },
    { codigo: 'NLE', nombre: 'Nuevo León' },
    { codigo: 'OAX', nombre: 'Oaxaca' },
    { codigo: 'PUE', nombre: 'Puebla' },
    { codigo: 'QUE', nombre: 'Querétaro' },
    { codigo: 'ROO', nombre: 'Quintana Roo' },
    { codigo: 'SLP', nombre: 'San Luis Potosí' },
    { codigo: 'SIN', nombre: 'Sinaloa' },
    { codigo: 'SON', nombre: 'Sonora' },
    { codigo: 'TAB', nombre: 'Tabasco' },
    { codigo: 'TAM', nombre: 'Tamaulipas' },
    { codigo: 'TLA', nombre: 'Tlaxcala' },
    { codigo: 'VER', nombre: 'Veracruz' },
    { codigo: 'YUC', nombre: 'Yucatán' },
    { codigo: 'ZAC', nombre: 'Zacatecas' },
];

export const STRIPE_COMPANY_STRUCTURES = [
    { codigo: 'private_corporation', nombre: 'Empresa privada (S.A., S. de R.L.)' },
    { codigo: 'sole_proprietorship', nombre: 'Propietario único' },
    { codigo: 'public_corporation', nombre: 'Empresa pública' },
    { codigo: 'unincorporated_association', nombre: 'Asociación civil / sin fines de lucro' },
    { codigo: 'multi_member_llc', nombre: 'LLC con múltiples miembros' },
    { codigo: 'single_member_llc', nombre: 'LLC de miembro único' },
];

export const STRIPE_MCC_B2B = [
    { codigo: '1520', nombre: 'Contratistas generales (residencial y comercial)' },
    { codigo: '1731', nombre: 'Contratistas eléctricos' },
    { codigo: '1799', nombre: 'Contratistas generales especializados' },
    { codigo: '2741', nombre: 'Editoriales y publicadoras' },
    { codigo: '2791', nombre: 'Tipografía y grabado' },
    { codigo: '4214', nombre: 'Transporte de carga local y mensajería' },
    { codigo: '4215', nombre: 'Servicios de mensajería (aire o tierra)' },
    { codigo: '4789', nombre: 'Servicios de transporte (no clasificados)' },
    { codigo: '4814', nombre: 'Servicios de telecomunicaciones' },
    { codigo: '5045', nombre: 'Computadoras y periféricos (mayoreo)' },
    { codigo: '5065', nombre: 'Equipos y suministros eléctricos (mayoreo)' },
    { codigo: '5085', nombre: 'Suministros industriales (mayoreo)' },
    { codigo: '5111', nombre: 'Materiales de oficina y papelería (mayoreo)' },
    { codigo: '5131', nombre: 'Materiales y textiles (mayoreo)' },
    { codigo: '5734', nombre: 'Venta de software de computadoras' },
    { codigo: '7311', nombre: 'Servicios de publicidad' },
    { codigo: '7333', nombre: 'Fotografía comercial, arte y gráficos' },
    { codigo: '7349', nombre: 'Mantenimiento y limpieza de edificios' },
    { codigo: '7372', nombre: 'Programación, diseño de sistemas y procesamiento de datos' },
    { codigo: '7375', nombre: 'Servicios de recuperación de información' },
    { codigo: '7379', nombre: 'Reparación y mantenimiento de computadoras' },
    { codigo: '7392', nombre: 'Servicios de consultoría y relaciones públicas' },
    { codigo: '7393', nombre: 'Agencias de detectives, seguridad y protección' },
    { codigo: '7399', nombre: 'Servicios comerciales varios' },
    { codigo: '7829', nombre: 'Producción y distribución de video' },
    { codigo: '8111', nombre: 'Servicios legales' },
    { codigo: '8734', nombre: 'Laboratorios de prueba e investigación' },
    { codigo: '8931', nombre: 'Servicios de contabilidad, auditoría y teneduría de libros' },
    { codigo: '8999', nombre: 'Servicios profesionales' },
];

// Mapeo de requirement code -> { mensaje (ES), paso del wizard (0-7) }
export const STRIPE_REQUIREMENTS_DICT: Record<string, { mensaje: string, paso: number }> = {
    // Negocio
    'business_profile.mcc': { mensaje: 'Giro del negocio (MCC)', paso: 1 },
    'business_profile.url': { mensaje: 'Sitio web o descripción del producto', paso: 1 },
    'business_profile.product_description': { mensaje: 'Descripción del producto', paso: 1 },
    'business_profile.support_phone': { mensaje: 'Teléfono de soporte', paso: 1 },
    'business_profile.support_email': { mensaje: 'Correo de soporte', paso: 1 },
    
    // Empresa (Company)
    'company.name': { mensaje: 'Razón social del negocio', paso: 1 },
    'company.tax_id': { mensaje: 'RFC de la empresa', paso: 1 },
    'company.phone': { mensaje: 'Teléfono de la empresa', paso: 1 },
    'company.structure': { mensaje: 'Estructura legal (Tipo de sociedad)', paso: 1 },
    'company.address.line1': { mensaje: 'Dirección (Calle y número)', paso: 2 },
    'company.address.city': { mensaje: 'Dirección (Ciudad)', paso: 2 },
    'company.address.state': { mensaje: 'Dirección (Estado)', paso: 2 },
    'company.address.postal_code': { mensaje: 'Dirección (Código Postal)', paso: 2 },
    'company.verification.document': { mensaje: 'Documento constitutivo de la empresa', paso: 5 }, 
    
    // Representante Legal y Personas (person_xxx)
    'person.first_name': { mensaje: 'Nombre del representante o dueño', paso: 3 },
    'person.last_name': { mensaje: 'Apellidos del representante o dueño', paso: 3 },
    'person.id_number': { mensaje: 'RFC o CURP del representante/dueño', paso: 3 },
    'person.dob': { mensaje: 'Fecha de nacimiento del representante/dueño', paso: 3 },
    'person.address': { mensaje: 'Dirección del representante/dueño', paso: 3 },
    'person.verification.document': { mensaje: 'Identificación oficial del representante/dueño', paso: 5 },
    
    // Attestations
    'company.owners_provided': { mensaje: 'Declaración de dueños beneficiarios', paso: 4 },
    'company.directors_provided': { mensaje: 'Declaración de directores', paso: 4 },
    'company.executives_provided': { mensaje: 'Declaración de ejecutivos', paso: 4 },
    
    // Individual (si es persona física)
    'individual.first_name': { mensaje: 'Nombre', paso: 1 },
    'individual.last_name': { mensaje: 'Apellidos', paso: 1 },
    'individual.id_number': { mensaje: 'RFC o CURP', paso: 1 },
    'individual.dob': { mensaje: 'Fecha de nacimiento', paso: 1 },
    'individual.address.line1': { mensaje: 'Dirección (Calle y número)', paso: 2 },
    'individual.address.city': { mensaje: 'Dirección (Ciudad)', paso: 2 },
    'individual.address.state': { mensaje: 'Dirección (Estado)', paso: 2 },
    'individual.address.postal_code': { mensaje: 'Dirección (Código Postal)', paso: 2 },
    'individual.phone': { mensaje: 'Teléfono', paso: 1 },
    'individual.verification.document': { mensaje: 'Identificación oficial', paso: 5 },
    
    // Cuenta y Términos
    'external_account': { mensaje: 'Cuenta bancaria (CLABE)', paso: 6 },
    'tos_acceptance.date': { mensaje: 'Aceptación de términos de Stripe', paso: 7 },
    'tos_acceptance.ip': { mensaje: 'Aceptación de términos de Stripe', paso: 7 }
};

export function translateRequirement(req: string): { mensaje: string, paso: number } {
    if (STRIPE_REQUIREMENTS_DICT[req]) {
        return STRIPE_REQUIREMENTS_DICT[req];
    }
    
    // Matcher para personas (person_123.dob.day -> person.dob)
    if (req.startsWith('person_')) {
        const parts = req.split('.');
        if (parts.length > 1) {
            const field = parts.slice(1).join('.'); // e.g. dob.day o verification.document
            
            // Buscar si tenemos mapeo para person.field
            for (const key of Object.keys(STRIPE_REQUIREMENTS_DICT)) {
                if (key.startsWith('person.') && (key === `person.${field}` || `person.${field}`.startsWith(key))) {
                    return STRIPE_REQUIREMENTS_DICT[key];
                }
            }
        }
        return { mensaje: 'Datos de identidad (representante o dueño)', paso: 3 };
    }
    
    // Matcher genérico para subcampos
    for (const key of Object.keys(STRIPE_REQUIREMENTS_DICT)) {
        if (req.startsWith(key)) {
            return STRIPE_REQUIREMENTS_DICT[key];
        }
    }

    return { mensaje: `Requisito pendiente (${req})`, paso: 1 };
}

// ════════════════════════════════════════════════════════════════════════════
// translateStripeError — traduce los errores que Stripe devuelve al RECHAZAR
// una operación (RFC inválido, CLABE mala, documento borroso, cuenta ya
// verificada…), a diferencia de translateRequirement() de arriba (que traduce
// lo que FALTA, no lo que salió mal). billing.ts adjunta code/type/param al
// Error que lanza `stripe()`/`stripeUpload()` — ver stripeError() ahí — para
// poder traducir por código exacto en vez de adivinar sobre el texto en
// inglés. Mismo patrón que el diccionario ERROR_ES de Clerk en CustomSignIn/
// CustomSignUp: código conocido → mensaje curado; código desconocido → se
// muestra el mensaje real de Stripe tal cual (nunca se inventa una traducción
// que podría ser incorrecta).
// ════════════════════════════════════════════════════════════════════════════

const STRIPE_ERROR_CODES: Record<string, string> = {
    // Parámetros / formato
    parameter_missing: 'Falta un dato obligatorio.',
    parameter_invalid_empty: 'Un campo obligatorio llegó vacío.',
    parameter_invalid_integer: 'Ese valor numérico no es válido.',
    parameter_invalid_string_blank: 'Un campo de texto no puede quedar vacío.',
    parameter_unknown: 'Se envió un dato que Stripe no reconoce.',
    parameters_exclusive: 'Se enviaron datos que no pueden combinarse entre sí.',
    invalid_characters: 'Ese campo tiene caracteres no permitidos.',
    email_invalid: 'El correo no tiene un formato válido.',
    url_invalid: 'El sitio web no tiene un formato válido.',
    postal_code_invalid: 'El código postal no es válido.',
    phone_invalid_country: 'Ese teléfono no corresponde a México.',

    // Entidad legal / cuenta
    tax_id_invalid: 'El RFC no tiene un formato válido para Stripe.',
    account_invalid: 'Esta cuenta de Stripe ya no es válida — puede haberse eliminado.',
    account_number_invalid: 'La CLABE no es válida.',
    routing_number_invalid: 'El número de ruta de la CLABE no es válido.',

    // Cuenta bancaria
    bank_account_unusable: 'Esa cuenta bancaria no se puede usar para recibir pagos.',
    bank_account_unverified: 'La cuenta bancaria aún no está verificada.',
    bank_account_exists: 'Esa cuenta bancaria ya está registrada.',
    bank_account_declined: 'El banco rechazó esa cuenta.',

    // Identificación / verificación de identidad
    verification_document_expired: 'La identificación está vencida — usa una vigente.',
    verification_document_failed_copy: 'La foto parece ser una copia (foto de una pantalla o de otra foto). Toma la foto directo del documento físico.',
    verification_document_failed_greyscale: 'La foto está en blanco y negro — Stripe necesita una foto a color.',
    verification_document_failed_other: 'Stripe no pudo procesar esa foto. Intenta de nuevo con mejor luz y sin reflejos.',
    verification_document_failed_test_mode: 'Estás en modo de prueba — usa uno de los documentos de prueba de Stripe.',
    verification_document_fraudulent: 'Stripe marcó ese documento como potencialmente fraudulento.',
    verification_document_id_number_mismatch: 'El RFC o CURP capturado no coincide con el de la identificación.',
    verification_document_incomplete: 'La foto no muestra el documento completo — vuelve a tomarla.',
    verification_document_invalid: 'Ese tipo de documento no es válido para verificar identidad.',
    verification_document_issue_or_expiry_date_missing: 'No se distingue la fecha de emisión o vencimiento en la foto.',
    verification_document_manipulated: 'Stripe detectó que el documento pudo haber sido alterado.',
    verification_document_missing_back: 'Falta la foto del reverso de la identificación.',
    verification_document_missing_front: 'Falta la foto del frente de la identificación.',
    verification_document_name_mismatch: 'El nombre capturado no coincide con el de la identificación.',
    verification_document_not_readable: 'La foto no se puede leer — repítela con mejor luz y enfoque.',
    verification_document_not_signed: 'El documento debe estar firmado.',
    verification_document_not_uploaded: 'No se recibió ningún documento.',
    verification_document_photo_mismatch: 'La selfie no coincide con la foto de la identificación.',
    verification_document_too_large: 'El archivo es demasiado grande.',
    verification_document_type_not_supported: 'Ese tipo de documento no es compatible — usa INE o pasaporte.',
    verification_failed_address_match: 'La dirección capturada no coincide con la de la identificación.',
    verification_failed_business_iec_number: 'No se pudo verificar el número de identificación de la empresa.',
    verification_failed_document_match: 'El documento no coincide con los datos que capturaste.',
    verification_failed_id_number_match: 'El RFC o CURP no coincide con los registros oficiales.',
    verification_failed_keyed_identity: 'Los datos de identidad capturados no coinciden con los del documento.',
    verification_failed_keyed_match: 'Los datos capturados no coinciden entre sí — revisa nombre y fecha de nacimiento.',
    verification_failed_name_match: 'El nombre no coincide con los registros oficiales.',
    verification_failed_other: 'Stripe no pudo verificar estos datos — revisa que todo esté correcto e inténtalo de nuevo.',
    verification_failed_representative_authority: 'No se pudo confirmar que esta persona tiene autoridad para representar al negocio.',
    verification_failed_residential_address: 'No se pudo verificar la dirección personal capturada.',
    verification_failed_tax_id_match: 'El RFC no coincide con los registros del SAT.',
    verification_failed_tax_id_not_issued: 'Ese RFC no existe en los registros del SAT.',
    verification_missing_owners: 'Falta declarar a los dueños del negocio (≥25% de participación).',
    verification_missing_executives: 'Falta declarar a los directivos del negocio.',
    verification_requires_additional_memorandum_of_association: 'Stripe pide el acta constitutiva de la empresa — contacta a soporte de Stripe (support.stripe.com/contact).',

    // Files API
    file_invalid_type: 'Ese tipo de archivo no es compatible — usa una foto JPG o PNG.',

    // Límites / infraestructura
    rate_limit: 'Demasiadas solicitudes seguidas a Stripe — espera un momento e inténtalo de nuevo.',
    lock_timeout: 'Stripe está ocupado con otra operación sobre esta cuenta — inténtalo de nuevo en unos segundos.',
    api_key_expired: 'La llave de Stripe configurada expiró — contacta a soporte.',
};

// Errores que Stripe no siempre expone con un `code` estable — se detectan
// por patrón en el `message` en inglés.
const STRIPE_MESSAGE_PATTERNS: Array<[RegExp, string]> = [
    [/cannot change[\s\S]*verifi/i, 'Esta información ya quedó verificada por Stripe — para corregirla, contacta a soporte de Stripe (support.stripe.com/contact).'],
    [/no such account/i, 'Esa cuenta de Stripe ya no existe — puede haberse eliminado o pertenecer a otro modo (prueba/en vivo).'],
    [/no such customer/i, 'Ese cliente de Stripe ya no existe.'],
    [/no such file/i, 'Ese documento ya no existe en Stripe — vuelve a subirlo.'],
    [/no such person/i, 'No se encontró a esa persona en Stripe — vuelve a completar sus datos.'],
    [/doesn.?t appear to be a valid file|not a valid (image|file)/i, 'La foto no se subió correctamente — parece dañada o incompleta. Vuelve a tomarla con buena luz.'],
    [/file (is )?too large|exceeds? the maximum (file )?size/i, 'La foto pesa demasiado — inténtalo de nuevo (la app la comprime automáticamente al tomarla con la cámara).'],
    [/fetch failed|network|ECONNRESET|ETIMEDOUT/i, 'No se pudo conectar con Stripe — revisa tu conexión e inténtalo de nuevo.'],
];

// Fallback por categoría (`error.type`) cuando no hay `code` ni patrón conocido.
const STRIPE_ERROR_TYPES: Record<string, string> = {
    api_connection_error: 'No se pudo conectar con Stripe — revisa tu conexión e inténtalo de nuevo.',
    api_error: 'Stripe tuvo un problema interno — inténtalo de nuevo en unos segundos.',
    rate_limit_error: 'Demasiadas solicitudes seguidas a Stripe — espera un momento e inténtalo de nuevo.',
    authentication_error: 'Problema de configuración con Stripe — contacta a soporte.',
    idempotency_error: 'Se detectó una solicitud duplicada — recarga la página e inténtalo de nuevo.',
};

export function translateStripeError(err: any): string {
    const code = err?.code as string | undefined;
    const type = err?.type as string | undefined;
    const message = String(err?.message ?? err ?? 'Ocurrió un error inesperado con Stripe.');

    if (code && STRIPE_ERROR_CODES[code]) return STRIPE_ERROR_CODES[code];

    for (const [pattern, translated] of STRIPE_MESSAGE_PATTERNS) {
        if (pattern.test(message)) return translated;
    }

    if (type && STRIPE_ERROR_TYPES[type]) return STRIPE_ERROR_TYPES[type];

    // Error no catalogado: se muestra el mensaje real de Stripe tal cual, en
    // vez de arriesgar una traducción incorrecta.
    return message;
}

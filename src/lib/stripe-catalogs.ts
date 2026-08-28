import { log } from './log';

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

// ── Estructura legal de la empresa, POR PAÍS ────────────────────────────────
//
// `company.structure` es un enum del proveedor y su set de valores es
// DISTINTO en cada país. Esta lista era global e incluía `multi_member_llc` y
// `single_member_llc`, que son figuras de Estados Unidos: a una S.L. en Madrid
// se le ofrecían tipos de sociedad que ahí no existen, y elegir uno produce un
// rechazo del proveedor por estructura incompatible.
//
// Verificado el 26-ago-2026 contra el endpoint de requisitos por país: MX, ES,
// FR, GB y BR devuelven `entity_type_structures` VACÍO — ahí el proveedor no
// ofrece estructura y el selector NO debe dibujarse. Un país ausente de este
// mapa significa exactamente eso, no un hueco por llenar.
const COMPANY_STRUCTURES: Record<string, { codigo: string; nombre: string; nombreEn: string }[]> = {
    US: [
        { codigo: 'sole_proprietorship', nombre: 'Propietario único', nombreEn: 'Sole proprietorship' },
        { codigo: 'single_member_llc', nombre: 'LLC de miembro único', nombreEn: 'Single-member LLC' },
        { codigo: 'multi_member_llc', nombre: 'LLC con múltiples miembros', nombreEn: 'Multi-member LLC' },
        { codigo: 'private_corporation', nombre: 'Sociedad privada', nombreEn: 'Private corporation' },
        { codigo: 'public_corporation', nombre: 'Sociedad pública', nombreEn: 'Public corporation' },
        { codigo: 'private_partnership', nombre: 'Sociedad de personas privada', nombreEn: 'Private partnership' },
        { codigo: 'public_partnership', nombre: 'Sociedad de personas pública', nombreEn: 'Public partnership' },
        { codigo: 'incorporated_non_profit', nombre: 'Sin fines de lucro constituida', nombreEn: 'Incorporated non-profit' },
        { codigo: 'unincorporated_non_profit', nombre: 'Sin fines de lucro no constituida', nombreEn: 'Unincorporated non-profit' },
    ],
    CA: [
        { codigo: 'sole_proprietorship', nombre: 'Propietario único', nombreEn: 'Sole proprietorship' },
        { codigo: 'private_corporation', nombre: 'Sociedad privada', nombreEn: 'Private corporation' },
        { codigo: 'public_corporation', nombre: 'Sociedad pública', nombreEn: 'Public corporation' },
        { codigo: 'private_partnership', nombre: 'Sociedad de personas privada', nombreEn: 'Private partnership' },
        { codigo: 'public_partnership', nombre: 'Sociedad de personas pública', nombreEn: 'Public partnership' },
        { codigo: 'incorporated_non_profit', nombre: 'Sin fines de lucro constituida', nombreEn: 'Incorporated non-profit' },
        { codigo: 'unincorporated_non_profit', nombre: 'Sin fines de lucro no constituida', nombreEn: 'Unincorporated non-profit' },
    ],
    DE: [
        { codigo: 'sole_proprietorship', nombre: 'Empresario individual', nombreEn: 'Sole proprietorship' },
        { codigo: 'private_corporation', nombre: 'Sociedad privada (GmbH, UG)', nombreEn: 'Private corporation (GmbH, UG)' },
        { codigo: 'public_corporation', nombre: 'Sociedad pública (AG)', nombreEn: 'Public corporation (AG)' },
        { codigo: 'private_partnership', nombre: 'Sociedad de personas (GbR, OHG, KG)', nombreEn: 'Private partnership (GbR, OHG, KG)' },
        { codigo: 'unincorporated_association', nombre: 'Asociación no constituida', nombreEn: 'Unincorporated association' },
        { codigo: 'incorporated_non_profit', nombre: 'Sin fines de lucro constituida (e.V.)', nombreEn: 'Incorporated non-profit (e.V.)' },
    ],
};

/**
 * Las estructuras legales que ese país ofrece, o `null` si no ofrece ninguna.
 *
 * `null` significa "no dibujes el selector": el proveedor no pide estructura en
 * ese país, y ofrecer un desplegable obligatorio con figuras de otro
 * ordenamiento jurídico es pedir un dato falso.
 */
export function companyStructuresFor(
    countryCode: string,
    locale: 'es' | 'en' = 'es',
): { codigo: string; nombre: string }[] | null {
    const lista = COMPANY_STRUCTURES[String(countryCode || '').toUpperCase()];
    if (!lista) return null;
    return lista.map((e) => ({ codigo: e.codigo, nombre: locale === 'en' ? e.nombreEn : e.nombre }));
}

// ── Giro del negocio (MCC) ──────────────────────────────────────────────────
//
// La lista se llamaba `STRIPE_MCC_B2B` y sólo tenía giros B2B, en español.
// Contradice la regla 10 del proyecto: Cord es una plataforma de cierre
// comercial para CUALQUIER negocio y país, no software B2B. Un restaurante en
// Madrid, una clínica en Bogotá o una tienda en Austin abrían el alta de cobros
// y no encontraban su actividad — y el MCC no es cosmético: decide la categoría
// con la que el proveedor evalúa el riesgo de la cuenta.
//
// Sigue siendo una SELECCIÓN, no los ~300 códigos del estándar: ofrecer la lista
// completa es la regla 28 aplicada a un desplegable. Están los giros que un
// negocio que cotiza y cobra por link puede tener, con "Servicios profesionales"
// (8999) y "Servicios comerciales varios" (7399) como salida honesta.
export const STRIPE_MCC = [
    // Construcción y oficios
    { codigo: '1520', es: 'Contratistas generales (residencial y comercial)', en: 'General contractors (residential and commercial)' },
    { codigo: '1711', es: 'Climatización, plomería e instalaciones', en: 'HVAC, plumbing and installation' },
    { codigo: '1731', es: 'Contratistas eléctricos', en: 'Electrical contractors' },
    { codigo: '1799', es: 'Contratistas especializados', en: 'Special trade contractors' },
    // Manufactura, impresión y edición
    { codigo: '2741', es: 'Editoriales y publicadoras', en: 'Publishing and printing' },
    { codigo: '2791', es: 'Tipografía y grabado', en: 'Typesetting and engraving' },
    // Logística y transporte
    { codigo: '4214', es: 'Transporte de carga y mudanzas', en: 'Freight and moving' },
    { codigo: '4215', es: 'Servicios de mensajería', en: 'Courier services' },
    { codigo: '4722', es: 'Agencias de viajes', en: 'Travel agencies' },
    { codigo: '4789', es: 'Servicios de transporte', en: 'Transportation services' },
    // Comercio
    { codigo: '5045', es: 'Equipo de cómputo (mayoreo)', en: 'Computers and equipment (wholesale)' },
    { codigo: '5065', es: 'Equipo y partes electrónicas', en: 'Electronic parts and equipment' },
    { codigo: '5072', es: 'Ferretería y herramientas', en: 'Hardware and tools' },
    { codigo: '5111', es: 'Papelería y material de oficina', en: 'Stationery and office supplies' },
    { codigo: '5131', es: 'Textiles y materiales', en: 'Textiles and materials' },
    { codigo: '5192', es: 'Libros, revistas y periódicos', en: 'Books, periodicals and newspapers' },
    { codigo: '5199', es: 'Productos no duraderos (mayoreo)', en: 'Nondurable goods (wholesale)' },
    { codigo: '5251', es: 'Ferretería y tlapalería (menudeo)', en: 'Hardware stores (retail)' },
    { codigo: '5311', es: 'Tiendas departamentales', en: 'Department stores' },
    { codigo: '5399', es: 'Comercio general al menudeo', en: 'General merchandise (retail)' },
    { codigo: '5499', es: 'Alimentos y abarrotes', en: 'Food and grocery' },
    { codigo: '5651', es: 'Ropa y accesorios', en: 'Clothing and accessories' },
    { codigo: '5712', es: 'Muebles y decoración', en: 'Furniture and home furnishings' },
    { codigo: '5734', es: 'Venta de software', en: 'Computer software stores' },
    { codigo: '5999', es: 'Comercio especializado', en: 'Specialty retail' },
    // Alimentos y hospitalidad
    { codigo: '5812', es: 'Restaurantes', en: 'Restaurants' },
    { codigo: '5814', es: 'Comida rápida y para llevar', en: 'Fast food and takeaway' },
    { codigo: '7011', es: 'Hoteles y hospedaje', en: 'Hotels and lodging' },
    { codigo: '7299', es: 'Servicios personales', en: 'Personal services' },
    // Servicios profesionales
    { codigo: '7311', es: 'Publicidad y marketing', en: 'Advertising and marketing' },
    { codigo: '7333', es: 'Fotografía, diseño y artes gráficas', en: 'Photography, design and graphic arts' },
    { codigo: '7338', es: 'Reprografía y planos', en: 'Reprographics and blueprinting' },
    { codigo: '7349', es: 'Limpieza y mantenimiento de inmuebles', en: 'Cleaning and building maintenance' },
    { codigo: '7372', es: 'Desarrollo de software y sistemas', en: 'Software and systems development' },
    { codigo: '7375', es: 'Servicios de datos e información', en: 'Data and information services' },
    { codigo: '7379', es: 'Soporte y reparación de cómputo', en: 'Computer support and repair' },
    { codigo: '7392', es: 'Consultoría y relaciones públicas', en: 'Consulting and public relations' },
    { codigo: '7393', es: 'Seguridad y protección', en: 'Security and protective services' },
    { codigo: '7399', es: 'Servicios comerciales varios', en: 'Business services (other)' },
    { codigo: '7538', es: 'Talleres y servicio automotriz', en: 'Automotive service and repair' },
    { codigo: '7623', es: 'Reparación de equipo y electrodomésticos', en: 'Equipment and appliance repair' },
    { codigo: '7829', es: 'Producción de video y cine', en: 'Video and film production' },
    { codigo: '7997', es: 'Gimnasios y clubes deportivos', en: 'Gyms and sports clubs' },
    // Salud, educación y profesiones reguladas
    { codigo: '8011', es: 'Consultorios médicos', en: 'Medical practices' },
    { codigo: '8021', es: 'Odontología', en: 'Dental practices' },
    { codigo: '8049', es: 'Terapias y salud especializada', en: 'Therapy and specialised health' },
    { codigo: '8111', es: 'Servicios legales', en: 'Legal services' },
    { codigo: '8220', es: 'Educación superior y formación', en: 'Higher education and training' },
    { codigo: '8299', es: 'Enseñanza y capacitación', en: 'Education and training services' },
    { codigo: '8351', es: 'Guarderías y cuidado infantil', en: 'Childcare services' },
    { codigo: '8398', es: 'Organizaciones sin fines de lucro', en: 'Non-profit organisations' },
    { codigo: '8641', es: 'Asociaciones civiles y clubes', en: 'Associations and clubs' },
    { codigo: '8734', es: 'Laboratorios de prueba e investigación', en: 'Testing and research laboratories' },
    { codigo: '8911', es: 'Arquitectura e ingeniería', en: 'Architecture and engineering' },
    { codigo: '8931', es: 'Contabilidad y auditoría', en: 'Accounting and auditing' },
    { codigo: '8999', es: 'Servicios profesionales', en: 'Professional services' },
    // Inmobiliario y financiero
    { codigo: '6513', es: 'Arrendamiento de inmuebles', en: 'Real estate rental' },
    { codigo: '7011', es: 'Administración de propiedades', en: 'Property management' },
] as const;

/** El catálogo de giros en el idioma del usuario, ordenado alfabéticamente. */
export function mccOptions(locale: 'es' | 'en' = 'es'): { codigo: string; nombre: string }[] {
    const vistos = new Set<string>();
    return STRIPE_MCC
        .filter((m) => (vistos.has(m.codigo) ? false : (vistos.add(m.codigo), true)))
        .map((m) => ({ codigo: m.codigo, nombre: locale === 'en' ? m.en : m.es }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre, locale === 'en' ? 'en' : 'es'));
}


// ── Qué le falta a la cuenta, dicho en el idioma y el vocabulario del país ──
//
// Este diccionario tenía tres defectos que se notaban justo donde Cord dice que
// opera:
//
//   1. **Estaba en español fijo.** Una cuenta en Londres o Berlín, con la app en
//      inglés, veía sus requisitos en español.
//   2. **Usaba vocabulario mexicano.** "RFC de la empresa" y "Cuenta bancaria
//      (CLABE)" no significan nada fuera de México; ahí es NIF/CIF e IBAN.
//   3. **No conocía los prefijos de rol.** `representative.*`, `owners.*`,
//      `directors.*` y `executives.*` son EXACTAMENTE los requisitos que ve una
//      cuenta recién creada, y todos caían al fallback genérico "Requisito
//      adicional de verificación, paso 1".
//
// La clave del diccionario es ahora el campo YA DESPOJADO de su prefijo de
// scope (`parseRequirement`), así que una sola entrada cubre `representative.
// dob`, `owners.dob`, `person_1K….dob` e `individual.dob`.

import { getCountryProfile, personIdLabel } from './countries';
import { payoutSpecFor } from './payout-fields';
import { parseRequirement } from './connect-requirements';

interface RequisitoTexto {
    es: string;
    en: string;
    paso: number;
}

/**
 * Campo normalizado -> texto y paso del asistente.
 *
 * `{taxId}`, `{personId}` y `{payout}` se sustituyen con el vocabulario real del
 * país: RFC en México, NIF/CIF en España, EIN en Estados Unidos; CLABE, IBAN,
 * sort code según el riel de depósito.
 */
const REQUISITOS: Record<string, RequisitoTexto> = {
    // Negocio
    'business_profile.mcc': { es: 'Giro del negocio (MCC)', en: 'Business category (MCC)', paso: 1 },
    'business_profile.url': { es: 'Sitio web o descripción del producto', en: 'Website or product description', paso: 1 },
    'business_profile.product_description': { es: 'Descripción del producto', en: 'Product description', paso: 1 },
    'business_profile.support_phone': { es: 'Teléfono de soporte', en: 'Support phone', paso: 1 },
    'business_profile.support_email': { es: 'Correo de soporte', en: 'Support email', paso: 1 },
    'business_profile.name': { es: 'Nombre comercial', en: 'Trading name', paso: 1 },

    // Empresa
    'name': { es: 'Razón social del negocio', en: 'Registered business name', paso: 1 },
    'tax_id': { es: '{taxId} de la empresa', en: 'Business {taxId}', paso: 1 },
    'registration_number': { es: 'Número de registro mercantil', en: 'Company registration number', paso: 1 },
    'vat_id': { es: 'Número de IVA intracomunitario', en: 'VAT number', paso: 1 },
    'phone': { es: 'Teléfono', en: 'Phone', paso: 1 },
    'structure': { es: 'Estructura legal', en: 'Legal structure', paso: 1 },
    'address.line1': { es: 'Dirección (calle y número)', en: 'Address (street and number)', paso: 2 },
    'address.line2': { es: 'Dirección (interior)', en: 'Address (line 2)', paso: 2 },
    'address.city': { es: 'Dirección (ciudad)', en: 'Address (city)', paso: 2 },
    'address.state': { es: 'Dirección (estado o provincia)', en: 'Address (state or province)', paso: 2 },
    'address.postal_code': { es: 'Dirección (código postal)', en: 'Address (postal code)', paso: 2 },
    'address.country': { es: 'Dirección (país)', en: 'Address (country)', paso: 2 },

    // Persona
    'first_name': { es: 'Nombre de la persona', en: "Person's first name", paso: 3 },
    'last_name': { es: 'Apellidos de la persona', en: "Person's last name", paso: 3 },
    'id_number': { es: '{personId}', en: '{personId}', paso: 3 },
    'id_number_secondary': { es: 'Segunda identificación personal', en: 'Secondary personal ID', paso: 3 },
    'ssn_last_4': { es: 'Últimos 4 dígitos del SSN', en: 'Last 4 digits of SSN', paso: 3 },
    'nationality': { es: 'Nacionalidad', en: 'Nationality', paso: 3 },
    'dob': { es: 'Fecha de nacimiento', en: 'Date of birth', paso: 3 },
    'dob.day': { es: 'Fecha de nacimiento', en: 'Date of birth', paso: 3 },
    'dob.month': { es: 'Fecha de nacimiento', en: 'Date of birth', paso: 3 },
    'dob.year': { es: 'Fecha de nacimiento', en: 'Date of birth', paso: 3 },
    'email': { es: 'Correo de la persona', en: "Person's email", paso: 3 },
    'political_exposure': { es: 'Declaración de exposición política', en: 'Political exposure declaration', paso: 3 },
    'relationship.title': { es: 'Puesto en el negocio', en: 'Job title', paso: 3 },
    'relationship.percent_ownership': { es: 'Porcentaje de participación', en: 'Ownership percentage', paso: 3 },

    // Atestaciones y declaraciones
    'owners_provided': { es: 'Declaración de dueños con 25% o más', en: 'Declaration of owners with 25% or more', paso: 4 },
    'directors_provided': { es: 'Declaración de directores', en: 'Declaration of directors', paso: 4 },
    'executives_provided': { es: 'Declaración de directivos', en: 'Declaration of executives', paso: 4 },
    'ownership_declaration': { es: 'Firma de la declaración de titularidad', en: 'Ownership declaration signature', paso: 4 },
    'directorship_declaration': { es: 'Firma de la declaración de directores', en: 'Directorship declaration signature', paso: 4 },
    'representative_declaration': { es: 'Firma de la declaración del representante', en: 'Representative declaration signature', paso: 4 },
    'ownership_exemption_reason': { es: 'Motivo de exención de titularidad', en: 'Ownership exemption reason', paso: 4 },

    // Documentos
    'verification.document': { es: 'Identificación oficial', en: 'Government-issued ID', paso: 5 },
    'verification.additional_document': { es: 'Comprobante de domicilio', en: 'Proof of address', paso: 5 },
    'documents.company_memorandum_of_association.files': { es: 'Escritura constitutiva de la empresa', en: 'Company memorandum of association', paso: 5 },
    'documents.company_registration_verification.files': { es: 'Comprobante de registro de la empresa', en: 'Company registration document', paso: 5 },
    'documents.proof_of_registration.files': { es: 'Comprobante de registro mercantil', en: 'Proof of company registration', paso: 5 },
    'documents.proof_of_ultimate_beneficial_ownership.files': { es: 'Comprobante de titularidad real', en: 'Proof of ultimate beneficial ownership', paso: 5 },
    'documents.company_tax_id_verification.files': { es: 'Comprobante de identificación fiscal', en: 'Tax ID verification document', paso: 5 },
    'documents.proof_of_address.files': { es: 'Comprobante de domicilio del negocio', en: 'Business proof of address', paso: 5 },
    'documents.bank_account_ownership_verification.files': { es: 'Comprobante de titularidad de la cuenta', en: 'Bank account ownership document', paso: 5 },
    'documents.company_license.files': { es: 'Licencia de operación', en: 'Business licence', paso: 5 },
    'documents.company_authorization.files': { es: 'Autorización de la empresa', en: 'Company authorization', paso: 5 },
    'documents.passport.files': { es: 'Pasaporte', en: 'Passport', paso: 5 },
    'documents.visa.files': { es: 'Visa', en: 'Visa', paso: 5 },

    // Cuenta y términos
    'external_account': { es: 'Cuenta bancaria ({payout})', en: 'Bank account ({payout})', paso: 6 },
    'settings.payments.statement_descriptor': { es: 'Nombre que verá el cliente en su estado de cuenta', en: 'Statement descriptor shown on your customer\u2019s card statement', paso: 1 },
    'tos_acceptance.date': { es: 'Aceptación del acuerdo de cuenta conectada', en: 'Connected account agreement acceptance', paso: 7 },
    'tos_acceptance.ip': { es: 'Aceptación del acuerdo de cuenta conectada', en: 'Connected account agreement acceptance', paso: 7 },
    'tos_acceptance.service_agreement': { es: 'Aceptación del acuerdo de servicio', en: 'Service agreement acceptance', paso: 7 },
};

/** Quién es el sujeto del requisito, para que la lista no diga todo igual. */
const SUJETO: Record<string, { es: string; en: string }> = {
    representative: { es: 'representante legal', en: 'legal representative' },
    owner: { es: 'dueño', en: 'owner' },
    director: { es: 'director', en: 'director' },
    executive: { es: 'directivo', en: 'executive' },
};

export interface RequisitoTraducido { mensaje: string; paso: number }

/**
 * Traduce un requisito del proveedor a algo accionable.
 *
 * `country` y `locale` son opcionales para no romper a los llamadores que
 * todavía no los pasan; sin ellos se usa el vocabulario mexicano en español,
 * que es el comportamiento histórico.
 */
export function translateRequirement(
    req: string,
    locale: 'es' | 'en' = 'es',
    country = 'MX',
): RequisitoTraducido {
    const parsed = parseRequirement(String(req || ''), 'currently_due');

    // Una entrevista del proveedor no la resuelve este asistente: se dice, en
    // vez de mandar al usuario a dar vueltas por los pasos.
    if (parsed.scope.kind === 'interview') {
        return {
            mensaje: locale === 'en'
                ? 'Additional review requested by the payments provider'
                : 'Revisión adicional solicitada por el procesador de pagos',
            paso: 8,
        };
    }

    const entrada = REQUISITOS[parsed.field] ?? REQUISITOS[parsed.field.split('.').slice(0, 2).join('.')];
    if (!entrada) {
        log.warn('requisito de Connect sin traducción', { route: 'connect', requisito: req });
        return {
            mensaje: locale === 'en' ? 'Additional verification requirement' : 'Requisito adicional de verificación',
            paso: 1,
        };
    }

    const perfil = getCountryProfile(country, locale);
    const mensaje = entrada[locale]
        .replace('{taxId}', perfil.taxIdLabel)
        .replace('{personId}', personIdLabel(country, locale))
        .replace('{payout}', locale === 'en' ? payoutSpecFor(country).labelEn : payoutSpecFor(country).label);

    // A quién le falta, cuando no es obvio. `person_…` no lleva sufijo: en la
    // lista de personas ya se sabe de quién se habla.
    if (parsed.scope.kind === 'role') {
        const sujeto = SUJETO[parsed.scope.role];
        if (sujeto) return { mensaje: `${mensaje} — ${sujeto[locale]}`, paso: entrada.paso };
    }
    return { mensaje, paso: entrada.paso };
}

// ── Por qué se rechazó una verificación ─────────────────────────────────────
//
// El proveedor devuelve un código exacto cuando rechaza un documento o una
// identidad. Cord nunca lo mostraba, así que el usuario volvía a subir la MISMA
// foto borrosa una y otra vez sin enterarse de qué estaba mal — y el negocio se
// quedaba sin poder cobrar por una razón que estaba a la vista en la API.
//
// Los códigos y su significado son de la documentación del proveedor. El texto
// es de Cord: describe qué hacer, no repite la jerga.

const RECHAZO_DOCUMENTO: Record<string, { es: string; en: string }> = {
    document_corrupt: { es: 'El archivo llegó dañado. Vuelve a tomar la foto y súbela de nuevo.', en: "The file arrived corrupted. Take the photo again and re-upload it." },
    document_country_not_supported: { es: 'Esa identificación es de un país que no se acepta para verificar esta cuenta.', en: 'That ID is from a country not accepted for verifying this account.' },
    document_expired: { es: 'La identificación está vencida. Usa una vigente.', en: 'The ID has expired. Use a valid one.' },
    document_failed_copy: { es: 'Se detectó una fotocopia. Necesitamos una foto del documento original.', en: 'A photocopy was detected. We need a photo of the original document.' },
    document_failed_greyscale: { es: 'La foto está en blanco y negro. Tómala a color.', en: 'The photo is greyscale. Take it in colour.' },
    document_failed_other: { es: 'No se pudo verificar la identificación. Prueba con otro documento oficial.', en: "The ID couldn't be verified. Try another government-issued document." },
    document_failed_test_mode: { es: 'Se usó un documento de prueba en una cuenta real.', en: 'A test document was used on a live account.' },
    document_fraudulent: { es: 'La identificación no pasó la revisión de autenticidad. Escríbenos para resolverlo.', en: "The ID didn't pass the authenticity review. Contact us to resolve it." },
    document_id_type_not_supported: { es: 'Ese tipo de documento no se acepta. Usa pasaporte o identificación oficial con foto.', en: 'That document type is not accepted. Use a passport or photo ID.' },
    document_id_country_not_supported: { es: 'Ese documento es de un país que no se acepta aquí.', en: 'That document is from a country not accepted here.' },
    document_incomplete: { es: 'Falta parte del documento en la foto. Que se vean las cuatro esquinas.', en: 'Part of the document is missing. Make sure all four corners are visible.' },
    document_invalid: { es: 'El documento no es válido para verificar identidad.', en: 'The document is not valid for identity verification.' },
    document_manipulated: { es: 'La imagen parece editada. Sube una foto sin retocar.', en: 'The image appears edited. Upload an unretouched photo.' },
    document_missing_back: { es: 'Falta el reverso de la identificación.', en: 'The back of the ID is missing.' },
    document_missing_front: { es: 'Falta el frente de la identificación.', en: 'The front of the ID is missing.' },
    document_not_readable: { es: 'La foto no se lee. Busca buena luz, sin reflejos ni sombras.', en: "The photo isn't readable. Use good lighting, without glare or shadows." },
    document_not_uploaded: { es: 'No se recibió el documento. Vuelve a subirlo.', en: "The document wasn't received. Upload it again." },
    document_photo_mismatch: { es: 'La foto del documento no coincide con la selfie.', en: "The document photo doesn't match the selfie." },
    document_too_large: { es: 'El archivo pesa demasiado. Sube una imagen de menos de 10 MB.', en: 'The file is too large. Upload an image under 10 MB.' },
    document_type_not_supported: { es: 'Ese tipo de documento no se acepta para esta cuenta.', en: 'That document type is not accepted for this account.' },
};

const RECHAZO_IDENTIDAD: Record<string, { es: string; en: string }> = {
    document_address_mismatch: { es: 'La dirección del documento no coincide con la que capturaste.', en: "The address on the document doesn't match the one you entered." },
    document_dob_mismatch: { es: 'La fecha de nacimiento no coincide con la del documento.', en: "The date of birth doesn't match the document." },
    document_duplicate_type: { es: 'Se subió dos veces el mismo tipo de documento.', en: 'The same document type was uploaded twice.' },
    document_id_number_mismatch: { es: 'El número de identificación no coincide con el del documento.', en: "The ID number doesn't match the document." },
    document_name_mismatch: { es: 'El nombre no coincide con el del documento.', en: "The name doesn't match the document." },
    document_nationality_mismatch: { es: 'La nacionalidad no coincide con la del documento.', en: "The nationality doesn't match the document." },
    failed_keyed_identity: { es: 'Los datos capturados no coinciden con los registros oficiales. Revísalos con cuidado.', en: "The details you entered don't match official records. Review them carefully." },
    failed_other: { es: 'No se pudo verificar la identidad con los datos actuales.', en: "Identity couldn't be verified with the current details." },
};

/**
 * Por qué se rechazó una verificación, dicho para el dueño del negocio.
 *
 * `fallback` es el texto literal que devuelve el proveedor (`verification.details`),
 * que su documentación marca como apto para mostrar. Se usa sólo cuando el
 * código no está en el diccionario: es mejor un texto en inglés que decir
 * "algo falló" y dejar a la persona sin nada que corregir.
 */
export function describeVerificationRejection(
    codigo: string | null | undefined,
    docCodigo: string | null | undefined,
    fallback: string | null | undefined,
    locale: 'es' | 'en' = 'es',
): string | null {
    const doc = docCodigo ? RECHAZO_DOCUMENTO[docCodigo] : undefined;
    if (doc) return doc[locale];
    const id = codigo ? RECHAZO_IDENTIDAD[codigo] : undefined;
    if (id) return id[locale];
    if (codigo && RECHAZO_DOCUMENTO[codigo]) return RECHAZO_DOCUMENTO[codigo][locale];
    return fallback?.trim() || null;
}

// ════════════════════════════════════════════════════════════════════════════
// translateStripeError — traduce los errores que Stripe devuelve al RECHAZAR
// una operación (RFC inválido, CLABE mala, documento borroso, cuenta ya
// verificada…), a diferencia de translateRequirement() de arriba (que traduce
// lo que FALTA, no lo que salió mal). billing.ts adjunta code/type/param al
// Error que lanza `stripe()`/`stripeUpload()` — ver stripeError() ahí — para
// poder traducir por código exacto en vez de adivinar sobre el texto en
// inglés. Mismo patrón que el diccionario ERROR_ES en CustomSignIn/
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
    parameter_unknown: 'Se envió un dato que el procesador de pagos no reconoce.',
    parameters_exclusive: 'Se enviaron datos que no pueden combinarse entre sí.',
    invalid_characters: 'Ese campo tiene caracteres no permitidos.',
    email_invalid: 'El correo no tiene un formato válido.',
    url_invalid: 'El sitio web no tiene un formato válido.',
    postal_code_invalid: 'El código postal no es válido.',
    phone_invalid_country: 'Ese teléfono no corresponde a México.',

    // Entidad legal / cuenta
    tax_id_invalid: 'El RFC no tiene un formato válido para el procesador de pagos.',
    account_invalid: 'Esta cuenta de pagos ya no es válida. Puede haberse eliminado.',
    // Genérico a propósito: este código lo dispara Stripe para CUALQUIER país
    // (CLABE en México, routing+account en EE.UU., IBAN en la zona SEPA…), y
    // translateStripeError() no recibe el país del emisor. Decir "la CLABE"
    // aquí le hablaba de un formato mexicano a un negocio en Austin.
    account_number_invalid: 'El número de cuenta bancaria no es válido.',
    routing_number_invalid: 'El número de ruta o sucursal bancaria no es válido.',

    // Cuenta bancaria
    bank_account_unusable: 'Esa cuenta bancaria no se puede usar para recibir pagos.',
    bank_account_unverified: 'La cuenta bancaria aún no está verificada.',
    bank_account_exists: 'Esa cuenta bancaria ya está registrada.',
    bank_account_declined: 'El banco rechazó esa cuenta.',

    // Identificación / verificación de identidad
    verification_document_expired: 'La identificación está vencida. Usa una vigente.',
    verification_document_failed_copy: 'La foto parece ser una copia (foto de una pantalla o de otra foto). Toma la foto directo del documento físico.',
    verification_document_failed_greyscale: 'La foto está en blanco y negro. Necesitamos una foto a color.',
    verification_document_failed_other: 'No pudimos procesar esa foto. Intenta de nuevo con mejor luz y sin reflejos.',
    verification_document_failed_test_mode: 'Estás en modo de prueba. Usa uno de los documentos de prueba indicados.',
    verification_document_fraudulent: 'El procesador de pagos marcó ese documento como potencialmente fraudulento.',
    verification_document_id_number_mismatch: 'El RFC o CURP capturado no coincide con el de la identificación.',
    verification_document_incomplete: 'La foto no muestra el documento completo. Vuelve a tomarla.',
    verification_document_invalid: 'Ese tipo de documento no es válido para verificar identidad.',
    verification_document_issue_or_expiry_date_missing: 'No se distingue la fecha de emisión o vencimiento en la foto.',
    verification_document_manipulated: 'El procesador de pagos detectó que el documento pudo haber sido alterado.',
    verification_document_missing_back: 'Falta la foto del reverso de la identificación.',
    verification_document_missing_front: 'Falta la foto del frente de la identificación.',
    verification_document_name_mismatch: 'El nombre capturado no coincide con el de la identificación.',
    verification_document_not_readable: 'La foto no se puede leer. Repítela con mejor luz y enfoque.',
    verification_document_not_signed: 'El documento debe estar firmado.',
    verification_document_not_uploaded: 'No se recibió ningún documento.',
    verification_document_photo_mismatch: 'La selfie no coincide con la foto de la identificación.',
    verification_document_too_large: 'El archivo es demasiado grande.',
    verification_document_type_not_supported: 'Ese tipo de documento no es compatible. Usa INE o pasaporte.',
    verification_failed_address_match: 'La dirección capturada no coincide con la de la identificación.',
    verification_failed_business_iec_number: 'No se pudo verificar el número de identificación de la empresa.',
    verification_failed_document_match: 'El documento no coincide con los datos que capturaste.',
    verification_failed_id_number_match: 'El RFC o CURP no coincide con los registros oficiales.',
    verification_failed_keyed_identity: 'Los datos de identidad capturados no coinciden con los del documento.',
    verification_failed_keyed_match: 'Los datos capturados no coinciden entre sí. Revisa nombre y fecha de nacimiento.',
    verification_failed_name_match: 'El nombre no coincide con los registros oficiales.',
    verification_failed_other: 'No pudimos verificar estos datos. Revisa que todo esté correcto e inténtalo de nuevo.',
    verification_failed_representative_authority: 'No se pudo confirmar que esta persona tiene autoridad para representar al negocio.',
    verification_failed_residential_address: 'No se pudo verificar la dirección personal capturada.',
    verification_failed_tax_id_match: 'El RFC no coincide con los registros del SAT.',
    verification_failed_tax_id_not_issued: 'Ese RFC no existe en los registros del SAT.',
    verification_missing_owners: 'Falta declarar a los dueños del negocio (≥25% de participación).',
    verification_missing_executives: 'Falta declarar a los directivos del negocio.',
    verification_requires_additional_memorandum_of_association: 'Hace falta el acta constitutiva de la empresa. Contacta a soporte de Cord.',

    // Files API
    file_invalid_type: 'Ese tipo de archivo no es compatible. Usa una foto JPG o PNG.',

    // Límites / herramientas
    rate_limit: 'Hay demasiadas solicitudes seguidas. Espera un momento e inténtalo de nuevo.',
    lock_timeout: 'El procesador está ocupado con otra operación sobre esta cuenta. Inténtalo de nuevo en unos segundos.',
    api_key_expired: 'La configuración del procesador de pagos expiró. Contacta a soporte.',
};

// Errores que Stripe no siempre expone con un `code` estable — se detectan
// por patrón en el `message` en inglés.
const STRIPE_MESSAGE_PATTERNS: Array<[RegExp, string]> = [
    [/cannot change[\s\S]*verifi/i, 'Esta información ya quedó verificada. Para corregirla, contacta a soporte de Cord.'],
    [/no such account/i, 'Esa cuenta de pagos ya no existe. Puede haberse eliminado o pertenecer a otro modo.'],
    [/no such customer/i, 'Ese registro de cliente ya no existe.'],
    [/no such file/i, 'Ese documento ya no existe. Vuelve a subirlo.'],
    [/no such person/i, 'No se encontró a esa persona. Vuelve a completar sus datos.'],
    [/doesn.?t appear to be a valid file|not a valid (image|file)/i, 'La foto no se subió correctamente. Parece dañada o incompleta. Vuelve a tomarla con buena luz.'],
    [/file (is )?too large|exceeds? the maximum (file )?size/i, 'La foto pesa demasiado. Inténtalo de nuevo; la app la comprime al tomarla con la cámara.'],
    [/fetch failed|network|ECONNRESET|ETIMEDOUT/i, 'No pudimos conectar con el procesador de pagos. Revisa tu conexión e inténtalo de nuevo.'],
];

// Fallback por categoría (`error.type`) cuando no hay `code` ni patrón conocido.
const STRIPE_ERROR_TYPES: Record<string, string> = {
    api_connection_error: 'No pudimos conectar con el procesador de pagos. Revisa tu conexión e inténtalo de nuevo.',
    api_error: 'El procesador de pagos tuvo un problema interno. Inténtalo de nuevo en unos segundos.',
    rate_limit_error: 'Hay demasiadas solicitudes seguidas. Espera un momento e inténtalo de nuevo.',
    authentication_error: 'Hay un problema de configuración con el procesador de pagos. Contacta a soporte.',
    idempotency_error: 'Se detectó una solicitud duplicada. Recarga la página e inténtalo de nuevo.',
};

export function translateStripeError(err: any): string {
    const code = err?.code as string | undefined;
    const type = err?.type as string | undefined;
    const message = String(err?.message ?? err ?? 'Ocurrió un error inesperado con el procesador de pagos.');

    if (code && STRIPE_ERROR_CODES[code]) return STRIPE_ERROR_CODES[code];

    for (const [pattern, translated] of STRIPE_MESSAGE_PATTERNS) {
        if (pattern.test(message)) return translated;
    }

    if (type && STRIPE_ERROR_TYPES[type]) return STRIPE_ERROR_TYPES[type];

    const ref = globalThis.crypto?.randomUUID?.().slice(0, 8).toUpperCase() || 'ERROR';
    log.error('error de Connect sin traducción', { route: 'connect', ref, providerMessage: message });
    return `No pudimos completar la operación (ref: ${ref})`;
}

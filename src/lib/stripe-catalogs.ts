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

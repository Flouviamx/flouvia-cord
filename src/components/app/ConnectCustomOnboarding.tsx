import React, { useState, useEffect, useRef } from 'react';
import { STRIPE_MX_STATES, companyStructuresFor, mccOptions, translateRequirement } from '../../lib/stripe-catalogs';
import { FEE_TERMS_VERSION } from '../../lib/fees';
import { payoutSpecFor, validatePayout } from '../../lib/payout-fields';
import { getCountryProfile, personIdLabel, subdivisionsFor } from '../../lib/countries';
import { validRfc, validSpainTaxId } from '../../lib/tax-id';
import { requiresField } from '../../lib/connect-requirements';
import ConnectPersonasStep from './ConnectPersonasStep';
import type { ConnectPersona } from '../../lib/connect-personas';

interface ConnectCustomOnboardingProps {
    org?: any;
    locale?: 'es' | 'en';
}

// Los nombres de los pasos viven en CO_STRINGS.pasos (traducidos).

// El formato de la cuenta de depósito y su dígito de control salen de
// lib/payout-fields.ts, la MISMA fuente que valida el endpoint. Este archivo
// tenía su propia copia del checksum de CLABE y solo sabía capturar ese
// formato, así que fuera de México el paso 6 pedía 18 dígitos que ningún banco
// local usa.


// Textos del alta de cobros.
//
// Locales al componente por la misma razón que en las demás islas: el
// diccionario de la app pesa ~373 KB y no tiene por qué viajar al navegador.
//
// Este paso además estaba escrito para México y solo para México: preguntaba
// cómo estaba registrado el negocio "ante el SAT", pedía RFC y CURP por su
// nombre, ofrecía los 32 estados mexicanos en un <select> y hablaba de la INE.
// Un negocio en Madrid o en Austin veía todo eso y no tenía dónde poner sus
// propios datos. Lo que es de México ahora se muestra SOLO en México; el resto
// usa el vocabulario de su país (getCountryProfile) o uno neutro.
const CO_STRINGS = {
  es: {
    requisitosPendientes: 'Requisitos pendientes',
    completar: 'Completar →',
    consultando: 'Consultando el estado de tu cuenta…',
    cambiar: 'Cambiar',
    editarCuenta: 'Editar cuenta bancaria',
    enRevision: 'Tus datos están en revisión',
    comoRegistrado: '¿Cómo está registrado legalmente tu negocio?',
    comoRegistradoMx: '¿Cómo está registrado legalmente tu negocio ante el SAT?',
    personaMoral: 'Empresa',
    personaMoralDesc: 'Sociedad, corporación o asociación registrada',
    personaMoralDescMx: 'Empresa, S.A. de C.V., S. de R.L., Asociación',
    personaFisica: 'Persona física',
    personaFisicaDesc: 'Trabajas por tu cuenta o como propietario único',
    personaFisicaDescMx: 'Propietario único, RESICO, PFAE',
    taxIdHint: 'Lo usamos para verificar la identidad de tu negocio.',
    giro: 'Giro del negocio (MCC)',
    selecciona: 'Selecciona…',
    giroHint: 'Selecciona el código que más se acerque a tu actividad principal.',
    estructuraLegal: 'Estructura legal',
    sitioWeb: 'Sitio web o link social',
    telefonoSoporte: 'Teléfono de soporte',
    calleNumero: 'Calle, número exterior e interior',
    codigoPostal: 'Código postal',
    ciudadMunicipio: 'Ciudad / Municipio',
    estado: 'Estado o provincia',
    seleccionaEstado: 'Selecciona estado…',
    nombres: 'Nombre(s)',
    apellidos: 'Apellidos',
    idPersonal: 'Identificación fiscal personal',
    idPersonalMx: 'CURP o RFC personal',
    ssnLast4: 'Últimos 4 dígitos del SSN',
    fechaNacimiento: 'Fecha de nacimiento',
    emailPersonal: 'Email personal',
    telefono: 'Teléfono',
    calle: 'Calle y número',
    ciudad: 'Ciudad',
    rolTitulo: '¿Qué papel tiene esta persona en el negocio?',
    rolNota: 'Marca solo lo que sea cierto. Los datos que declaras aquí se envían tal cual para la verificación.',
    rolDueno: 'Posee 25% o más del negocio',
    rolDirector: 'Es director, administrador o miembro del consejo',
    rolPuesto: 'Puesto',
    rolParticipacion: 'Porcentaje de participación',
    duenosNota: 'Por regulaciones financieras, se debe declarar si hay dueños con más del 25% de participación.',
    duenosConfirmo: 'Confirmo que he agregado a todos los dueños con ≥25%',
    duenosDetalle: 'Estás declarando bajo tu responsabilidad que la lista de personas con 25% o más de participación está completa. Es una declaración legal y se envía tal cual para la verificación.',
    identidadNota: 'Necesitamos una foto clara de una identificación oficial vigente. Si hace falta, después te pediremos un comprobante de domicilio.',
    recomendado: 'Recomendado',
    qrNota: 'Escanea el código con tu celular y toma las fotos con su cámara: tendrás mejor luz y enfoque que con un archivo escaneado.',
    generando: 'Generando…',
    copiar: 'Copiar',
    frente: 'Frente',
    reverso: 'Reverso',
    comprobante: 'Comprobante',
    esperandoTelefono: 'Esperando a que termines desde tu teléfono…',
    codigoExpiro: 'El código expiró por seguridad (duran 10 minutos).',
    generarNuevo: 'Generar uno nuevo',
    frenteId: 'Frente de la identificación',
    quitar: 'Quitar',
    reversoId: 'Reverso (omite si tu identificación es un pasaporte)',
    comprobanteNota: 'Si te pedimos un comprobante de domicilio, la forma más rápida de subirlo es con la opción "Con tu teléfono" de arriba.',
    cuentaNota: 'Ingresa la cuenta donde recibirás los cobros. Debe estar a nombre del negocio o representante.',
    titular: 'Nombre del titular de la cuenta',
    valido: 'válido',
    tosIntro: 'Stripe procesa los pagos para este servicio. Al continuar, aceptas el',
    tosAcuerdo: 'Acuerdo de Cuenta Conectada de Stripe',
    tosCierre: ', que incluye los Términos de Servicio de Stripe.',
    tosCondicion: 'Como condición para que Cord habilite los servicios de procesamiento de pagos a través de Stripe, aceptas proporcionar a Cord información precisa y completa sobre ti y tu negocio, y autorizas a Cord a compartirla junto con los datos de transacciones relacionados con tu uso de los servicios de procesamiento de pagos provistos por Stripe.',
    tosDatos: 'Las imágenes de tus documentos se envían directamente a Stripe y CORD no las almacena de forma persistente; antes de enviarlas se les quitan los metadatos, incluida la ubicación GPS. Tu cuenta de depósito se conserva cifrada para operar y mostrarte a dónde llegan los cobros.',
    consentTitulo: 'Acepto expresamente el tratamiento de datos y las condiciones de Cord Payments',
    consentLei: 'Confirmo que leí el',
    consentPrivacidad: 'Aviso de Privacidad',
    consentComa: ', los',
    consentTerminos: 'Términos de Cord Payments',
    consentCierre: 'y el acuerdo de Stripe. Autorizo el tratamiento y las transferencias descritas de mis datos financieros, patrimoniales y de verificación de identidad.',
    consentRegistro: 'Tu aceptación se registra con fecha, dirección IP y versión de términos.',
    atras: 'Atrás',
    personas: {
      titulo: 'Personas y control',
      intro: 'Declara a quienes controlan el negocio: el representante legal y toda persona con 25% o más de participación. Es un requisito de las normas contra el lavado de dinero, no una preferencia de Cord.',
      agregar: 'Agregar persona',
      editar: 'Editar',
      quitar: 'Quitar',
      verificar: 'Verificar identidad',
      guardar: 'Guardar persona',
      cancelar: 'Cancelar',
      sinPersonas: 'Todavía no has agregado a nadie. Empieza por el representante legal.',
      rolRepresentante: 'Representante legal',
      rolDueno: 'Dueño',
      rolDirector: 'Director',
      rolEjecutivo: 'Directivo',
      rolesTitulo: '¿Qué papel tiene en el negocio?',
      participacion: 'Porcentaje de participación',
      puesto: 'Puesto',
      nombres: 'Nombre(s)',
      apellidos: 'Apellidos',
      idPersonal: 'Últimos 4 dígitos del SSN',
      fechaNacimiento: 'Fecha de nacimiento',
      email: 'Email',
      telefono: 'Teléfono',
      calle: 'Calle y número',
      ciudad: 'Ciudad',
      estado: 'Estado o provincia',
      codigoPostal: 'Código postal',
      selecciona: 'Selecciona…',
      estadoNoVerificada: 'Datos capturados',
      estadoEnRevision: 'En revisión',
      estadoVerificada: 'Verificada',
      estadoAccion: 'Acción requerida',
      sumaParticipacion: 'Declarado: {pct}% de participación entre las personas de esta lista.',
      confirmarQuitar: '¿Quitar a esta persona?',
      pendientes: 'Falta:',
    },
    pasos: ['Tipo de entidad', 'Datos del negocio', 'Dirección fiscal', 'Identidad', 'Personas', 'Verificación', 'Cuenta bancaria', 'Términos'],
  },
  en: {
    requisitosPendientes: 'Pending requirements',
    completar: 'Complete →',
    consultando: 'Checking your account status…',
    cambiar: 'Change',
    editarCuenta: 'Edit bank account',
    enRevision: 'Your details are under review',
    comoRegistrado: 'How is your business legally registered?',
    comoRegistradoMx: 'How is your business legally registered with the SAT?',
    personaMoral: 'Company',
    personaMoralDesc: 'Registered corporation, partnership or association',
    personaMoralDescMx: 'Company, S.A. de C.V., S. de R.L., Association',
    personaFisica: 'Individual',
    personaFisicaDesc: 'You work for yourself or as a sole proprietor',
    personaFisicaDescMx: 'Sole proprietor, RESICO, PFAE',
    taxIdHint: "We use it to verify your business's identity.",
    giro: 'Business category (MCC)',
    selecciona: 'Select…',
    giroHint: 'Pick the code closest to your main activity.',
    estructuraLegal: 'Legal structure',
    sitioWeb: 'Website or social link',
    telefonoSoporte: 'Support phone',
    calleNumero: 'Street and number',
    codigoPostal: 'Postal code',
    ciudadMunicipio: 'City',
    estado: 'State or province',
    seleccionaEstado: 'Select a state…',
    nombres: 'First name(s)',
    apellidos: 'Last name(s)',
    idPersonal: 'Personal tax ID',
    idPersonalMx: 'CURP or personal RFC',
    ssnLast4: 'Last 4 digits of SSN',
    fechaNacimiento: 'Date of birth',
    emailPersonal: 'Personal email',
    telefono: 'Phone',
    calle: 'Street and number',
    ciudad: 'City',
    rolTitulo: 'What role does this person have in the business?',
    rolNota: 'Only tick what is true. What you declare here is submitted as-is for verification.',
    rolDueno: 'Owns 25% or more of the business',
    rolDirector: 'Is a director, board member or administrator',
    rolPuesto: 'Job title',
    rolParticipacion: 'Ownership percentage',
    duenosNota: 'Financial regulations require declaring any owner with more than 25% ownership.',
    duenosConfirmo: "I confirm I've added every owner with ≥25%",
    duenosDetalle: 'You are declaring, under your own responsibility, that the list of people owning 25% or more is complete. This is a legal declaration and is submitted as-is for verification.',
    identidadNota: 'We need a clear photo of a valid government ID. If needed, we may ask for proof of address afterwards.',
    recomendado: 'Recommended',
    qrNota: "Scan the code with your phone and take the photos with its camera — better light and focus than a scanned file.",
    generando: 'Generating…',
    copiar: 'Copy',
    frente: 'Front',
    reverso: 'Back',
    comprobante: 'Proof of address',
    esperandoTelefono: 'Waiting for you to finish on your phone…',
    codigoExpiro: 'The code expired for security (they last 10 minutes).',
    generarNuevo: 'Generate a new one',
    frenteId: 'Front of the ID',
    quitar: 'Remove',
    reversoId: 'Back (skip if your ID is a passport)',
    comprobanteNota: 'If we ask for proof of address, the fastest way to upload it is the "With your phone" option above.',
    cuentaNota: 'Enter the account where you\'ll receive payouts. It must be under the business or representative name.',
    titular: 'Account holder name',
    valido: 'valid',
    tosIntro: 'Stripe processes payments for this service. By continuing, you accept the',
    tosAcuerdo: 'Stripe Connected Account Agreement',
    tosCierre: ", which includes Stripe's Terms of Service.",
    tosCondicion: 'As a condition of Cord enabling payment processing services through Stripe, you agree to provide Cord with accurate and complete information about you and your business, and you authorize Cord to share it along with transaction data related to your use of the payment processing services provided by Stripe.',
    tosDatos: "Document images are sent directly to Stripe and CORD does not store them persistently; their metadata, including GPS location, is stripped before sending. Your payout account is kept encrypted so we can operate and show you where payments land.",
    consentTitulo: 'I expressly accept the data processing and the Cord Payments terms',
    consentLei: 'I confirm I read the',
    consentPrivacidad: 'Privacy Notice',
    consentComa: ', the',
    consentTerminos: 'Cord Payments Terms',
    consentCierre: "and the Stripe agreement. I authorize the described processing and transfers of my financial, asset and identity-verification data.",
    consentRegistro: 'Your acceptance is recorded with date, IP address and terms version.',
    atras: 'Back',
    personas: {
      titulo: 'People and control',
      intro: 'Declare who controls the business: the legal representative and anyone owning 25% or more. This is an anti-money-laundering requirement, not a Cord preference.',
      agregar: 'Add person',
      editar: 'Edit',
      quitar: 'Remove',
      verificar: 'Verify identity',
      guardar: 'Save person',
      cancelar: 'Cancel',
      sinPersonas: "You haven't added anyone yet. Start with the legal representative.",
      rolRepresentante: 'Legal representative',
      rolDueno: 'Owner',
      rolDirector: 'Director',
      rolEjecutivo: 'Executive',
      rolesTitulo: 'What role do they have in the business?',
      participacion: 'Ownership percentage',
      puesto: 'Job title',
      nombres: 'First name(s)',
      apellidos: 'Last name',
      idPersonal: 'Last 4 digits of SSN',
      fechaNacimiento: 'Date of birth',
      email: 'Email',
      telefono: 'Phone',
      calle: 'Street and number',
      ciudad: 'City',
      estado: 'State or province',
      codigoPostal: 'Postal code',
      selecciona: 'Select…',
      estadoNoVerificada: 'Details captured',
      estadoEnRevision: 'Under review',
      estadoVerificada: 'Verified',
      estadoAccion: 'Action required',
      sumaParticipacion: 'Declared: {pct}% ownership across the people in this list.',
      confirmarQuitar: 'Remove this person?',
      pendientes: 'Missing:',
    },
    pasos: ['Entity type', 'Business details', 'Registered address', 'Identity', 'People', 'Verification', 'Bank account', 'Terms'],
  },
} as const;

/**
 * Un solo camino para hablar con la API de cobros, con el ciclo de step-up.
 *
 * Los endpoints que escriben identidad (personas, sesión de captura,
 * declaraciones) exigen reautenticación reciente y responden 428. Ese ciclo
 * estaba implementado UNA sola vez y a mano, dentro del paso de la cuenta
 * bancaria; cualquier otro paso que empezara a pedirlo se habría quedado colgado
 * mostrando "reauthentication_required" como si fuera un error del formulario.
 *
 * `window.cordStepUp` lo publica AppLayout: abre el diálogo de confirmación de
 * identidad y resuelve `true` si el usuario se reautenticó.
 */
async function postConnect(url: string, init: RequestInit): Promise<any> {
    const enviar = () => fetch(url, init);
    let res = await enviar();
    if (res.status === 428) {
        const stepUp = (window as any).cordStepUp;
        if (typeof stepUp !== 'function') {
            throw new Error('Necesitas confirmar tu identidad para continuar. Recarga la página e intenta de nuevo.');
        }
        if (!await stepUp()) {
            throw new Error('Necesitas confirmar tu identidad para continuar.');
        }
        res = await enviar();
    }
    const data = await res.json().catch(() => null);
    if (!data?.ok) throw new Error(data?.error || 'No se pudo completar la operación.');
    return data;
}

/** Azúcar para el caso más común: un JSON de ida. */
const postConnectJson = (url: string, body: unknown, method: 'POST' | 'PATCH' | 'DELETE' = 'POST') =>
    postConnect(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });

export default function ConnectCustomOnboarding({ org, locale = 'es' }: ConnectCustomOnboardingProps) {
    const S = CO_STRINGS[locale] ?? CO_STRINGS.es;
    const PAIS = String(org?.countryCode || 'MX').toUpperCase();
    const esMx = PAIS === 'MX';
    // El nombre de la identificación fiscal sale del país: RFC en México, NIF en
    // España, EIN en Estados Unidos. Preguntar "RFC" en Madrid no tiene respuesta.
    const TAX_ID_LABEL = getCountryProfile(PAIS, locale).taxIdLabel;
    // La identificación de la PERSONA no es la del negocio: en México es la CURP,
    // en Estados Unidos el SSN. Donde Stripe no la pide, el campo ni se dibuja.
    const PERSON_ID_LABEL = personIdLabel(PAIS, locale);
    // Subdivisión del país: los 32 estados de México, las 13 provincias de
    // Canadá, las 27 UF de Brasil, las 52 provincias de España, los 51 de EE.UU.
    // `null` = ese país no usa subdivisión en el alta y va input libre. El
    // proveedor EXIGE el código de dos letras en Canadá y Brasil, así que
    // escribir "Ontario" a mano hacía rebotar la cuenta.
    const SUBDIVISIONES = PAIS === 'MX'
        ? STRIPE_MX_STATES.map((e) => ({ code: e.codigo, name: e.nombre }))
        : subdivisionsFor(PAIS);
    // `company.structure` es un enum distinto en cada país. Donde el proveedor
    // no ofrece ninguno (México, España, Francia, Reino Unido, Brasil) el
    // selector no se dibuja, en vez de ofrecer figuras de otro ordenamiento.
    const ESTRUCTURAS = companyStructuresFor(PAIS, locale);
    // El giro ya no es una lista B2B en español: Cord es horizontal (regla 10).
    const GIROS = mccOptions(locale);
    const [step, setStep] = useState(0);
    const [booting, setBooting] = useState(true);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [requirements, setRequirements] = useState<any>(null);
    const [accountId, setAccountId] = useState<string | null>(null);
    const [chargesEnabled, setChargesEnabled] = useState(false);
    const [detailsSubmitted, setDetailsSubmitted] = useState(false);
    const [disabledReason, setDisabledReason] = useState<string | null>(null);
    const [bankInfo, setBankInfo] = useState<{ bank_name?: string; last4?: string } | null>(
        org?.bancoLast4 ? { last4: String(org.bancoLast4) } : null,
    );
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // ── Qué pedir lo decide Stripe, no una rama por país ────────────────────
    //
    // `person.id_number` se exigía en los ocho países y `ssn_last_4` se pintaba
    // con `if (PAIS === 'US')`. Verificado contra la API de requisitos de
    // Stripe: ES, DE y GB NO piden `id_number` — el representante europeo no
    // tiene ese número, así que el alta era imposible de terminar ahí.
    //
    // Se distingue MOSTRAR de EXIGIR: se pinta el campo si Stripe lo va a pedir
    // en algún momento (incluye `eventually_due`, así se captura de una vez), y
    // sólo se bloquea el avance si lo pide AHORA. Un campo que nadie pidió no se
    // dibuja: es identificación nacional, no un dato de relleno.
    const mostrarIdNumber = requiresField(requirements, 'id_number', { includeEventual: true });
    const exigirIdNumber = requiresField(requirements, 'id_number');
    const mostrarSsn = requiresField(requirements, 'ssn_last_4', { includeEventual: true });
    const exigirSsn = requiresField(requirements, 'ssn_last_4');
    const mostrarNacionalidad = requiresField(requirements, 'nationality', { includeEventual: true });

    // State
    const [businessType, setBusinessType] = useState<'company' | 'individual' | ''>('');
    const [mcc, setMcc] = useState('');
    const [url, setUrl] = useState(org?.sitioWeb || '');
    const [phone, setPhone] = useState(org?.telefono || '');
    const [email, setEmail] = useState(org?.emailContacto || '');
    const [name, setName] = useState(org?.razonSocial || org?.nombre || '');
    const [taxId, setTaxId] = useState(org?.rfc || '');
    const [structure, setStructure] = useState('');
    const [address, setAddress] = useState({
        line1: org?.direccion || '',
        city: '',
        state: '',
        postal_code: org?.cpFiscal || ''
    });

    // Person (Representative)
    const [person, setPerson] = useState({
        first_name: '',
        last_name: '',
        dob_day: '',
        dob_month: '',
        dob_year: '',
        id_number: '',
        ssn_last_4: '',
        phone: '',
        email: '',
        address_line1: '',
        address_city: '',
        address_state: '',
        address_postal_code: '',
        title: '',
        // Los roles se PREGUNTAN. Antes se mandaban `owner: true, director: true`
        // fijos junto con `percent_ownership: 100`, así que un director
        // contratado sin una sola acción quedaba declarado ante la autoridad
        // como dueño del 100% del negocio. Es un dato de KYC, no un default.
        is_owner: false,
        is_director: false,
        percent_ownership: '' as string | number,
    });
    const [personId, setPersonId] = useState<string | null>(null);
    const [ownersProvided, setOwnersProvided] = useState(false);
    // La lista real de personas. Antes el paso 4 era un checkbox y no había
    // ninguna: se creaba una sola Person y se declaraba que la lista estaba
    // completa, lo cual era falso en cuanto el negocio tenía más de un socio.
    const [personas, setPersonas] = useState<ConnectPersona[]>([]);
    const [personasCargadas, setPersonasCargadas] = useState(false);

    // Document (modo "Subir archivo" — fallback cuando no hay teléfono a la mano)
    const [docFront, setDocFront] = useState<File | null>(null);
    const [docBack, setDocBack] = useState<File | null>(null);
    const [previewFront, setPreviewFront] = useState<string | null>(null);
    const [previewBack, setPreviewBack] = useState<string | null>(null);

    // Verificación de identidad "continúa en tu teléfono" — QR + polling (estilo
    // Stripe Identity). El celular sube frente/reverso/comprobante directo a Stripe vía
    // /api/billing/connect/capture/[token]; el escritorio solo espera y refresca.
    const [uploadMode, setUploadMode] = useState<'phone' | 'file'>('phone');
    const [captureToken, setCaptureToken] = useState<string | null>(null);
    const [captureUrl, setCaptureUrl] = useState<string | null>(null);
    const [captureQr, setCaptureQr] = useState<string | null>(null);
    const [captureStatus, setCaptureStatus] = useState<'idle' | 'creating' | 'waiting' | 'completed' | 'expired'>('idle');
    const [capturedParts, setCapturedParts] = useState<{ front?: boolean; back?: boolean; address?: boolean }>({});
    const capturePollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Bank
    // Los campos de depósito dependen del país: CLABE, IBAN, routing+account…
    const payoutSpec = payoutSpecFor(String(org?.countryCode || 'MX'));
    // Los campos arrancan VACÍOS, también cuando ya hay una cuenta guardada.
    // Antes se precargaba la CLABE completa, lo que obligaba a mandarle al
    // navegador el número de cuenta descifrado sólo para rellenar un input. La
    // cuenta vigente se muestra como `••••1234` (ver `bankInfo`), y cambiarla
    // exige volver a teclearla — el mismo criterio que cualquier producto serio
    // aplica a un dato de este valor, y coherente con el step-up que ya pide el
    // endpoint.
    const [bankFields, setBankFields] = useState<Record<string, string>>(() => {
        const inicial: Record<string, string> = {};
        for (const f of payoutSpec.fields) inicial[f.key] = '';
        return inicial;
    });
    const setBankField = (key: string, value: string) =>
        setBankFields((prev) => ({ ...prev, [key]: value }));
    const [accountHolder, setAccountHolder] = useState(org?.bancoBeneficiario || org?.razonSocial || '');
    const [legalConsent, setLegalConsent] = useState(false);

    useEffect(() => {
        checkStatus(true).finally(() => setBooting(false));
        return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }, []);

    // Mientras la cuenta está "en revisión" (datos enviados, cobros aún no activos)
    // se sondea el estado cada 6s — al activarse se recarga la página para que los
    // toggles de métodos de pago (server-rendered) se desbloqueen solos.
    useEffect(() => {
        const pending = step === 8 && detailsSubmitted && !chargesEnabled
            && (!requirements?.currently_due || requirements.currently_due.length === 0);
        if (pending && !pollRef.current) {
            pollRef.current = setInterval(async () => {
                const acc = await fetchStatus();
                if (acc?.charges_enabled) {
                    if (pollRef.current) clearInterval(pollRef.current);
                    pollRef.current = null;
                    window.location.reload();
                }
            }, 6000);
        }
        if (!pending && pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
        }
    }, [step, detailsSubmitted, chargesEnabled, requirements]);

    // Sondea la sesión de captura por teléfono cada 2.5s mientras espera — cuando
    // el celular cierra la sesión, se refleja solo en el escritorio
    // sin que nadie tenga que refrescar la página.
    // La lista se pide al entrar al paso, no al montar: la mayoría de las altas
    // nunca llegan aquí en la primera sesión.
    useEffect(() => {
        if (step === 4 && !personasCargadas) void cargarPersonas();
    }, [step, personasCargadas]);

    useEffect(() => {
        if (captureStatus !== 'waiting' || !captureToken) return;
        const poll = async () => {
            try {
                const res = await fetch(`/api/billing/connect/capture/${captureToken}`);
                const data = await res.json();
                if (!data.ok) return;
                if (data.expired) { setCaptureStatus('expired'); return; }
                setCapturedParts(data.captured || {});
                if (data.status === 'completed') setCaptureStatus('completed');
            } catch { /* reintenta en el próximo tick */ }
        };
        poll();
        capturePollRef.current = setInterval(poll, 2500);
        return () => { if (capturePollRef.current) clearInterval(capturePollRef.current); };
    }, [captureStatus, captureToken]);

    // Al completarse desde el teléfono: refresca los requisitos reales de Stripe
    // y avanza solo, con una pausa breve para que se vea la confirmación.
    useEffect(() => {
        if (captureStatus !== 'completed') return;
        fetchStatus();
        const t = setTimeout(() => setStep(6), 1100);
        return () => clearTimeout(t);
    }, [captureStatus]);

    const startPhoneCapture = async () => {
        setError(null);
        if (businessType === 'company' && !personId) {
            setError('Primero completa los datos del representante (paso 4 del asistente)');
            return;
        }
        setCaptureStatus('creating');
        try {
            const data = await postConnectJson('/api/billing/connect/capture-session',
                { personId, isCompanyDoc: businessType === 'individual' });
            setCaptureToken(data.token);
            setCaptureUrl(data.url);
            setCaptureQr(data.qrSvg || null);
            setCapturedParts({});
            setCaptureStatus('waiting');
        } catch (e: any) {
            setError(e.message);
            setCaptureStatus('idle');
        }
    };

    const cargarPersonas = async () => {
        try {
            const res = await fetch('/api/billing/connect/persons');
            const data = await res.json();
            if (data.ok) setPersonas(data.personas || []);
        } catch { /* la lista se vuelve a pedir al entrar al paso */ }
        finally { setPersonasCargadas(true); }
    };

    const crearPersona = async (payload: any) => {
        const data = await postConnectJson('/api/billing/connect/persons', payload);
        setPersonas(data.personas || []);
        setRequirements(data.requirements);
        if (data.personId && payload?.relationship?.representative) setPersonId(data.personId);
    };

    const editarPersona = async (payload: any) => {
        const data = await postConnectJson('/api/billing/connect/persons', payload, 'PATCH');
        setPersonas(data.personas || []);
        setRequirements(data.requirements);
    };

    const quitarPersona = async (stripePersonId: string) => {
        const data = await postConnectJson('/api/billing/connect/persons', { id: stripePersonId }, 'DELETE');
        setPersonas(data.personas || []);
        setRequirements(data.requirements);
    };

    // Verificar a UNA persona reutiliza el mismo QR de captura móvil que ya
    // existía, apuntado a ella en vez de al representante fijo.
    const verificarPersona = (stripePersonId: string) => {
        setPersonId(stripePersonId);
        setStep(5);
        setUploadMode('phone');
        setCaptureStatus('idle');
    };

    const fetchStatus = async (): Promise<any | null> => {
        try {
            const res = await fetch('/api/billing/connect/status');
            const data = await res.json();
            if (data.ok && data.account) {
                setAccountId(data.account.id);
                setRequirements(data.account.requirements);
                setChargesEnabled(data.account.charges_enabled);
                setDetailsSubmitted(data.account.details_submitted);
                setDisabledReason(data.account.disabled_reason || null);
                if (data.account.business_type === 'company' || data.account.business_type === 'individual') {
                    setBusinessType(data.account.business_type);
                }
                if (data.account.person_id) setPersonId(data.account.person_id);
                if (data.account.external_accounts?.length) setBankInfo(data.account.external_accounts[0]);
                return data.account;
            }
        } catch (e) {
            console.error('Error fetching status', e);
        }
        return null;
    };

    const checkStatus = async (resume = false) => {
        const acc = await fetchStatus();
        if (!acc) return;
        if (acc.details_submitted) {
            setStep(8); // Completada o en revisión
        } else if (resume && acc.id) {
            // Reanudar donde se quedó: brincar al primer requisito pendiente en vez
            // de forzar al usuario a re-caminar todo el wizard desde cero.
            const due: string[] = acc.requirements?.currently_due || [];
            if (due.length) {
                const primerPaso = Math.min(...due.map((r) => translateRequirement(r, locale, PAIS).paso));
                setStep(Math.max(1, Math.min(7, primerPaso)));
            }
        }
    };

    const goBack = () => {
        setError(null);
        setStep((s) => {
            // Persona física salta el paso 4 (dueños beneficiarios) en ambos sentidos.
            if (s === 5 && businessType === 'individual') return 3;
            return Math.max(0, s - 1);
        });
    };

    const handleNext = async () => {
        setError(null);
        setLoading(true);
        try {
            if (step === 0) {
                if (!businessType) throw new Error('Selecciona un tipo de registro');
                const data = await postConnectJson('/api/billing/connect/create', { business_type: businessType });
                setAccountId(data.accountId);
                setRequirements(data.requirements);
                if (data.business_type === 'company' || data.business_type === 'individual') {
                    setBusinessType(data.business_type);
                }
                setStep(1);
            } else if (step === 1) {
                if (!name || !taxId || !mcc) throw new Error('Faltan datos obligatorios');
                // El checksum se verifica AQUÍ y no se deja para que Stripe lo
                // rechace con un error que no le dice nada al vendedor (regla
                // 14) — mismo criterio que la CLABE en payout-fields.ts.
                if (esMx) {
                    if (!validRfc(taxId)) throw new Error('El RFC no tiene un formato válido (12 o 13 caracteres, formato oficial)');
                } else if (PAIS === 'ES') {
                    if (!validSpainTaxId(taxId)) throw new Error('Ese NIF, NIE o CIF no es válido — revisa la letra de control.');
                } else if (taxId.trim().length < 5) {
                    throw new Error(`Captura tu ${TAX_ID_LABEL}`);
                }

                const payload: any = {
                    business_profile: { mcc, url, support_phone: phone, support_email: email },
                };
                if (businessType === 'company') {
                    payload.company = { name, tax_id: taxId, phone, structure: structure || undefined };
                } else {
                    payload.individual = { first_name: name.split(' ')[0], last_name: name.split(' ').slice(1).join(' ') || '.', id_number: taxId, phone };
                }
                const data = await postConnectJson('/api/billing/connect/account', payload, 'PATCH');
                setRequirements(data.requirements);
                setStep(2);
            } else if (step === 2) {
                if (!address.line1 || !address.state || !address.postal_code) throw new Error('Completa la dirección fiscal');
                const payload: any = {};
                if (businessType === 'company') {
                    payload.company = { address };
                } else {
                    payload.individual = { address };
                }
                const data = await postConnectJson('/api/billing/connect/account', payload, 'PATCH');
                setRequirements(data.requirements);
                setStep(3); // Empresa Y persona física pasan por el paso 3 (datos personales + DOB)
            } else if (step === 3) { // Datos personales (representante o persona física)
                if (!person.first_name || !person.last_name) throw new Error('Completa los datos personales');
                // Sólo se exige lo que Stripe pidió para ESTA cuenta. Antes se
                // exigía `id_number` en los ocho países (bloqueo duro en ES/DE/GB)
                // y `ssn_last_4` con una rama por país.
                if (exigirIdNumber && !person.id_number.trim()) {
                    throw new Error(locale === 'en' ? `Enter the ${PERSON_ID_LABEL}` : `Captura el ${PERSON_ID_LABEL}`);
                }
                if (exigirSsn && person.ssn_last_4.length !== 4) throw new Error('Captura los últimos 4 dígitos del SSN');
                if (person.is_owner) {
                    const pct = Number(person.percent_ownership);
                    if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
                        throw new Error(locale === 'en'
                            ? 'Enter the ownership percentage (between 1 and 100).'
                            : 'Captura el porcentaje de participación (entre 1 y 100).');
                    }
                }
                const d = Number(person.dob_day), m = Number(person.dob_month), y = Number(person.dob_year);
                if (!d || !m || !y || d < 1 || d > 31 || m < 1 || m > 12 || y < 1900 || y > new Date().getFullYear() - 18) {
                    throw new Error('Revisa la fecha de nacimiento (debes ser mayor de 18 años)');
                }
                const dob = { day: person.dob_day, month: person.dob_month, year: person.dob_year };
                const personAddress = {
                    line1: person.address_line1,
                    city: person.address_city,
                    state: person.address_state,
                    postal_code: person.address_postal_code,
                    // El país de la ORG, no 'MX' fijo: el domicilio del
                    // representante de un negocio en Austin se mandaba a
                    // Stripe como si viviera en México, bloqueando el alta.
                    country: PAIS,
                };
                if (businessType === 'individual') {
                    // Persona física: los datos van al individual[...] de la CUENTA (no una person aparte).
                    const data = await postConnectJson('/api/billing/connect/account', {
                        individual: {
                            first_name: person.first_name,
                            last_name: person.last_name,
                            // Se manda sólo si existe: `flattenConnectFields()` omite
                            // vacíos, pero mandar una llave que el país no usa ensucia
                            // el payload y confunde al leer un log.
                            ...(person.id_number ? { id_number: person.id_number } : {}),
                            ...(person.ssn_last_4 ? { ssn_last_4: person.ssn_last_4 } : {}),
                            email: person.email,
                            phone: person.phone,
                            dob,
                            address: personAddress,
                        },
                    }, 'PATCH');
                    setRequirements(data.requirements);
                    setStep(5); // las personas físicas omiten el paso de dueños beneficiarios
                } else {
                    const payload = {
                        first_name: person.first_name,
                        last_name: person.last_name,
                        ...(person.id_number ? { id_number: person.id_number } : {}),
                        ...(person.ssn_last_4 ? { ssn_last_4: person.ssn_last_4 } : {}),
                        email: person.email,
                        phone: person.phone,
                        dob,
                        address: personAddress,
                        // `owner` y `director` salen de lo que el usuario declaró, no
                        // de un literal. Marcarlos siempre en true declaraba ante la
                        // autoridad que el representante posee el 100% del negocio,
                        // aunque fuera un director contratado sin acciones — y de paso
                        // hacía imposible que la lista de dueños fuera correcta.
                        relationship: {
                            representative: true,
                            owner: person.is_owner,
                            director: person.is_director,
                            title: person.title || undefined,
                            ...(person.is_owner ? { percent_ownership: Number(person.percent_ownership) } : {}),
                        },
                    };
                    // Si ya existe el representante (reanudación), se ACTUALIZA en vez
                    // de crear una segunda persona duplicada en la cuenta.
                    const data = await postConnectJson(
                        '/api/billing/connect/persons',
                        personId ? { ...payload, id: personId } : payload,
                        personId ? 'PATCH' : 'POST',
                    );
                    if (data.personId) setPersonId(data.personId);
                    setRequirements(data.requirements);
                    setStep(4);
                }
            } else if (step === 4) { // Dueños Beneficiarios
                if (!ownersProvided) throw new Error('Confirma que la lista de dueños está completa para continuar');
                const data = await postConnectJson('/api/billing/connect/account',
                    { company: { owners_provided: true, directors_provided: true, executives_provided: true } }, 'PATCH');
                setRequirements(data.requirements);
                setStep(5);
            } else if (step === 5) { // Identificación
                if (uploadMode === 'phone') {
                    // El teléfono ya subió las fotos directo a Stripe (ver polling arriba);
                    // aquí solo refrescamos requisitos y avanzamos.
                    if (captureStatus !== 'completed') throw new Error('Espera a que termines la verificación desde tu teléfono, o cambia a "Subir archivo".');
                    await fetchStatus();
                    setStep(6);
                } else {
                    if (!docFront) throw new Error('Sube al menos el frente de tu identificación');
                    if (businessType === 'company' && !personId) throw new Error('Primero completa los datos del representante (paso 4 del asistente)');

                    const uploadDoc = async (file: File, side: string) => {
                        const fd = new FormData();
                        fd.append('file', file);
                        fd.append('side', side);
                        if (businessType === 'company') {
                            fd.append('personId', personId!);
                            fd.append('isCompanyDoc', 'false');
                        } else {
                            fd.append('isCompanyDoc', 'true');
                        }
                        // Por `postConnect` como todo lo demás: no se le pone
                        // Content-Type a un FormData (el navegador tiene que
                        // escribir el boundary), y el ciclo de step-up queda
                        // cubierto si este endpoint llega a exigirlo.
                        return postConnect('/api/billing/connect/document', { method: 'POST', body: fd });
                    };

                    await uploadDoc(docFront, 'front');
                    if (docBack) await uploadDoc(docBack, 'back');

                    await fetchStatus();
                    setStep(6);
                }
            } else if (step === 6) { // Cuenta Bancaria
                if (!accountHolder.trim()) throw new Error('Escribe el nombre del titular de la cuenta');
                // Misma validación que el servidor, con el formato del país.
                const check = validatePayout(String(org?.countryCode || 'MX'), bankFields, locale);
                if (!check.ok) throw new Error(check.error || 'Revisa los datos de tu cuenta');
                // El ciclo de step-up vive en `postConnect`, no aquí: era el único
                // camino del wizard que lo manejaba, y estaba escrito a mano.
                const data = await postConnectJson('/api/billing/connect/external-account',
                    { ...check.values, account_holder_name: accountHolder, account_holder_type: businessType });
                setRequirements(data.requirements);
                if (data.external_account?.last4) setBankInfo({ bank_name: data.external_account.bank_name, last4: data.external_account.last4 });
                setStep(7);
            } else if (step === 7) { // TOS Acceptance
                if (!legalConsent) throw new Error('Confirma los términos y el tratamiento de datos para continuar');
                await postConnectJson('/api/billing/connect/account', {
                    tos_acceptance: true,
                    legal_consents: {
                        payments_terms: FEE_TERMS_VERSION,
                        privacy: true,
                    },
                }, 'PATCH');
                await fetchStatus();
                setStep(8);
            }
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    const dueList: string[] = requirements?.currently_due || [];

    const renderRequirements = () => {
        if (!dueList.length) return null;
        return (
            <div className="co-requirements">
                <div className="co-req-header">{S.requisitosPendientes}</div>
                <ul className="co-req-list">
                    {dueList.map((req: string) => {
                        const tr = translateRequirement(req, locale, PAIS);
                        return <li key={req} onClick={() => setStep(tr.paso)} className="co-req-item">
                            <span className="co-req-msg">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" fill="currentColor" fillOpacity="0.1"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                                {tr.mensaje}
                            </span>
                            <span className="co-req-action">{S.completar}</span>
                        </li>;
                    })}
                </ul>
            </div>
        );
    };

    if (booting) {
        return (
            <div className="connect-custom-onboarding">
                <div className="co-boot">
                    <span className="co-spinner" aria-hidden="true"></span>
                    <span>{S.consultando}</span>
                </div>
            </div>
        );
    }

    if (step === 8) {
        if (chargesEnabled) {
            return (
                <div className="connect-custom-onboarding">
                    <div className="co-active">
                        {bankInfo?.last4 && (
                            <div className="co-bank-row">
                                <div className="co-bank-ico">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18"/><path d="M5 21V10l7-5 7 5v11" fill="currentColor" fillOpacity="0.1"/><path d="M9 21v-6h6v6"/></svg>
                                </div>
                                <div className="co-bank-text">
                                    <strong>{bankInfo.bank_name || 'Cuenta bancaria'}</strong>
                                    <span>{payoutSpec.label} terminación •••• {bankInfo.last4}. Aquí llegan tus depósitos.</span>
                                </div>
                                <button type="button" className="co-btn co-btn-ghost" onClick={() => setStep(6)}>{S.cambiar}</button>
                            </div>
                        )}
                        {!bankInfo?.last4 && (
                            <button type="button" className="co-btn co-btn-ghost" onClick={() => setStep(6)}>{S.editarCuenta}</button>
                        )}
                    </div>
                </div>
            );
        }
        return (
            <div className="connect-custom-onboarding">
                <div className="co-success">
                    {renderRequirements()}
                    {dueList.length === 0 ? (
                        <div className="co-review">
                            <span className="co-spinner co-spinner-lg" aria-hidden="true"></span>
                            <h3>{S.enRevision}</h3>
                            <p>
                                Cord Payments está verificando tu información. Normalmente toma un par de minutos.
                                Esta página se actualizará sola en cuanto tus cobros estén activos.
                            </p>
                            {disabledReason && disabledReason !== 'requirements.pending_verification' && (
                                <p className="co-review-reason">{locale === 'en' ? 'Detail' : 'Detalle'}: {translateRequirement(disabledReason, locale, PAIS).mensaje}</p>
                            )}
                        </div>
                    ) : null}
                </div>
            </div>
        );
    }

    const totalSteps = S.pasos.length;
    const progressPct = Math.round(((step + 1) / totalSteps) * 100);

    return (
        <div className="connect-custom-onboarding">
            <div className="co-header">
                <div className="co-header-text">
                    <h3>{S.pasos[step]}</h3>
                    <span className="co-step-count">Paso {step + 1} de {totalSteps}</span>
                </div>
                {accountId && <span className="co-account-id">{accountId}</span>}
            </div>
            <div className="co-progress" role="progressbar" aria-valuenow={progressPct} aria-valuemin={0} aria-valuemax={100}>
                <span className="co-progress-fill" style={{ width: `${progressPct}%` }}></span>
            </div>

            {error && <div className="co-error" role="alert">{error}</div>}

            <div className="co-step-content" key={step}>
                {step === 0 && (
                    <div className="co-step">
                        <p className="co-sub">{esMx ? S.comoRegistradoMx : S.comoRegistrado}</p>
                        <div className="co-radio-list">
                            <label className={`co-card-radio ${businessType === 'company' ? 'active' : ''}`}>
                                <input type="radio" name="btype" checked={businessType === 'company'} onChange={() => setBusinessType('company')} />
                                <div className="cr-text">
                                    <strong>{S.personaMoral}</strong>
                                    <span>{esMx ? S.personaMoralDescMx : S.personaMoralDesc}</span>
                                </div>
                            </label>
                            <label className={`co-card-radio ${businessType === 'individual' ? 'active' : ''}`}>
                                <input type="radio" name="btype" checked={businessType === 'individual'} onChange={() => setBusinessType('individual')} />
                                <div className="cr-text">
                                    <strong>{S.personaFisica}</strong>
                                    <span>{esMx ? S.personaFisicaDescMx : S.personaFisicaDesc}</span>
                                </div>
                            </label>
                        </div>
                    </div>
                )}

                {step === 1 && (
                    <div className="co-step">
                        <div className="s-field">
                            <label>{businessType === 'company' ? 'Razón Social' : 'Nombre Completo (Negocio)'}</label>
                            <input className="s-input" value={name} onChange={e => setName(e.target.value)} placeholder={businessType === 'company' ? 'Ej. Mi Empresa S.A. de C.V.' : 'Ej. Juan Pérez'} />
                        </div>
                        <div className="s-row">
                            <div className="s-field">
                                <label>{TAX_ID_LABEL}</label>
                                <input className="s-input" value={taxId} onChange={e => setTaxId(e.target.value.toUpperCase())} maxLength={13} autoCapitalize="characters" />
                                <span className="s-hint">{S.taxIdHint}</span>
                            </div>
                            <div className="s-field">
                                <label>{S.giro}</label>
                                <select className="s-input" value={mcc} onChange={e => setMcc(e.target.value)}>
                                    <option value="">{S.selecciona}</option>
                                    {GIROS.map(m => <option key={m.codigo} value={m.codigo}>{m.nombre}</option>)}
                                </select>
                                <span className="s-hint">{S.giroHint}</span>
                            </div>
                        </div>
                        {businessType === 'company' && ESTRUCTURAS && (
                            <div className="s-field">
                                <label>{S.estructuraLegal}</label>
                                <select className="s-input" value={structure} onChange={e => setStructure(e.target.value)}>
                                    <option value="">{S.selecciona}</option>
                                    {ESTRUCTURAS.map(e => <option key={e.codigo} value={e.codigo}>{e.nombre}</option>)}
                                </select>
                            </div>
                        )}
                        <div className="s-row">
                            <div className="s-field">
                                <label>{S.sitioWeb}</label>
                                <input className="s-input" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://" type="url" />
                            </div>
                            <div className="s-field">
                                <label>{S.telefonoSoporte}</label>
                                <input className="s-input" value={phone} onChange={e => setPhone(e.target.value)} type="tel" />
                            </div>
                        </div>
                    </div>
                )}

                {step === 2 && (
                    <div className="co-step">
                        <div className="s-field">
                            <label>{S.calleNumero}</label>
                            <input className="s-input" value={address.line1} onChange={e => setAddress({...address, line1: e.target.value})} />
                        </div>
                        <div className="s-row">
                            <div className="s-field">
                                <label>{S.codigoPostal}</label>
                                {/* El formato del CP lo decide el país: MX/US son 5 dígitos,
                                    pero un ZIP+4 (12345-6789), un código canadiense
                                    (K1A 0B1) o uno británico traen letras y guiones. */}
                                {(esMx || PAIS === 'US') ? (
                                    <input className="s-input" value={address.postal_code} onChange={e => setAddress({...address, postal_code: e.target.value.replace(/\D/g, '')})} maxLength={5} inputMode="numeric" />
                                ) : (
                                    <input className="s-input" value={address.postal_code} onChange={e => setAddress({...address, postal_code: e.target.value.toUpperCase()})} maxLength={12} />
                                )}
                            </div>
                            <div className="s-field">
                                <label>{S.ciudadMunicipio}</label>
                                <input className="s-input" value={address.city} onChange={e => setAddress({...address, city: e.target.value})} />
                            </div>
                        </div>
                        <div className="s-field">
                            <label>{S.estado}</label>
                            {/* Un solo camino: el catálogo del país si existe, input
                                libre si ese país no usa subdivisión. Antes eran dos
                                ramas fijas (MX y US) y todo lo demás caía a texto
                                libre — incluidos Canadá y Brasil, donde el proveedor
                                EXIGE el código de dos letras y "Ontario" rebotaba. */}
                            {SUBDIVISIONES ? (
                                <select className="s-input" value={address.state} onChange={e => setAddress({...address, state: e.target.value})}>
                                    <option value="">{S.seleccionaEstado}</option>
                                    {SUBDIVISIONES.map(sub => <option key={sub.code} value={sub.code}>{sub.name}</option>)}
                                </select>
                            ) : (
                                <input className="s-input" value={address.state} onChange={e => setAddress({...address, state: e.target.value})} maxLength={60} />
                            )}
                        </div>
                    </div>
                )}

                {step === 3 && (
                    <div className="co-step">
                        <p className="co-sub">{businessType === 'individual' ? 'Como persona física, necesitamos verificar tu identidad para activar Cord Payments.' : 'Persona autorizada para operar la cuenta bancaria de la empresa.'}</p>
                        <div className="s-row">
                            <div className="s-field">
                                <label>{S.nombres}</label>
                                <input className="s-input" value={person.first_name} onChange={e => setPerson({...person, first_name: e.target.value})} autoComplete="given-name" />
                            </div>
                            <div className="s-field">
                                <label>{S.apellidos}</label>
                                <input className="s-input" value={person.last_name} onChange={e => setPerson({...person, last_name: e.target.value})} autoComplete="family-name" />
                            </div>
                        </div>
                        {(mostrarIdNumber || mostrarSsn) && (
                            <div className="s-row">
                                {mostrarIdNumber && (
                                    <div className="s-field">
                                        <label>{PERSON_ID_LABEL}</label>
                                        <input className="s-input" value={person.id_number} onChange={e => setPerson({...person, id_number: e.target.value.toUpperCase()})} autoCapitalize="characters" autoComplete="off" />
                                    </div>
                                )}
                                {mostrarSsn && (
                                    <div className="s-field">
                                        <label>{S.ssnLast4}</label>
                                        <input className="s-input" value={person.ssn_last_4} onChange={e => setPerson({...person, ssn_last_4: e.target.value.replace(/\D/g, '').slice(0, 4)})} maxLength={4} inputMode="numeric" autoComplete="off" />
                                    </div>
                                )}
                            </div>
                        )}
                        <div className="s-row">
                            <div className="s-field">
                                <label>{S.fechaNacimiento}</label>
                                <div className="co-dob">
                                    <input className="s-input" placeholder="DD" value={person.dob_day} onChange={e => setPerson({...person, dob_day: e.target.value.replace(/\D/g, '')})} maxLength={2} inputMode="numeric" aria-label="Día" />
                                    <span className="co-dob-sep">/</span>
                                    <input className="s-input" placeholder="MM" value={person.dob_month} onChange={e => setPerson({...person, dob_month: e.target.value.replace(/\D/g, '')})} maxLength={2} inputMode="numeric" aria-label="Mes" />
                                    <span className="co-dob-sep">/</span>
                                    <input className="s-input" placeholder="AAAA" value={person.dob_year} onChange={e => setPerson({...person, dob_year: e.target.value.replace(/\D/g, '')})} maxLength={4} inputMode="numeric" aria-label="Año" />
                                </div>
                            </div>
                        </div>
                        <div className="s-row">
                            <div className="s-field">
                                <label>{S.emailPersonal}</label>
                                <input className="s-input" value={person.email} onChange={e => setPerson({...person, email: e.target.value})} type="email" autoComplete="email" />
                            </div>
                            <div className="s-field">
                                <label>{S.telefono}</label>
                                <input className="s-input" value={person.phone} onChange={e => setPerson({...person, phone: e.target.value})} type="tel" autoComplete="tel" />
                            </div>
                        </div>
                        {businessType === 'company' && (
                            <>
                                <div className="co-divider"></div>
                                <p className="co-sub co-sub-strong">{S.rolTitulo}</p>
                                <p className="co-hint">{S.rolNota}</p>
                                <label className="co-role">
                                    <span className="s-toggle">
                                        <input type="checkbox" checked={person.is_owner} onChange={e => setPerson({...person, is_owner: e.target.checked, percent_ownership: e.target.checked ? person.percent_ownership : ''})} />
                                        <span className="s-toggle-track"><span className="s-toggle-thumb"></span></span>
                                    </span>
                                    <span className="co-role-text">{S.rolDueno}</span>
                                </label>
                                <label className="co-role">
                                    <span className="s-toggle">
                                        <input type="checkbox" checked={person.is_director} onChange={e => setPerson({...person, is_director: e.target.checked})} />
                                        <span className="s-toggle-track"><span className="s-toggle-thumb"></span></span>
                                    </span>
                                    <span className="co-role-text">{S.rolDirector}</span>
                                </label>
                                <div className="s-row">
                                    <div className="s-field">
                                        <label>{S.rolPuesto}</label>
                                        <input className="s-input" value={person.title} onChange={e => setPerson({...person, title: e.target.value})} maxLength={60} autoComplete="organization-title" />
                                    </div>
                                    {person.is_owner && (
                                        <div className="s-field">
                                            <label>{S.rolParticipacion}</label>
                                            <input className="s-input" value={String(person.percent_ownership)} onChange={e => setPerson({...person, percent_ownership: e.target.value.replace(/[^0-9.]/g, '').slice(0, 6)})} inputMode="decimal" placeholder="25" />
                                        </div>
                                    )}
                                </div>
                            </>
                        )}
                        <div className="co-divider"></div>
                        <p className="co-sub co-sub-strong">{businessType === 'individual' ? 'Tu dirección personal' : 'Dirección personal del representante'}</p>
                        <div className="s-field">
                            <label>{S.calle}</label>
                            <input className="s-input" value={person.address_line1} onChange={e => setPerson({...person, address_line1: e.target.value})} />
                        </div>
                        <div className="s-row s-row-3">
                            <div className="s-field">
                                <label>{S.ciudad}</label>
                                <input className="s-input" value={person.address_city} onChange={e => setPerson({...person, address_city: e.target.value})} />
                            </div>
                            <div className="s-field">
                                <label>{S.estado}</label>
                                {SUBDIVISIONES ? (
                                    <select className="s-input" value={person.address_state} onChange={e => setPerson({...person, address_state: e.target.value})}>
                                        <option value="">{S.selecciona}</option>
                                        {SUBDIVISIONES.map(sub => <option key={sub.code} value={sub.code}>{sub.name}</option>)}
                                    </select>
                                ) : (
                                    <input className="s-input" value={person.address_state} onChange={e => setPerson({...person, address_state: e.target.value})} maxLength={60} />
                                )}
                            </div>
                            <div className="s-field co-field-cp">
                                <label>{esMx ? 'CP' : S.codigoPostal}</label>
                                {(esMx || PAIS === 'US') ? (
                                    <input className="s-input" value={person.address_postal_code} onChange={e => setPerson({...person, address_postal_code: e.target.value.replace(/\D/g, '')})} maxLength={5} inputMode="numeric" />
                                ) : (
                                    <input className="s-input" value={person.address_postal_code} onChange={e => setPerson({...person, address_postal_code: e.target.value.toUpperCase()})} maxLength={12} />
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {step === 4 && (
                    <div className="co-step">
                        <ConnectPersonasStep
                            personas={personas}
                            pais={PAIS}
                            subdivisiones={SUBDIVISIONES}
                            locale={locale}
                            strings={S.personas}
                            exigeIdNumber={mostrarIdNumber}
                            exigeSsn={mostrarSsn}
                            exigeNacionalidad={mostrarNacionalidad}
                            busy={loading}
                            onCrear={crearPersona}
                            onEditar={editarPersona}
                            onQuitar={quitarPersona}
                            onVerificar={verificarPersona}
                        />
                        {/* La atestación aparece DESPUÉS de la lista y sólo cuando el
                            proveedor la pide. Antes era el paso entero, y se firmaba
                            sin haber podido construir la lista que declara. */}
                        <div className="co-divider"></div>
                        <p className="co-sub">{S.duenosNota}</p>
                        <label className="co-attest">
                            <span className="s-toggle">
                                <input type="checkbox" checked={ownersProvided} onChange={e => setOwnersProvided(e.target.checked)} />
                                <span className="s-toggle-track"><span className="s-toggle-thumb"></span></span>
                            </span>
                            <span className="co-attest-text">
                                <strong>{S.duenosConfirmo}</strong>
                                <span>{S.duenosDetalle}</span>
                            </span>
                        </label>
                    </div>
                )}

                {step === 5 && (
                    <div className="co-step">
                        <p className="co-sub">{S.identidadNota}</p>

                        <div className="co-mode-tabs" role="tablist">
                            <button type="button" role="tab" aria-selected={uploadMode === 'phone'} className={`co-mode-tab ${uploadMode === 'phone' ? 'active' : ''}`} onClick={() => setUploadMode('phone')}>
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="7" y="2" width="10" height="20" rx="2.5" fill="currentColor" fillOpacity="0.12"/><line x1="11" y1="18" x2="13" y2="18"/></svg>
                                Con tu teléfono
                                <span className="co-mode-tab-tag">{S.recomendado}</span>
                            </button>
                            <button type="button" role="tab" aria-selected={uploadMode === 'file'} className={`co-mode-tab ${uploadMode === 'file' ? 'active' : ''}`} onClick={() => setUploadMode('file')}>
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12" /><path d="m7 8 5-5 5 5" fill="currentColor" fillOpacity="0.12"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" /></svg>
                                Subir archivo
                            </button>
                        </div>

                        {uploadMode === 'phone' ? (
                            <div className="co-phone-capture">
                                {(captureStatus === 'idle' || captureStatus === 'creating') && (
                                    <div className="co-phone-intro">
                                        <div className="co-phone-ico">
                                            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="7" y="2" width="10" height="20" rx="2.5" fill="currentColor" fillOpacity="0.1"/><circle cx="12" cy="11" r="2.6" /><line x1="11" y1="17.3" x2="13" y2="17.3" /></svg>
                                        </div>
                                        <p>{S.qrNota}</p>
                                        <button type="button" className="co-btn co-btn-primary" onClick={startPhoneCapture} disabled={captureStatus === 'creating'}>
                                            {captureStatus === 'creating' ? (<><span className="co-spinner co-spinner-btn" aria-hidden="true"></span> {S.generando}</>) : (locale === 'en' ? 'Generate QR code' : 'Generar código QR')}
                                        </button>
                                    </div>
                                )}

                                {(captureStatus === 'waiting' || captureStatus === 'completed') && (
                                    <div className="co-phone-active">
                                        {captureQr && <div className="co-phone-qr" dangerouslySetInnerHTML={{ __html: captureQr }} />}
                                        <div className="co-phone-link">
                                            <input readOnly value={captureUrl || ''} onFocus={(e) => e.currentTarget.select()} />
                                            <button type="button" onClick={() => { if (captureUrl) navigator.clipboard?.writeText(captureUrl); }}>{S.copiar}</button>
                                        </div>
                                        <ul className="co-phone-steps">
                                            <li className={capturedParts.front ? 'done' : ''}><span className="co-phone-step-dot"></span>{S.frente}</li>
                                            <li className={capturedParts.back ? 'done' : ''}><span className="co-phone-step-dot"></span>{S.reverso}</li>
                                            <li className={capturedParts.address ? 'done' : ''}><span className="co-phone-step-dot"></span>{S.comprobante}</li>
                                        </ul>
                                        {captureStatus === 'waiting' ? (
                                            <span className="co-phone-waiting"><span className="co-spinner co-spinner-btn" aria-hidden="true"></span> {S.esperandoTelefono}</span>
                                        ) : (
                                            <span className="co-phone-done">
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                                                Identidad verificada desde tu teléfono. Continuando…
                                            </span>
                                        )}
                                    </div>
                                )}

                                {captureStatus === 'expired' && (
                                    <div className="co-phone-intro">
                                        <p>{S.codigoExpiro}</p>
                                        <button type="button" className="co-btn co-btn-primary" onClick={startPhoneCapture}>{S.generarNuevo}</button>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <>
                                <div className="s-field">
                                    <label>{S.frenteId}</label>
                                    {previewFront ? (
                                        <div className="co-doc-preview">
                                            <img src={previewFront} alt="Frente" />
                                            <span className="co-doc-ok">
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                                                Lista
                                            </span>
                                            <button type="button" className="co-btn co-btn-ghost co-btn-sm" onClick={() => { setDocFront(null); setPreviewFront(null); }}>{S.quitar}</button>
                                        </div>
                                    ) : (
                                        <label className="co-btn co-btn-ghost co-upload co-upload-block">
                                            Subir archivo
                                            <input type="file" accept="image/jpeg,image/png" onChange={e => {
                                                const file = e.target.files?.[0];
                                                if (file) { setDocFront(file); setPreviewFront(file.type.startsWith('image/') ? URL.createObjectURL(file) : '/imgs/logo-cord-navy.png'); }
                                            }} />
                                        </label>
                                    )}
                                </div>

                                <div className="s-field">
                                    <label>{S.reversoId}</label>
                                    {previewBack ? (
                                        <div className="co-doc-preview">
                                            <img src={previewBack} alt="Reverso" />
                                            <span className="co-doc-ok">
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                                                Lista
                                            </span>
                                            <button type="button" className="co-btn co-btn-ghost co-btn-sm" onClick={() => { setDocBack(null); setPreviewBack(null); }}>{S.quitar}</button>
                                        </div>
                                    ) : (
                                        <label className="co-btn co-btn-ghost co-upload co-upload-block">
                                            Subir archivo
                                            <input type="file" accept="image/jpeg,image/png" onChange={e => {
                                                const file = e.target.files?.[0];
                                                if (file) { setDocBack(file); setPreviewBack(file.type.startsWith('image/') ? URL.createObjectURL(file) : '/imgs/logo-cord-navy.png'); }
                                            }} />
                                        </label>
                                    )}
                                </div>
                                <p className="co-hint">{S.comprobanteNota}</p>
                            </>
                        )}
                    </div>
                )}

                {step === 6 && (
                    <div className="co-step">
                        <p className="co-sub">{S.cuentaNota}</p>
                        {payoutSpec.fields.map((f) => {
                            const valor = bankFields[f.key] || '';
                            // Solo se opina cuando el campo ya tiene su longitud
                            // completa: marcar en rojo mientras se teclea es ruido.
                            const completo = valor.length >= f.minLength;
                            const check = completo ? validatePayout(String(org?.countryCode || 'MX'), { ...bankFields, [f.key]: valor }, locale) : null;
                            return (
                                <div className="s-field" key={f.key}>
                                    <label>{f.label}{f.hint ? ` (${f.hint})` : ''}</label>
                                    <input
                                        className="s-input co-clabe"
                                        value={valor}
                                        onChange={e => setBankField(f.key, f.kind === 'digits'
                                            ? e.target.value.replace(/\D/g, '')
                                            : e.target.value.replace(/\s+/g, '').toUpperCase())}
                                        maxLength={f.maxLength}
                                        inputMode={f.kind === 'digits' ? 'numeric' : 'text'}
                                    />
                                    {completo && check && (check.ok
                                        ? <span className="s-hint co-hint-ok">{f.label} válido</span>
                                        : <span className="s-hint co-hint-bad">{check.error}</span>)}
                                </div>
                            );
                        })}
                        <div className="s-field">
                            <label>{S.titular}</label>
                            <input className="s-input" value={accountHolder} onChange={e => setAccountHolder(e.target.value)} />
                        </div>
                    </div>
                )}

                {step === 7 && (
                    <div className="co-step">
                        <div className="co-tos">
                            <p><strong>Stripe Connected Account Agreement</strong></p>
                            <p>{S.tosIntro} <a href="https://stripe.com/mx/connect-account/legal" target="_blank" rel="noopener noreferrer">{S.tosAcuerdo}</a>{S.tosCierre}</p>
                            <p>{S.tosCondicion}</p>
                            <p>{S.tosDatos}</p>
                        </div>
                        <label className="co-attest co-legal-consent">
                            <input type="checkbox" checked={legalConsent} onChange={event => setLegalConsent(event.target.checked)} />
                            <span className="co-attest-text">
                                <strong>{S.consentTitulo}</strong>
                                <span>{S.consentLei} <a href="/privacidad" target="_blank" rel="noopener noreferrer">{S.consentPrivacidad}</a>{S.consentComa} <a href="/terminos#cord-pagos" target="_blank" rel="noopener noreferrer">{S.consentTerminos}</a> {S.consentCierre}</span>
                            </span>
                        </label>
                        <p className="co-tos-note">{S.consentRegistro}</p>
                    </div>
                )}
            </div>

            <div className="co-footer">
                {step > 0 && <button type="button" className="co-btn co-btn-ghost" onClick={goBack} disabled={loading}>{S.atras}</button>}
                <div style={{ flex: 1 }}></div>
                {!(step === 5 && uploadMode === 'phone' && captureStatus !== 'completed') && (
                    <button type="button" className="co-btn co-btn-primary" onClick={handleNext} disabled={loading || (step === 7 && !legalConsent)}>
                        {loading && <span className="co-spinner co-spinner-btn" aria-hidden="true"></span>}
                        {loading ? 'Guardando…' : step === 7 ? 'Aceptar y finalizar' : 'Continuar'}
                    </button>
                )}
            </div>
        </div>
    );
}

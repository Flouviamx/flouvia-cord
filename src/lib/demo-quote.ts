// src/lib/demo-quote.ts
// Cotización de demostración pública (/q/demo).
//
// Es Cord cotizándole a un cliente —Distribuidora El Zarco, el mismo universo de
// datos de toda la landing— el plan Profesional. Se arma en la forma EXACTA del
// DTO de `getCotizacionByToken()` (queries.ts) para que `QuoteCard` dibuje lo
// mismo que dibujaría con una cotización real: mismos campos, mismos tipos,
// mismo motor de totales.
//
// Reglas que sostienen estos datos:
//   · Los precios salen de `precios.ts` (plan) y del excedente real de
//     usuarios de Pro en MXN (`plan-overage-pricing.ts`, verificado en
//     test/demo-quote.test.ts). Nada inventado.
//   · Los precios de Cord se publican con IVA incluido (regla 27): la
//     cotización lleva `iva_incluido: true` y el motor DESAGREGA el impuesto.
//   · Cord es una empresa real: no se le inventa RFC, teléfono, WhatsApp ni una
//     persona con nombre. El vendedor firma como el equipo.
//   · Las fechas son relativas a hoy: la demo nunca vence.
//
// La demo no toca la base, no resuelve actor y no emite señales (regla 19). Sus
// interacciones se resuelven en el navegador — ver el modo demo de QuoteCard.

import { currentLocale, setRequestCurrency, setRequestTimeZone } from './context';
import { fmtDate, fmtRelative } from './fmt-server';
import { money } from './mock';
import type { MockQuote } from './mock';
import { PLANES, MESES_POR_ANIO, precioAnualTotal } from './precios';
import { calculateDocumentTotals } from '../../packages/elements/src/engine';

export const DEMO_QUOTE_TOKEN = 'demo';
/** Folio que la sonda de salud (platform-health.ts) busca en el HTML. */
export const DEMO_QUOTE_FOLIO = 'COT-0148';

export const isDemoQuoteToken = (token: string | undefined | null) => token === DEMO_QUOTE_TOKEN;

const TAX_RATE = 0.16;
const CURRENCY = 'MXN';
const DIAS_VIGENCIA = 15;

/** Precio mensual publicado del plan Profesional en MXN. */
export const DEMO_PRO_MENSUAL = PLANES.find((p) => p.id === 'pro')!.precio.MXN;
/**
 * Excedente por usuario adicional de Pro, en MXN por mes. Espejo de
 * `USD_MINOR.pro.usuario` × 20 / 100 en plan-overage-pricing.ts; el test lo
 * compara contra `overagePriceLabel()` para que no se desfase en silencio.
 */
export const DEMO_USUARIO_ADICIONAL_MXN = 300;
export const DEMO_USUARIOS_ADICIONALES = 2;

const minutos = (n: number) => n * 60_000;

export function getDemoQuote(now: Date = new Date()) {
    const en = currentLocale() === 'en';

    // Mismo contexto que fija getCotizacionByToken(): la divisa de la
    // cotización manda en money(). La zona es la del vendedor (Cord, México).
    setRequestCurrency(CURRENCY);
    setRequestTimeZone('America/Mexico_City');

    const creada = new Date(now.getTime() - minutos(26 * 60));
    const vigencia = new Date(creada.getTime() + DIAS_VIGENCIA * 86_400_000);
    const hace = (min: number) => fmtRelative(new Date(now.getTime() - minutos(min)));
    const desdeCreada = (min: number) => fmtRelative(new Date(creada.getTime() + minutos(min)));

    // Mismo cálculo que getCotizacionByToken() para la cuenta regresiva.
    const hoy = new Date(now); hoy.setHours(0, 0, 0, 0);
    const diasVigencia = Math.ceil((vigencia.getTime() - hoy.getTime()) / 86_400_000);

    const listaAnual = DEMO_PRO_MENSUAL * 12;
    const anual = precioAnualTotal(DEMO_PRO_MENSUAL);
    const cantidadUsuarios = DEMO_USUARIOS_ADICIONALES * 12;

    const EQUIPO = en ? 'Cord team' : 'Equipo de Cord';
    const CLIENTE = 'Distribuidora El Zarco';

    const items: MockQuote['items'] = [
        {
            id: '7f3c2a10-4b8e-4d21-9a6f-1c0e5b2d8a01',
            producto_id: null,
            descripcion: en ? 'Cord Professional · annual plan' : 'Cord Profesional · plan anual',
            cantidad: 1,
            unidad: en ? 'year' : 'año',
            precioLista: listaAnual,
            precioNegociado: anual,
            taxRate: TAX_RATE,
            aprobado: true,
            comentarios: [
                {
                    autor: 'Raúl Mendoza',
                    tipo: 'cliente',
                    contenido: en
                        ? 'Does the annual plan already include the users on my team?'
                        : '¿El anual ya incluye a los usuarios de mi equipo?',
                    cuando: hace(55),
                },
                {
                    autor: EQUIPO,
                    tipo: 'usuario',
                    contenido: en
                        ? 'It includes 5 users, unlimited quotes, live tracking, and collections with a 90-day cash-flow view. From the sixth user on, each one is billed as an additional user.'
                        : 'Incluye 5 usuarios, cotizaciones ilimitadas, seguimiento en vivo, y cobranza con flujo de caja a 90 días. A partir del sexto usuario, cada uno se cobra como adicional.',
                    cuando: hace(48),
                },
            ],
        },
        {
            id: '2d9b6e44-8c1f-4f73-b5a2-6e7d0c9f3b02',
            producto_id: null,
            descripcion: en ? 'Additional users' : 'Usuarios adicionales',
            cantidad: cantidadUsuarios,
            unidad: en ? 'user-month' : 'usuario-mes',
            precioLista: DEMO_USUARIO_ADICIONAL_MXN,
            precioNegociado: null,
            taxRate: TAX_RATE,
            aprobado: true,
            comentarios: [
                {
                    autor: 'Raúl Mendoza',
                    tipo: 'cliente',
                    contenido: en
                        ? 'If we hire someone halfway through the year, can we add them?'
                        : 'Si contratamos a alguien a medio año, ¿lo podemos sumar?',
                    cuando: hace(30),
                },
                {
                    autor: EQUIPO,
                    tipo: 'usuario',
                    contenido: en
                        ? 'Yes. Additional users are billed each month based on how many are active, so you can add or remove them whenever you need.'
                        : 'Sí. Los usuarios adicionales se cobran cada mes según los que estén activos, así que puedes sumarlos o darlos de baja cuando lo necesites.',
                    cuando: hace(22),
                },
            ],
        },
    ];

    // El total "de base de datos" se escribe con el mismo motor que lo guarda.
    const totals = calculateDocumentTotals(
        items.map((it) => ({
            descripcion: it.descripcion,
            cantidad: it.cantidad,
            precio_unitario: it.precioLista,
            precio_negociado: it.precioNegociado,
            tax_rate: it.taxRate ?? TAX_RATE,
        })),
        { ivaIncluido: true, retenciones: [] },
    );
    const total = Math.round(totals.total * 100) / 100;

    const quote = {
        id: '5e1a7c3d-2f60-4a9b-8d14-0b3c6f9e2a48',
        folio: DEMO_QUOTE_FOLIO,
        cliente: CLIENTE,
        cliente_id: '9c4e1b27-6d3a-4e85-a0f2-3b7d5c1e8f60',
        clienteInicial: 'DE',
        status: 'viewed' as const,
        // El DTO real devuelve la etiqueta en español aun con la interfaz en
        // inglés; la demo la localiza para quien la lee.
        terminos: (en ? 'Due on receipt' : 'Contado') as MockQuote['terminos'],
        vigencia: fmtDate(vigencia),
        vigenciaDias: Math.max(1, Math.ceil((vigencia.getTime() - now.getTime()) / 86_400_000)),
        creada: fmtDate(creada),
        token: DEMO_QUOTE_TOKEN,
        notas: en
            ? `Prices in MXN, tax (IVA) included. The annual plan is paid upfront and equals ${MESES_POR_ANIO} months of the monthly plan. Additional users are billed month to month based on how many are active; this line estimates ${DEMO_USUARIOS_ADICIONALES} users for 12 months.`
            : `Precios en MXN con IVA incluido. El plan anual se paga por adelantado y equivale a ${MESES_POR_ANIO} meses del plan mensual. Los usuarios adicionales se facturan mes a mes según los que estén activos; esta partida estima ${DEMO_USUARIOS_ADICIONALES} usuarios durante 12 meses.`,
        aprobEstado: null,
        aprobMotivo: null,
        total,
        baseCurrency: CURRENCY,
        fiscalCurrency: CURRENCY,
        version: 1,
        iva_incluido: true,
        taxRateFallback: TAX_RATE,
        retenciones: [] as NonNullable<MockQuote['retenciones']>,
        anticipoPct: null,
        esRecurrente: false,
        items,
        eventos: [
            {
                tipo: 'viewed' as const,
                // Textos reales de `eventos` (queries.ts markViewed, cotizaciones.ts).
                detalle: en ? 'Opened by the client from the link' : 'Abierta por el cliente desde el link',
                cuando: hace(60),
            },
            {
                tipo: 'sent' as const,
                detalle: en ? 'Quote sent — link generated' : 'Cotización enviada — link generado',
                cuando: desdeCreada(15),
            },
        ],
        conversacion: [],
        versiones: [],
        // Campos que getCotizacionByToken() agrega sobre rowToQuote().
        diasVigencia,
        pagoDisponible: true,
        saldoVence: '',
        saldoVenceDias: 0,
    };

    const conversacion = [
        {
            tipo: 'reply',
            detalle: en
                ? `Hi Raúl, here is the Professional plan proposal for your team. Annual billing already includes two months at no cost: ${money(anual)} instead of ${money(listaAnual)}. You can approve everything or only the lines you need.`
                : `Hola, Raúl. Te compartimos la propuesta del plan Profesional para tu equipo. El anual ya trae dos meses sin costo: ${money(anual)} en lugar de ${money(listaAnual)}. Puedes aprobar todo o solo las partidas que necesites.`,
            cuando: desdeCreada(20),
            mine: false,
        },
        {
            tipo: 'comment',
            detalle: en
                ? 'Thanks. Will the invoice be issued to Distribuidora El Zarco?'
                : 'Gracias. ¿La factura sale a nombre de Distribuidora El Zarco?',
            cuando: hace(42),
            mine: true,
        },
        {
            tipo: 'reply',
            detalle: en
                ? "Yes. As soon as the payment settles, we issue the CFDI for the subscription in your company's name."
                : 'Sí. En cuanto se liquida el pago, emitimos el CFDI de la suscripción a nombre de tu empresa.',
            cuando: hace(35),
            mine: false,
        },
    ];

    const org = {
        // Sin id de organización: la demo no pertenece a ninguna org de la base
        // y /q/[token] no resuelve actor ni analítica para ella.
        id: '',
        nombre: 'Cord',
        inicial: 'C',
        rfc: '',
        colorMarca: '#0a192f',
        logoUrl: '/imgs/logo-cord-navy.png',
        pdfMensaje: '',
        ivaPct: TAX_RATE * 100,
        embedDomains: '',
        emailContacto: 'hola@flouvia.com',
        telefono: '',
        whatsapp: '',
        portalBanner: '',
        portalBienvenida: '',
        portalMostrarChat: true,
        // Es Cord mismo: el sello "Verificado por Cord" sería redundante.
        portalPowered: false,
        paisCode: 'MX',
        esPrueba: false,
        esDemo: true,
        // El pago se simula en el navegador; estos campos solo encienden la
        // misma sección de pago que ve una cotización real con cobro en línea.
        stripeAccountId: DEMO_QUOTE_TOKEN as string | null,
        stripeChargesEnabled: true,
        aceptaTarjeta: true,
        aceptaTransferencia: false,
        cobroSpeiAuto: true,
        bancoNombre: '',
        bancoClabe: '',
        bancoBeneficiario: '',
        moneda: CURRENCY,
    };

    return { quote, conversacion, org };
}

// Catálogo VERSIONADO de eventos de producto. Fuente ÚNICA de verdad para:
//
//   1. los tipos de trackServer / trackUser / cordTrack — un typo en el nombre
//      del evento (`quote_aproved`) no compila, y la bolsa de propiedades se
//      valida contra el `required`/`optional` de cada evento;
//   2. `scripts/analytics-contract-check.mjs` (`npm run security:analytics`) —
//      un evento capturado que no está aquí, o una entrada de aquí que no se
//      emite en ningún lado, rompe CI;
//   3. la taxonomía de PostHog — `node scripts/analytics-contract-check.mjs
//      --taxonomy` imprime nombre + descripción para sincronizarla desde el repo.
//
// Por qué existe
// ─────────────
// El carril de facturas quedó a CERO eventos sin que nada avisara: no es un
// error de tipos, no rompe el build, y un dashboard vacío se lee igual que
// "todavía no lo usa nadie". Peor: el 14 ago 2026 un cambio de política silenció
// TODOS los eventos comerciales (descartaba los del equipo interno) y pasó un mes
// hasta que se notó. Los eventos no emitidos no se rellenan después. La regla 2
// del check —"una entrada del catálogo SIN call site rompe CI"— es el candado
// que impide que se vuelva a caer en silencio.
//
// Restricción de forma
// ────────────────────
// CERO imports y sin `enum` / `namespace`: el check lo carga con Node
// `--experimental-strip-types`, que solo acepta TypeScript borrable
// (`type`, `interface`, `satisfies`, `as const`). Es data pura, verificable
// desde un `.mjs`, un vitest y un futuro sync de taxonomía.

// La versión actual del esquema de eventos. Todo evento server-side la estampa.
// Un corte de análisis "solo v2" descarta el ruido anterior al 3 ago 2026.
export const ANALYTICS_VERSION = 2 as const;

// ── Ejes de clasificación ──────────────────────────────────────────────────
export type Rail =
  | 'quote'      // ciclo de la cotización: created → sent → viewed → approved → paid
  | 'invoice'    // ciclo de la factura fiscal / documento por cobrar
  | 'billing'    // dinero confirmado: pagos, reembolsos, disputas, suscripción de Cord
  | 'auth'       // registro e inicio de sesión
  | 'team'       // invitaciones y membresía
  | 'adoption'   // activación y adopción de capacidades
  | 'docs';      // buscador y utilidad de la documentación pública

// `server`: se emite desde backend con `trackServer` / `trackUser` /
//   `trackPaymentReceived` (posthog-node). Lleva `distinctId` sintético
//   `organization:<id>` (scope org) o el `userId` real (scope user).
// `client`: se emite desde el navegador con `window.cordTrack`. Respeta el
//   consentimiento de cookies y las exclusiones de `<CordAnalytics>`.
export type Surface = 'server' | 'client';

// `org`: el sujeto es la organización (grupo `company`), sin perfil de persona.
// `user`: el sujeto es la persona (registro). Conserva el perfil para poder
//   atribuir la adquisición (`$initial_utm_*`).
export type Scope = 'org' | 'user';

// Etiqueta de tipo de una propiedad. Un `string[]` literal (tupla `as const`)
// declara un enum cerrado: el linter valida los valores y el tipo TS lo
// resuelve a la unión de literales.
export type PropType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'uuid'        // identificador de recurso de Cord (se documenta como string)
  | 'currency'    // ISO 4217, p. ej. "MXN" (string)
  | 'iso_date'    // fecha ISO 8601 (string)
  | 'string[]'
  | readonly string[];

export interface EventSpec {
  rail: Rail;
  surface: Surface;
  scope: Scope;
  // `true` ⇒ ingreso confirmado. Obliga a `insertIdFrom !== null` (el check
  // falla si un evento de ingreso se emite sin clave de idempotencia: Stripe
  // reintenta sus webhooks por diseño y sin `$insert_id` el ingreso se cuenta
  // dos veces).
  revenue: boolean;
  // Nombre de la propiedad de la que sale el `$insert_id` estable.
  // `null` ⇒ evento no deduplicable (aceptable para señales de adopción de
  // baja frecuencia; NUNCA para `revenue: true`).
  insertIdFrom: string | null;
  // Propiedades presentes en TODOS los call sites del evento.
  required: Readonly<Record<string, PropType>>;
  // Propiedades presentes en ALGUNOS call sites.
  optional: Readonly<Record<string, PropType>>;
  // Una línea en español, apta para la descripción de la taxonomía de PostHog.
  description: string;
  // Esquema en el que nació el evento. `1` = anterior al contrato v2.
  since: 1 | 2;
}

// Propiedades que ESTAMPAN los helpers (`trackServer` y `<CordAnalytics>`).
// Un call site que escriba una de estas a mano es una violación: un
// `is_sandbox` puesto a dedo es exactamente cómo una org demo se cuela en el
// revenue real.
export const AUTO_PROPS = [
  'is_sandbox',
  'is_demo',
  'is_internal',
  'analytics_version',
  '$insert_id',
  '$process_person_profile',
  '$set',
  '$set_once',
] as const;

// ── Enums compartidos ──────────────────────────────────────────────────────
// Firmografía capturada en `POST /api/onboarding/complete`. Estas tuplas son
// copia de las allowlists de ese archivo (líneas ~22-25);
// `test/analytics-events.test.ts` verifica que sigan idénticas.
export const ONBOARDING_PUESTOS = ['dueno', 'ventas', 'finanzas', 'operaciones', 'otro'] as const;
export const ONBOARDING_INDUSTRIAS = [
  'distribucion', 'manufactura', 'construccion', 'servicios', 'tecnologia', 'comercio', 'otro',
] as const;
export const ONBOARDING_TAMANOS = ['solo', '2-10', '11-50', '51-200', '200+'] as const;
export const ONBOARDING_CASOS_USO = [
  'cotizar', 'cobrar', 'facturar', 'seguimiento', 'margenes', 'cobranza_ia',
] as const;

// Guía de configuración persistente (`getSetupProgress()` en src/lib/queries.ts).
export const SETUP_GROUPS = ['negocio', 'catalogo', 'venta', 'dinero', 'equipo'] as const;
export const SETUP_TASKS = [
  'marca', 'fiscal', 'documento', 'productos', 'clientes',
  'cotizacion', 'enviar', 'online_cobros', 'cobro', 'equipo',
] as const;

// ── EL CATÁLOGO ────────────────────────────────────────────────────────────
export const ANALYTICS_EVENTS = {
  // ══ Carril cotización ════════════════════════════════════════════════════
  quote_created: {
    rail: 'quote', surface: 'server', scope: 'org', revenue: false,
    insertIdFrom: 'event_id',
    required: {
      event_id: 'uuid', quote_id: 'uuid', total: 'number', currency: 'currency',
      source: ['manual', 'api', 'mcp', 'duplicate'],
    },
    optional: {
      status: 'string', item_count: 'number', sent_on_create: 'boolean',
      source_quote_id: 'uuid',
    },
    description: 'Se creó una cotización (alta manual, API, MCP o duplicado).',
    since: 2,
  },
  quote_sent: {
    rail: 'quote', surface: 'server', scope: 'org', revenue: false,
    insertIdFrom: 'event_id',
    required: {
      event_id: 'string', quote_id: 'uuid', total: 'number', currency: 'currency',
      source: ['manual', 'api', 'mcp', 'approval_flow'],
    },
    optional: { send_type: ['initial', 'resend'] },
    description: 'La cotización se envió al cliente y se generó el link público.',
    since: 2,
  },
  quote_viewed: {
    rail: 'quote', surface: 'server', scope: 'org', revenue: false,
    insertIdFrom: 'event_id',
    required: {
      event_id: 'uuid', quote_id: 'uuid', total: 'number', currency: 'currency',
      source: ['public_link'],
    },
    optional: {},
    description: 'El cliente abrió el link por primera vez (solo la transición sent → viewed).',
    since: 2,
  },
  quote_approved: {
    rail: 'quote', surface: 'server', scope: 'org', revenue: false,
    insertIdFrom: 'event_id',
    required: {
      event_id: 'uuid', quote_id: 'uuid', total: 'number', currency: 'currency',
      source: ['external', 'manual'],
    },
    optional: { is_partial: 'boolean', item_count: 'number' },
    description: 'El cliente aprobó la cotización (link público) o se marcó aprobada en la app.',
    since: 2,
  },
  quote_rejected: {
    rail: 'quote', surface: 'server', scope: 'org', revenue: false,
    insertIdFrom: 'event_id',
    required: { event_id: 'uuid', quote_id: 'uuid', total: 'number', currency: 'currency' },
    optional: { has_comment: 'boolean', source: ['external', 'manual'] },
    description: 'El cliente rechazó la cotización desde el link público, o gerencia rechazó la solicitud.',
    since: 2,
  },
  quote_expired: {
    rail: 'quote', surface: 'server', scope: 'org', revenue: false,
    insertIdFrom: 'event_id',
    required: { event_id: 'uuid', quote_id: 'uuid' },
    optional: { total: 'number', currency: 'currency', days_since_sent: 'number' },
    description: 'El cron marcó la cotización como vencida al pasar su vigencia sin aprobarse.',
    since: 2,
  },
  quote_marked_paid: {
    rail: 'quote', surface: 'server', scope: 'org', revenue: false,
    insertIdFrom: 'event_id',
    required: {
      event_id: 'uuid', quote_id: 'uuid', total: 'number', currency: 'currency',
      source: ['manual'],
    },
    optional: {},
    description: 'Un operador marcó la cotización como pagada A MANO. NUNCA es ingreso: para eso está payment_received.',
    since: 2,
  },
  checkout_started: {
    rail: 'quote', surface: 'server', scope: 'org', revenue: false,
    insertIdFrom: 'event_id',
    required: {
      event_id: 'string', checkout_id: 'string', amount: 'number', currency: 'currency',
      payment_method: 'string', checkout_version: 'number', source: ['public_link'],
    },
    optional: {
      quote_id: 'uuid', invoice_id: 'uuid', cobro_id: 'uuid', cobro_tipo: 'string',
    },
    description: 'Se creó un PaymentIntent/Checkout nuevo para pagar una cotización o factura desde el link público.',
    since: 2,
  },
  checkout_resumed: {
    rail: 'quote', surface: 'server', scope: 'org', revenue: false,
    insertIdFrom: null,
    required: {
      checkout_id: 'string', amount: 'number', currency: 'currency',
      payment_method: 'string', checkout_version: 'number', source: ['public_link'],
    },
    optional: {
      quote_id: 'uuid', invoice_id: 'uuid', cobro_id: 'uuid', cobro_tipo: 'string',
    },
    description: 'El cliente reabrió un link de pago y se reutilizó el PaymentIntent existente en vez de crear uno nuevo.',
    since: 2,
  },

  // ══ Carril factura ═══════════════════════════════════════════════════════
  invoice_created: {
    rail: 'invoice', surface: 'server', scope: 'org', revenue: false,
    insertIdFrom: 'event_id',
    required: {
      event_id: 'uuid', invoice_id: 'uuid', total: 'number', currency: 'currency',
      source: ['manual', 'quote', 'api', 'duplicate'],
    },
    optional: { country_code: 'string', document_type: 'string', from_quote_id: 'uuid' },
    description: 'Se creó un borrador de factura / documento fiscal.',
    since: 2,
  },
  invoice_finalized: {
    rail: 'invoice', surface: 'server', scope: 'org', revenue: false,
    insertIdFrom: 'event_id',
    required: { event_id: 'string', invoice_id: 'uuid', total: 'number', currency: 'currency' },
    optional: {
      has_fiscal_stamp: 'boolean', document_type: 'string', sent_on_finalize: 'boolean',
    },
    description: 'La factura pasó de borrador a emitida (folio reservado; timbrada si aplica).',
    since: 2,
  },
  invoice_sent: {
    rail: 'invoice', surface: 'server', scope: 'org', revenue: false,
    insertIdFrom: 'event_id',
    required: { event_id: 'string', invoice_id: 'uuid' },
    optional: { send_type: ['initial', 'resend'] },
    description: 'La factura emitida se envió al cliente y quedó accesible en su link.',
    since: 2,
  },
  invoice_viewed: {
    rail: 'invoice', surface: 'server', scope: 'org', revenue: false,
    insertIdFrom: 'event_id',
    required: { event_id: 'uuid', invoice_id: 'uuid' },
    optional: { total: 'number', currency: 'currency' },
    description: 'El cliente abrió el link de la factura por primera vez.',
    since: 2,
  },
  invoice_paid: {
    rail: 'invoice', surface: 'server', scope: 'org', revenue: false,
    insertIdFrom: 'event_id',
    required: { event_id: 'uuid', invoice_id: 'uuid', total: 'number', currency: 'currency' },
    optional: { payment_method: 'string', days_to_pay: 'number' },
    description: 'La factura quedó saldada (saldo en cero). El ingreso real lo declara payment_received.',
    since: 2,
  },
  invoice_voided: {
    rail: 'invoice', surface: 'server', scope: 'org', revenue: false,
    insertIdFrom: 'event_id',
    required: { event_id: 'uuid', invoice_id: 'uuid' },
    optional: { void_reason: 'string', had_payments: 'boolean' },
    description: 'La factura se anuló / canceló.',
    since: 2,
  },
  credit_note_created: {
    rail: 'invoice', surface: 'server', scope: 'org', revenue: false,
    insertIdFrom: 'event_id',
    required: {
      event_id: 'uuid', invoice_id: 'uuid', credit_note_of: 'uuid',
      total: 'number', currency: 'currency',
    },
    optional: {},
    description: 'Se emitió una nota de crédito contra una factura previa.',
    since: 2,
  },

  // ══ Carril dinero ════════════════════════════════════════════════════════
  payment_received: {
    rail: 'billing', surface: 'server', scope: 'org', revenue: true,
    insertIdFrom: 'payment_id',
    required: {
      payment_id: 'string', amount: 'number', currency: 'currency',
      payment_method: 'string', is_recurring: 'boolean', source: ['stripe_webhook'],
    },
    optional: {
      quote_id: 'uuid', invoice_id: 'uuid', cobro_id: 'uuid', stripe_invoice_id: 'string',
      payment_kind: ['settlement', 'partial', 'legacy', 'invoice', 'recurring'],
    },
    description: 'Ingreso confirmado por Stripe. ÚNICA fuente de revenue real.',
    since: 2,
  },
  payment_failed: {
    rail: 'billing', surface: 'server', scope: 'org', revenue: false,
    insertIdFrom: null,
    required: { context: ['subscription', 'iguala'] },
    optional: { cotizacion_id: 'uuid' },
    description: 'Falló un cobro recurrente (suscripción de Cord o iguala del cliente).',
    since: 2,
  },
  refund_issued: {
    rail: 'billing', surface: 'server', scope: 'org', revenue: true,
    insertIdFrom: 'refund_id',
    required: { refund_id: 'string', amount: 'number', currency: 'currency' },
    optional: { quote_id: 'uuid', invoice_id: 'uuid', cobro_id: 'uuid', reason: 'string' },
    description: 'Se emitió un reembolso a un cliente (monto negativo contra el revenue).',
    since: 2,
  },
  dispute_created: {
    rail: 'billing', surface: 'server', scope: 'org', revenue: false,
    insertIdFrom: 'dispute_id',
    required: { dispute_id: 'string', amount: 'number', currency: 'currency' },
    optional: { reason: 'string', quote_id: 'uuid', invoice_id: 'uuid' },
    description: 'Un cliente abrió una contracargo/disputa sobre un pago.',
    since: 2,
  },
  payout_paid: {
    rail: 'billing', surface: 'server', scope: 'org', revenue: false,
    insertIdFrom: 'payout_id',
    required: { payout_id: 'string', amount: 'number', currency: 'currency' },
    optional: { arrival_date: 'iso_date', method: 'string' },
    description: 'Stripe depositó un payout en la cuenta bancaria de la organización.',
    since: 2,
  },
  subscription_upgraded: {
    rail: 'billing', surface: 'server', scope: 'org', revenue: false,
    insertIdFrom: null,
    required: { from_plan: 'string', to_plan: 'string', cycle: 'string' },
    optional: {},
    description: 'La organización subió de plan de Cord.',
    since: 2,
  },
  subscription_downgraded: {
    rail: 'billing', surface: 'server', scope: 'org', revenue: false,
    insertIdFrom: null,
    required: { from_plan: 'string', to_plan: 'string', cycle: 'string' },
    optional: {},
    description: 'La organización bajó de plan de Cord.',
    since: 2,
  },
  subscription_canceled: {
    rail: 'billing', surface: 'server', scope: 'org', revenue: false,
    insertIdFrom: null,
    required: { plan: 'string' },
    optional: { tenure_days: 'number' },
    description: 'La organización canceló su suscripción de Cord y volvió a Gratis.',
    since: 2,
  },
  stripe_connect_activated: {
    rail: 'billing', surface: 'server', scope: 'org', revenue: false,
    insertIdFrom: null,
    required: {},
    optional: { time_since_org_created_days: 'number' },
    description: 'Se habilitaron los cobros: la cuenta de Cord Payments quedó activa (charges_enabled).',
    since: 2,
  },
  cfdi_first_timbrado: {
    rail: 'billing', surface: 'server', scope: 'org', revenue: false,
    insertIdFrom: null,
    required: {},
    optional: { time_since_org_created_days: 'number' },
    description: 'La organización timbró su primer CFDI en México.',
    since: 2,
  },

  // ══ Carril auth ══════════════════════════════════════════════════════════
  sign_up_completed: {
    rail: 'auth', surface: 'server', scope: 'user', revenue: false,
    insertIdFrom: null,
    required: { sign_up_method: ['email', 'google', 'apple', 'saml'] },
    optional: {},
    description: 'Cuenta nueva real tras verificar el correo o el primer OAuth/SAML. NO es un login.',
    since: 1,
  },
  sso_login: {
    rail: 'auth', surface: 'server', scope: 'org', revenue: false,
    insertIdFrom: null,
    required: { provider: 'string' },
    optional: {},
    description: 'Un usuario inició sesión mediante SSO/SAML de la organización.',
    since: 2,
  },

  // ══ Carril equipo ════════════════════════════════════════════════════════
  team_member_invited: {
    rail: 'team', surface: 'server', scope: 'org', revenue: false,
    insertIdFrom: null,
    required: { role_assigned: 'string' },
    optional: {},
    description: 'Se creó una invitación para un nuevo miembro del equipo.',
    since: 2,
  },
  team_member_accepted: {
    rail: 'team', surface: 'server', scope: 'org', revenue: false,
    insertIdFrom: null,
    required: { role: 'string' },
    optional: {},
    description: 'Un invitado aceptó y se activó como miembro del equipo.',
    since: 2,
  },
  invite_viewed: {
    rail: 'team', surface: 'client', scope: 'org', revenue: false,
    insertIdFrom: null,
    required: {},
    optional: { role: 'string', valid: 'boolean' },
    description: 'Alguien abrió una página de invitación /unirse/[token].',
    since: 2,
  },

  // ══ Carril adopción ══════════════════════════════════════════════════════
  onboarding_step_completed: {
    rail: 'adoption', surface: 'client', scope: 'org', revenue: false,
    insertIdFrom: null,
    required: { step: 'number' },
    optional: {},
    description: 'El dueño avanzó un paso del asistente de onboarding en el navegador.',
    since: 2,
  },
  onboarding_completed: {
    rail: 'adoption', surface: 'server', scope: 'org', revenue: false,
    insertIdFrom: 'event_id',
    required: {
      event_id: 'uuid', industria: ONBOARDING_INDUSTRIAS, tamano_equipo: ONBOARDING_TAMANOS,
      casos_uso: 'string[]', puesto: ONBOARDING_PUESTOS, country_code: 'string',
      moneda: 'currency', idioma: 'string',
    },
    optional: {},
    description: 'El dueño cerró el asistente de onboarding y se persistió la firmografía de la cuenta.',
    since: 2,
  },
  setup_step_completed: {
    rail: 'adoption', surface: 'server', scope: 'org', revenue: false,
    insertIdFrom: 'event_id',
    required: {
      event_id: 'string', group: SETUP_GROUPS, task_id: SETUP_TASKS,
      done_count: 'number', total: 'number',
    },
    optional: { days_since_signup: 'number' },
    description: 'Un paso de la guía de configuración pasó a completo por primera vez.',
    since: 2,
  },
  ai_draft_used: {
    rail: 'adoption', surface: 'client', scope: 'org', revenue: false,
    insertIdFrom: null,
    required: { has_file: 'boolean', has_text: 'boolean', item_count: 'number' },
    optional: { surface: ['quote', 'invoice'] },
    description: 'El vendedor usó "Armar con IA" para redactar una cotización o factura.',
    since: 2,
  },
  kit_used: {
    rail: 'adoption', surface: 'client', scope: 'org', revenue: false,
    insertIdFrom: null,
    required: { kit_id: 'string', item_count: 'number', multiplier: 'number' },
    optional: {},
    description: 'El vendedor insertó un kit de productos en una cotización.',
    since: 2,
  },
  cobranza_ia_activated: {
    rail: 'adoption', surface: 'server', scope: 'org', revenue: false,
    insertIdFrom: null,
    required: {},
    optional: {},
    description: 'La organización activó el agente de Cobranza IA.',
    since: 2,
  },
  api_key_created: {
    rail: 'adoption', surface: 'server', scope: 'org', revenue: false,
    insertIdFrom: null,
    required: { key_scope: 'string', mode: 'string', type: 'string' },
    optional: {},
    description: 'La organización creó una API key.',
    since: 2,
  },

  // Carril `docs` (buscador de la documentación): lo instrumenta DocsLayout.astro
  // vía `trackDocsEvent` → `cordTrack`. Cuando ese cambio aterrice, agrega aquí
  // docs_search_opened / _performed / _zero_results / _result_clicked /
  // docs_feedback_submitted y registra el envoltorio en analytics-contract-check.
} as const satisfies Record<string, EventSpec>;

// ── Máquina de tipos ───────────────────────────────────────────────────────
type Resolve<T> =
  T extends 'string' | 'uuid' | 'currency' | 'iso_date' ? string :
  T extends 'number' ? number :
  T extends 'boolean' ? boolean :
  T extends 'string[]' ? readonly string[] :
  T extends readonly (infer U)[] ? U :        // enum cerrado → unión de literales
  never;

// Bolsa de propiedades de un evento. Todo valor admite `| null`: hay call sites
// reales que pasan `tenure_days: number | null`, `Number(x ?? 0)`, etc.
type Bag<S extends EventSpec> =
  & { [K in keyof S['required']]: Resolve<S['required'][K]> | null }
  & { [K in keyof S['optional']]?: Resolve<S['optional'][K]> | null };

export type EventName = keyof typeof ANALYTICS_EVENTS;

export type ServerEvent = {
  [K in EventName]: (typeof ANALYTICS_EVENTS)[K]['surface'] extends 'server' ? K : never
}[EventName];

export type ClientEvent = {
  [K in EventName]: (typeof ANALYTICS_EVENTS)[K]['surface'] extends 'client' ? K : never
}[EventName];

export type OrgEvent = {
  [K in EventName]: (typeof ANALYTICS_EVENTS)[K]['scope'] extends 'org' ? K : never
}[EventName];

export type UserEvent = {
  [K in EventName]: (typeof ANALYTICS_EVENTS)[K]['scope'] extends 'user' ? K : never
}[EventName];

// DISTRIBUTIVA a propósito: dos call sites eligen el nombre con un ternario
// (`src/pages/api/cotizaciones/[id].ts` y `src/pages/api/stripe/webhook.ts`), y
// `EventProps<'quote_sent' | 'quote_approved' | 'quote_marked_paid'>` debe
// resolver a la unión de sus bolsas.
export type EventProps<E extends EventName> =
  E extends EventName ? Bag<(typeof ANALYTICS_EVENTS)[E]> : never;

// ── Utilidades runtime (para el check y para tests) ────────────────────────
export const EVENT_NAMES = Object.keys(ANALYTICS_EVENTS) as EventName[];

export function isEventName(name: string): name is EventName {
  return Object.prototype.hasOwnProperty.call(ANALYTICS_EVENTS, name);
}

export function eventSpec<E extends EventName>(name: E): (typeof ANALYTICS_EVENTS)[E] {
  return ANALYTICS_EVENTS[name];
}

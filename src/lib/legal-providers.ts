// Inventario verificable de terceros que aparecen en los flujos de Cord.
//
// `role` evita el error del aviso heredado de llamar "subencargado" a una
// autoridad fiscal, a un proveedor con obligaciones regulatorias propias o a
// una integración que el Cliente elige y dirige. `condition` impide presentar
// una integración opcional como si siempre recibiera datos.

export type LegalProviderRole =
  | 'subprocessor'
  | 'provider-with-own-duties'
  | 'authority'
  | 'customer-directed';

export type LegalProvider = {
  id: string;
  name: string;
  role: LegalProviderRole;
  purpose: { es: string; en: string };
  condition: { es: string; en: string };
  codeEvidence: readonly string[];
  publicEvidenceUrl?: string;
  contractEvidence: 'public-terms-reviewed' | 'account-evidence-pending' | 'not-applicable';
};

export const LEGAL_PROVIDER_ROLE_LABELS: Record<LegalProviderRole, { es: string; en: string }> = {
  subprocessor: { es: 'Subencargado', en: 'Sub-processor' },
  'provider-with-own-duties': { es: 'Proveedor con obligaciones propias', en: 'Provider with its own legal duties' },
  authority: { es: 'Autoridad o destinatario legal', en: 'Authority or legally required recipient' },
  'customer-directed': { es: 'Integración dirigida por el Cliente', en: 'Customer-directed integration' },
};

export const LEGAL_PROVIDERS: readonly LegalProvider[] = [
  {
    id: 'neon', name: 'Neon', role: 'subprocessor',
    purpose: { es: 'Alojamiento de la base PostgreSQL que contiene datos de cuenta, operación y clientes.', en: 'Hosting of the PostgreSQL database containing account, operational, and customer data.' },
    condition: { es: 'Infraestructura principal.', en: 'Core infrastructure.' },
    codeEvidence: ['src/lib/db.ts', '.env.example:DATABASE_URL'],
    publicEvidenceUrl: 'https://neon.com/msa', contractEvidence: 'account-evidence-pending',
  },
  {
    id: 'vercel', name: 'Vercel', role: 'subprocessor',
    purpose: { es: 'Alojamiento, ejecución de solicitudes, logs técnicos y analítica web agregada.', en: 'Hosting, request execution, technical logs, and aggregated web analytics.' },
    condition: { es: 'Infraestructura principal; las rutas con identificadores se redactan antes de Web Analytics.', en: 'Core infrastructure; paths containing identifiers are redacted before Web Analytics.' },
    codeEvidence: ['astro.config.mjs', 'src/layouts/Layout.astro', 'src/layouts/AppLayout.astro'],
    publicEvidenceUrl: 'https://vercel.com/legal/Vercel_Inc_-_Data_Processing_Addendum.pdf', contractEvidence: 'account-evidence-pending',
  },
  {
    id: 'anthropic', name: 'Anthropic', role: 'subprocessor',
    purpose: { es: 'Procesamiento de texto para funciones de IA, incluidas cotizaciones y cobranza cuando se usan.', en: 'Text processing for AI features, including quotes and collections when used.' },
    condition: { es: 'Solo al invocar una función de IA.', en: 'Only when an AI feature is invoked.' },
    codeEvidence: ['src/lib/agents/ar-agent.ts', 'src/lib/agents/cobranza-run.ts'],
    publicEvidenceUrl: 'https://privacy.anthropic.com/en/articles/7996885-how-do-you-use-personal-data-in-model-training', contractEvidence: 'account-evidence-pending',
  },
  {
    id: 'resend', name: 'Resend', role: 'subprocessor',
    purpose: { es: 'Entrega de correos transaccionales y gestión del newsletter con doble confirmación.', en: 'Delivery of transactional email and management of the double-opt-in newsletter.' },
    condition: { es: 'Cuando Cord envía correo o el usuario confirma una suscripción editorial.', en: 'When Cord sends email or a user confirms an editorial subscription.' },
    codeEvidence: ['src/lib/email.ts', 'src/lib/blog-newsletter.ts'],
    publicEvidenceUrl: 'https://resend.com/legal/dpa', contractEvidence: 'public-terms-reviewed',
  },
  {
    id: 'posthog', name: 'PostHog', role: 'subprocessor',
    purpose: { es: 'Analítica de producto. El navegador se activa tras consentimiento; el servidor puede emitir telemetría de negocio a nivel organización, sin crear un perfil de persona.', en: 'Product analytics. Browser capture starts after consent; the server may emit organization-level business telemetry without creating a person profile.' },
    condition: { es: 'Solo si PostHog está configurado; la captura del navegador requiere aceptación de analítica.', en: 'Only when PostHog is configured; browser capture requires analytics consent.' },
    codeEvidence: ['src/lib/posthog-server.ts', 'src/components/CookieConsent.astro'],
    publicEvidenceUrl: 'https://trust.posthog.com/', contractEvidence: 'account-evidence-pending',
  },
  {
    id: 'upstash', name: 'Upstash', role: 'subprocessor',
    purpose: { es: 'Limitación distribuida de solicitudes y sesiones técnicas efímeras.', en: 'Distributed rate limiting and ephemeral technical sessions.' },
    condition: { es: 'Solo cuando las variables de Upstash están configuradas; existe respaldo en PostgreSQL.', en: 'Only when Upstash environment variables are configured; PostgreSQL is the fallback.' },
    codeEvidence: ['src/lib/ratelimit.ts', 'src/lib/mcp/session-store.ts'],
    publicEvidenceUrl: 'https://upstash.com/trust/dpa.pdf', contractEvidence: 'account-evidence-pending',
  },
  {
    id: 'slack-ops', name: 'Slack (alertas de Cord)', role: 'subprocessor',
    purpose: { es: 'Recepción de alertas operativas minimizadas mediante un webhook controlado por Cord.', en: 'Receipt of minimized operational alerts through a Cord-controlled webhook.' },
    condition: { es: 'Solo si el webhook interno está configurado.', en: 'Only when the internal webhook is configured.' },
    codeEvidence: ['src/lib/ops-alert.ts', '.env.example:OPS_SLACK_WEBHOOK_URL'],
    publicEvidenceUrl: 'https://slack.com/terms-of-service/data-processing', contractEvidence: 'account-evidence-pending',
  },
  {
    id: 'facturapi', name: 'Facturapi', role: 'subprocessor',
    purpose: { es: 'Preparación, timbrado y recuperación de CFDI, incluido el CSD que el negocio configura.', en: 'Preparation, stamping, and retrieval of CFDI, including the CSD configured by the business.' },
    condition: { es: 'Solo para CFDI en México cuando el proveedor está configurado.', en: 'Only for Mexican CFDI when the provider is configured.' },
    codeEvidence: ['src/lib/fiscal/facturapi.ts', 'src/lib/fiscal/providers/MexicoSatProvider.ts'],
    contractEvidence: 'account-evidence-pending',
  },
  {
    id: 'stripe', name: 'Stripe', role: 'provider-with-own-duties',
    purpose: { es: 'Suscripciones, cobros, reembolsos, disputas, depósitos y verificación financiera/identidad. Su rol depende del producto y puede incluir obligaciones regulatorias propias.', en: 'Subscriptions, payments, refunds, disputes, payouts, and financial/identity verification. Its role depends on the product and may include independent regulatory duties.' },
    condition: { es: 'Cuando se usa billing o Cord Payments.', en: 'When billing or Cord Payments is used.' },
    codeEvidence: ['src/lib/billing.ts', 'src/lib/stripe-cobros.ts', 'src/pages/api/billing/connect'],
    publicEvidenceUrl: 'https://stripe.com/legal/dpa', contractEvidence: 'public-terms-reviewed',
  },
  {
    id: 'google-oauth', name: 'Google', role: 'provider-with-own-duties',
    purpose: { es: 'Autenticación OAuth elegida por el usuario; Cord recibe el identificador, nombre y correo autorizados.', en: 'User-selected OAuth authentication; Cord receives the authorized identifier, name, and email.' },
    condition: { es: 'Solo si se elige iniciar sesión con Google.', en: 'Only when Google sign-in is selected.' },
    codeEvidence: ['src/pages/api/auth/google/index.ts', 'src/pages/api/auth/google/callback.ts'],
    publicEvidenceUrl: 'https://developers.google.com/identity/protocols/oauth2/policies',
    contractEvidence: 'account-evidence-pending',
  },
  {
    id: 'apple-oauth', name: 'Apple', role: 'provider-with-own-duties',
    purpose: { es: 'Autenticación elegida por el usuario; Cord recibe el identificador y los datos autorizados por Apple.', en: 'User-selected authentication; Cord receives the identifier and data authorized by Apple.' },
    condition: { es: 'Solo si se elige iniciar sesión con Apple.', en: 'Only when Apple sign-in is selected.' },
    codeEvidence: ['src/pages/api/auth/apple/index.ts', 'src/pages/api/auth/apple/callback.ts'],
    publicEvidenceUrl: 'https://www.apple.com/legal/privacy/data/en/sign-in-with-apple/',
    contractEvidence: 'account-evidence-pending',
  },
  {
    id: 'tax-authorities', name: 'SAT, PAC y AEAT', role: 'authority',
    purpose: { es: 'Destinatarios de datos fiscales cuando una obligación o función fiscal aplicable está realmente habilitada.', en: 'Recipients of tax data when an applicable tax obligation or feature is actually enabled.' },
    condition: { es: 'SAT/PAC al timbrar CFDI. AEAT solo si Verifactu y el envío están configurados; hoy el valor por defecto es desactivado.', en: 'SAT/PAC when stamping CFDI. AEAT only when Verifactu and submission are configured; submission is disabled by default today.' },
    codeEvidence: ['src/lib/fiscal/providers/MexicoSatProvider.ts', 'src/lib/fiscal/verifactu/submit.ts', '.env.example:VERIFACTU_AEAT_ENABLED=false'],
    contractEvidence: 'not-applicable',
  },
  {
    id: 'mercadopago', name: 'Mercado Pago', role: 'provider-with-own-duties',
    purpose: { es: 'Cobro de cotizaciones y facturas con la cuenta de Mercado Pago del Cliente, y lectura de pagos y reembolsos para conciliarlos.', en: 'Collecting quotes and invoices with the Customer’s Mercado Pago account, and reading payments and refunds to reconcile them.' },
    condition: { es: 'Solo si el Cliente conecta su cuenta.', en: 'Only if the Customer connects their account.' },
    codeEvidence: ['src/lib/mercadopago.ts', 'src/pages/api/mercadopago/webhook.ts'],
    publicEvidenceUrl: 'https://www.mercadopago.com.mx/privacidad', contractEvidence: 'account-evidence-pending',
  },
  {
    id: 'google-integrations', name: 'Google (Sheets, Gmail y complemento para Gmail)', role: 'customer-directed',
    purpose: { es: 'Google Sheets limitado al archivo que Cord crea; envío de documentos desde la cuenta de Gmail del Cliente sin leer su correo; y el complemento para Gmail.', en: 'Google Sheets limited to the file Cord creates; sending documents from the Customer’s Gmail account without reading their email; and the Gmail add-on.' },
    condition: { es: 'Solo si el Cliente conecta cada función.', en: 'Only if the Customer connects each feature.' },
    codeEvidence: ['src/lib/integraciones/hojas/google.ts', 'src/lib/integraciones/gmail/envio.ts', 'integrations/gmail/Code.js'],
    publicEvidenceUrl: 'https://developers.google.com/terms/api-services-user-data-policy', contractEvidence: 'not-applicable',
  },
  {
    id: 'microsoft-integrations', name: 'Microsoft (Excel y Teams)', role: 'customer-directed',
    purpose: { es: 'Libro de Excel en el OneDrive del Cliente y avisos en el canal de Teams que elige.', en: 'An Excel workbook in the Customer’s OneDrive and notifications in the Teams channel they choose.' },
    condition: { es: 'Solo si el Cliente conecta cada función.', en: 'Only if the Customer connects each feature.' },
    codeEvidence: ['src/lib/integraciones/hojas/excel.ts', 'src/lib/integraciones/teams-graph.ts'],
    contractEvidence: 'not-applicable',
  },
  {
    id: 'accounting-integrations', name: 'Intuit QuickBooks Online, Xero', role: 'customer-directed',
    purpose: { es: 'Registro de facturas definitivas con su cliente, líneas, importes, divisa e impuestos en la contabilidad del Cliente.', en: 'Recording final invoices with their customer, lines, amounts, currency and taxes in the Customer’s accounting.' },
    condition: { es: 'Solo si el Cliente conecta su contabilidad.', en: 'Only if the Customer connects their accounting.' },
    codeEvidence: ['src/lib/integraciones/contabilidad/qbo.ts', 'src/lib/integraciones/contabilidad/xero.ts'],
    contractEvidence: 'not-applicable',
  },
  {
    id: 'shopify', name: 'Shopify', role: 'customer-directed',
    purpose: { es: 'Lectura del catálogo y de los clientes de la tienda del Cliente, y creación de un pedido cuando una cotización cierra, si lo activa.', en: 'Reading the catalog and customers of the Customer’s store, and creating an order when a quote closes, if enabled.' },
    condition: { es: 'Solo si el Cliente conecta su tienda.', en: 'Only if the Customer connects their store.' },
    codeEvidence: ['src/lib/integraciones/shopify/service.ts', 'src/lib/integraciones/shopify/orders.ts'],
    contractEvidence: 'not-applicable',
  },
  {
    id: 'whatsapp', name: 'Meta (WhatsApp Business)', role: 'customer-directed',
    purpose: { es: 'Envío de mensajes con plantillas del Cliente a sus clientes desde su número de WhatsApp Business.', en: 'Sending messages with the Customer’s templates to their customers from their WhatsApp Business number.' },
    condition: { es: 'Solo si el Cliente lo configura.', en: 'Only if the Customer configures it.' },
    codeEvidence: ['src/lib/whatsapp.ts'],
    contractEvidence: 'not-applicable',
  },
  {
    id: 'customer-integrations', name: 'SAML, MCP, Slack, HubSpot, plataformas conectadas por API y webhooks del Cliente', role: 'customer-directed',
    purpose: { es: 'Intercambio de datos con el proveedor de identidad, servidor MCP, espacio de Slack, cuenta de HubSpot, plataforma de automatización (como Zapier o Make) o endpoint que el propio Cliente configura.', en: 'Data exchange with the identity provider, MCP server, Slack workspace, HubSpot account, automation platform (such as Zapier or Make), or endpoint configured by the Customer.' },
    condition: { es: 'Solo por instrucción y configuración del Cliente, que puede desconectarlas.', en: 'Only under the Customer’s instruction and configuration, which the Customer can disconnect.' },
    codeEvidence: ['src/lib/saml.ts', 'src/lib/mcp/client-manager.ts', 'src/lib/integraciones/hubspot/service.ts', 'src/lib/webhook-delivery.ts'],
    contractEvidence: 'not-applicable',
  },
] as const;

export function legalProvidersByRole(role: LegalProviderRole): LegalProvider[] {
  return LEGAL_PROVIDERS.filter((provider) => provider.role === role);
}

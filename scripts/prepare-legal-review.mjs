// Read-only, one-time drafting aid for phase 5.1. Prints a proposed file as JSON;
// never writes/publishes anything. Existing clauses outside the listed sections
// are carried forward, not certified as legally approved. Canonical editable
// copies are the resulting Markdown files, not this migration helper.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SIGNUP_LEGAL_BUNDLES } from '../src/lib/legal-corpus.ts';

const [locale, docId] = process.argv.slice(2);
assert.ok(['es-MX', 'en-US'].includes(locale));
assert.ok(['terms', 'privacy'].includes(docId));
const en = locale === 'en-US';
const variant = SIGNUP_LEGAL_BUNDLES[locale][docId];
const base = readFileSync(new URL(`../src/content/legal/${locale}/${docId}.md`, import.meta.url), 'utf8');
let body = base.split('\n---\n').slice(1).join('\n---\n').trim();
const changed = [];
const p = (text) => `<p>${text}</p>`;
function section(id, es, english) {
  const pattern = new RegExp(`(<h2 id="${id}"[^>]*>[\\s\\S]*?<\\/h2>)[\\s\\S]*?(?=<h2 id=|\\n<\\/div>\\n<\\/div>\\n<\\/main>)`);
  assert.ok(pattern.test(body), `Missing section: ${id}`);
  body = body.replace(pattern, (_match, heading) => `${heading}\n${(en ? english : es).map(p).join('\n')}\n`);
  changed.push(id);
}
function addToSection(id, es, english) {
  const pattern = new RegExp(`(<h2 id="${id}"[^>]*>[\\s\\S]*?<\\/h2>)`);
  assert.ok(pattern.test(body));
  body = body.replace(pattern, (heading) => `${heading}\n${p(en ? english : es)}`);
  changed.push(id);
}

if (docId === 'terms') {
  body = body.replace(/(<div class="intro-box">\n)[\s\S]*?(\n<\/div>)/, (_match, start, end) => start + p(en
    ? 'CORD (cordhq.app) is operated under the Flouvia trade name by Andre Valle Ortega, the operator named in the published version. Contract acceptance is recorded through the specific affirmative action shown at registration or re-acceptance, against a document version and language. Creating an account or continued use is not described as a substitute for that record. A person acting for a business must have authority to do so; a personal acceptance record does not by itself establish that authority. Acknowledging the privacy notice is separate from optional analytics consent and from payment-specific approvals.'
    : 'CORD (cordhq.app) opera bajo la marca Flouvia por Andre Valle Ortega, la persona operadora identificada en la versión publicada. La aceptación contractual se registra mediante la acción afirmativa específica presentada en el alta o la reaceptación, contra una versión e idioma del documento. Crear una cuenta o continuar usando el servicio no se presenta como sustituto de esa evidencia. Quien actúe por un negocio deberá contar con facultades para hacerlo; el registro de aceptación personal no acredita por sí solo esas facultades. El reconocimiento del aviso de privacidad es independiente del consentimiento opcional de analítica y de las autorizaciones específicas de pagos.') + end);
  changed.push('introduction');
  const paymentProcessorParagraph = /<p>(?:Si usted opta por recibir pagos|If you choose to receive payments)[\s\S]*?<\/p>/;
  assert.ok(paymentProcessorParagraph.test(body));
  body = body.replace(paymentProcessorParagraph, p(en
    ? 'Where online payments are available and the connected account is enabled, Stripe processes customer payments through that account. Cord provides the interface and sends payment instructions through the integration; it does not act as a bank or hold funds in its own custody. Cord processes verification data and retains certain technical records described in the privacy notice; it is not merely a transient relay of every data item. Processor restrictions and requirements can affect availability. The applicable connected-account agreement is presented in payment onboarding. This description does not exclude Cord’s own responsibilities.'
    : 'Donde el cobro en línea está disponible y la cuenta conectada se encuentra habilitada, Stripe procesa los pagos de los compradores mediante esa cuenta. Cord proporciona la interfaz y envía instrucciones de pago mediante la integración; no actúa como banco ni mantiene los fondos bajo custodia propia. Cord trata datos de verificación y conserva ciertos registros técnicos descritos en el aviso de privacidad; no es un mero transmisor temporal de todos los datos. Las restricciones y requisitos del procesador pueden afectar la disponibilidad. El acuerdo de cuenta conectada aplicable se presenta durante el alta de pagos. Esta descripción no excluye las responsabilidades propias de Cord.'));
  const installmentsParagraph = /<p>CORD (?:le permite solicitar un anticipo|lets you request a deposit)[\s\S]*?<\/p>/;
  assert.ok(installmentsParagraph.test(body));
  body = body.replace(installmentsParagraph, p(en
    ? 'The Customer can configure deposits, balances and installments where enabled. Payment execution depends on the available method, required authorization and connected-account status; a due date does not guarantee collection. Cord does not provide financing or purchase the receivable. The Customer is responsible for the commercial terms, delivery and applicable tax treatment of each payment. This feature does not automatically generate a Mexican payment receipt complement (REP). Displayed balances and payment statuses are management information, not a substitute for the required fiscal record.'
    : 'El Cliente puede configurar anticipos, saldos y cuotas donde estén habilitados. La ejecución de un cobro depende del método disponible, la autorización requerida y el estado de la cuenta conectada; una fecha de vencimiento no garantiza el pago. Cord no financia ni adquiere el crédito. El Cliente responde de las condiciones comerciales, la entrega y el tratamiento fiscal aplicable a cada pago. Esta función no genera automáticamente el Complemento de Recepción de Pagos (REP) mexicano. Los saldos y estados mostrados son información de gestión, no sustituyen el comprobante fiscal exigible.'));
  section('facturacion', [
    'El plan distingue capacidades habilitadas, límites de recursos y cuotas mensuales de consumo. Alcanzar un límite duro impide crear recursos o ejecutar la operación correspondiente; no habilita automáticamente un excedente pagado. Algunas funciones requieren un plan específico y evidencia de suscripción vigente.',
    'Gratis no admite excedentes facturables. En los planes que sí los admiten, únicamente las dimensiones habilitadas generan consumo adicional a la cuota incluida. Starter conserva un asiento máximo; desde Pro pueden existir asientos adicionales facturables conforme al plan. Los envíos limitados de Gratis no se convierten en cargos por excedente.',
    'Incluso cuando una dimensión permite excedentes, existen límites de seguridad y controles de abuso. Una operación puede bloquearse si se alcanza el techo aplicable o no puede verificarse la autorización o cuota. No se promete continuidad ilimitada ni ausencia de bloqueos por superar un plan.',
    'Los importes, divisa, ciclo y consumos facturables aplicables se muestran al contratar y en las superficies de facturación. La medición reserva consumo antes de operaciones externas; las reservas fallidas se cancelan y el excedente elegible se comunica al procesador de suscripciones. Esta descripción no autoriza conceptos ajenos al plan contratado.'
  ], [
    'The plan distinguishes enabled features, resource limits and monthly usage allowances. Reaching a hard limit prevents creating resources or performing the relevant operation; it does not automatically enable paid overage. Some features require a particular plan and evidence of a current subscription.',
    'Free does not allow billable overage. On plans that do, only eligible dimensions generate additional usage beyond the included allowance. Starter retains a maximum of one seat; from Pro, additional billable seats may be available under the plan. Limited Free sends do not turn into overage charges.',
    'Even when a dimension permits overage, safety limits and abuse controls apply. An operation may be blocked when a relevant ceiling is reached or authorization or quota cannot be verified. Unlimited continuity or freedom from plan-limit blocks is not promised.',
    'Applicable amounts, currency, cycle and billable usage are shown when subscribing and in billing interfaces. Usage is reserved before external operations; failed reservations are canceled and eligible overage is reported to the subscription processor. This description does not authorize items outside the contracted plan.'
  ]);
  section('fairuse', [
    'Una característica sin tope de recursos en un plan no elimina los límites de otras dimensiones, los controles de velocidad, la verificación de autorización ni los controles de seguridad. Cord puede limitar solicitudes que comprometan la operación o incumplan las condiciones aplicables. No se ofrece por defecto una migración a infraestructura dedicada; cualquier servicio especial requiere evaluación y acuerdo separado.'
  ], [
    'A feature without a resource cap on a plan does not remove limits on other dimensions, rate limits, authorization checks or security controls. Cord may restrict requests that compromise operations or breach applicable terms. Migration to dedicated infrastructure is not a standard offer; any special service requires a separate assessment and agreement.'
  ]);
  section('fiscal', [
    'Cord ofrece herramientas tecnológicas de facturación, no asesoría contable ni una garantía general de cumplimiento fiscal por país. El Cliente debe verificar los datos, impuestos y requisitos aplicables a su operación. Esta responsabilidad no elimina las obligaciones propias de Cord ni las responsabilidades que la ley no permita excluir.',
    'En México, el timbrado de CFDI depende de los datos fiscales, las credenciales del emisor y la disponibilidad del proveedor configurado. Fuera del carril fiscal habilitado, el documento es comercial y no prueba recepción por una autoridad.',
    'En España, generar un documento comercial, generar un registro encadenado, enviarlo a la AEAT y obtener una respuesta son estados distintos. El modo comercial no remite registros. Si se activa el modo Verifactu, la generación exige los datos del emisor y la identidad del sistema; la falta de requisitos puede bloquear la emisión, no convertirla automáticamente en un envío correcto.',
    'Cargar un certificado no demuestra remisión ni aceptación por la AEAT. El envío depende de su habilitación operativa y debe comprobarse mediante el estado del registro y la respuesta de la autoridad. La configuración actual usa un procesamiento programado diario y no acredita remisión inmediata. Antes de ofrecer ese carril como operativo deben verificarse la declaración responsable del productor, la versión del sistema y el mecanismo de envío. No se afirma una homologación otorgada por la AEAT.'
  ], [
    'Cord provides invoicing technology, not accounting advice or a general guarantee of tax compliance in every country. The Customer must verify the data, taxes and requirements applicable to its transactions. This responsibility does not remove Cord’s own duties or liability that cannot lawfully be excluded.',
    'In Mexico, CFDI stamping depends on tax data, issuer credentials and the configured provider’s availability. Outside an enabled fiscal rail, the document is commercial and does not establish receipt by an authority.',
    'In Spain, generating a commercial document, generating a chained record, submitting it to AEAT and obtaining a response are distinct states. Commercial mode does not submit records. When Verifactu mode is enabled, generation requires issuer information and system identity; missing prerequisites may block issuance rather than automatically become a successful submission.',
    'Uploading a certificate does not establish submission or acceptance by AEAT. Submission depends on operational enablement and must be checked against the record status and the authority’s response. The current configuration uses daily scheduled processing and does not establish immediate remittance. Before offering that rail as operational, the producer’s responsible declaration, system version and submission mechanism must be verified. No AEAT-issued approval is claimed.'
  ]);
  addToSection('pagos-autorizacion',
    'El interés moratorio automático está deshabilitado en todos los países ofrecidos mientras se revisa la política aplicable. Que el Cliente acuerde un plazo de crédito o un pago en cuotas no significa que Cord calcule o cargue intereses. La cobranza opcional puede enviar correos en nombre del acreedor con su identificación y canal de respuesta; no garantiza recuperación, exactitud de la redacción de IA ni revisión humana previa de cada envío.',
    'Automatic late interest is disabled in all offered countries while the applicable policy is reviewed. A Customer’s credit period or installment arrangement does not mean Cord calculates or charges interest. Optional collections may send email on the creditor’s behalf with creditor identification and a reply channel; it does not guarantee recovery, AI wording accuracy or prior human review of every message.');
  // Remove absolute claims inside the retained section, while preserving payment
  // authorization and detailed chargeback clauses for separately flagged review.
  body = body.replace(en
    ? 'CORD is not liable for the tone, content, or commercial consequences of any message, nor for amounts it fails to recover.'
    : 'CORD no se responsabiliza del tono, contenido o consecuencias comerciales de cualquier mensaje, ni de los montos que no logre recuperar.',
    en ? 'This does not exclude Cord’s own obligations or liability that applicable law does not allow it to exclude.' : 'Esto no excluye las obligaciones propias de Cord ni las responsabilidades que la ley aplicable no permita excluir.');
  addToSection('reembolsos',
    'El cuadro de tarifas que sigue corresponde al esquema en MXN y no debe extrapolarse a otras divisas. Los cargos de Cord y los del procesador son conceptos distintos: que no haya una comisión de plataforma habilitada para una divisa no vuelve gratuito el procesamiento. La aceptación general de estos términos no sustituye la aceptación específica del esquema de tarifas por un miembro autorizado de la organización.',
    'The fee schedule below applies to the MXN schedule and must not be extrapolated to other currencies. Cord fees and processor charges are separate items: absence of an enabled platform fee in a currency does not make processing free. General acceptance of these terms does not replace an authorized organization member’s specific acceptance of the fee schedule.');
  section('cambios', [
    'Cada publicación tiene versión, idioma y huella del artefacto mostrado. Cuando una modificación requiera nueva aceptación o reconocimiento, Cord presentará la versión correspondiente mediante el flujo de aceptación y registrará una acción afirmativa. El uso continuado no sustituye esa acción. Los borradores no modifican el contrato vigente y la aceptación personal de términos no sustituye las autorizaciones organizacionales o de pagos que correspondan.'
  ], [
    'Each publication has a version, language and hash of the displayed artifact. Where a change requires renewed acceptance or acknowledgement, Cord will present the relevant version through the acceptance flow and record an affirmative action. Continued use does not replace that action. Drafts do not amend the current contract, and personal acceptance of terms does not replace required organization or payment approvals.'
  ]);
}

if (docId === 'privacy') {
  section('datos', [
    'Los datos provienen de formularios y archivos que usted o el negocio proporcionan, de la actividad sobre el servicio y de las respuestas de proveedores e integraciones configuradas. Las categorías dependen de la función utilizada; no todas se solicitan a todas las personas.',
    '<strong>Cuenta y acceso:</strong> nombre, correo, identificadores de cuenta, datos de sesión y evidencias de aceptación. Las contraseñas de acceso propio se verifican mediante hashes; no se describen como contraseñas reversiblemente cifradas. Los métodos alternativos de acceso procesan los identificadores y credenciales técnicas necesarios para el método elegido.',
    '<strong>Datos comerciales y fiscales:</strong> catálogos, contactos, cotizaciones, facturas, comunicaciones y datos de emisor/receptor. CFDI puede involucrar RFC, régimen, domicilio fiscal y CSD. En España, la función configurada puede procesar NIF/CIF y certificado electrónico con su contraseña. Tener un certificado o registro encadenado no demuestra envío a la AEAT.',
    '<strong>Datos financieros:</strong> titular y cuenta bancaria, CLABE cuando corresponda, cobros, depósitos, reembolsos y disputas. La CLABE se guarda cifrada y se conserva una terminación para mostrarla. Los datos de tarjeta se recogen mediante los componentes del procesador; Cord no almacena el número completo ni el código de seguridad.',
    '<strong>Verificación de identidad:</strong> datos de las personas, representantes, directores y titulares reales requeridos por el procesador para la cuenta concreta. No se aplica un umbral universal de participación para todos los países y tipos de entidad. Los archivos se procesan temporalmente para su transmisión; el flujo elimina metadatos de imagen innecesarios, como ubicación, conservando cuando hace falta la orientación técnica.',
    'Cord no conserva persistentemente la imagen del documento enviada por ese flujo. El registro técnico de envío puede incluir identificadores de cuenta/persona, huella del archivo, formato, tamaño, métricas de calidad, fecha, IP, user-agent y respuesta del proveedor. No equivale a una copia de la imagen ni demuestra que todos los envíos hayan quedado registrados sin fallos. Su configuración actual contempla cinco años, como se explica en la sección de retención; no se atribuye ese plazo a una obligación universal de prevención de lavado.',
    '<strong>Firma y disputas:</strong> nombre, contacto, IP de firma o compra y documentos o comunicaciones pertinentes que el negocio conserve o seleccione como evidencia. Confirmar la preparación de archivos de evidencia puede transmitirlos al procesador y guardar sus identificadores en un borrador, antes de la presentación final de la respuesta a la disputa. Guardar un borrador no significa que los archivos permanezcan solo en Cord.',
    'El alta de pagos solicita al usuario que la completa una autorización electrónica sobre datos financieros y de identidad. Ese registro no prueba por sí solo el consentimiento de todas las personas cuyos datos aporta un representante. La base aplicable, la información a terceros y las facultades de representación deben verificarse para cada flujo; el reconocimiento de este aviso no es un consentimiento general para cualquier tratamiento.'
  ], [
    'Data comes from forms and files supplied by you or the business, activity on the service, and responses from configured providers and integrations. Categories depend on the feature used; not every category is requested from every person.',
    '<strong>Account and access:</strong> name, email, account identifiers, session information and acceptance evidence. Native-login passwords are verified using hashes; they are not described as reversibly encrypted passwords. Alternative sign-in methods process the identifiers and technical credentials necessary for the selected method.',
    '<strong>Business and tax data:</strong> catalogs, contacts, quotes, invoices, communications and issuer/recipient information. CFDI may involve RFC, tax regime, tax address and CSD. In Spain, a configured feature may process NIF/CIF and an electronic certificate and password. Possession of a certificate or chained record does not establish AEAT submission.',
    '<strong>Financial data:</strong> bank account and holder, CLABE where applicable, payments, payouts, refunds and disputes. CLABE is stored encrypted with a suffix retained for display. Card data is collected through processor components; Cord does not store the full card number or security code.',
    '<strong>Identity verification:</strong> information about individuals, representatives, directors and beneficial owners required by the processor for the specific account. No universal ownership threshold applies across all countries and entity types. Files are temporarily processed for transmission; the flow removes unnecessary image metadata, such as location, while retaining technical orientation when needed.',
    'Cord does not persistently retain the identity-document image sent through that flow. The technical submission record may include account/person identifiers, file hash, format, size, quality measurements, date, IP, user-agent and provider response. It is not an image copy or proof that every submission was recorded without failure. Current configuration provides for five years, as explained in the retention section; that period is not attributed to a universal anti-money-laundering obligation.',
    '<strong>Signatures and disputes:</strong> name, contact information, signature or purchase IP, and relevant documents or communications the business retains or selects as evidence. Confirming evidence-file preparation may transmit files to the processor and save their identifiers in a draft before the final dispute response is submitted. Saving a draft does not mean files remain only within Cord.',
    'Payment onboarding requests electronic authorization concerning financial and identity data from the user completing it. That record does not by itself prove consent from every person whose data a representative supplies. The applicable basis, information to third parties and authority to act must be verified for each flow; acknowledging this notice is not blanket consent to all processing.'
  ]);
  addToSection('uso',
    'Las finalidades se distinguen por función y no se consideran todas necesarias para contratar. La seguridad, autenticación, soporte y evidencia contractual se relacionan con operar la cuenta. El newsletter es opcional y usa doble confirmación y mecanismo de baja; la analítica opcional del navegador se gestiona separadamente. El uso de IA o el envío de cobranza depende de activar o invocar esas funciones y puede transmitir contexto a sus proveedores. La base jurídica se evalúa por tratamiento y jurisdicción; el contrato no reemplaza esa evaluación.',
    'Purposes are distinguished by feature and are not all treated as necessary to enter the contract. Security, authentication, support and contractual evidence relate to account operation. The newsletter is optional, uses double confirmation and provides an unsubscribe mechanism; optional browser analytics is managed separately. AI use or collections messages depend on enabling or invoking those features and may transmit context to their providers. The legal basis is assessed per processing activity and jurisdiction; the contract does not replace that assessment.');
  body = body.replace(en ? 'The collected data is used exclusively for the following essential purposes:' : 'Los datos recabados se utilizan exclusivamente para los siguientes propósitos esenciales:',
    en ? 'Depending on the enabled functions, operational purposes include:' : 'Según las funciones habilitadas, las finalidades operativas incluyen:');
  section('seguridad', [
    'Cord utiliza protección en tránsito y cifrado de campos concretos, como CLABE y secretos configurados. No se afirma que todos los datos estén cifrados a nivel de aplicación, que un hash sea anonimización o que los controles de código acrediten por sí solos el estado de producción. El acceso, las credenciales y la configuración de cada integración requieren controles propios.',
    'El registro técnico de envío de KYC usa actualmente un umbral de eliminación de cinco años desde su creación. La limpieza depende de que la tarea programada se ejecute correctamente; no es una garantía de borrado a una hora exacta. Ese valor es una política implementada que requiere validación por finalidad, rol y jurisdicción, no prueba de una obligación legal común a todos los registros.',
    'La conservación fiscal ante un proveedor no equivale a un archivo garantizado de cinco años dentro de Cord. El borrado de la organización elimina registros primarios dependientes y puede afectar los documentos almacenados localmente. El Cliente debe conservar los comprobantes que le correspondan y verificar su recuperación; Cord no promete archivo local perpetuo ni conservación uniforme de todos los datos.',
    'Sigue pendiente completar el calendario por categoría para datos operativos, pagos, disputas, evidencias de aceptación, logs, proveedores y respaldos, incluidas excepciones justificadas y verificación de eliminación. El responsable no debe conservar datos más allá de lo necesario por el solo hecho de que exista capacidad de almacenamiento.'
  ], [
    'Cord uses protection in transit and encryption of specific fields such as CLABE and configured secrets. It does not claim that all data is application-level encrypted, that hashing is anonymization or that code controls alone establish production deployment status. Access, credentials and each integration’s configuration require their own controls.',
    'The technical KYC submission record currently uses a deletion threshold of five years from creation. Cleanup depends on successful execution of the scheduled task; this is not a guarantee of deletion at an exact time. That setting is an implemented policy requiring validation by purpose, role and jurisdiction, not proof of one legal obligation covering all records.',
    'Fiscal retention by a provider is not a guaranteed five-year archive within Cord. Organization deletion removes dependent primary records and may affect locally stored documents. Customers must retain the records for which they are responsible and verify retrieval; Cord does not promise a perpetual local archive or uniform retention of all data.',
    'A category-specific schedule remains to be completed for operational data, payments, disputes, acceptance evidence, logs, providers and backups, including justified exceptions and deletion verification. Storage capacity alone does not justify retaining data beyond what is necessary.'
  ]);
  addToSection('portabilidad',
    'Eliminar la organización tampoco demuestra que una suscripción externa se haya cancelado correctamente ni que la cuenta de pagos del procesador se haya cerrado. El flujo intenta cancelar la suscripción, pero un fallo requiere seguimiento; no elimina automáticamente la cuenta conectada. Debe confirmarse el cierre de cada servicio externo y cualquier obligación pendiente por separado.',
    'Deleting an organization also does not establish that an external subscription was successfully canceled or that the processor payment account was closed. The flow attempts subscription cancellation, but a failure requires follow-up; it does not automatically delete the connected account. Closure of each external service and any outstanding obligations must be confirmed separately.');
  section('menores', [
    'Cord está dirigido a personas con capacidad para contratar y a usuarios autorizados para operar un negocio, no a menores como usuarios destinatarios del servicio. Una autorización corporativa no equivale a autorización parental o de quien ejerza tutela. Si se detectan datos de una persona menor, se debe evaluar la relación, el rol de Cord, el responsable de esos datos y la medida aplicable; no se promete que un borrado automático e inmediato resuelva todos los casos.'
  ], [
    'Cord is directed to persons with capacity to contract and users authorized to operate a business, not to children as intended service users. Corporate authorization is not equivalent to authorization by a parent or guardian. If a child’s data is identified, the relationship, Cord’s role, the controller of the data and the appropriate response must be assessed; automatic immediate deletion is not promised as a solution in every case.'
  ]);
  addToSection('arco',
    'Puede solicitar también revocar un consentimiento o limitar un uso de datos cuando corresponda. Rechazar analítica o darse de baja del newsletter no cancela la cuenta ni constituye rechazo del contrato. Las solicitudes no automatizadas se gestionan por el canal de privacidad, con verificación proporcional y conforme a los plazos aplicables; el calendario de respuesta y el contacto verificado deben completarse antes de publicar esta revisión.',
    'You may also request withdrawal of consent or limitation of data use where applicable. Rejecting analytics or unsubscribing from the newsletter does not cancel the account or reject the contract. Non-automated requests are handled through the privacy channel, with proportionate verification and applicable deadlines; the response procedure and verified contact must be completed before publishing this revision.');
}

body = body.replace(/(<p class="last-updated">)[\s\S]*?(<\/p>)/,
  (_match, start, end) => start + (en ? 'Proposed revision: August 30, 2026. Not effective.' : 'Propuesta de revisión: 30 de agosto de 2026. Sin vigencia.') + end);
const path = `src/content/legal-revisions/${locale}/${docId}-2026-08-30.1.md`;
const header = `---
docId: ${docId}
locale: ${locale}
version: "2026-08-30.1"
basedOnVersion: "${variant.version}"
basedOnArtifactSha256: "${variant.artifactSha256}"
publicationStatus: draft
reviewStatus: technical-draft
effectiveDate: null
artifactSha256: null
requiresAction: false
action: none
sourceOfTruth: ${path}
releaseBlockers: [verified-identity, legal-review, operational-evidence, publication-approval]
changedSections: ${JSON.stringify(changed)}
reviewDate: "2026-08-30"
---

${en ? '> TECHNICAL DRAFT. Not published, effective or approved by legal counsel. Preserved clauses remain subject to review. This does not replace the current version or authorize charges or new processing.' : '> BORRADOR TÉCNICO. No publicado, vigente ni aprobado por asesoría jurídica. Las cláusulas conservadas siguen sujetas a revisión. No sustituye la versión actual ni autoriza cobros o tratamientos nuevos.'}

`;
process.stdout.write(JSON.stringify({ path, content: header + body + '\n' }));

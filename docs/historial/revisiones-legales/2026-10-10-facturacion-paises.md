# Revisión técnica de facturación, impuestos y cobros por país

Fecha de corte: **10 de octubre de 2026**, rama `claude/sharp-tesla-x211o3`
(base `ee07d5a`).

Evidencia para revisión jurídica; no es una opinión legal ni autoriza publicar.
**No se publica**: una versión nueva de Términos o Aviso obliga a toda la base de
usuarios a aceptar de nuevo, y el procedimiento exige la decisión explícita de
André. Los cuatro artefactos vigentes (`2026-09-28`) conservan su hash; `npm run
security:legal` lo verifica. La propuesta queda lista para que solo falte esa
decisión y la revisión de un abogado.

## Entregables

- **Revisión candidata `2026-10-10.1`**, texto completo ES/EN, en la colección
  aislada `legalRevisions` (sin vigencia, sin hash, sin acción de aceptación;
  `scripts/legal-revisions-check.mjs` comprueba procedencia y anclas):
  - [Aviso ES](../../../src/content/legal-revisions/es-MX/privacy-2026-10-10.1.md)
  - [Aviso EN](../../../src/content/legal-revisions/en-US/privacy-2026-10-10.1.md)
  - [Términos ES](../../../src/content/legal-revisions/es-MX/terms-2026-10-10.1.md)
  - [Términos EN](../../../src/content/legal-revisions/en-US/terms-2026-10-10.1.md)
  Cada una parte del cuerpo publicado `2026-09-28`, conserva sus anclas y lleva un
  aviso de borrador y una fecha "[fecha de publicación]" que se retiran al publicar.
- **Borradores complementarios actualizados** (no publicados, con
  `releaseBlockers`): condiciones de facturación y de pagos, subencargados, DPA y
  política de retención, en ES y EN.
- **`src/lib/legal-providers.ts` sin cambios**: está ligado al hash publicado (ver
  "Inventario de terceros"). El bloque listo para aplicar al publicar está abajo.

## Hechos observados en código

| ID | Hecho | Evidencia | Tratamiento |
|---|---|---|---|
| FAC-01 | Rieles con autoridad: Verifactu (AEAT), ARCA, Sefin Nacional (NFS-e), SEFAZ (NF-e, con contingencia SVC), SUNAT, SII, DIAN y la DGFiP por una plataforma autorizada. La solución pública B2B de la AEAT (SPFE) está construida y sin transporte. Todos nacen apagados (`*_ENABLED=false`). Cord transmite directo, con las credenciales del negocio; solo México usa un PAC. | `src/lib/fiscal/latam/rieles.ts`, `src/lib/fiscal/providers/`, `src/lib/fiscal/spfe/`, `src/lib/fiscal/transmision/`, `.env.example` | Aviso §1–§3, §6, §7; Términos §1, §5, §8 |
| FAC-02 | Salen a la autoridad la identificación, el nombre, el domicilio y la condición fiscal del emisor y del receptor (también personas físicas), los conceptos, importes e impuestos y, donde la ley lo prevé, el cobro (SPFE: SETTLEMENT/DEFAULT; Francia: estado 212 y e-reporting de pagos). Vuelven y se guardan CAE, CDR, ApplicationResponse, protocolos, trackid y XML firmados. Base: obligación legal del negocio emisor; Cord como encargado. | `fiscal_rail_comprobantes`, `dian_documentos`, `nfe_eventos`, `spfe_mensajes`, `pa_envios`, `pa_estados` en `db/schema.sql` | Aviso §2, §6 |
| FAC-03 | Iopole (plataforma autorizada francesa): el alta lleva SIREN, régimen de TVA, correo, dirección y, opcional, nombre, apellido y cargo del representante (`pa_altas.datos`); la identidad y el mandato se completan en su página, sin pasar por Cord. Recibe el Factur-X de cada factura B2B (guardado en `pa_envios.archivo`), el e-reporting B2BINT con nombre e identificador del comprador, el B2C agregado sin identidad y los cobros. Credenciales OAuth de Flouvia como operador. Contrato de producción pendiente. | `src/lib/fiscal/transmision/alta.ts`, `ereporting.ts`, `iopole/` | Aviso §6 (fila nueva), §7; Términos §8; subencargados y DPA |
| FAC-04 | Stripe Tax en la cuenta conectada (`Stripe-Account`): dirección del cliente (estado, ZIP, ciudad, calle opcional), bandera de exento, importes y código de producto; domicilio y estados registrados del negocio. `us_tax_calculos.destino` guarda la dirección sin purga. Lo paga Cord (`application_custom`); el negocio tiene una cuota de 10/25/60/150 ventas al mes y excedente de USD 0.75, MXN 15 o EUR 0.70 (el meter aún no existe: hoy es tope duro). El número del certificado de exención solo vive en Cord. | `src/lib/us-tax/stripe.ts`, `calculo.ts`, `cuota.ts`; sección us-tax de `db/schema.sql` | Aviso §2, §3, §6 (Stripe); Términos §8 |
| FAC-05 | Credenciales cifradas: `fiscal_rail_credenciales` (certificado, llave y `secretos_enc`: usuario y clave SOL, PIN y clave técnica de la DIAN) por riel y entorno; `fiscal_sii_cafs` (CAF entero con su llave privada; no se puede quitar con folios usados); `fiscal_rail_accesos` (tickets); `orgs.verifactu_cert_enc` y `verifactu_cert_pass_enc`, que también firman la Facturae si `fiscal_metadata.facturae_firma` está activa. El certificado del SII es de una persona (su RUT), igual que un e-CPF o un FNMT de persona física. | `src/lib/fiscal/latam/credenciales.ts`, `latam/sii/cafs.ts`, `db/schema.sql` | Aviso §2, §9; Términos §8 |
| FAC-06 | Casilla de intercambio del SII `dte-<token>@<dominio>`, recibida por un proveedor de correo entrante **sin identificar** (`.env.example` dice "Resend/SendGrid Inbound"). Guarda el XML recibido tal cual, el remitente, el RUT, la razón social y el correo del proveedor, los importes y la decisión (inmutable); responde acuses firmados por correo y registra en el SII (Ley 20.956). | `src/lib/fiscal/latam/sii/recepcion.ts`, `src/pages/api/webhooks/sii-intercambio.ts`, tablas `fiscal_sii_*` | Aviso §1–§3, §6 (fila de correo entrante); Términos §8 |
| FAC-07 | Portal `/portal/[token]` (32 bytes): `noindex`, sin referrer, sin caché y `analyticsDisabled` (sin PostHog, Vercel Analytics ni Speed Insights). El negocio lo crea, rota o apaga. **No enlaza ningún aviso de privacidad.** | `src/pages/portal/[token].astro`, `src/lib/cobros/portal.ts` | Aviso §5; Términos §4; hallazgo de producto |
| FAC-08 | Cobro automático: el cliente acepta "Autorizo a {org} a cobrar…" (`portal.consentimiento`, versión `cord-autopay-2026-10`); el servidor guarda fecha, IP completa, navegador e id del intento, pendiente hasta que el proveedor confirma el método. Se guardan el resumen del método (tipo, marca, últimos 4, banco, vencimiento) y quién lo desactivó y por qué. Reintentos con correo al cliente a nombre del negocio y tarea al negocio. **Un consentimiento nuevo sobrescribe el anterior.** | `src/lib/cobros/agrupados.ts` (`consentimientoAutopay`, `activarAutopay`), `src/lib/cobros/avisos.ts` | Aviso §2, §3; Términos §4; hallazgo de producto |
| FAC-09 | Domiciliación SEPA (EUR en ES, DE y FR) y ACH (USD en EE. UU.) solo si el negocio la activa y la capacidad está activa en la cuenta; solo donde Cord no cobra comisión. Un débito queda días en proceso; ACH no admite reembolsos parciales. El aviso de cada cargo SEPA y la confirmación del mandato ACH los envía el proveedor según la documentación interna; no se verificó en una cuenta Custom real. | `src/lib/cobros/metodos.ts`, `docs/estado/cobros-facturacion.md` | Aviso §2, §3; Términos §4; condiciones de pagos |
| FAC-10 | Cupones: `cupones` (código, valor, vigencia, topes, autor) y `cupon_redenciones` (cupón, cliente, cotización o factura, importe, divisa). La redención sobrevive al borrado del documento y pierde el cliente si este se borra. | Sección de descuentos de `db/schema.sql`, `src/lib/cupones.ts` | Aviso §2, §9; Términos §4 |
| FAC-11 | Conservación: solo Verifactu impide borrar la organización (`trg_orgs_verifactu_conservacion`, sin plazo de salida). Las filas de CFDI, los comprobantes y XML de ARCA, NFS-e, NF-e, SUNAT, SII y DIAN, los documentos recibidos en Chile, los mensajes de la SPFE y los envíos a la plataforma francesa cascadean con la organización; sus triggers solo impiden ediciones manuales. Ninguna tabla nueva tiene purga por antigüedad. | `db/schema.sql`, `src/lib/org-delete.ts` | Aviso §9, §11; Términos §8; retención |
| FAC-12 | México: el CFDI declara por concepto IVA 16/8/exento, retenciones de IVA e ISR y el descuento, y rechaza IEPS y tasa cero gravada; sustitución con relación 04 y cancelación con motivo 01; estados de cancelación aceptada/pendiente/en verificación/rechazada/vencida; complemento de pago (REP) automático en CFDI PPD. | `src/lib/fiscal/providers/mexico-items.ts`, `sustitucion.ts`, `invoices.ts`, `payment-complement.ts` | Términos §4, §8; condiciones de facturación §3–§4 |
| FAC-13 | Verifactu envía por tandas cada hora (`cord-crons.yml`) y tras emitir o anular; con el envío apagado no se encadena nada. Los Términos vigentes dicen "procesamiento programado diario". | `.github/workflows/cord-crons.yml`, `src/lib/fiscal/verifactu/sif.ts` | Términos §8; condiciones de facturación §5 |
| FAC-14 | Mercado Pago es riel en CO, AR, CL, PE, MX y BR desde sep 2026; el borrador de condiciones de pagos todavía decía "registro manual exclusivamente" en CO, AR, CL y PE. | `src/lib/payment-rail.ts` | Condiciones de pagos §1–§2 |
| FAC-15 | Nada de lo anterior está en `origin/main` (portal, cobro automático, cupones, rieles de LatAm y Francia, sales tax). Llega a producción al fusionar `claude/sharp-tesla-x211o3`. Portal, cobro automático y cupones no tienen interruptor de despliegue. | `git ls-tree origin/main` (2026-10-09) | Riesgo de publicación |

## Qué necesita una versión nueva y qué no

- **Necesita versión nueva (Términos y Aviso):** todo lo que cambia el texto
  publicado o la tabla de terceros. Eso incluye cualquier cambio en el nombre,
  rol, finalidad, condición u orden de `src/lib/legal-providers.ts`, porque
  `legalPublicationInputsHash('privacy', …)` los incluye y el build falla si no
  coinciden con `sourceInputsSha256` del Aviso publicado (verificado: el hash
  recalculado hoy es `00627d5a…` en ES y `321a4b1e…` en EN, igual al publicado).
  Solo `id`, `codeEvidence`, `publicEvidenceUrl` y `contractEvidence` quedan fuera
  del hash.
- **No necesita versión nueva:** los borradores complementarios (no publicados,
  sin aceptación) y la documentación interna. Se actualizaron en este cambio.

## Cambios propuestos al Aviso de Privacidad

La lista de cambios por sección es exacta: el texto propuesto es el de los archivos
de `src/content/legal-revisions/`, sin las etiquetas HTML. Todo está **pendiente de
revisión jurídica**.

### §1 Identidad del responsable (`#rol`)

Justificación: Cord ya trata datos de los **proveedores** del negocio (documentos recibidos en Chile) y transmite datos a autoridades en nombre del negocio. El rol de encargado del aviso vigente solo nombra a los clientes del negocio (FAC-01, FAC-06).

**es-MX**

Texto vigente (fragmento):

> sobre los datos de *sus propios clientes*. Nosotros solo procesamos esta información siguiendo sus instrucciones en la plataforma.

Texto propuesto (fragmento):

> sobre los datos de *sus propios clientes y proveedores*, incluidos los que se transmiten a autoridades fiscales en su nombre. Nosotros solo procesamos esta información siguiendo sus instrucciones en la plataforma.

**en-US**

Texto vigente (fragmento):

> over the data of *your own clients*. We only process this information following your instructions on the platform.

Texto propuesto (fragmento):

> over the data of *your own clients and suppliers*, including data transmitted to tax authorities on your behalf. We only process this information following your instructions on the platform.

### §2 Datos personales recabados (`#datos`)

Justificación: El aviso vigente solo describe CFDI y Verifactu. Faltan categorías que hoy existen en código: datos del receptor por país y lo que devuelve la autoridad (FAC-02); credenciales fiscales cifradas, que pueden identificar a una persona física (FAC-05); método de pago, mandato y evidencia de la autorización de cobro automático con **IP completa** del cliente del negocio (FAC-08, FAC-09); dirección enviada para el sales tax (FAC-04); documentos de proveedores (FAC-06) y redenciones de cupones (FAC-10). La IP completa es una excepción a la regla general de IP hasheada (Términos §9 y regla 19); se declara como tal, igual que la de una firma.

**es-MX**

Texto vigente:

> **Datos comerciales y fiscales:** catálogos, contactos, cotizaciones, facturas, comunicaciones y datos de emisor/receptor. CFDI puede involucrar RFC, régimen, domicilio fiscal y CSD. En España, la función configurada puede procesar NIF/CIF y certificado electrónico con su contraseña. Tener un certificado o registro encadenado no demuestra envío a la AEAT.

Texto propuesto:

> **Datos comerciales y fiscales:** catálogos, contactos, cotizaciones, facturas, comunicaciones y los datos de emisor y receptor que exige cada documento: identificación fiscal, nombre o razón social, domicilio y, según el país, régimen, condición frente al impuesto, giro o actividad. Si el negocio usa cupones, Cord registra qué cupón se aplicó a qué cliente y documento para respetar los topes de uso que el negocio fija. Cuando el negocio activa un riel fiscal, Cord guarda también lo que devuelve la autoridad o la plataforma autorizada: autorizaciones, constancias, acuses, códigos, rechazos y el XML firmado. Tener un certificado o un registro generado no demuestra que la autoridad lo haya recibido ni aceptado.
>
> **Credenciales fiscales del negocio:** cuando el negocio las carga, Cord guarda cifrados los certificados digitales, con sus llaves o contraseñas, con que el negocio se identifica y firma ante su autoridad (en Argentina, Brasil, Chile, Colombia, Perú y España), los archivos de folios autorizados de Chile con su llave, el usuario y la clave SOL de Perú, y el PIN del software y la clave técnica de Colombia. Un certificado puede identificar a una persona física, como el usuario autorizado ante la autoridad o un representante, con su nombre y su identificador. Esas credenciales no vuelven al navegador: Cord solo muestra su vigencia, su titular y su huella, y las usa para firmar y transmitir los documentos del propio negocio, consultar su estado, responder a sus proveedores en Chile y, si el negocio lo activa, firmar su Facturae.

Se agrega antes de «Verificación de identidad:…»:

> **Portal del cliente y cobro automático:** si un negocio comparte con su cliente un enlace personal de facturas y ese cliente guarda un método de pago, el procesador guarda el método y, en un débito bancario, el mandato. Cord conserva su identificador, tipo, marca o banco, terminación y vencimiento, y la evidencia de la autorización de cobro automático: versión del texto aceptado, fecha, dirección IP completa, navegador e identificador del intento. Esa IP se conserva íntegra a propósito, como la de una firma, porque acredita una autorización de cargo. Cord registra además quién desactivó el cobro automático y por qué, y los intentos y rechazos de cada cargo.
>
> **Sales tax de Estados Unidos:** si el negocio activa el cálculo por dirección, Cord envía al procesador, dentro de la cuenta de cobros del negocio, la dirección del cliente (estado, código postal, ciudad y, si existe, calle), si está exento y los importes de la venta, y guarda el cálculo con esa dirección. El número del certificado de exención se guarda en Cord y se imprime en el documento; no se envía al procesador.
>
> **Facturas recibidas de proveedores (Chile):** si el negocio usa la casilla de intercambio de Cord o sube el archivo, Cord recibe y guarda tal cual los documentos tributarios electrónicos que sus proveedores le dirigen, con el correo del remitente, el RUT, la razón social y el correo del proveedor, los importes y la decisión del negocio. Son datos de terceros que no usan Cord.

**en-US**

Texto vigente:

> **Business and tax data:** catalogs, contacts, quotes, invoices, communications and issuer/recipient information. CFDI may involve RFC, tax regime, tax address and CSD. In Spain, a configured feature may process NIF/CIF and an electronic certificate and password. Possession of a certificate or chained record does not establish AEAT submission.

Texto propuesto:

> **Business and tax data:** catalogs, contacts, quotes, invoices, communications and the issuer and recipient details each document requires: tax identifier, name or legal name, address and, depending on the country, tax regime, tax status, line of business or activity. If the business uses coupons, Cord records which coupon was applied to which customer and document to enforce the usage limits the business sets. When the business enables a tax rail, Cord also keeps what the authority or approved platform returns: authorizations, receipts, acknowledgments, codes, rejections and the signed XML. Holding a certificate or a generated record does not establish that the authority received or accepted it.
>
> **Business tax credentials:** when the business uploads them, Cord stores encrypted the digital certificates, with their keys or passwords, that the business uses to identify itself and sign before its authority (in Argentina, Brazil, Chile, Colombia, Peru and Spain), Chile’s authorized folio files with their key, Peru’s SOL user and password, and Colombia’s software PIN and technical key. A certificate may identify an individual, such as the user authorized before the authority or a representative, with their name and identifier. These credentials are never returned to the browser: Cord only displays their validity, holder and fingerprint, and uses them to sign and transmit the business’s own documents, check their status, answer its suppliers in Chile and, if the business enables it, sign its Facturae.

Se agrega antes de «Identity verification:…»:

> **Customer portal and automatic payments:** if a business shares a personal invoice link with its customer and that customer saves a payment method, the processor stores the method and, for a bank debit, the mandate. Cord keeps its identifier, type, brand or bank, last digits and expiry, and the evidence of the automatic-payment authorization: version of the accepted text, date, full IP address, browser and intent identifier. That IP is deliberately kept in full, like a signature’s, because it evidences a charge authorization. Cord also records who turned automatic payments off and why, and the attempts and declines of each charge.
>
> **United States sales tax:** if the business enables address-based calculation, Cord sends the processor, within the business’s payment account, the customer’s address (state, ZIP code, city and, if available, street), whether the customer is exempt and the sale amounts, and keeps the calculation with that address. The exemption certificate number is stored in Cord and printed on the document; it is not sent to the processor.
>
> **Invoices received from suppliers (Chile):** if the business uses Cord’s exchange mailbox or uploads the file, Cord receives and stores as received the electronic tax documents its suppliers address to it, with the sender’s email, the supplier’s RUT, legal name and email, the amounts and the business’s decision. This is data of third parties who do not use Cord.

### §3 Finalidades (`#uso`)

Justificación: Cuatro finalidades nuevas sin cobertura en el aviso vigente: transmisión fiscal y comunicación de estados (FAC-01, FAC-02), portal y cobro automático con avisos al cliente final (FAC-07, FAC-08), sales tax por dirección (FAC-04) e intercambio de documentos en Chile (FAC-06). La viñeta de Stripe Connect suma métodos y mandatos guardados (FAC-09).

**es-MX**

Texto vigente:

> - Generar, almacenar y enviar cotizaciones, y procesar el timbrado de facturas electrónicas.

Texto propuesto:

> - Generar, almacenar y enviar cotizaciones y facturas y, cuando el negocio activa un riel fiscal, firmarlas con sus credenciales, transmitirlas a la autoridad o a la plataforma autorizada que corresponda, consultar su estado y comunicar los estados que la ley prevé, como el cobro o el rechazo.

Texto vigente (fragmento):

> previa eliminación de sus metadatos.

Texto propuesto (fragmento):

> previa eliminación de sus metadatos. Donde el negocio lo activa, guardar métodos de pago y mandatos de domiciliación (SEPA o ACH) de sus clientes para el cobro automático.

Se agrega después de «Enviar correos transaccionales y notificaciones.…»:

> - **Portal del cliente y cobro automático:** Mostrar al cliente del negocio sus facturas y saldos mediante un enlace personal, cobrar varias facturas a la vez y, si el cliente lo autoriza, cobrar cada factura en su vencimiento con el método guardado, reintentar un cargo rechazado y avisarle por correo, a nombre del negocio, cuando un cargo falla o requiere su acción.
>
> - **Sales tax de Estados Unidos:** Calcular el impuesto de cada línea por la dirección del cliente con los registros estatales del propio negocio y registrar la venta para que el negocio la declare.
>
> - **Intercambio de facturas en Chile:** Recibir y validar los documentos que los proveedores dirigen al negocio, responderles los acuses firmados con el certificado del negocio y registrar ante el SII la aceptación o el reclamo que el negocio decide.

**en-US**

Texto vigente:

> - Generate, store, and send quotes, and process the stamping of electronic invoices.

Texto propuesto:

> - Generate, store and send quotes and invoices and, when the business enables a tax rail, sign them with its credentials, transmit them to the relevant authority or approved platform, check their status and report the statuses the law provides for, such as payment or rejection.

Texto vigente (fragmento):

> with their metadata stripped beforehand.

Texto propuesto (fragmento):

> with their metadata stripped beforehand. Where the business enables it, store its customers’ payment methods and direct-debit mandates (SEPA or ACH) for automatic payments.

Se agrega después de «Send transactional emails and notifications.…»:

> - **Customer portal and automatic payments:** Show the business’s customer their invoices and balances through a personal link, collect several invoices at once and, if the customer authorizes it, charge each invoice on its due date with the saved method, retry a declined charge and email the customer, in the business’s name, when a charge fails or needs their action.
>
> - **United States sales tax:** Calculate each line’s tax from the customer’s address using the business’s own state registrations and record the sale so the business can report it.
>
> - **Invoice exchange in Chile:** Receive and validate the documents suppliers address to the business, send them acknowledgments signed with the business’s certificate and register with the SII the acceptance or claim the business decides.

### §5 Cookies (`#cookies`)

Justificación: El portal es un enlace portador (reglas 19 y 34): no carga analítica, no se indexa y no envía referrer. Decirlo cierra la pregunta de qué se mide sobre el cliente del negocio (FAC-07).

**es-MX**

Se agrega antes de «Puede cambiar su preferencia de cookies de analítica en cualquier momento.…»:

> El portal de facturas que un negocio comparte con su cliente no carga analítica de producto ni analítica web, no se indexa y no comparte su dirección como referencia con otros sitios, porque el enlace funciona como una credencial.

**en-US**

Se agrega antes de «You can change your analytics cookie preference at any time.…»:

> The invoice portal a business shares with its customer loads no product or web analytics, is not indexed and does not pass its address to other sites as a referrer, because the link works as a credential.

### §6 Roles de tratamiento y terceros (`#dpa`)

Justificación: La fila "SAT, PAC y AEAT" ya no describe los destinatarios reales (FAC-01). Faltan la plataforma autorizada francesa (FAC-03) y el proveedor de correo entrante de las casillas de Cord (FAC-06). Stripe gana Stripe Tax y los métodos y mandatos de los clientes del negocio (FAC-04, FAC-08, FAC-09); Facturapi, la cancelación, los complementos de pago y la factura global (FAC-12). El párrafo nuevo fija el rol de Cord al transmitir: sistema de facturación del negocio, con sus credenciales, sin actuar como apoderado ni proveedor autorizado. **Las filas de esta tabla deben coincidir con `src/lib/legal-providers.ts` al publicar** (ver "Inventario de terceros").

**es-MX**

Texto vigente (fragmento):

> Preparación, timbrado y recuperación de CFDI, incluido el CSD que el negocio configura. *Solo para CFDI en México cuando el proveedor está configurado.*

Texto propuesto (fragmento):

> Preparación, timbrado, cancelación y recuperación de CFDI, incluidos complementos de pago, factura global y el CSD que el negocio configura. *Solo para CFDI en México cuando el proveedor está configurado.*

Se agrega después de «Preparación, timbrado, cancelación y recuperación de CFDI, incluidos complementos de pago,…»:

> **[Proveedor de correo entrante: nombre pendiente]** · Subencargado · Recepción de los correos dirigidos a las casillas de Cord: respuestas de clientes a la cobranza y documentos de proveedores en la casilla de intercambio de Chile. *Solo si la recepción de correo está configurada.*

Texto vigente (fragmento):

> Suscripciones, cobros, reembolsos, disputas, depósitos y verificación financiera/identidad. Su rol depende del producto y puede incluir obligaciones regulatorias propias. *Cuando se usa billing o Cord Payments.*

Texto propuesto (fragmento):

> Suscripciones, cobros, reembolsos, disputas, depósitos, verificación financiera/identidad, métodos de pago y mandatos que guardan los clientes del negocio, y cálculo del sales tax de Estados Unidos en la cuenta de cobros del negocio. Su rol depende del producto y puede incluir obligaciones regulatorias propias. *Cuando se usa billing, Cord Payments, el cobro automático o el sales tax por dirección.*

Texto vigente:

> **SAT, PAC y AEAT** · Autoridad o destinatario legal · Destinatarios de datos fiscales cuando una obligación o función fiscal aplicable está realmente habilitada. *SAT/PAC al timbrar CFDI. AEAT solo si Verifactu y el envío están configurados; hoy el valor por defecto es desactivado.*

Texto propuesto:

> **SAT/PAC, AEAT, ARCA, Sefin Nacional, SEFAZ, SUNAT, SII, DIAN, DGFiP** · Autoridad o destinatario legal · Reciben, por obligación legal del negocio emisor, los documentos, registros, eventos y estados de cobro que su ley exige, con los datos del emisor y del receptor, y devuelven autorizaciones, acuses o rechazos. *Solo para el país del emisor, cuando ese riel está habilitado en Cord y el negocio lo configuró: SAT por el PAC al timbrar CFDI; AEAT con Verifactu; ARCA en Argentina; Sefin Nacional y SEFAZ en Brasil; SUNAT en Perú; SII en Chile; DIAN en Colombia; DGFiP a través de la plataforma autorizada en Francia. El envío a la solución pública de facturación entre empresarios de la AEAT está construido, pero no transmite nada hasta que la AEAT publique su servicio.*

Se agrega después de «Solo si el Cliente conecta su cuenta.…»:

> **Iopole** · Proveedor con obligaciones propias · Plataforma autorizada por la administración fiscal francesa con la que un negocio establecido en Francia emite sus facturas entre empresas, declara sus demás ventas y sus cobros, y recibe los estados de sus facturas. Recibe los datos de alta del negocio (SIREN, régimen de TVA, correo, dirección y, si se indican, nombre y cargo de su representante), las facturas con los datos de sus clientes y los cobros. La verificación de identidad y el mandato se completan en la página de la plataforma, sin pasar por Cord. *Solo para negocios establecidos en Francia que completan el alta, cuando el servicio está habilitado.*

Se agrega antes de «Datos de usuario de Google…»:

> Cuando Cord transmite un documento a una autoridad o a la plataforma autorizada, actúa como el sistema de facturación del negocio, por su instrucción y con las credenciales del propio negocio: el obligado ante la autoridad es el negocio emisor. Cord no actúa como su apoderado, colaborador social ni proveedor tecnológico autorizado ante esas autoridades. Las respuestas de intercambio que el negocio envía a sus proveedores en Chile salen firmadas con su certificado.

**en-US**

Texto vigente (fragmento):

> Preparation, stamping, and retrieval of CFDI, including the CSD configured by the business. *Only for Mexican CFDI when the provider is configured.*

Texto propuesto (fragmento):

> Preparation, stamping, cancellation, and retrieval of CFDI, including payment complements, global invoices, and the CSD configured by the business. *Only for Mexican CFDI when the provider is configured.*

Se agrega después de «Preparation, stamping, cancellation, and retrieval of CFDI, including payment complements,…»:

> **[Inbound email provider: name pending]** · Sub-processor · Receipt of email sent to Cord mailboxes: customer replies to collections and supplier documents in Chile’s exchange mailbox. *Only when inbound email is configured.*

Texto vigente (fragmento):

> Subscriptions, payments, refunds, disputes, payouts, and financial/identity verification. Its role depends on the product and may include independent regulatory duties. *When billing or Cord Payments is used.*

Texto propuesto (fragmento):

> Subscriptions, payments, refunds, disputes, payouts, financial/identity verification, payment methods and mandates saved by the business’s customers, and United States sales tax calculation in the business’s payment account. Its role depends on the product and may include independent regulatory duties. *When billing, Cord Payments, automatic payments, or address-based sales tax is used.*

Texto vigente:

> **SAT, PAC y AEAT** · Authority or legally required recipient · Recipients of tax data when an applicable tax obligation or feature is actually enabled. *SAT/PAC when stamping CFDI. AEAT only when Verifactu and submission are configured; submission is disabled by default today.*

Texto propuesto:

> **SAT/PAC, AEAT, ARCA, Sefin Nacional, SEFAZ, SUNAT, SII, DIAN, DGFiP** · Authority or legally required recipient · Receive, under the issuing business’s legal obligation, the documents, records, events and payment statuses their law requires, with issuer and recipient data, and return authorizations, acknowledgments or rejections. *Only for the issuer’s country, when that rail is enabled in Cord and the business has configured it: SAT through the PAC when stamping CFDI; AEAT with Verifactu; ARCA in Argentina; Sefin Nacional and SEFAZ in Brazil; SUNAT in Peru; SII in Chile; DIAN in Colombia; DGFiP through the approved platform in France. Submission to the AEAT’s public business-to-business e-invoicing solution is built, but transmits nothing until the AEAT publishes its service.*

Se agrega después de «Only if the Customer connects their account.…»:

> **Iopole** · Provider with its own legal duties · Platform approved by the French tax administration through which a business established in France issues its business-to-business invoices, reports its other sales and its payments, and receives its invoices’ statuses. It receives the business’s registration data (SIREN, VAT regime, email, address and, if provided, its representative’s name and title), invoices with the business’s customer data, and payments. Identity verification and the mandate are completed on the platform’s own page, without passing through Cord. *Only for businesses established in France that complete registration, when the service is enabled.*

Se agrega antes de «Google user data…»:

> When Cord transmits a document to an authority or the approved platform, it acts as the business’s invoicing system, on its instruction and with the business’s own credentials: the party obliged before the authority is the issuing business. Cord does not act as its attorney-in-fact, authorized filing collaborator or accredited technology provider before those authorities. Exchange responses the business sends its suppliers in Chile are signed with its certificate.

### §7 Transferencias internacionales (`#internacionales`)

Justificación: El destino de un documento fiscal lo fija la ley del país del emisor, no Cord. La región de Iopole y del proveedor de correo entrante no tiene evidencia contractual (FAC-03, FAC-06).

**es-MX**

Se agrega después de «el reconocimiento de este aviso no se usa como sustituto general.…»:

> Los documentos fiscales se transmiten a la autoridad del país del emisor porque su ley lo exige; ese destino no lo elige Cord. La región de tratamiento de la plataforma autorizada de Francia y del proveedor de correo entrante forma parte de la evidencia contractual pendiente.

**en-US**

Se agrega después de «consent to this notice is not used as a blanket substitute.…»:

> Tax documents are transmitted to the authority of the issuer’s country because its law requires it; Cord does not choose that destination. The processing region of the French approved platform and of the inbound email provider is part of the pending contractual evidence.

### §9 Retención y seguridad (`#seguridad`)

Justificación: El aviso vigente dice que el borrado "puede afectar" los documentos locales. El hecho es más preciso y más grave: solo Verifactu impide borrar la organización; todo lo demás se borra con ella y ninguna tabla nueva tiene purga por antigüedad (FAC-11). También se declaran el cifrado de credenciales y de la cuenta de cobro (FAC-05) y los datos nuevos sin plazo (FAC-04, FAC-08, FAC-10).

**es-MX**

Texto vigente (fragmento):

> Cord utiliza protección en tránsito y cifrado de campos concretos, como CLABE y secretos configurados.

Texto propuesto (fragmento):

> Cord utiliza protección en tránsito y cifrado de campos concretos, como CLABE, la cuenta de cobro de las facturas, los certificados, llaves y claves fiscales, los archivos de folios y los secretos configurados.

Texto vigente:

> La conservación fiscal ante un proveedor no equivale a un archivo garantizado de cinco años dentro de Cord. El borrado de la organización elimina registros primarios dependientes y puede afectar los documentos almacenados localmente. El Cliente debe conservar los comprobantes que le correspondan y verificar su recuperación; Cord no promete archivo local perpetuo ni conservación uniforme de todos los datos.

Texto propuesto:

> Los documentos fiscales y lo que devuelve cada autoridad (XML firmados, autorizaciones, constancias, acuses, eventos y estados) se conservan mientras exista la organización; no hay borrado por antigüedad. Los registros Verifactu de España no se pueden modificar ni borrar y, mientras existan, impiden eliminar la organización. Los demás documentos fiscales, incluidos los CFDI de México y los de Argentina, Brasil, Chile, Colombia, Perú y Francia, se eliminan con la organización. La ley fiscal de cada país obliga al negocio emisor a conservarlos durante varios años, y lo que conservan la autoridad, el PAC o la plataforma autorizada se rige por sus propias reglas. El negocio debe descargar y conservar sus comprobantes antes de cerrar su cuenta; Cord no promete un archivo fiscal más allá de la vida de la organización ni conservación uniforme de todos los datos.
>
> Las credenciales fiscales se conservan hasta que el negocio las reemplaza o elimina, o hasta que se elimina la organización; un certificado vencido no se borra solo y un archivo de folios de Chile con folios usados no se puede quitar. La evidencia de la autorización de cobro automático, los cálculos de sales tax con la dirección del cliente, los documentos recibidos de proveedores y el registro de cupones tampoco tienen todavía un plazo de borrado propio.

**en-US**

Texto vigente (fragmento):

> Cord uses protection in transit and encryption of specific fields such as CLABE and configured secrets.

Texto propuesto (fragmento):

> Cord uses protection in transit and encryption of specific fields such as CLABE, the invoice payee account, tax certificates, keys and passwords, folio files and configured secrets.

Texto vigente:

> Fiscal retention by a provider is not a guaranteed five-year archive within Cord. Organization deletion removes dependent primary records and may affect locally stored documents. Customers must retain the records for which they are responsible and verify retrieval; Cord does not promise a perpetual local archive or uniform retention of all data.

Texto propuesto:

> Tax documents and what each authority returns (signed XML, authorizations, receipts, acknowledgments, events and statuses) are kept while the organization exists; there is no age-based deletion. Spain’s Verifactu records cannot be modified or deleted and, while they exist, prevent deleting the organization. Other tax documents, including Mexican CFDI and those of Argentina, Brazil, Chile, Colombia, Peru and France, are deleted with the organization. Each country’s tax law requires the issuing business to keep them for several years, and what the authority, the PAC or the approved platform keeps is governed by their own rules. The business must download and keep its records before closing its account; Cord does not promise a tax archive beyond the life of the organization or uniform retention of all data.
>
> Tax credentials are kept until the business replaces or deletes them, or until the organization is deleted; an expired certificate is not deleted automatically and a Chilean folio file with used folios cannot be removed. Automatic-payment authorization evidence, sales tax calculations with the customer’s address, documents received from suppliers and the coupon log do not yet have their own deletion period either.

### §11 Portabilidad y eliminación (`#portabilidad`)

Justificación: La exportación JSON no incluye documentos fiscales (borrador de retención, §5) y borrar en Cord no anula nada ante la autoridad (FAC-11).

**es-MX**

Se agrega después de «Las solicitudes sobre esos registros se evalúan por separado conforme a la ley aplicable.…»:

> La exportación JSON no incluye los documentos fiscales ni sus XML: se descargan desde cada factura. Eliminar la organización no anula ante la autoridad los documentos ya autorizados ni borra lo que la autoridad o la plataforma autorizada conservan.

**en-US**

Se agrega después de «Requests concerning those records are assessed separately under the applicable law.…»:

> The JSON export does not include tax documents or their XML: they are downloaded from each invoice. Deleting the organization does not cancel documents already authorized by the authority or erase what the authority or the approved platform keeps.

### §13 Derechos de privacidad (`#arco`)

Justificación: Los clientes y proveedores del negocio ahora interactúan con Cord directamente (portal, cobro automático, correo de intercambio). Necesitan saber que su primer canal es el negocio y que pueden apagar el cobro automático ellos mismos (FAC-07, FAC-08).

**es-MX**

Se agrega después de «pedir una identificación completa por defecto recopilaría más datos de los necesarios.…»:

> Si usted es cliente o proveedor de un negocio que usa Cord (por ejemplo, recibe sus facturas, paga en su portal o autorizó el cobro automático), ese negocio es el responsable de sus datos y es su primer canal; Cord le asiste como encargado. Puede desactivar el cobro automático en cualquier momento desde su portal.

**en-US**

Se agrega después de «requesting a full ID by default would collect more data than necessary.…»:

> If you are a customer or supplier of a business that uses Cord (for example, you receive its invoices, pay in its portal or authorized automatic payments), that business is the controller of your data and your first point of contact; Cord assists it as processor. You can turn automatic payments off at any time from your portal.

## Cambios propuestos a los Términos y Condiciones

Mismo criterio: texto exacto, pendiente de revisión jurídica. No se tocan las
cláusulas comerciales heredadas (indemnización, límite de responsabilidad, no
reembolsos, ley y foro); ver "Pendientes para asesoría".

### §1 Descripción del software (`#descripcion`)

Justificación: El §1 vigente dice que fuera de México solo existe la "factura comercial propia de CORD". Hoy hay rieles con autoridad en España, Argentina, Brasil, Perú, Chile, Colombia y Francia (FAC-01).

**es-MX**

Texto vigente:

> CORD es una plataforma tecnológica diseñada para la generación de cotizaciones, gestión de cobranza y emisión de comprobantes de venta — comprobantes fiscales digitales (CFDI 4.0) para negocios en México, y factura comercial propia de CORD para el resto del mundo. Flouvia provee

Texto propuesto:

> CORD es una plataforma tecnológica diseñada para la generación de cotizaciones, gestión de cobros y cobranza, y emisión de comprobantes de venta. Según el país del negocio y los rieles habilitados, el comprobante puede ser un CFDI 4.0 timbrado en México, un documento que Cord transmite a la autoridad o a la plataforma fiscal del país del emisor (Verifactu en España; ARCA en Argentina; NFS-e y NF-e en Brasil; SUNAT en Perú; SII en Chile; DIAN en Colombia; plataforma autorizada en Francia) o la factura comercial propia de CORD, que no se transmite a ninguna autoridad. Flouvia provee

**en-US**

Texto vigente:

> CORD is a technological platform designed for quote generation, collection management, and issuance of invoices — digital tax receipts (CFDI 4.0) for businesses in Mexico, and CORD's own commercial invoice for the rest of the world. Flouvia provides

Texto propuesto:

> CORD is a technological platform designed for quote generation, payment and collection management, and issuance of invoices. Depending on the business’s country and the enabled rails, the invoice may be a CFDI 4.0 stamped in Mexico, a document Cord transmits to the tax authority or platform of the issuer’s country (Verifactu in Spain; ARCA in Argentina; NFS-e and NF-e in Brazil; SUNAT in Peru; SII in Chile; DIAN in Colombia; an approved platform in France), or CORD’s own commercial invoice, which is not transmitted to any authority. Flouvia provides

### §4 Condiciones de pago y autorización de débito (`#pagos-autorizacion`)

Justificación: El §4 vigente afirma que Cord **no** genera el REP; hoy lo emite para cada cobro de un CFDI PPD (FAC-12). Además, el portal, el cobro automático, la domiciliación y los cupones crean obligaciones del Cliente que los Términos no mencionan: la autorización es a favor del Cliente, el Cliente solo puede apagarla, debe cumplir las reglas del esquema de débito, ACH no admite reembolsos parciales, y responde de sus promociones (FAC-07 a FAC-10).

**es-MX**

Texto vigente (fragmento):

> Esta función no genera automáticamente el Complemento de Recepción de Pagos (REP) mexicano.

Texto propuesto (fragmento):

> Cord emite el Complemento de Recepción de Pagos (REP) mexicano de cada cobro registrado sobre un CFDI timbrado como pago diferido o en parcialidades (PPD); el Cliente debe verificar que exista un complemento por cada cobro que lo requiera.

Se agrega antes de «Cobranza Autónoma con IA…»:

> **Subtítulo nuevo:** Portal del Cliente, Cobro Automático y Domiciliación
>
> El Cliente puede compartir con cada uno de sus clientes un enlace personal con sus facturas, desde el que ese cliente consulta su saldo y paga una o varias a la vez. El enlace funciona como una credencial: quien lo tenga ve esas facturas. El Cliente lo crea, lo rota o lo apaga desde la ficha del cliente y es responsable de enviarlo a la persona correcta.
>
> El cobro automático lo activa el cliente del Cliente desde su portal, mediante una autorización expresa a favor del Cliente para cobrar en su vencimiento, con el método que guarda, cada factura que el Cliente le emita desde ese día; el Cliente solo puede desactivarlo. Cord registra esa autorización (versión del texto, fecha, dirección IP y navegador), cobra en la cuenta de pagos conectada del Cliente, reintenta los cargos rechazados según una política fija, avisa al cliente cuando un cargo falla y al Cliente cuando el cobro se detiene. El Cliente responde de que sus condiciones comerciales, sus avisos y el uso de esa autorización cumplan la ley aplicable y las reglas de la red de tarjetas o del esquema de débito.
>
> La domiciliación bancaria (SEPA en euros y ACH en dólares de Estados Unidos) solo se ofrece si el Cliente la activa y el procesador habilita la capacidad en su cuenta. Un débito tarda días en confirmarse y el banco del pagador puede devolverlo después; mientras está en proceso, la factura no puede volver a cobrarse ni anularse. ACH no admite reembolsos parciales. El procesador envía al correo del cliente el aviso de cada cargo SEPA y la confirmación del mandato ACH.
>
> **Subtítulo nuevo:** Descuentos y Cupones
>
> El Cliente define el valor, la divisa, la vigencia y los topes de uso de sus cupones, y responde de que sus promociones cumplan la ley de protección al consumidor y de publicidad aplicable. Cord aplica el descuento antes de impuestos, lo refleja en el documento fiscal y registra cada uso por cliente y documento; un cupón agotado impide emitir o aprobar el documento que lo usa.

**en-US**

Texto vigente (fragmento):

> This feature does not automatically generate a Mexican payment receipt complement (REP).

Texto propuesto (fragmento):

> Cord issues the Mexican payment receipt complement (REP) for each payment recorded against a CFDI stamped as deferred or installment payment (PPD); the Customer must check that a complement exists for every payment that requires one.

Se agrega antes de «Autonomous AI Collections…»:

> **Subtítulo nuevo:** Customer Portal, Automatic Payments and Direct Debit
>
> The Customer may share with each of its customers a personal link to their invoices, from which that customer checks their balance and pays one or several at once. The link works as a credential: whoever holds it sees those invoices. The Customer creates, rotates or turns it off from the customer record and is responsible for sending it to the right person.
>
> Automatic payments are turned on by the Customer’s customer from their portal, through an express authorization in favor of the Customer to charge on its due date, with the method they save, each invoice the Customer issues to them from that day on; the Customer can only turn it off. Cord records that authorization (text version, date, IP address and browser), charges through the Customer’s connected payment account, retries declined charges under a fixed policy, notifies the customer when a charge fails and the Customer when collection stops. The Customer is responsible for ensuring its commercial terms, its notices and its use of that authorization comply with applicable law and with card network or debit scheme rules.
>
> Direct debit (SEPA in euros and ACH in US dollars) is offered only if the Customer enables it and the processor enables the capability on its account. A debit takes days to confirm and the payer’s bank may return it later; while it is processing, the invoice cannot be charged again or voided. ACH does not support partial refunds. The processor sends the customer’s email the notice of each SEPA charge and the ACH mandate confirmation.
>
> **Subtítulo nuevo:** Discounts and Coupons
>
> The Customer sets the value, currency, validity and usage limits of its coupons, and is responsible for ensuring its promotions comply with applicable consumer-protection and advertising law. Cord applies the discount before taxes, reflects it in the tax document and records each use by customer and document; an exhausted coupon prevents issuing or approving the document that uses it.

### §5 Actividades prohibidas (`#prohibidas`)

Justificación: La prohibición vigente solo menciona la interacción con el SAT; hoy Cord transmite a varias autoridades (FAC-01).

**es-MX**

Texto vigente (fragmento):

> Como infraestructura que emite comprobantes de venta — incluida, para negocios en México, la interacción con el SAT para emitir CFDI —, está

Texto propuesto (fragmento):

> Como infraestructura que emite comprobantes de venta — incluida la transmisión de comprobantes a autoridades fiscales y plataformas autorizadas en los países donde el riel está habilitado —, está

**en-US**

Texto vigente (fragmento):

> As an infrastructure that issues invoices — including, for businesses in Mexico, interacting with the SAT to issue CFDI — it is

Texto propuesto (fragmento):

> As an infrastructure that issues invoices — including transmitting invoices to tax authorities and approved platforms in countries where the rail is enabled — it is

### §8 Responsabilidad fiscal y legal (`#fiscal`)

Justificación: El §8 vigente solo trata México y España y afirma un "procesamiento programado diario" de Verifactu que ya no es cierto (FAC-13). Se agregan: cancelación y sustitución de CFDI (FAC-12); la solución pública B2B de la AEAT, construida y sin envíos; el rol de Cord en los rieles de LatAm (FAC-01); la recepción de documentos y su decisión irrevocable en Chile (FAC-06); la plataforma autorizada francesa y su mandato (FAC-03); la firma de la Facturae en nombre del Cliente (FAC-05); el sales tax de EE. UU. con su cuota y excedente (FAC-04); la autorización para usar credenciales (FAC-05) y la conservación real (FAC-11).

**es-MX**

Texto vigente:

> En México, el timbrado de CFDI depende de los datos fiscales, las credenciales del emisor y la disponibilidad del proveedor configurado. Fuera del carril fiscal habilitado, el documento es comercial y no prueba recepción por una autoridad.

Texto propuesto:

> En México, el timbrado de CFDI depende de los datos fiscales, las credenciales del emisor y la disponibilidad del proveedor configurado. Solicitar una cancelación no la completa: el estado final lo da el SAT y puede requerir la aceptación del receptor. Para sustituir un CFDI, Cord emite primero el comprobante sustituto y después solicita la cancelación del original relacionándolo. Fuera del carril fiscal habilitado, el documento es comercial y no prueba recepción por una autoridad.

Texto vigente:

> Cargar un certificado no demuestra remisión ni aceptación por la AEAT. El envío depende de su habilitación operativa y debe comprobarse mediante el estado del registro y la respuesta de la autoridad. La configuración actual usa un procesamiento programado diario y no acredita remisión inmediata. Antes de ofrecer ese carril como operativo deben verificarse la declaración responsable del productor, la versión del sistema y el mecanismo de envío. No se afirma una homologación otorgada por la AEAT.

Texto propuesto:

> Cargar un certificado no demuestra remisión ni aceptación por la AEAT. El envío depende de su habilitación operativa y debe comprobarse mediante el estado del registro y la respuesta de la autoridad. La configuración actual envía por tandas cada hora y después de emitir o anular, respetando la espera que indica la AEAT, y no acredita remisión inmediata. Antes de ofrecer ese carril como operativo deben verificarse la declaración responsable del productor, la versión del sistema y el mecanismo de envío. No se afirma una homologación otorgada por la AEAT. La factura electrónica obligatoria entre empresarios por la solución pública de la AEAT todavía no está disponible: Cord no envía nada por ese canal hasta que la AEAT publique su servicio.

Se agrega después de «Cargar un certificado no demuestra remisión ni aceptación por la AEAT. El envío depende de…»:

> En Argentina, Brasil, Perú, Chile y Colombia, cuando el riel está habilitado, Cord actúa como el sistema de facturación del propio Cliente: firma con las credenciales que el Cliente carga y transmite directamente a la autoridad, sin un proveedor intermediario, y no actúa como su apoderado ni como proveedor tecnológico autorizado. El documento solo tiene validez fiscal cuando la autoridad lo autoriza. Un envío sin respuesta se consulta antes de volver a emitir. Un documento autorizado no se edita: se anula o se corrige solo por el procedimiento que la autoridad prevé, que en varios países es únicamente una nota de crédito. Cada riel cubre los documentos y las operaciones que su pantalla indica y rechaza los demás antes de enviarlos.
>
> En Chile, si el Cliente usa la recepción de documentos de sus proveedores, Cord responde automáticamente el acuse de recibo y, cuando el Cliente decide, envía al proveedor la aceptación o el reclamo firmado con el certificado del Cliente y lo registra ante el SII; esa decisión no se puede cambiar después. El Cliente debe decidir dentro del plazo legal; Cord no acepta ni reclama por su cuenta.
>
> En Francia, cuando el servicio está habilitado y el Cliente completa su alta, Cord emite mediante una plataforma autorizada por la administración fiscal francesa las facturas entre empresas establecidas en Francia y declara las demás ventas y los cobros que la ley exige. El Cliente verifica su identidad y firma su mandato directamente con esa plataforma, que se rige por sus propias condiciones. Cord solo emite: no recibe facturas de proveedores, y el Cliente debe mantener su propia plataforma de recepción. Un dato ya declarado no se corrige desde Cord y una factura rechazada se corrige con una nueva.
>
> En la Unión Europea, Cord puede generar las facturas en formatos electrónicos estándar y, según lo que elija el Cliente, adjuntarlas al correo; fuera del caso de Francia no las transmite por ninguna red. Si el Cliente lo activa, Cord firma su Facturae con el certificado del Cliente y en su nombre.
>
> En Estados Unidos, si el Cliente activa el cálculo del sales tax por la dirección de su cliente, el impuesto de cada línea sale de un cálculo hecho en la cuenta de pagos del Cliente con los estados donde el Cliente declara recaudar. El Cliente es quien está registrado, recauda y declara ante cada estado; Cord no tramita registros ni presenta declaraciones, y no determina dónde existe obligación de recaudar. Si falta un dato o el cálculo no está disponible, el documento no se guarda en lugar de usar una tasa estimada. Las ventas registradas con este cálculo consumen una cuota mensual propia del plan; pasada la cuota se cobran como excedente al precio publicado o, mientras ese excedente no esté habilitado, la operación se rechaza.
>
> **Credenciales fiscales.** Al cargar un certificado, una llave, un archivo de folios o una clave de acceso ante su autoridad, el Cliente declara que le pertenecen o que quien las carga está facultado para usarlas en su nombre, y autoriza a Cord a usarlas solo para firmar y transmitir los documentos de esa organización, consultar su estado y, en Chile, responder a sus proveedores. Cord las guarda cifradas y no las devuelve al navegador. El Cliente debe revocarlas ante su autoridad si se comprometen y puede eliminarlas en Cord, salvo un archivo de folios con folios usados o, en España, el certificado mientras queden registros por enviar o del ejercicio en curso.
>
> **Conservación.** El Cliente debe conservar sus comprobantes, XML y acuses durante el plazo que exige su ley fiscal. Cord los conserva mientras exista la organización. Al eliminarla se borran, salvo los registros Verifactu, que impiden eliminarla; antes de cerrar su cuenta, el Cliente debe descargar lo que necesite conservar.

**en-US**

Texto vigente:

> In Mexico, CFDI stamping depends on tax data, issuer credentials and the configured provider’s availability. Outside an enabled fiscal rail, the document is commercial and does not establish receipt by an authority.

Texto propuesto:

> In Mexico, CFDI stamping depends on tax data, issuer credentials and the configured provider’s availability. Requesting a cancellation does not complete it: the final status comes from the SAT and may require the recipient’s acceptance. To replace a CFDI, Cord first issues the replacement and then requests cancellation of the original, linking the two. Outside an enabled fiscal rail, the document is commercial and does not establish receipt by an authority.

Texto vigente:

> Uploading a certificate does not establish submission or acceptance by AEAT. Submission depends on operational enablement and must be checked against the record status and the authority’s response. The current configuration uses daily scheduled processing and does not establish immediate remittance. Before offering that rail as operational, the producer’s responsible declaration, system version and submission mechanism must be verified. No AEAT-issued approval is claimed.

Texto propuesto:

> Uploading a certificate does not establish submission or acceptance by AEAT. Submission depends on operational enablement and must be checked against the record status and the authority’s response. The current configuration submits in batches every hour and after issuing or voiding, observing the waiting time the AEAT sets, and does not establish immediate remittance. Before offering that rail as operational, the producer’s responsible declaration, system version and submission mechanism must be verified. No AEAT-issued approval is claimed. Mandatory business-to-business e-invoicing through the AEAT’s public solution is not available yet: Cord sends nothing through that channel until the AEAT publishes its service.

Se agrega después de «Uploading a certificate does not establish submission or acceptance by AEAT. Submission de…»:

> In Argentina, Brazil, Peru, Chile and Colombia, when the rail is enabled, Cord acts as the Customer’s own invoicing system: it signs with the credentials the Customer uploads and transmits directly to the authority, without an intermediary provider, and does not act as the Customer’s attorney-in-fact or as an accredited technology provider. A document has tax validity only once the authority authorizes it. A submission without a response is queried before issuing again. An authorized document is not edited: it is voided or corrected only through the procedure the authority provides, which in several countries is a credit note only. Each rail covers the documents and transactions its screen indicates and rejects the rest before sending them.
>
> In Chile, if the Customer uses receipt of its suppliers’ documents, Cord automatically sends the receipt acknowledgment and, when the Customer decides, sends the supplier the acceptance or claim signed with the Customer’s certificate and registers it with the SII; that decision cannot be changed afterwards. The Customer must decide within the legal deadline; Cord does not accept or claim on its own.
>
> In France, when the service is enabled and the Customer completes registration, Cord issues through a platform approved by the French tax administration the invoices between businesses established in France and reports the other sales and payments the law requires. The Customer verifies its identity and signs its mandate directly with that platform, which is governed by its own terms. Cord only issues: it does not receive supplier invoices, and the Customer must keep its own receiving platform. Data already reported is not corrected from Cord, and a rejected invoice is corrected with a new one.
>
> In the European Union, Cord can generate invoices in standard electronic formats and, as the Customer chooses, attach them to email; except in France, it does not transmit them through any network. If the Customer enables it, Cord signs its Facturae with the Customer’s certificate and on its behalf.
>
> In the United States, if the Customer enables sales tax calculation by its customer’s address, each line’s tax comes from a calculation made in the Customer’s payment account using the states where the Customer declares it collects. The Customer is the party registered with, collecting for and filing with each state; Cord does not handle registrations or file returns, and does not determine where a collection obligation exists. If data is missing or the calculation is unavailable, the document is not saved rather than using an estimated rate. Sales recorded with this calculation use a separate monthly allowance of the plan; beyond the allowance they are charged as overage at the published price or, while that overage is not enabled, the operation is rejected.
>
> **Tax credentials.** By uploading a certificate, key, folio file or access password for its authority, the Customer represents that they belong to it or that the person uploading them is authorized to use them on its behalf, and authorizes Cord to use them only to sign and transmit that organization’s documents, check their status and, in Chile, answer its suppliers. Cord stores them encrypted and never returns them to the browser. The Customer must revoke them with its authority if they are compromised and may delete them in Cord, except a folio file with used folios or, in Spain, the certificate while records remain to be sent or belong to the current fiscal year.
>
> **Retention.** The Customer must keep its invoices, XML and acknowledgments for the period its tax law requires. Cord keeps them while the organization exists. Deleting it erases them, except Verifactu records, which prevent deletion; before closing its account, the Customer must download what it needs to keep.

## Inventario de terceros para la publicación (`legal-providers.ts`)

No se modificó: cambiarlo hoy rompe el build del Aviso publicado. Al publicar,
en el mismo cambio que el texto, se aplica este bloque (las finalidades y
condiciones son las mismas cadenas que las filas propuestas de la tabla) y se
recalcula `sourceInputsSha256`. Antes de publicar hay que sustituir el marcador
del proveedor de correo entrante por su nombre real, o retirar la fila si la
recepción de correo no se activa.

```ts
  // facturapi: sustituye purpose y condition de la entrada vigente.
  {
    id: 'facturapi', name: "Facturapi", role: 'subprocessor',
    purpose: { es: "Preparación, timbrado, cancelación y recuperación de CFDI, incluidos complementos de pago, factura global y el CSD que el negocio configura.", en: "Preparation, stamping, cancellation, and retrieval of CFDI, including payment complements, global invoices, and the CSD configured by the business." },
    condition: { es: "Solo para CFDI en México cuando el proveedor está configurado.", en: "Only for Mexican CFDI when the provider is configured." },
    codeEvidence: ["src/lib/fiscal/facturapi.ts", "src/lib/fiscal/providers/MexicoSatProvider.ts", "src/lib/fiscal/payment-complement.ts"],
    contractEvidence: 'account-evidence-pending',
  },
  // inbound-email: entrada nueva, después de facturapi; el nombre real sustituye al marcador antes de publicar.
  {
    id: 'inbound-email', name: "[Proveedor de correo entrante: nombre pendiente]", role: 'subprocessor',
    purpose: { es: "Recepción de los correos dirigidos a las casillas de Cord: respuestas de clientes a la cobranza y documentos de proveedores en la casilla de intercambio de Chile.", en: "Receipt of email sent to Cord mailboxes: customer replies to collections and supplier documents in Chile’s exchange mailbox." },
    condition: { es: "Solo si la recepción de correo está configurada.", en: "Only when inbound email is configured." },
    codeEvidence: ["src/pages/api/webhooks/inbound-email.ts", "src/pages/api/webhooks/sii-intercambio.ts", "src/lib/inbound-auth.ts"],
    contractEvidence: 'account-evidence-pending',
  },
  // stripe: sustituye purpose y condition de la entrada vigente.
  {
    id: 'stripe', name: "Stripe", role: 'provider-with-own-duties',
    purpose: { es: "Suscripciones, cobros, reembolsos, disputas, depósitos, verificación financiera/identidad, métodos de pago y mandatos que guardan los clientes del negocio, y cálculo del sales tax de Estados Unidos en la cuenta de cobros del negocio. Su rol depende del producto y puede incluir obligaciones regulatorias propias.", en: "Subscriptions, payments, refunds, disputes, payouts, financial/identity verification, payment methods and mandates saved by the business’s customers, and United States sales tax calculation in the business’s payment account. Its role depends on the product and may include independent regulatory duties." },
    condition: { es: "Cuando se usa billing, Cord Payments, el cobro automático o el sales tax por dirección.", en: "When billing, Cord Payments, automatic payments, or address-based sales tax is used." },
    codeEvidence: ["src/lib/billing.ts", "src/lib/stripe-cobros.ts", "src/pages/api/billing/connect", "src/lib/cobros/agrupados.ts", "src/lib/us-tax/stripe.ts"],
    publicEvidenceUrl: 'https://stripe.com/legal/dpa',
    contractEvidence: 'public-terms-reviewed',
  },
  // tax-authorities: sustituye nombre, purpose y condition de la entrada vigente.
  {
    id: 'tax-authorities', name: "SAT/PAC, AEAT, ARCA, Sefin Nacional, SEFAZ, SUNAT, SII, DIAN, DGFiP", role: 'authority',
    purpose: { es: "Reciben, por obligación legal del negocio emisor, los documentos, registros, eventos y estados de cobro que su ley exige, con los datos del emisor y del receptor, y devuelven autorizaciones, acuses o rechazos.", en: "Receive, under the issuing business’s legal obligation, the documents, records, events and payment statuses their law requires, with issuer and recipient data, and return authorizations, acknowledgments or rejections." },
    condition: { es: "Solo para el país del emisor, cuando ese riel está habilitado en Cord y el negocio lo configuró: SAT por el PAC al timbrar CFDI; AEAT con Verifactu; ARCA en Argentina; Sefin Nacional y SEFAZ en Brasil; SUNAT en Perú; SII en Chile; DIAN en Colombia; DGFiP a través de la plataforma autorizada en Francia. El envío a la solución pública de facturación entre empresarios de la AEAT está construido, pero no transmite nada hasta que la AEAT publique su servicio.", en: "Only for the issuer’s country, when that rail is enabled in Cord and the business has configured it: SAT through the PAC when stamping CFDI; AEAT with Verifactu; ARCA in Argentina; Sefin Nacional and SEFAZ in Brazil; SUNAT in Peru; SII in Chile; DIAN in Colombia; DGFiP through the approved platform in France. Submission to the AEAT’s public business-to-business e-invoicing solution is built, but transmits nothing until the AEAT publishes its service." },
    codeEvidence: ["src/lib/fiscal/providers/MexicoSatProvider.ts", "src/lib/fiscal/verifactu/submit.ts", "src/lib/fiscal/latam/rieles.ts", "src/lib/fiscal/spfe/transporte.ts", "src/lib/fiscal/transmision/cola.ts", ".env.example:VERIFACTU_AEAT_ENABLED=false"],
    contractEvidence: 'not-applicable',
  },
  // iopole: entrada nueva, después de mercadopago.
  {
    id: 'iopole', name: "Iopole", role: 'provider-with-own-duties',
    purpose: { es: "Plataforma autorizada por la administración fiscal francesa con la que un negocio establecido en Francia emite sus facturas entre empresas, declara sus demás ventas y sus cobros, y recibe los estados de sus facturas. Recibe los datos de alta del negocio (SIREN, régimen de TVA, correo, dirección y, si se indican, nombre y cargo de su representante), las facturas con los datos de sus clientes y los cobros. La verificación de identidad y el mandato se completan en la página de la plataforma, sin pasar por Cord.", en: "Platform approved by the French tax administration through which a business established in France issues its business-to-business invoices, reports its other sales and its payments, and receives its invoices’ statuses. It receives the business’s registration data (SIREN, VAT regime, email, address and, if provided, its representative’s name and title), invoices with the business’s customer data, and payments. Identity verification and the mandate are completed on the platform’s own page, without passing through Cord." },
    condition: { es: "Solo para negocios establecidos en Francia que completan el alta, cuando el servicio está habilitado.", en: "Only for businesses established in France that complete registration, when the service is enabled." },
    codeEvidence: ["src/lib/fiscal/transmision/alta.ts", "src/lib/fiscal/transmision/ereporting.ts", "src/lib/fiscal/transmision/iopole/cliente.ts"],
    contractEvidence: 'account-evidence-pending',
  },
```

Con las dos entradas nuevas, la evidencia de cuenta pendiente pasa de 10 a 12
(`iopole`, `inbound-email`), y `npm run security:legal-release` lo reportará.

## Conservación fiscal por país (comparación con la política)

Referencias para el abogado. Salen de búsquedas en fuentes secundarias hechas el
10-10-2026; **no se verificaron contra el texto vigente** de cada norma y alguna puede
haber cambiado (Argentina reformó la prescripción en 2026 según fuentes
secundarias). La política de retención (borrador) no fija plazos fiscales y dice
que no aplica uno de México a otros países; el hecho de código es que, salvo
Verifactu, todo se borra al eliminar la organización.

| País | Referencia de conservación (a confirmar) | Qué guarda Cord | Al eliminar la organización |
|---|---|---|---|
| México | CFF, art. 30: cinco años desde la declaración relacionada | Documento y respuesta del PAC; el XML vive en el PAC | Se borra en Cord; el PAC conserva bajo sus reglas |
| España | LGT, arts. 66 y 70 (cuatro años); Código de Comercio, art. 30 (seis años) | Registros Verifactu inmutables y respuestas de la AEAT; mensajes de la SPFE | Verifactu impide borrar, sin plazo de salida |
| Argentina | Ley 11.683 y su reglamento, art. 48 (ligado a la prescripción); CCyC, art. 328 (diez años, registros contables) | Solicitud, respuesta y CAE | Se borra |
| Brasil | CTN, arts. 173, 174 y 195 (hasta la prescripción, cinco años); Ajuste SINIEF 07/05, cláusula décima | XML de NFS-e, `nfeProc`, eventos e inutilizaciones | Se borra |
| Perú | Código Tributario, art. 87, num. 7 (cinco años o la prescripción, el mayor) | XML firmado y CDR | Se borra |
| Chile | Código Tributario, arts. 17 y 200 (hasta seis años) | DTE, CAF, set de pruebas, libros, documentos recibidos y respuestas | Se borra |
| Colombia | Estatuto Tributario, art. 632 (cinco años); Ley 962 de 2005, art. 46 | XML firmado, ApplicationResponse y contenedor | Se borra |
| Francia | LPF, art. L102 B (seis años); Code de commerce, art. L123-22 (diez años, documentos contables) | Factur-X enviado, e-reporting y estados | Se borra; la plataforma conserva bajo sus reglas |
| EE. UU. | Variable por estado | Cálculos y transacciones | Se borra; el proveedor conserva la transacción |

Fuentes consultadas: [CFF art. 30](https://mley.mx/CFF/articulo/30/),
[BOFiP sobre L102 B](https://bofip.impots.gouv.fr/bofip/645-PGP.html),
[ET art. 632](https://estatuto.co/632),
[conservación en Perú, DL 1315](https://lpderecho.pe/d-l-1315-modifican-diversos-articulos-del-codigo-tributario),
[Ley 11.683, ARCA](https://biblioteca.afip.gob.ar/dcp/TOR_C_011683_1998_07_13),
[prescripción reducida en Argentina (Errepar)](https://tributum.news/prescripcion-fiscal-reducida-a-3-anos-alcance-general-y-condiciones-de-aplicacion-errepar/).

Decisión pendiente (producto y abogado), sin la cual el Aviso solo puede decir
que el negocio debe descargar sus comprobantes: bloquear el cierre como en
Verifactu, ofrecer un archivo fiscal completo antes de cerrar, o conservar tras
el cierre con base y plazo por país. Hoy no existe una exportación masiva de XML.

## Borradores complementarios actualizados

| Documento | Cambio |
|---|---|
| `invoicing-terms` ES/EN | Rieles por país y su alcance; credenciales y su autorización; descuentos y cupones; **la sustitución de CFDI ya no está pendiente** (relación 04, motivo 01, estados de cancelación); el desglose de impuestos del CFDI ya se envía por concepto; REP automático en PPD; Verifactu cada hora; SPFE construida y sin envíos; Chile recibe documentos; Francia por plataforma; conservación real. Fuera `cfdi-tax-mapping` y `cfdi-cancellation-state` de `releaseBlockers`; entran `fr-platform-contract`, `latam-rail-activation`, `spfe-publication` y `fiscal-retention-after-closure`. |
| `payments-terms` ES/EN | Mercado Pago como segundo riel (CO, AR, CL, PE, MX, BR); portal, cobro agrupado, cobro automático y domiciliación; reparto de reembolsos de un cobro agrupado; ACH sin reembolsos parciales. Entran `autopay-consent-evidence` y `debit-notice-verification`. |
| `subprocessors` ES/EN | Correo entrante (proveedor por identificar), Iopole, Stripe con Stripe Tax y métodos guardados, lista de autoridades y rol de Cord al transmitir. Entran `fr-platform-contract` e `inbound-email-provider`. |
| `dpa` ES/EN | Nuevas personas y datos (proveedores, titulares de certificados, pagadores), autoridades e Iopole en los roles, credenciales como instrucción documentada, conservación fiscal tras el borrado. Entra `fiscal-retention-after-closure`. |
| `retention-policy` ES/EN | Plazos observados del portal, tickets, credenciales, cálculos de sales tax y alta francesa; datos nuevos sin plazo; tabla de conservación fiscal por país. Entra `fiscal-retention-after-closure`. |

`collections-notice` y `kyc-aml-policy` no se tocaron: los avisos de fallo del
cobro automático son mensajes de pago a nombre del acreedor y conviene revisarlos
con el aviso de cobranza en la siguiente pasada.

## Hallazgos de producto (no corregidos aquí)

1. **Conservación fiscal tras el cierre** (FAC-11). Un negocio que cierra su
   cuenta pierde en Cord los XML y acuses que su ley le obliga a guardar, salvo
   España (en México el PAC conserva los suyos bajo sus reglas). Es el riesgo de
   fondo más alto de esta revisión.
2. **La evidencia del cobro automático se sobrescribe** (FAC-08). Si el cliente
   cambia de método, se pierde la autorización con la que se hicieron los cargos
   anteriores. Conviene un historial append-only.
3. **El portal no enlaza ningún aviso** (FAC-07). El cliente del negocio entrega
   su método de pago y su IP sin un enlace al aviso del negocio ni al de Cord.
4. **Proveedor de correo entrante sin identificar** (FAC-06). El mismo camino
   recibe las respuestas a la cobranza y no figura en la tabla publicada.
5. **Avisos SEPA/ACH sin verificar** en una cuenta Custom real (FAC-09).
6. **Sin purga** para `us_tax_calculos` (direcciones), redenciones de cupones,
   documentos recibidos y registros Verifactu, que bloquean el cierre para siempre.

## Pendientes para asesoría

1. Rol de Cord ante cada autoridad: sistema de facturación del contribuyente y
   encargado del negocio. En Chile, si Flouvia debe o puede registrarse como
   proveedor de software; en Colombia, que operar como "software propio" de cada
   facturador no convierte a Cord en proveedor tecnológico.
2. Plataforma autorizada francesa: naturaleza del acuerdo entre el negocio y la
   plataforma (el mandato que se firma en su página), rol de Flouvia como
   operador frente a Iopole, si Iopole es encargado de Cord o proveedor con
   obligaciones propias, cláusulas del contrato de producción y región de
   tratamiento.
3. Conservación fiscal tras el cierre (tabla anterior): qué debe hacer Cord como
   encargado y con qué base.
4. Cobro automático: si el texto de `portal.consentimiento` basta para cargos
   iniciados por el comercio con tarjeta, para el mandato SEPA (preaviso) y para
   ACH; base y plazo de conservar la IP completa; si el texto de autorización
   debe vivir en un documento legal versionado y no solo en el diccionario.
5. Deber de informar a los clientes del negocio en el portal y quién lo cumple.
6. Documentos de proveedores recibidos por correo (Chile): base y aviso a
   proveedores personas naturales.
7. Stripe Tax: rol de Stripe en la cuenta conectada; que Cord pague el cálculo y
   cobre por venta registrada; si la cuota y su excedente deben constar también
   en la página de precios antes de cobrarse.
8. Firma de la Facturae en nombre del negocio: si la opción en Ajustes basta o se
   necesita una autorización expresa versionada.
9. Indemnización (§10) y límite de responsabilidad (§12): siguen hablando de
   "CFDI o factura comercial"; no se ampliaron sin decisión jurídica.
10. Anexos por país, ahora más urgentes porque hay flujo real con autoridad:
    `country-es` (Verifactu y SPFE), `country-fr` (plataforma autorizada),
    `country-cl` (intercambio y Ley 19.983/20.956), `country-co`, `country-pe`,
    `country-ar`, `country-br`, `country-mx` (sustitución y REP), `country-us` y
    `us-state-privacy-annex` (sales tax por dirección).

## Procedimiento de publicación (cuando André lo decida)

1. Revisión jurídica de las cuatro propuestas y resolución de sus
   `releaseBlockers`, en particular el contrato con la plataforma francesa, el
   nombre del proveedor de correo entrante y la decisión de conservación fiscal.
2. Quitar de cada propuesta el aviso de borrador, poner la fecha real y sustituir
   los marcadores entre corchetes.
3. Aplicar el bloque de `legal-providers.ts` anterior.
4. Copiar el cuerpo de cada propuesta a `src/content/legal/<locale>/<doc>.md`
   (`sourceKind: html-snapshot`, mismo `legacyScope`), con `version` y
   `effectiveDate` nuevos, `supersedes: "2026-09-28"`,
   `sourceInputsSha256 = legalPublicationInputsHash(doc, locale)` y
   `artifactSha256 = sha256(restoreLegacyLegalHtml(cuerpo, legacyScope))`.
5. Actualizar `TERMS_VERSION`, `PRIVACY_VERSION` y los cuatro hashes en
   `src/lib/legal-corpus.ts`.
6. Agregar en `db/schema.sql` las filas de `legal_documents` y
   `legal_document_variants` de la nueva versión, como el bloque de `2026-09-28`,
   y migrar **antes** de desplegar.
7. Borrar las propuestas de `src/content/legal-revisions/` y apuntar en
   `sourceSections` de los borradores la versión nueva.
8. `npm run build`, `npm run security:legal` y `npm run security:legal-release`.
9. Publicar **antes o junto con** la fusión de `claude/sharp-tesla-x211o3` a
   `main` (FAC-15). Si no, mantener apagados los rieles y no fusionar portal,
   cobro automático ni cupones hasta publicar.

## Verificación

| Comando | Resultado |
|---|---|
| `npm run build` | Pasa |
| `npm run security:legal` | Pasa: 4 variantes publicadas con su hash intacto, 24 borradores técnicos, 4 propuestas aisladas, 19 terceros clasificados |
| `npm run security:legal-release` | Falla de forma esperada, igual que antes de este cambio: 5 campos de identidad y 10 evidencias de cuenta pendientes |
| `npm run security:i18n` | Pasa |
| `npm run typecheck` | Solo los errores previos de `packages/elements/src/vue.ts` y `framer.tsx` |

No se modificaron artefactos publicados, `db/schema.sql`, `legal-providers.ts`,
runtime ni datos.

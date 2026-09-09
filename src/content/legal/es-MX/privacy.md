---
docId: privacy
version: "2026-08-29"
effectiveDate: "2026-08-29"
supersedes: "2026-08-11"
locale: es-MX
jurisdiction: GLOBAL
appliesToCountries: [MX, US, CA, BR, ES, GB, DE, FR, CO, AR, CL, PE]
requiresAction: true
action: acknowledged
acceptanceScope: personal
publicationStatus: published
sourceKind: html-snapshot
sourceInputsSha256: "471a436b5b6af14bcb123298128194685af773546e7e039c3f8a65bafebf0191"
legacyScope: data-astro-cid-dcn55ul3
sourceOfTruth: src/content/legal/es-MX/privacy.md
artifactRoute: /privacidad
artifactSha256: "469dd0c23ed4626059b8869951d8bf8842cfc7e1dc0122b3c1da4652bae6dbf4"
lastReviewed: "2026-08-29"
reviewedBy: Auditoría técnica interna; revisión jurídica externa pendiente
---

<main class="legal-page js-anim">
<div class="legal-header">
<h1 class="editorial masked-title">Aviso de<br>Privacidad</h1>
<div class="reveal">
<p class="last-updated">Última actualización: 29 de agosto de 2026</p>
</div>
</div>
<!-- Grid de 2 columnas: Sidebar + Contenido -->
<div class="legal-grid reveal">
<!-- Índice Sticky (Izquierda) -->
<aside class="toc-sidebar">
<span class="toc-eyebrow">CONTENIDO</span>
<ul class="toc-list">
<li>
<a href="#rol" class="toc-link active">1. Responsable</a>
</li>
<li>
<a href="#datos" class="toc-link">2. Datos recabados</a>
</li>
<li>
<a href="#uso" class="toc-link">3. Finalidades</a>
</li>
<li>
<a href="#anonimizados" class="toc-link">4. Datos Anonimizados</a>
</li>
<li>
<a href="#cookies" class="toc-link">5. Política de Cookies</a>
</li>
<li>
<a href="#dpa" class="toc-link">6. Roles y Terceros</a>
</li>
<li>
<a href="#internacionales" class="toc-link">7. Transf. Internacionales</a>
</li>
<li>
<a href="#negocio" class="toc-link">8. Transf. de Negocio</a>
</li>
<li>
<a href="#seguridad" class="toc-link">9. Seguridad</a>
</li>
<li>
<a href="#brechas" class="toc-link">10. Brechas de Datos</a>
</li>
<li>
<a href="#portabilidad" class="toc-link">11. Portabilidad</a>
</li>
<li>
<a href="#menores" class="toc-link">12. Menores de Edad</a>
</li>
<li>
<a href="#arco" class="toc-link">13. Derechos de Privacidad</a>
</li>
<li>
<a href="#cambios" class="toc-link">14. Cambios</a>
</li>
</ul>
</aside>
<!-- Contenido Legal (Derecha) -->
<div class="legal-content">
<!-- Caja gris estilo Flouvia -->
<div class="intro-box">
<p>Este aviso se emite conforme a la <strong>Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP)</strong> de México. Otras leyes obligatorias pueden aplicar según las personas, organizaciones, tratamientos y ubicaciones involucradas, incluido el GDPR o la LGPD de Brasil. Este aviso no afirma que una sola base jurídica o procedimiento baste para todas las jurisdicciones y no constituye por sí mismo un Acuerdo de Procesamiento de Datos.</p>
</div>
<p>
<strong>Flouvia</strong> y <strong>CORD</strong> son nombres comerciales utilizados por Andre Valle Ortega, la persona operadora identificada en este aviso. Este documento describe los tratamientos demostrables en el código y configuración actuales de Cord; no convierte una integración opcional o no configurada en un flujo activo.</p>
<!-- Los H2 ahora tienen un ID para anclarlos al índice -->
<h2 id="rol" class="editorial">
<span class="num">01</span> Identidad del Responsable</h2>
<p>Para efectos legales y operativos, es importante distinguir cómo interactuamos con los datos:</p>
<ul>
<li>
<strong>Como Responsables (Data Controller):</strong> Actuamos como responsables sobre los datos de usted y su equipo (nuestros clientes directos) al crear una cuenta o suscribirse.</li>
<li>
<strong>Como Encargados (Data Processor):</strong> Actuamos como encargados sobre los datos de <em>sus propios clientes</em>. Nosotros solo procesamos esta información siguiendo sus instrucciones en la plataforma.</li>
</ul>
<p class="legal-warning">Pendiente de cumplimiento abierto: todavía no se publica el domicilio verificable del responsable. Esta omisión no limita ningún derecho ni canal de solicitud.</p>
<h2 id="datos" class="editorial">
<span class="num">02</span> Datos Personales Recabados</h2>
<p>Recopilamos información a través de tres vías principales:</p>
<ul>
<li>
<strong>Datos de Identidad:</strong> Nombre, correo electrónico y contraseñas (gestionadas de forma encriptada).</li>
<li>
<strong>Datos Fiscales (CFDI 4.0):</strong> RFC, Razón Social, Régimen Fiscal, Código Postal y Certificados de Sello Digital (CSD).</li>
<li>
<strong>Datos Fiscales (Verifactu, España):</strong> NIF/CIF, razón social, domicilio fiscal y, si el negocio configura la función, un certificado electrónico (.p12/.pfx). El certificado y la contraseña se guardan cifrados. El envío real a la AEAT tiene un gate adicional de entorno desactivado por defecto; sin identidad verificada del sistema y el carril de envío habilitado, Cord produce un documento comercial y no debe afirmar que lo remitió.</li>
<li>
<strong>Datos Financieros y Patrimoniales:</strong> Banco, titular, CLABE, movimientos de pago, reembolsos, disputas y saldos negativos. CORD almacena la CLABE cifrada y conserva sus últimos cuatro dígitos para mostrarla. <em>CORD no almacena números de tarjeta ni códigos de seguridad; Stripe los tokeniza directamente.</em>
</li>
<li>
<strong>Datos de Verificación de Identidad:</strong> Información del representante legal, directores y beneficiarios finales (25% o más), e imágenes de la identificación oficial y, cuando se requiera, del comprobante de domicilio. Las imágenes de los documentos se transmiten directamente a Stripe y CORD no las almacena de forma persistente. Antes de transmitirlas, CORD elimina los metadatos del archivo, incluida la ubicación GPS que el dispositivo de captura pudiera haber incrustado. CORD conserva un registro de cumplimiento de cada envío —qué parte del documento se remitió, cuándo, desde qué dirección IP, la forma técnica del archivo y la respuesta del sistema de verificación— durante cinco (5) años, conforme a la normativa de prevención de lavado de dinero. Ese registro nunca incluye la imagen, una miniatura, el número del documento, la fecha de nacimiento ni el domicilio personal.</li>
<li>
<strong>Datos de su Negocio:</strong> Catálogo de productos, listas de precios, y datos de las empresas a las que usted cotiza.</li>
<li>
<strong>Datos del Comprador y Evidencia de Disputas:</strong> Nombre, correo, dirección IP de compra, comunicaciones comerciales, recibos, documentos de entrega, fechas de servicio y demás evidencia que el Cliente decida guardar o enviar para responder a una disputa de pago.</li>
</ul>
<p>Debido a que el alta de pagos puede involucrar datos financieros, patrimoniales o de verificación de identidad, solicitamos el consentimiento expreso por medios electrónicos de la persona titular antes de completarla. El consentimiento puede revocarse mediante el procedimiento de la sección 13, sin efectos retroactivos; sin embargo, la revocación o la falta de datos requeridos puede impedir que CORD y Stripe habiliten o mantengan los servicios de pago.</p>
<h2 id="uso" class="editorial">
<span class="num">03</span> Finalidades</h2>
<p>Los datos recabados se utilizan exclusivamente para los siguientes propósitos esenciales:</p>
<ul>
<li>Generar, almacenar y enviar cotizaciones, y procesar el timbrado de facturas electrónicas.</li>
<li>Gestionar el cobro de su suscripción mensual y calcular el excedente de uso.</li>
<li>
<strong>Procesamiento de Pagos (Stripe Connect Custom):</strong> Conectar la cuenta de pagos del Cliente, recibir y conciliar cobros, calcular y cobrar las tarifas transaccionales de Cord, programar depósitos, procesar reembolsos, gestionar contracargos y saldos negativos, y cumplir los requisitos de verificación financiera. Los datos bancarios se cifran en CORD y se transmiten a Stripe por API. Las imágenes de los documentos se transmiten a Stripe sin almacenamiento persistente en CORD, previa eliminación de sus metadatos.</li>
<li>
<strong>Inteligencia Artificial:</strong> Procesar el texto necesario para la función de IA que invoque el usuario. Cord utiliza la API comercial de Anthropic; la política pública vigente del proveedor indica que las entradas y salidas comerciales no se usan para entrenar modelos salvo que el cliente comercial participe voluntariamente. Cord no presenta esa política del proveedor como garantía de que el tratamiento con IA carezca de riesgos.</li>
<li>
<strong>Cobranza Autónoma con IA (opcional):</strong> Si el Administrador de la cuenta la habilita, Cord procesa datos de cartera (nombre y correo del cliente, monto, vencimiento y el contexto de conversación seleccionado por el flujo) para redactar o enviar recordatorios en nombre del acreedor. Está desactivada por defecto.</li>
<li>Enviar correos transaccionales y notificaciones.</li>
</ul>
<h2 id="anonimizados" class="editorial">
<span class="num">04</span> Datos Anonimizados y Agregados</h2>
<p>Podemos crear estadísticas agregadas o desidentificadas para analizar tendencias y mejorar Cord. Quitar identificadores directos no vuelve anónimo un dato por sí solo: si un conjunto puede vincularse razonablemente con una persona, seguimos tratándolo como dato personal. No prometemos que toda técnica de desidentificación haga imposible la reidentificación.</p>
<h2 id="cookies" class="editorial">
<span class="num">05</span> Política de Utilización de Cookies</h2>
<p>CORD utiliza cookies y tecnologías de seguimiento de manera minimalista y no invasiva. No vendemos sus datos de navegación a redes publicitarias de terceros.</p>
<ul>
<li>
<strong>Cookies Estrictamente Necesarias:</strong> Utilizadas para mantener su sesión activa, autenticar su identidad y prevenir ataques de falsificación de solicitudes (CSRF). Sin estas cookies, la aplicación no puede funcionar de manera segura. Siempre están activas y no pueden desactivarse desde el aviso de cookies.</li>
<li>
<strong>Analítica de Producto en el Navegador (PostHog):</strong> Mide vistas y adopción de funciones después de que acepta analítica en el aviso. Los eventos del navegador con sesión pueden vincularse al usuario y su organización. Por separado, si PostHog está configurado, el servidor de Cord puede registrar eventos de negocio a nivel organización con la creación de perfiles de persona desactivada; esos eventos no dependen de una cookie del navegador.</li>
<li>
<strong>Analítica Web sin Cookies de Terceros (Vercel):</strong> Registra dimensiones agregadas de vistas. Antes del envío, Cord elimina consultas y sustituye identificadores de clientes, documentos, disputas, SSO, invitaciones, enlaces públicos y captura de identidad. Vercel todavía procesa la solicitud técnica necesaria para prestar el servicio, por lo que no se afirma de forma absoluta que “no identifica a nadie”.</li>
</ul>
<p>Puede cambiar su preferencia de cookies de analítica en cualquier momento. <button type="button" id="cc-reopen" class="cc-reopen-link">Administrar preferencias de cookies</button>
</p>
<h2 id="dpa" class="editorial">
<span class="num">06</span> Roles de tratamiento y terceros</h2>
<p>Este aviso de privacidad <strong>no</strong> pone en vigor un DPA completo del artículo 28 por el solo uso de Cord. El DPA independiente continúa como borrador controlado y debe completarse con datos verificados de las partes, anexos de tratamiento, mecanismo de transferencia y evidencia de ejecución antes de que un Cliente dependa de él. El inventario siguiente declara el rol real de cada tercero; no todo destinatario es un subencargado.</p>
<div class="table-wrapper">
<table>
<thead>
<tr>
<th>Tercero</th>
<th>Rol</th>
<th>Finalidad y activación</th>
</tr>
</thead>
<tbody>
<tr>
<td>
<strong>Neon</strong>
</td>
<td>Subencargado</td>
<td>Alojamiento de la base PostgreSQL que contiene datos de cuenta, operación y clientes. <em>Infraestructura principal.</em>
</td>
</tr>
<tr>
<td>
<strong>Vercel</strong>
</td>
<td>Subencargado</td>
<td>Alojamiento, ejecución de solicitudes, logs técnicos y analítica web agregada. <em>Infraestructura principal; las rutas con identificadores se redactan antes de Web Analytics.</em>
</td>
</tr>
<tr>
<td>
<strong>Anthropic</strong>
</td>
<td>Subencargado</td>
<td>Procesamiento de texto para funciones de IA, incluidas cotizaciones y cobranza cuando se usan. <em>Solo al invocar una función de IA.</em>
</td>
</tr>
<tr>
<td>
<strong>Resend</strong>
</td>
<td>Subencargado</td>
<td>Entrega de correos transaccionales y gestión del newsletter con doble confirmación. <em>Cuando Cord envía correo o el usuario confirma una suscripción editorial.</em>
</td>
</tr>
<tr>
<td>
<strong>PostHog</strong>
</td>
<td>Subencargado</td>
<td>Analítica de producto. El navegador se activa tras consentimiento; el servidor puede emitir telemetría de negocio a nivel organización, sin crear un perfil de persona. <em>Solo si PostHog está configurado; la captura del navegador requiere aceptación de analítica.</em>
</td>
</tr>
<tr>
<td>
<strong>Upstash</strong>
</td>
<td>Subencargado</td>
<td>Limitación distribuida de solicitudes y sesiones técnicas efímeras. <em>Solo cuando las variables de Upstash están configuradas; existe respaldo en PostgreSQL.</em>
</td>
</tr>
<tr>
<td>
<strong>Slack (alertas de Cord)</strong>
</td>
<td>Subencargado</td>
<td>Recepción de alertas operativas minimizadas mediante un webhook controlado por Cord. <em>Solo si el webhook interno está configurado.</em>
</td>
</tr>
<tr>
<td>
<strong>Facturapi</strong>
</td>
<td>Subencargado</td>
<td>Preparación, timbrado y recuperación de CFDI, incluido el CSD que el negocio configura. <em>Solo para CFDI en México cuando el proveedor está configurado.</em>
</td>
</tr>
<tr>
<td>
<strong>Stripe</strong>
</td>
<td>Proveedor con obligaciones propias</td>
<td>Suscripciones, cobros, reembolsos, disputas, depósitos y verificación financiera/identidad. Su rol depende del producto y puede incluir obligaciones regulatorias propias. <em>Cuando se usa billing o Cord Payments.</em>
</td>
</tr>
<tr>
<td>
<strong>Google</strong>
</td>
<td>Proveedor con obligaciones propias</td>
<td>Autenticación OAuth elegida por el usuario; Cord recibe el identificador, nombre y correo autorizados. <em>Solo si se elige iniciar sesión con Google.</em>
</td>
</tr>
<tr>
<td>
<strong>Apple</strong>
</td>
<td>Proveedor con obligaciones propias</td>
<td>Autenticación elegida por el usuario; Cord recibe el identificador y los datos autorizados por Apple. <em>Solo si se elige iniciar sesión con Apple.</em>
</td>
</tr>
<tr>
<td>
<strong>SAT, PAC y AEAT</strong>
</td>
<td>Autoridad o destinatario legal</td>
<td>Destinatarios de datos fiscales cuando una obligación o función fiscal aplicable está realmente habilitada. <em>SAT/PAC al timbrar CFDI. AEAT solo si Verifactu y el envío están configurados; hoy el valor por defecto es desactivado.</em>
</td>
</tr>
<tr>
<td>
<strong>SAML, MCP, Slack y webhooks del Cliente</strong>
</td>
<td>Integración dirigida por el Cliente</td>
<td>Intercambio de datos con el proveedor de identidad, servidor MCP, espacio de Slack o endpoint que el propio Cliente configura. <em>Solo por instrucción y configuración del Cliente.</em>
</td>
</tr>
</tbody>
</table>
</div>
<h2 id="internacionales" class="editorial">
<span class="num">07</span> Transferencias Internacionales de Datos</h2>
<p>Algunos proveedores pueden tratar datos fuera del país donde se ubique el usuario o Cliente. El DPA o lista pública de subencargados de un proveedor demuestra sus términos publicados, pero no prueba la región, configuración o mecanismo de transferencia ejecutado para la cuenta de Cord. Esas evidencias permanecen en el checklist de liberación. Cuando aplique el capítulo V del GDPR, debe identificarse para la transferencia concreta una decisión de adecuación, las Cláusulas Contractuales Tipo de 2021 aplicables u otro mecanismo válido; el reconocimiento de este aviso no se usa como sustituto general.</p>
<h2 id="negocio" class="editorial">
<span class="num">08</span> Transferencias de Negocio (M&amp;A)</h2>
<p>La información pertinente para los Servicios puede formar parte de una fusión, adquisición, financiamiento, reestructura, insolvencia o venta de activos, sujeta a los deberes de confidencialidad, limitación de finalidad y aviso aplicables a la operación. Esto no autoriza a un adquirente ajeno a ignorar este aviso o la ley aplicable.</p>
<h2 id="seguridad" class="editorial">
<span class="num">09</span> Retención y Seguridad</h2>
<p>Cord utiliza TLS en tránsito y cifrado a nivel de campo para CLABE y secretos configurados. Los CFDI timbrados y los registros de cumplimiento del envío de identidad están configurados actualmente alrededor de una retención de cinco años. Cuando el modo Verifactu está realmente habilitado, la base guarda una secuencia append-only cuyos registros referencian la huella anterior; esta propiedad técnica no se presenta como prueba de que toda obligación española de conservación ya esté operativa. La retención de pagos, disputas, proveedores, respaldos y evidencias de aceptación aún requiere un calendario documentado registro por registro. Cord no guarda de forma persistente las imágenes de identidad enviadas a Stripe.</p>
<h2 id="brechas" class="editorial">
<span class="num">10</span> Protocolo ante Brechas de Seguridad</h2>
<p>Si Cord conoce una vulneración de datos personales que afecte Datos del Cliente respecto de los cuales actúa como encargado, informará al Cliente aplicable sin dilación indebida y facilitará la información razonablemente disponible para su evaluación y notificaciones. Cuando Cord actúe como responsable, evaluará el aviso a autoridades y personas afectadas conforme a la ley aplicable al incidente. El plazo de 72 horas del GDPR ante la autoridad de control no se presenta como un plazo de 72 horas hábiles del encargado al Cliente.</p>
<h2 id="portabilidad" class="editorial">
<span class="num">11</span> Portabilidad y Eliminación de Datos</h2>
<p>Los ajustes permiten exportar los datos de la organización en JSON y productos y clientes en CSV. Al eliminar una organización se borra su fila principal en la base de Cord y las filas operativas dependientes. Esto no borra por sí solo registros que un proveedor conserve por obligaciones propias, datos ya entregados por instrucción del Cliente, respaldos aún dentro de su ciclo de rotación ni la evidencia seudónima de aceptación legal que Cord conserva para acreditar el contrato. Las solicitudes sobre esos registros se evalúan por separado conforme a la ley aplicable.</p>
<h2 id="menores" class="editorial">
<span class="num">12</span> Privacidad de Menores de Edad</h2>
<p>CORD es una plataforma SaaS diseñada exclusivamente para empresas y profesionales. No recopilamos ni solicitamos a sabiendas Información Personal de ninguna persona menor de 18 años. Si descubrimos que hemos recopilado información de un menor de edad sin el consentimiento corporativo o verificable adecuado, eliminaremos dicha información de nuestros servidores lo más rápido posible.</p>
<h2 id="arco" class="editorial">
<span class="num">13</span> Derechos de Privacidad</h2>
<p>El nombre y fundamento de cada derecho depende de la ley aplicable. México reconoce Acceso, Rectificación, Cancelación y Oposición (ARCO); los regímenes GDPR incluyen acceso, rectificación, supresión, limitación, portabilidad y oposición; la LGPD de Brasil establece sus propios derechos. Ajustes permite actualmente exportar la organización, exportar ciertos CSV, corregir datos de cuenta y eliminar la organización. Las demás solicitudes requieren evaluación individual y no se describen como automatizadas solo porque exista una página de Ajustes.</p>
<p>Las solicitudes que no puedan completarse en Ajustes pueden enviarse a <strong>legal@flouvia.com</strong>. Indique el derecho y la cuenta o relación involucrada. No adjunte una identificación salvo que Cord solicite un medio proporcional de verificación después de revisar el caso; pedir una identificación completa por defecto recopilaría más datos de los necesarios.</p>
<h2 id="cambios" class="editorial">
<span class="num">14</span> Cambios al Aviso</h2>
<p>Cada aviso publicado tiene versión y huella de contenido. Los cambios materiales que requieran un nuevo reconocimiento se presentan en la pantalla de reaceptación legal de Cord y se registran contra la versión exacta mostrada. El uso continuado no se describe como “aceptación explícita”. Un cambio de subencargado o transferencia sigue además el procedimiento de aviso y objeción del DPA ejecutado aplicable, si existe.</p>
</div>
</div>
</main>

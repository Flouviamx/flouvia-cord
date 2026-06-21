import fs from 'fs';
import path from 'path';

const contentMap = {
  'actualizar-clabe.md': `Para proteger tus fondos, el cambio de la cuenta CLABE receptora requiere verificación manual por parte de nuestro equipo de compliance.

### Instrucciones para cambiar tu CLABE

1. Inicia sesión como **Administrador (Propietario)** de la cuenta. Los usuarios con rol de Ventas o Desarrollador no verán esta opción.
2. Dirígete a **Ajustes > Facturación y Pagos**.
3. En la sección *Cuenta de Depósito*, haz clic en **Solicitar Cambio**.
4. Se te pedirá subir una **Carátula Bancaria** no mayor a 3 meses de antigüedad. La carátula debe mostrar claramente:
   - El logotipo del banco.
   - El nombre de la Razón Social (debe coincidir con la de tu cuenta Cord).
   - Los 18 dígitos de la cuenta CLABE.

**Tiempo de Resolución:** Nuestro equipo validará el documento en un máximo de **24 horas hábiles**. Durante este tiempo, tus dispersiones automáticas se pausarán. Una vez aprobada, los fondos retenidos se liberarán a la nueva cuenta.`,

  'acuerdos-nda.md': `Para cuentas Enterprise o transacciones corporativas sensibles, Cord facilita la firma electrónica de Acuerdos de Confidencialidad (NDA) antes de revelar los detalles de la cotización.

### Flujo de NDA previo a la Cotización

Si habilitas la opción *Forzar NDA* al crear una cotización:
1. El cliente recibirá un enlace que **no muestra los precios ni las partidas**.
2. En su lugar, verá una pantalla de firma electrónica legalmente vinculante solicitando su nombre, puesto y firma digital.
3. Una vez que el cliente firma el documento, el sistema revela instantáneamente la cotización completa.

**Validez Legal:** Las firmas recolectadas a través de este flujo cumplen con la NOM-151 (México) respecto a firmas electrónicas simples y generan una constancia de conservación que puedes descargar en PDF desde la vista de la cotización.`,

  'api-clientes.md': `El objeto \`Customer\` es fundamental en la arquitectura de Cord, ya que vincula métodos de pago, facturación recurrente e historial crediticio.

### Creación de un Cliente

Para registrar un nuevo cliente desde tu backend, realiza una petición \`POST\` a \`/v1/customers\`:

\`\`\`bash
curl -X POST https://api.flouvia.com/v1/customers \\
  -H "Authorization: Bearer sk_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Acme Corp",
    "email": "pagos@acmecorp.com",
    "tax_id": "ACM190203XYZ",
    "metadata": {
      "erp_id": "CUST-8812"
    }
  }'
\`\`\`

**Campos Clave:**
- \`tax_id\`: Si proporcionas un RFC válido en México, el sistema lo utilizará para emitir facturas (CFDI 4.0) automáticamente si así lo configuras.
- \`metadata\`: Utiliza este objeto (clave-valor) para guardar el ID de tu cliente en tu propio ERP o base de datos. Cord retornará esta metadata en todos los webhooks relacionados al cliente.`,

  'api-cotizaciones.md': `La API de Cotizaciones (Quotes) permite generar propuestas dinámicas programáticamente, ideal para integraciones con CRMs como Salesforce o HubSpot.

### Crear una Cotización (Quote)

Las cotizaciones requieren al menos un \`line_item\` (partida).

\`\`\`javascript
// Ejemplo usando el SDK de Node.js de Cord
const cord = require('cord-node')('sk_live_...');

const quote = await cord.quotes.create({
  customer_id: 'cus_9a8b7c6d',
  expiration_date: 1735689600, // Unix timestamp
  line_items: [
    {
      name: 'Licencia Anual ERP',
      quantity: 1,
      unit_price: 1500000, // En centavos ($15,000.00 MXN)
      tax_rate: 'tx_iva_16'
    }
  ],
  require_signature: true
});

console.log(quote.hosted_url); // Enlace para enviar al cliente
\`\`\`

**Lógica de Precios en Centavos:** Absolutamente todos los montos en la API de Cord se manejan en centavos para evitar errores de precisión de punto flotante. Un precio de \`1500000\` equivale a \$15,000.00.`,

  'api-facturas.md': `El endpoint de \`Invoices\` controla el timbrado de CFDI 4.0 en México. Cuando utilizas este endpoint en modo *Live*, te conectas directamente a nuestro PAC certificado (Facturapi).

### Timbrar una Factura Directa

Si no deseas pasar por el flujo de una cotización y solo quieres generar un CFDI 4.0 (Ingreso):

\`\`\`bash
curl -X POST https://api.flouvia.com/v1/invoices \\
  -H "Authorization: Bearer sk_live_..." \\
  -d '{
    "customer_id": "cus_12345",
    "payment_form": "03", // 03 = Transferencia electrónica de fondos
    "payment_method": "PUE", // Pago en una sola exhibición
    "use": "G03", // Gastos en general
    "items": [
      {
        "product_key": "43231500", // Clave SAT de Software
        "description": "Desarrollo a la medida",
        "price": 5000000
      }
    ]
  }'
\`\`\`

**Generación Asíncrona:** La API responderá con un \`status: processing\`. El timbrado con el PAC puede demorar entre 1 a 5 segundos. Te recomendamos escuchar el evento webhook \`invoice.created\` para saber cuándo descargar el PDF y XML.`,

  'aprobar-rechazar-tratos.md': `Cord permite configurar un flujo de aprobación interno para evitar que los vendedores envíen cotizaciones con descuentos excesivos sin supervisión.

### Configurar Reglas de Aprobación

1. Ve a **Ajustes > Ventas y Cotizaciones**.
2. Busca la sección de **Flujos de Aprobación Internos**.
3. Añade una regla, por ejemplo: *"Si el Descuento Total supera el 15%, requiere aprobación de un Gerente"*.

### Experiencia del Vendedor
Cuando un vendedor intente enviar una cotización que rompa esta regla, el botón de "Enviar al cliente" cambiará a **"Solicitar Aprobación"**. El administrador o gerente recibirá una notificación (correo y dentro de la app).

Una vez que el gerente revisa y hace clic en **Aprobar Trato**, el vendedor recibe luz verde y la URL pública de la cotización se activa. Si es rechazada, la URL arrojará un error 404 al cliente final hasta que se corrijan las condiciones.`,

  'auditorias-seguridad.md': `Para clientes de planes Enterprise, ofrecemos transparencia total sobre nuestras posturas de seguridad.

### Cumplimiento y Certificaciones

- **PCI-DSS Nivel 1:** No almacenamos números de tarjetas de crédito completos. Todo fluye mediante tokens procesados directamente por los adquirentes (Stripe/Conekta).
- **Cifrado:** Los datos en reposo están cifrados usando AES-256. Las transmisiones en tránsito utilizan TLS 1.3.
- **Auditorías Independientes:** Cord se somete a pruebas de penetración (*pentesting*) anuales por firmas de seguridad de terceros.

**Solicitar Reporte de Penetración:**
Si el departamento de TI o *Compliance* de tu empresa requiere nuestro reporte de auditoría más reciente, contacta a tu Account Executive. Para compartirlo, requerimos la firma mutua de un NDA (Acuerdo de Confidencialidad).`,

  'autenticacion-2fa.md': `La Autenticación de Dos Pasos (2FA) añade una capa extra de seguridad. Recomendamos que todo tu equipo lo habilite, en especial quienes tienen rol de Administrador o Finanzas.

### Habilitar 2FA en tu Perfil
1. Haz clic en tu avatar en la esquina superior derecha y selecciona **Mi Perfil**.
2. Bajo *Seguridad*, activa **Autenticación en dos pasos**.
3. Se mostrará un código QR. Escanéalo usando una app como Google Authenticator, Authy o 1Password.
4. Introduce el código de 6 dígitos para confirmar.

**Guardado de Códigos de Respaldo:** El sistema te entregará 10 códigos de un solo uso. ¡Guárdalos en un lugar seguro! Si pierdes tu celular, estos códigos son la única manera de recuperar el acceso a tu cuenta de Cord.

### Forzar 2FA para el Equipo (Organizaciones Enterprise)
Los dueños de cuentas Enterprise pueden forzar a que todos los miembros activen 2FA:
1. Ve a **Ajustes > Seguridad**.
2. Activa *Exigir verificación en dos pasos para todos los miembros*.
Cualquier empleado que no tenga 2FA habilitado será deslogueado y obligado a configurarlo en su próximo inicio de sesión.`,

  'borrar-cuenta.md': `Entendemos que los negocios cambian. Si deseas dar de baja tu cuenta en Cord, el proceso debe realizarse con precaución, ya que implica la retención de datos fiscales por ley.

### Procedimiento de Cierre

1. **Liquida facturas pendientes:** Asegúrate de que no existan facturas en estatus \`PPD\` pendientes de un Complemento de Pago (REP).
2. **Descarga tu información:** Exporta tus clientes, cotizaciones y archivos XML. Una vez borrada la cuenta, perderás acceso a la interfaz web.
3. Envía un correo a \`soporte@flouvia.com\` desde el correo del Administrador principal solicitando la baja.

**Retención de Datos Fiscales:** Por cumplimiento con las leyes de prevención de lavado de dinero e infraestructura fiscal en México (CFF), aunque cerremos tu acceso a la plataforma, Cord está obligado a mantener el historial de tus comprobantes fiscales timbrados durante 5 años. La eliminación no borra el registro de los CFDI emitidos ante el SAT.`,

  'cambiar-frecuencia-pagos.md': `Por defecto, todas las cuentas de Cord tienen una dispersión de fondos (Payout) **Automática Diaria**. Esto significa que todos los pagos liquidados de tarjetas (T+1) y transferencias se envían juntos a tu CLABE a las 6:00 AM (hora de la CDMX).

### Configurar Dispersiones Manuales

Si prefieres tener el dinero "guardado" en tu balance de Cord y enviarlo a tu banco manualmente solo cuando lo necesites (para cuadrar caja semanal, por ejemplo):

1. Ve a **Pagos > Dispersiones**.
2. Haz clic en el ícono de engranaje (Ajustes de Dispersión).
3. Cambia la frecuencia de *Automática* a *Manual*.

A partir de este momento, deberás entrar al panel y hacer clic en el botón **Retirar Fondos** e ingresar la cantidad deseada. Los fondos enviados de forma manual llegarán a tu cuenta CLABE vía SPEI en un lapso de 1 a 3 horas hábiles.`,

  'cambiar-razon-social.md': `Cambiar la Razón Social y RFC de tu cuenta operativa es un procedimiento crítico, ya que impacta la facturación en vivo y la emisión de comprobantes.

### Proceso de Migración Fiscal

No existe un botón para "cambiar el RFC" directamente, ya que las facturas pasadas no pueden migrar de emisor. Si tu empresa cambió legalmente de Razón Social:

1. **Crea una nueva organización:** Dentro de Cord, puedes pertenecer a múltiples organizaciones. Haz clic en el nombre de tu empresa arriba a la izquierda y selecciona *Crear nueva organización*.
2. Registra los nuevos datos (RFC, Razón Social, CSD del SAT).
3. Contacta a soporte para que transfiramos tu plan de suscripción actual a la nueva cuenta.
4. Exporta tu catálogo de clientes de la cuenta vieja e impórtalo en la nueva.

Este método garantiza que tu historial contable previo se mantenga intacto e inmutable bajo el RFC anterior para efectos de auditoría del SAT.`,

  'cancelar-cfdi-relacionados.md': `El SAT es muy estricto cuando intentas cancelar una factura (Ingreso) que ya tiene documentos relacionados, como Notas de Crédito (Egreso) o Complementos de Pago (REP). El SAT arrojará un error 400 indicando que el CFDI no es cancelable.

### Pasos para desenredar un CFDI relacionado

Para lograr la cancelación, debes "romper" la cadena de atrás hacia adelante:

1. Localiza el Complemento de Pago (REP) o Nota de Crédito que está relacionado a la factura principal.
2. **Cancela primero ese documento secundario.** Utiliza el motivo \`02 - Comprobante emitido con errores sin relación\`.
3. Espera 5 minutos a que el SAT procese la cancelación del documento hijo y su estatus pase a *Cancelado*.
4. Ahora, ve a la factura principal y solicita su cancelación. Si vas a sustituirla, usa el motivo \`01 - Comprobante emitido con errores con relación\`. De lo contrario, usa el motivo \`02\`.

Cord simplifica esto mostrando un árbol de relaciones en la vista de la factura, indicándote exactamente qué documento bloquea a cuál.`,

  'cancelar-facturas.md': `El proceso de cancelación de un CFDI 4.0 en Cord sigue las normativas dictadas por el SAT.

### Motivos de Cancelación (Catálogo SAT)

Al hacer clic en "Cancelar Factura", el sistema te pedirá elegir un motivo obligatorio:
- **01 (Errores con relación):** Úsalo cuando te equivocaste en el precio o concepto y vas a emitir una factura nueva que reemplaza a esta. *Importante:* Primero debes emitir la nueva factura relacionando la original, y luego cancelar la original apuntando a la nueva.
- **02 (Errores sin relación):** Úsalo cuando te equivocaste en el RFC del cliente. Cancela y vuelve a hacerla de cero.
- **03 (No se llevó a cabo la operación):** Úsalo si la venta simplemente se cayó y nunca se pagó.
- **04 (Operación nominativa relacionada en global):** Exclusivo para público general.

### Cancelaciones con Aceptación
Si el monto supera los $1,000 MXN o han pasado más de 24 horas, el SAT pondrá la cancelación en estado *En Proceso*. Tu cliente recibirá un aviso en su Buzón Tributario y tiene 72 horas para aceptarla o rechazarla. Si no responde en ese plazo, el SAT la cancelará automáticamente (Negativa Ficta).`,

  'catalogo-clientes-rfc.md': `El manejo de clientes en Cord está pensado para evitar rechazos del SAT al emitir CFDI 4.0.

### Validación en tiempo real (CFDI 4.0)

En la versión 4.0 del CFDI, el Nombre/Razón Social y el Código Postal deben coincidir letra por letra con la Constancia de Situación Fiscal (CSF) del cliente.
Cuando añades un cliente en Cord:
1. El sistema valida el Código Postal contra el listado oficial del SAT.
2. Si la Razón Social incluye el régimen societario (ej. "ACME S.A. DE C.V."), Cord lo **limpiará automáticamente** a "ACME", ya que el SAT rechaza facturas que incluyen el "SA de CV".

**Tip de importación masiva:** Si vienes de otro sistema, usa nuestra herramienta de importación por CSV. Asegúrate de que las columnas de Nombre y Código Postal vengan directamente de la CSF de tus clientes para evitar bloqueos operativos futuros.`,

  'catalogos-sat-claves.md': `Cada partida (concepto) que factures necesita contar obligatoriamente con una Clave de Producto/Servicio y una Clave de Unidad, según los catálogos del SAT.

### ¿Cómo configurarlo en Cord?

No necesitas aprenderte los códigos. En la sección de **Productos/Inventario**:
1. Crea o edita un producto.
2. Ve al apartado de *Información Fiscal*.
3. En **Clave SAT**, simplemente escribe lo que vendes (ej. "Software" o "Consultoría"). El buscador predictivo de Cord te mostrará las claves válidas (ej. \`43231500\` para Software de negocio).
4. En **Unidad SAT**, busca por descripción (ej. "Servicio", "Pieza"). El sistema asignará el código correcto (ej. \`E48\` para Unidad de Servicio, o \`H87\` para Pieza).

Una vez configurado en el catálogo de productos de Cord, cualquier vendedor podrá cotizar estos ítems y el sistema fiscal heredará estas claves de manera invisible y automática al timbrar la factura.`,

  'cfdi-traslado.md': `Actualmente, la plataforma principal de Cord está enfocada en empresas de tecnología, servicios B2B y agencias, por lo que **los CFDI de Traslado (Carta Porte) no están soportados de forma nativa en el dashboard**.

Nuestro motor de facturación está optimizado para:
- CFDI de Ingreso (Facturas, Recibos de Honorarios, Recibos de Arrendamiento).
- CFDI de Egreso (Notas de Crédito).
- CFDI de Recepción de Pagos (Complementos / REP).

Si tu empresa se dedica a la logística o al transporte de mercancías por vías federales y requieres timbrar Complementos Carta Porte versión 3.0, te sugerimos utilizar la API de nuestro proveedor directo de timbrado (Facturapi) conectando tu propio ERP, ya que su llenado requiere decenas de nodos específicos sobre vehículos, operadores y aseguradoras que no gestionamos en Cord.`,

  'claves-api.md': `Tus Claves de API son la puerta de entrada a tu cuenta. Trátalas con el mismo cuidado que la contraseña de tu base de datos.

### Entornos (Live vs Test)

En la sección **Desarrolladores > Claves API** encontrarás dos pares de llaves:
- **Test Mode (\`sk_test_...\`):** Úsalas para desarrollar. No generan cargos reales a tarjetas ni timbran facturas reales ante el SAT (las simulan).
- **Live Mode (\`sk_live_...\`):** Úsalas en tu entorno de producción. Todo cargo es real y todo CFDI tiene validez legal.

### Rotación de Llaves
Si sospechas que tu llave secreta se ha filtrado (ej. se subió por error a GitHub):
1. Ingresa inmediatamente al panel de Claves API.
2. Haz clic en el botón de los tres puntos junto a tu llave viva y selecciona **"Rotar Clave (Roll Key)"**.
3. El sistema te dará una llave nueva al instante y tienes la opción de que la vieja deje de funcionar de inmediato, o darle un periodo de gracia de 24 horas para que actualices tus servidores sin tirar tu aplicación en producción.`,

  'clonacion-cotizaciones.md': `Si envías propuestas similares frecuentemente a distintos prospectos (ej. renovaciones de software o paquetes estándar), no es necesario crear cada cotización desde cero.

### ¿Cómo clonar una cotización?

1. Entra a **Ventas > Cotizaciones**.
2. Busca la cotización que deseas duplicar (puede estar en estatus de borrador, enviada o incluso rechazada).
3. Haz clic en el menú contextual de tres puntos a la derecha y selecciona **Duplicar Cotización**.
4. Se generará un nuevo Borrador exacto.

**Lo que sí se copia:**
- Todas las partidas, descripciones y precios.
- Descuentos aplicados e impuestos.
- Términos legales, garantías y vigencia relativa.

**Lo que NO se copia:**
- El cliente (se te pedirá seleccionar a quién va dirigida esta nueva propuesta).
- El historial de firmas o pagos. Cada clon es un folio completamente virgen.`,

  'cobro-divisas.md': `Cord te permite enviar cotizaciones en monedas extranjeras (ej. USD o EUR) mientras mantienes tu contabilidad y depósitos en México.

### ¿Cómo funciona el tipo de cambio?

1. Si creas una cotización en \`USD\`, tu cliente verá el monto en dólares.
2. Al momento en que el cliente decide pagar mediante el portal de Cord, nuestro procesador tomará el tipo de cambio FIX interbancario del momento.
3. Al cliente se le hará el cargo equivalente en su tarjeta, y a ti **se te depositarán Pesos Mexicanos (MXN)** en tu cuenta CLABE.

### Facturación en Moneda Extranjera
Si el cliente requiere factura (CFDI) y la operación fue en dólares, Cord emitirá la factura indicando \`Moneda: USD\` e incluirá automáticamente el nodo de \`TipoCambio\` oficial del Diario Oficial de la Federación (DOF) del día del cobro. Esto asegura que el SAT reciba el valor correcto de los impuestos trasladados convertidos a pesos para tu declaración mensual.`,

  'comisiones-tarifas.md': `La transparencia es nuestra filosofía. En Cord, no hay cobros ocultos por mantenimiento ni penalizaciones por montos mínimos.

### Tarifas Transaccionales (Procesamiento de Pagos)

Solo pagas cuando tus clientes te pagan usando nuestra pasarela integrada:
- **Tarjetas de Crédito / Débito (Nacional):** 3.6% + $3.00 MXN + IVA por transacción exitosa.
- **Tarjetas Internacionales:** 4.6% + $3.00 MXN + IVA.
- **Transferencia SPEI Automatizada:** $10.00 MXN fijos por transacción (sin importar si son mil o un millón de pesos).

*Las tarifas de procesamiento se descuentan del monto bruto antes de depositar a tu cuenta CLABE.*

### Emisión de CFDI (Timbrado)
Todos los planes de suscripción de Cord incluyen una cuota mensual que te permite el acceso a la plataforma. El timbrado de facturas 4.0 está incluido de forma ilimitada y sin costo adicional (Política de Uso Justo: máximo 10,000 folios al mes).`,

  'complementos-de-pago.md': `Cuando emites una factura bajo el método de pago PPD (Pago en Parcialidades o Diferido), el SAT exige que generes un "Complemento de Recepción de Pagos" (REP) cada vez que el cliente te envíe un abono.

### Automatización Mágica en Cord

Si utilizas las facturas y links de pago de Cord en conjunto, **tú no tienes que hacer absolutamente nada**.
1. Cotizas y facturas en PPD (ej. a 30 días de crédito).
2. El cliente te paga el día 25 usando el link de la factura.
3. En el milisegundo en que el banco aprueba la tarjeta o recibimos el SPEI, Cord emite el Complemento de Pago (REP) ante el SAT, lo relaciona con el UUID de la factura PPD, y se lo envía por correo al cliente.

### Complemento Manual (Pago externo)
Si el cliente te hizo una transferencia a una cuenta de banco externa que no controlamos:
1. Entra a la Factura en Cord.
2. Haz clic en **Registrar Pago**.
3. Indica la fecha, el monto y la cuenta receptora.
4. Cord timbrará el REP basándose en esos datos y liquidará el balance de la factura.`,

  'conciliacion-depositos.md': `La peor pesadilla contable es recibir un depósito agrupado del procesador de pagos y no saber qué facturas está pagando. Cord resuelve esto con conciliación nativa.

### El Reporte de Dispersión (Payout Report)

Cada vez que Cord envía dinero a tu cuenta bancaria (ej. un depósito de $50,000 MXN), generamos un reporte exacto de lo que compone ese dinero.

1. Ve a **Pagos > Balance y Dispersiones**.
2. Haz clic sobre cualquier dispersión completada.
3. Verás un desglose línea por línea:
   - "Factura F-102: +$30,000"
   - "Factura F-103: +$21,000"
   - "Comisión Cord: -$1,000"
   - **Neto Depositado: $50,000**

Puedes exportar este detalle en formato CSV o PDF. Tu departamento de contabilidad solo tiene que tomar este archivo y subirlo a su sistema ERP para matar de un solo golpe las cuentas por cobrar, logrando una conciliación a nivel centavo y sin trabajo manual.`,

  'configurar-webhooks.md': `Los webhooks son llamadas HTTP (callbacks) que nuestro servidor hace al tuyo cuando ocurre un evento importante de manera asíncrona (ej. un cliente pagó, o una factura se timbró).

### Registro de un Endpoint

Para recibir webhooks, primero necesitas exponer una ruta \`POST\` en tu servidor (ej. \`https://api.tuempresa.com/webhooks/cord\`).
1. Ve a **Desarrolladores > Webhooks** en el panel de Cord.
2. Añade tu URL.
3. Selecciona a qué eventos deseas suscribirte. Te recomendamos iniciar con \`charge.succeeded\` y \`invoice.created\`.

### Verificación de Firmas

Por seguridad, alguien podría simular ser Cord y enviarte eventos falsos para intentar hackear tu inventario. **Es obligatorio que valides la firma criptográfica** que enviamos en los headers de cada petición.

El header se llama \`Cord-Signature\` e incluye un timestamp y el hash HMAC SHA-256. Utiliza el *Webhook Secret* que te proporcionamos al crear el endpoint para verificarlo. [Ver fragmentos de código de verificación en Node.js y Python](/soporte/firmas-webhooks).`,

  'cord-elements.md': `Cord Elements es una librería de componentes UI *drop-in* (listos para usar) que te permite embeber el poder de Cord directamente dentro del sitio web de tu aplicación, sin que el cliente sepa que existimos.

### Beneficios

- **Menos abandono:** El cliente nunca sale de tu dominio (ej. \`app.tuempresa.com/checkout\`) para pagar o aceptar una cotización.
- **Cumplimiento PCI:** Los componentes inyectan iframes seguros que recolectan los datos de la tarjeta. La información sensible jamás toca tus servidores, eximiéndote de auditorías PCI pesadas.

### Elementos Disponibles

1. **Payment Element:** Una caja de pago que soporta tarjetas, transferencias y meses sin intereses dinámicamente.
2. **Quote Element:** Muestra una cotización B2B interactiva dentro de tu portal de clientes.
3. **Customer Portal Element:** Permite a tus usuarios descargar sus propias facturas XML/PDF y actualizar sus datos fiscales directamente en tu sitio.

Para instalar Elements, simplemente añade la etiqueta de script en tu \`<head>\` y monta los componentes usando nuestro [SDK de frontend](/soporte/react-sdk).`,

  'cotizaciones-multimoneda.md': `Cord soporta nativamente la emisión de propuestas comerciales en más de 100 divisas. 

### ¿Cómo crear una cotización en otra moneda?

Al momento de redactar la cotización, en la sección de **Configuración Global** (panel derecho), verás un selector de Moneda (Currency).
1. Cambia de \`MXN - Peso Mexicano\` a \`USD - Dólar Estadounidense\` o \`EUR - Euro\`.
2. Todos los precios de tus conceptos ingresados se leerán bajo esa nueva divisa.

### Impacto en la Facturación y Pagos

- **Para tu cliente:** Recibirá el documento y la liga de pago mostrando dólares (ej. $10,000 USD). Si paga con tarjeta, su banco le hará el cargo en dólares o en su moneda local según su contrato bancario.
- **Para ti (Factura):** Cord timbrará automáticamente el CFDI ante el SAT indicando \`Moneda: USD\` y buscará el \`TipoCambio\` del Diario Oficial de la Federación correspondiente a ese día.
- **Para ti (Dinero):** Nuestro motor de pagos liquidará la operación en tu cuenta bancaria mexicana **en Pesos (MXN)** usando una tasa cambiaria mayorista competitiva al momento de la captura.`,

  'csd-vencido.md': `Para que Cord (o cualquier PAC) pueda emitir facturas legales en tu nombre, requieres cargar tu **Certificado de Sello Digital (CSD)**. ¡Atención! El CSD no es la FIEL (e.firma).

### ¿Por qué mi CSD aparece vencido o revocado?

Los CSD emitidos por el SAT tienen una vigencia estricta de **4 años**. Si llega a su límite, todas tus facturas y cobranza automática fallarán con un error criptográfico.
Además, el SAT puede **revocar** tu CSD antes de tiempo como medida precautoria si detecta anomalías severas (ej. no presentar declaración anual o no ser localizado en tu domicilio fiscal).

### Cómo actualizar tu CSD en Cord

1. Entra a **Ajustes > Fiscal y SAT**.
2. En la sección *Certificado de Sello Digital*, verás el estado de tu sello actual.
3. Haz clic en **Reemplazar CSD**.
4. Sube tu nuevo archivo \`.cer\`, tu nuevo archivo \`.key\` y la contraseña correspondiente.

**Tip de Tiempo:** Después de tramitar un nuevo CSD en el portal del SAT (Certifica), tarda **entre 24 y 72 horas** en propagarse por todos los servidores del SAT a nivel nacional (el famoso LCO). Si lo subes a Cord el mismo día que lo sacaste, el timbrado fallará indicando que "El CSD no se encuentra en la lista de sellos válidos". Debes tener paciencia.`,

  'cumplimiento-pci-dss.md': `El Estándar de Seguridad de Datos para la Industria de Tarjeta de Pago (PCI DSS) es un conjunto de requerimientos para garantizar que todas las empresas que procesan, almacenan o transmiten información de tarjetas de crédito mantengan un entorno seguro.

### Tu responsabilidad al usar Cord

Debido a que utilizas la infraestructura de Cord o Cord Elements para cobrar:
**Tú NO tocas datos sensibles.** 

Cuando el cliente escribe su número de tarjeta de 16 dígitos, esos datos viajan encriptados directamente desde su navegador hasta los servidores de los bancos adquirentes mediante iframes de seguridad. Tu aplicación solo recibe un "Token" criptográfico asimétrico que representa la tarjeta (ej. \`tok_123abc\`).

Esto significa que, para efectos legales y de auditoría, tu empresa se beneficia de nuestro cumplimiento Nivel 1. Únicamente necesitas responder un Cuestionario de Autoevaluación (SAQ-A) muy simple que atestigua que has delegado por completo el procesamiento de tarjetas a nosotros.`,

  'descargar-xml.md': `Mantener el orden en tu contabilidad es fundamental, especialmente para la conciliación mensual. 

### Descarga Masiva de CFDI

En lugar de bajar facturas una por una, puedes descargar todas las de un periodo específico en formato `.ZIP` (conteniendo los PDFs y XMLs estructurados).

1. Ve al módulo **Contabilidad > Facturas**.
2. En la esquina superior derecha, haz clic en el botón de **Exportar**.
3. Selecciona el rango de fechas (ej. Todo el mes de Octubre).
4. Elige si quieres exportar solo los XML, solo PDFs, o ambos.
5. El sistema procesará la solicitud en *background*. Si seleccionaste cientos de facturas, recibirás un correo electrónico en un lapso de 2 a 5 minutos con un enlace seguro de descarga válido por 24 horas.

> **Importante para Contadores:** El archivo ZIP contiene carpetas separadas por CFDI de Ingreso, Egreso (Notas de crédito) y Pagos (REP), para que la subida a tu software contable sea lo más limpia y rápida posible.`,

  'descuentos-promociones.md': `La flexibilidad en la negociación B2B es vital. Cord te permite aplicar descuentos tanto a nivel de concepto individual como a nivel global en la cotización.

### Tipos de Descuento

**1. Descuento Lineal (Por partida):**
Ideal si solo quieres hacer un descuento en un servicio particular (ej. 20% off en la consultoría, pero la licencia de software va a precio completo).
- En el editor de la cotización, haz clic en el ícono de descuento \`%\` al lado del precio del concepto. Puedes aplicarlo como porcentaje o como monto fijo (ej. -$500 MXN).

**2. Descuento Global:**
Aplica a la suma total del subtotal.
- En el panel derecho de configuración, bajo *Finanzas*, añade un descuento global.

**¿Cómo lo ve el SAT?**
Cuando la cotización se convierte en una Factura (CFDI 4.0), Cord mapea los descuentos de manera perfecta al XML fiscal en el nodo de \`Descuento\`, de modo que el cálculo del IVA trasladado se hace sobre la base gravable correcta, evitando descuadres contables y errores matemáticos ante el SAT.`,

  'emitir-cfdi.md': `La emisión de un Comprobante Fiscal Digital por Internet (CFDI) versión 4.0 está totalmente integrada en tu flujo de ventas.

### De Cotización a Factura en un Clic

El flujo ideal y recomendado en Cord es:
1. El cliente acepta tu cotización online.
2. Automáticamente, esa cotización ganada te mostrará un botón verde gigante: **Emitir Factura**.
3. Al hacer clic, todos los conceptos, precios, descuentos e impuestos se copian directamente al borrador de la factura.
4. Selecciona el **Uso de CFDI** (ej. Gastos en general) y el **Método de Pago** (PUE o PPD).
5. Haz clic en "Timbrar Factura". En 2 segundos, el XML y PDF estarán disponibles y se enviarán al cliente.

### Facturación Directa (Sin Cotización)
Si solo quieres facturar algo rápidamente sin enviar una propuesta comercial antes:
1. Ve a **Contabilidad > Facturas**.
2. Haz clic en **Nueva Factura**.
3. Selecciona el cliente, añade los conceptos manualmente, y timbra. El resultado legal y operativo es exactamente el mismo.`,

  'emitir-reembolsos.md': `En ocasiones es necesario devolver dinero a un cliente (por cancelación de servicio, insatisfacción o error).

### Emitir un Reembolso (Refund) desde el Dashboard

1. Ve a **Pagos > Transacciones**.
2. Localiza el cargo que deseas reembolsar y ábrelo.
3. En la esquina superior derecha, haz clic en **Reembolsar**.
4. Puedes elegir hacer un *Reembolso Completo* o un *Reembolso Parcial* (escribiendo el monto específico a devolver).

**Consecuencias de un Reembolso:**
- **Dinero:** El procesador de pagos solicitará al banco emisor que devuelva el dinero a la tarjeta del cliente (tarda de 5 a 10 días hábiles en verse reflejado en su estado de cuenta). Los fondos se descontarán de tus próximas dispersiones de Cord.
- **Impuestos:** Las comisiones originales de procesamiento que Cord te cobró por esa transacción no son reembolsables.
- **Facturación:** Emitir un reembolso en el motor de pagos **NO** cancela automáticamente el CFDI asociado ante el SAT. Debes ir a la factura correspondiente y emitir una Nota de Crédito (Egreso) de forma separada para estar contablemente sano.`,

  'envio-masivo-facturas.md': `Si tienes decenas o cientos de facturas recurrentes o generadas mediante la API y quieres asegurarte de que tus clientes las reciban y las paguen rápido, no tienes que enviar correos manuales.

### Automatización de Envío

Puedes apoyarte en el módulo de Cobranza de Cord:
1. Ve a **Contabilidad > Facturas**.
2. Utiliza las casillas de selección izquierda para marcar múltiples facturas (puedes usar el filtro "Con saldo pendiente").
3. Haz clic en el botón de "Acciones Masivas" y selecciona **Enviar recordatorio de pago**.

El sistema despachará una ráfaga de correos electrónicos a todos los clientes seleccionados. Cada correo estará personalizado con su nombre, el saldo adeudado y un enlace único a su portal de cliente donde pueden descargar su PDF/XML y ver el botón de pago con tarjeta.

Para programar estos envíos automáticamente a final de mes, te sugerimos utilizar la [API de Cobranza Inteligente](/soporte/cord-elements).`
};

for (const [filename, newBody] of Object.entries(contentMap)) {
  const filePath = path.join(dir, filename);
  if (!fs.existsSync(filePath)) continue;

  const content = fs.readFileSync(filePath, 'utf-8');
  const frontmatterMatch = content.match(/^---([\s\S]*?)---/);
  if (!frontmatterMatch) continue;
  
  const frontmatter = frontmatterMatch[1];
  const fullFile = `---${frontmatter}---\n\n${newBody}\n`;
  
  fs.writeFileSync(filePath, fullFile);
}

console.log('Batch 1 (32 files) heavily enriched and rewritten successfully.');

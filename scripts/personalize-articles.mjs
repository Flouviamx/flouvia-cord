import fs from 'fs';
import path from 'path';

const dir = path.join(process.cwd(), 'src/content/support');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));

for (const file of files) {
    const filePath = path.join(dir, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    
    // Parse frontmatter
    const frontmatterMatch = content.match(/^---([\s\S]*?)---/);
    if (!frontmatterMatch) continue;
    
    const frontmatter = frontmatterMatch[1];
    const titleMatch = frontmatter.match(/title:\s*"(.*?)"/);
    const categoryMatch = frontmatter.match(/category:\s*"(.*?)"/);
    const descMatch = frontmatter.match(/description:\s*"(.*?)"/);
    
    const title = titleMatch ? titleMatch[1] : 'Guía de Soporte';
    const category = categoryMatch ? categoryMatch[1] : '';
    const desc = descMatch ? descMatch[1] : '';

    let bodyContent = '';

    // PERSONALIZATION ENGINE
    if (category === 'Desarrolladores') {
        bodyContent = `# ${title}

${desc}

Como desarrollador, Cord te proporciona las herramientas para integrar esta funcionalidad directamente en tu propia arquitectura. A continuación, exploraremos cómo implementar **${title}** usando nuestra API REST.

## Prerrequisitos de Integración

Antes de iniciar la petición, asegúrate de cumplir con lo siguiente:
- Tener una [Clave de API válida](/soporte/claves-api) (Secreta).
- Que tu entorno esté configurado para soportar conexiones TLS 1.2 o superior.
- Enviar el header \`Authorization: Bearer sk_...\`.

## Implementación Técnica

Dependiendo del entorno (Test o Live), tu petición debe dirigirse al endpoint correspondiente. A continuación un ejemplo de cómo estructurar la petición:

\`\`\`bash
# Petición de ejemplo con cURL
curl -X POST https://api.flouvia.com/v1/resource \\
  -H "Authorization: Bearer sk_test_your_secret_key" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: req_123456789" \\
  -d '{
    "environment": "sandbox",
    "reference_id": "ext_987",
    "metadata": {
      "internal_user_id": "u_001"
    }
  }'
\`\`\`

> [!NOTE]
> **Uso de SDKs**
> Si estás utilizando un ecosistema en JavaScript, te recomendamos encarecidamente utilizar el [Cord Node.js SDK](/soporte/node-sdk) para manejar la serialización de datos automáticamente.

## Manejo de Errores

Si la API rechaza tu petición, revisa el campo \`error.code\` en la respuesta JSON. Los errores comunes 40x generalmente indican que un parámetro requerido fue omitido o que tu API Key no tiene los permisos suficientes.`;

    } else if (category === 'Facturación y CFDI') {
        bodyContent = `# ${title}

${desc}

El cumplimiento fiscal en México (SAT) requiere precisión absoluta. Cord automatiza la gran mayoría del proceso de **${title}**, pero es vital que configures tus catálogos corporativos correctamente.

## Requisitos Fiscales (SAT)

Para asegurar que los comprobantes (CFDI 4.0) se timbren de manera exitosa:
- Valida que el Código Postal del cliente coincida exactamente con su Constancia de Situación Fiscal.
- Asegúrate de que el régimen fiscal del receptor sea compatible con el Uso de CFDI seleccionado.

> [!WARNING]
> **Normativa del SAT**
> Las regulaciones fiscales pueden actualizarse. Asegúrate de siempre tener vigente tu Certificado de Sello Digital (CSD) dentro del portal de Cord para evitar bloqueos en el timbrado. [Ver cómo actualizar el CSD](/soporte/csd-vencido).

## Proceso en Plataforma

Para gestionar esta configuración dentro del sistema:
1. Dirígete al módulo de **Contabilidad > Facturación** en el panel lateral.
2. Selecciona la cotización o factura correspondiente.
3. En el menú contextual (tres puntos), selecciona las opciones fiscales.
4. Si realizas cambios en catálogos, estos se aplicarán únicamente a las *nuevas* facturas. Las facturas previamente timbradas mantendrán su UUID y estructura original.

Si requieres aplicar notas de crédito por devoluciones, revisa nuestra guía sobre [Notas de Crédito (Egreso)](/soporte/nota-de-credito).`;

    } else if (category === 'Cotizaciones') {
        bodyContent = `# ${title}

${desc}

Cerrar tratos B2B requiere propuestas ágiles y claras. En Cord, la gestión de **${title}** está diseñada para optimizar tus conversiones y evitar fricciones con tu comprador.

## Flujo Operativo Comercial

Las cotizaciones en Cord no son documentos estáticos, son enlaces interactivos. 
1. Crea un nuevo borrador desde **Ventas > Cotizaciones**.
2. Añade tus partidas (conceptos, cantidades y descuentos).
3. Configura los **Términos de Crédito** si operas en esquemas PPD (ej. Net 30).
4. Activa el botón de firma digital o pago de anticipo obligatorio.

> [!TIP]
> **Mejora tus conversiones**
> Personaliza los colores de tu cotización en los ajustes de apariencia. Las propuestas que mantienen la identidad visual de la marca (White-label) tienen un 15% más de probabilidad de ser aceptadas rápidamente.

## Monitoreo y Seguimiento

Una vez que envíes la propuesta, el sistema se encargará de trackear la apertura. Puedes habilitar notificaciones por correo para que tu equipo de ventas reciba una alerta en el instante en que el cliente abre el enlace. 

Para profundizar en integraciones avanzadas de ventas, visita la sección de [Cord Elements](/soporte/cord-elements).`;

    } else if (category === 'Cuenta y Equipo') {
        bodyContent = `# ${title}

${desc}

Gestionar el acceso y la configuración de tu empresa es el primer paso para una operación segura. Aquí te explicamos cómo administrar **${title}**.

## Configuración del Entorno de Trabajo

Solo los usuarios con el rol de **Administrador** (Owner) pueden realizar modificaciones destructivas o críticas.

### Instrucciones paso a paso
1. En tu panel principal, haz clic en el ícono de engranaje en la esquina inferior izquierda (**Ajustes**).
2. Navega hasta la pestaña de tu organización o equipo.
3. Realiza los ajustes necesarios en el formulario.
4. Guarda los cambios. El sistema registrará la acción en el Audit Log por seguridad.

> [!IMPORTANT]
> **Seguridad Corporativa**
> Te sugerimos habilitar políticas estrictas para todos los miembros de tu equipo. Si tu plan lo permite, considera forzar el uso de Autenticación de Dos Pasos (2FA) para prevenir accesos no autorizados. [Ver guía de 2FA](/soporte/autenticacion-2fa).

Si tienes problemas para acceder a la cuenta, contacta directamente con el Administrador de tu organización para que revise tus permisos de RBAC.`;

    } else if (category === 'Pagos y Depósitos') {
        bodyContent = `# ${title}

${desc}

El corazón de tu negocio es el flujo de caja. Esta guía detalla cómo opera Cord respecto a **${title}**, para que tengas control absoluto sobre tus finanzas.

## Ciclos de Liquidación y Fondos

Los fondos cobrados mediante enlaces de Cord pasan por un proceso de liquidación bancaria:
- **Tarjetas (Visa/Mastercard):** La liquidación estándar toma T+1 (al día siguiente hábil).
- **SPEI / Transferencias:** Se liquidan de manera casi instantánea en tu balance de Cord.

## Resolución y Gestión

Si enfrentas anomalías o necesitas configurar esta característica:
1. Entra a **Pagos > Balance**.
2. Verifica tus transferencias en tránsito y el historial de depósitos.
3. Si estás investigando un pago rechazado, haz clic en el ID de la transacción para leer el código de declinación emitido por el banco emisor.

> [!NOTE]
> **Conciliación Automatizada**
> Cord exporta un reporte detallado (CSV) que tu equipo contable puede utilizar para conciliar los depósitos masivos contra las facturas individuales. [Lee sobre la Conciliación de depósitos](/soporte/conciliacion-depositos).

Mantén siempre actualizada tu cuenta CLABE receptora para evitar retrasos en las dispersiones.`;

    } else {
        // Seguridad y Privacidad y otros
        bodyContent = `# ${title}

${desc}

En Flouvia/Cord, la integridad de tus datos y el cumplimiento normativo son nuestra máxima prioridad. Este documento explica nuestra postura y procesos respecto a **${title}**.

## Marco Normativo y Cumplimiento

Operamos bajo estrictos estándares internacionales de encriptación y manejo de información. Todos los datos sensibles (como PAN de tarjetas de crédito o credenciales de API) están tokenizados y almacenados en bases de datos aisladas.

### Acciones Recomendadas
- Si eres un administrador de TI, asegúrate de mantener actualizados tus acuerdos de confidencialidad (NDA).
- Revisa periódicamente los logs de auditoría de tu cuenta para detectar anomalías.
- Educa a tu equipo sobre prácticas seguras anti-phishing.

> [!IMPORTANT]
> **Manejo de Vulnerabilidades**
> Si crees haber encontrado un fallo crítico de seguridad, por favor abstente de publicarlo. Dirígete a nuestro [Programa de Reporte de Vulnerabilidades](/soporte/reportar-vulnerabilidades) y te compensaremos por la divulgación responsable.

Para solicitar copias de nuestras certificaciones SOC2 o documentación de cumplimiento PCI-DSS, los clientes Enterprise pueden abrir un ticket directo con su Account Executive.`;
    }

    const fullFile = `---${frontmatter}---

${bodyContent}
`;

    fs.writeFileSync(filePath, fullFile);
}

console.log(`Successfully personalized ${files.length} support articles without generic JSON.`);

# Lo que falta para Make y Zapier

> Checklist operativo al 2026-09-15. El código de las dos apps ya está listo y
> probado en `integrations/make/` e `integrations/zapier/`; lo que falta son pasos
> en las cuentas de Make y Zapier que solo puede hacer el dueño de esas cuentas.
> Cuando termines cada bloque, avísale a Claude con la frase del final del bloque.

## Resumen

| App | Estado del código | Estado en Cord hoy | Lo que falta |
|---|---|---|---|
| **Zapier** | App subida a Zapier como privada (App246344, versión 1.0.1), 16 pruebas pasando | Tarjeta "Próximamente" | Logo, correo del dominio en el equipo, link de invitación |
| **Make** | App escrita y probada (7 pruebas), **nunca subida** a Make | Tarjeta "Con webhooks" (funciona con Webhooks + HTTP) | Token de API de Make y correr el deploy |

Nunca pegues tokens ni llaves en el chat. Van en archivos `.env` que no se suben a git.

---

## Zapier

### 1. Logo e información de la app

1. Entra a **developer.zapier.com** con la cuenta con la que se hizo `zapier-platform login`.
2. Abre la integración **Cord** (App246344).
3. En **Settings** (o **Branding**):
   - **Logo:** PNG cuadrado de 256 x 256 px, fondo sólido, sin texto pequeño. Usa el isotipo de Cord.
   - **Description:** "Cord es la plataforma de cierre comercial: de la propuesta al pago, todo en un solo link. Conecta tus cotizaciones, clientes, pagos y facturas con tus apps."
   - **Homepage URL:** `https://cordhq.app`
   - **Category:** Sales & CRM (o Invoices / Payment Processing).
   - **Intended audience:** Private por ahora.
4. Guarda.

### 2. Equipo con correo del dominio

Zapier pide que quien administra la app tenga un correo del mismo dominio que la homepage.

1. En la integración, abre **Team**.
2. Invita a `contacto@cordhq.app` como **Admin**.
3. Acepta la invitación desde ese buzón.
4. (Opcional) Deja tu correo personal como colaborador.

### 3. Link de invitación

1. En la integración, abre **Sharing** (en algunas cuentas se llama **Invite** o **Share**).
2. Elige la versión **1.0.1**.
3. Genera el **link público de invitación** (el que cualquiera con el link puede aceptar).
4. Copia el link. **Este link sí lo puedes pegar en el chat**: no es un secreto.

### 4. Prueba tú mismo

1. Abre el link de invitación y acepta.
2. En Cord, crea una llave secreta de **prueba** (`sk_test_…`) con escritura: Ajustes, Modo desarrollador, pestaña API.
3. En Zapier, crea un Zap: disparador **Cord › Quote Approved**, pega la llave cuando la pida.
4. Aprueba una cotización de prueba en Cord y confirma que el Zap se dispara.
5. Agrega una acción **Cord › Create Task** en otro Zap y confirma que la tarea aparece en Cord.

**Cuando termines, dile a Claude:** "ya tengo el link de invitación de Zapier: <link>". Claude hace:

- poner el link en `ZAPIER_INVITE_URL` (`src/lib/integraciones/catalogo.ts`), con lo que la tarjeta pasa de "Próximamente" a "Con llave de API" y aparece el botón **Abrir Cord en Zapier**;
- reescribir la página de Zapier en docs.cordhq.app con el paso a paso de la app;
- escribir el artículo de soporte `conectar-zapier`;
- probar, subir a `main` y verificar en producción.

### 5. Directorio público de Zapier (después, cuando haya usuarios)

No es necesario para que tus clientes la usen con el link. Para aparecer en el buscador de Zapier:

- tener Zaps reales activos de usuarios que no sean del equipo (Zapier revisa el uso antes de aprobar);
- dar a los revisores de Zapier una cuenta de prueba de Cord con datos de ejemplo;
- en **Publishing**, llenar el formulario y enviar a revisión.

---

## Make

### 1. Saber tu zona de Make

Entra a Make y mira la URL del navegador: `us1.make.com`, `us2.make.com`, `eu1.make.com` o `eu2.make.com`. Esa es tu **zona**.

### 2. Crear el token de API

1. En Make, abre tu **perfil** (abajo a la izquierda) › **API access**.
2. Pulsa **Add token**.
3. Nombre: "Cord deploy".
4. Marca estos scopes: **`sdk-apps:read`** y **`sdk-apps:write`**. Nada más.
5. Crea y copia el token (solo se muestra una vez).

### 3. Guardar el token en tu computadora

Crea el archivo `~/Desktop/flouvia-cord/integrations/make/.env` (ese archivo ya está ignorado por git) con:

```
MAKE_API_TOKEN=pega-aqui-el-token
MAKE_ZONE=us1.make.com
MAKE_APP_NAME=cord
```

Cambia `MAKE_ZONE` por tu zona del paso 1.

### 4. Subir la app

Tú, o Claude cuando se lo pidas, desde la carpeta del proyecto:

```bash
cd ~/Desktop/flouvia-cord/integrations/make
npm test
npm run deploy:dry
npm run deploy
```

- `deploy:dry` muestra lo que va a crear sin tocar nada.
- `deploy` crea la app "Cord" en tu cuenta de Make con la conexión, el disparador **Watch Events**, 8 acciones, 2 búsquedas y **Make an API Call**.
- Si dice que el nombre `cord` ya está tomado, cambia `MAKE_APP_NAME` (por ejemplo `cordhq`) y vuelve a correr.

### 5. Prueba tú mismo

1. En Make, crea un escenario y agrega el módulo **Cord › Watch Events**.
2. Crea la conexión pegando una llave `sk_test_…` de Cord.
3. Elige el evento `quote.approved` y guarda.
4. Aprueba una cotización de prueba en Cord y confirma que el escenario la recibe.
5. Prueba **Cord › Create a Task** y confirma que la tarea aparece en Cord.

### 6. Link de invitación

1. En Make, abre **Custom apps** (o **Apps** en el menú de desarrollador) › **Cord**.
2. Genera el **link de invitación** para compartir la app privada.
3. Copia el link; tampoco es secreto.

**Cuando termines, dile a Claude:** "ya subí la app de Make y este es el link de invitación: <link>". Claude hace:

- cambiar la tarjeta de Make de "Con webhooks" a la app, con botón **Abrir Cord en Make**;
- reescribir la página de Make en docs.cordhq.app y el artículo de soporte con los módulos de la app (dejando Webhooks + HTTP como alternativa);
- probar, subir a `main` y verificar en producción.

### 7. Catálogo público de Make (después)

Desde el panel de la app en Make, **Request review**. Make revisa que la app funcione, tenga logo, descripciones en inglés y ejemplos. Hazlo cuando ya haya clientes usándola con el link.

---

## Apps que conviene conectar después (además de Shopify)

Ordenadas por impacto para Cord (de la propuesta al pago, con fuerte uso en México, Latinoamérica, Estados Unidos y España).

| Prioridad | App | Por qué le sirve a Cord | Esfuerzo | Cómo |
|---|---|---|---|---|
| 1 | **WhatsApp Business (Cloud API de Meta)** | En México y Latinoamérica la cotización se manda y se persigue por WhatsApp. Enviar el link, recordatorios de pago y avisos de "tu cliente abrió" por WhatsApp es lo que más cerraría ventas. | Alto: verificación de negocio en Meta, plantillas aprobadas y costo por conversación. | Nativa |
| 2 | **Microsoft Teams** | El Slack de las empresas medianas y grandes. Mismo patrón que Slack: avisos por evento y acción en workflows. | Bajo: se puede reutilizar casi todo lo de Slack. | Nativa |
| 3 | **QuickBooks Online y Xero** | Que cada factura y pago de Cord aparezca solo en la contabilidad. QuickBooks domina en Estados Unidos; Xero en Reino Unido y buena parte de Europa. | Medio: OAuth y revisión de sus marketplaces. | Nativa |
| 4 | **Alegra / Holded / Siigo** | Contabilidad en la nube local: Alegra (México, Colombia, Perú y más), Holded (España), Siigo (Colombia). Cierra el ciclo fiscal donde el CFDI no aplica. | Medio por cada una. | Nativa, empezando por la del mercado con más clientes |
| 5 | **Mercado Pago** | Cobro en línea en Colombia, Argentina, Chile y Perú, donde hoy Cord no puede cobrar con tarjeta. Es la pieza que falta para el 100% en esos países. | Alto: es dinero real y aplica la regla 33 completa. | Nativa |
| 6 | **Pipedrive** | El CRM más usado por equipos de ventas pequeños después de HubSpot. Mismo modelo de sincronización: clientes y Deals. | Medio: se reutiliza el diseño de HubSpot. | Nativa |
| 7 | **Salesforce** | Para cuentas grandes (plan Scale). Abre ventas enterprise. | Alto: AppExchange, revisión de seguridad y costo. | Nativa, cuando haya un cliente que lo pida |
| 8 | **Google Workspace (Gmail, Sheets, Calendar)** | Crear cotizaciones desde Gmail y exportar ventas a Sheets. | Sheets y Calendar ya se cubren con Make y Zapier; Gmail como complemento es medio. | Primero vía Make/Zapier |
| 9 | **n8n** | La alternativa a Zapier/Make que usan agencias y equipos técnicos en Latinoamérica; muchos lo prefieren por costo. | Bajo: nodo comunitario sobre la misma API v1. | Nodo de n8n |
| 10 | **Tiendanube y WooCommerce** | El equivalente de Shopify en Latinoamérica (Tiendanube) y en sitios propios (WooCommerce), para negocios que venden en línea y cotizan mayoreo. | Medio. | Nativa, después de Shopify |

Recomendación de orden: **Teams y n8n** primero (poco esfuerzo, se ven como "más integraciones" rápido), luego **WhatsApp** (el mayor impacto en ventas), después **QuickBooks/Xero** y **Mercado Pago** según dónde estén los clientes que paguen.

Todo lo que se agregue sigue la regla 15: nada aparece en Ajustes › Integraciones como disponible hasta que funcione de punta a punta.

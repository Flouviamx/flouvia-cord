# Personalización de marca

La identidad del negocio se configura en **Ajustes → Marca y apariencia**.
Cord conserva su diseño interno. El editor compartido está en
`src/components/app/brand/BrandEditor.astro`; su comportamiento, en
`src/lib/brand-editor.ts`.

## Alcance actual

- Identidad: logo principal y variante sobre color, tamaño del logo, seis paletas,
  colores principal/secundario y tres familias tipográficas del sistema.
- Portal: composiciones Esencial, Suave y Contraste; bordes y densidad;
  aviso, bienvenida y controles existentes de interacción y marca de Cord.
- Vista previa de escritorio/móvil con el mismo `QuoteCard` y `BrandHeader` de
  `/q` y `/embed`, aislada en una ruta autenticada y sin operaciones de negocio.
- Deshacer recupera el último estado guardado. Restaurar estilo restablece
  composición, tipografía, bordes, densidad y tamaño; conserva logos y textos.
- Guardado explícito con el pie y feedback compartidos de Ajustes. Se valida antes
  del PATCH y los cambios realizados durante una petición siguen pendientes.

`src/lib/brand-profile.ts` es el contrato validado, con opciones cerradas y
valores predeterminados. No se almacena CSS arbitrario. `orgs.brand_profile`
contiene las opciones nuevas; logo principal, colores y mensajes conservan sus
campos existentes. El API valida el perfil y conserva los permisos y el contexto
de organización. Quitar la marca de Cord sigue sujeto al entitlement existente.

## Documentos y correos

- **Ajustes → Documento PDF** comparte `QuotePrint.astro` con la impresión real
  de cotizaciones. Vista previa autenticada, plantilla Minimal/Clásico/Detallado,
  mensaje, condiciones y precios de lista; cambios visibles antes del guardado.
  Hereda logo, variante sobre color, tipografía, densidad y colores de la identidad.
- **Facturas comerciales**: el generador vectorial usa el perfil compartido para
  encabezado, logo, acentos, bordes y espaciado. Editorial usa Times con métricas
  propias; Sistema/Humanista usan Helvetica como equivalente disponible en PDF.
  Importes, divisa, impuestos y partes provienen del snapshot fiscal existente.
  Los PDF timbrados del proveedor CFDI conservan su formato de origen.
- **Ajustes → Correo** muestra el mismo `renderQuoteEmail` del envío real.
  Remitente, respuesta, introducción y firma conservan el entitlement `custom_email`;
  la identidad base se aplica también sin ese permiso. Quitar Cord conserva su
  entitlement. La muestra no envía correos ni crea documentos.
- `brandEmailShell` unifica cotizaciones, facturas, recordatorios, mensajes de
  workflows a clientes, cobranza e instrucciones SPEI. Los avisos internos y de
  autenticación conservan la marca de Cord. La elegibilidad de Gmail no cambia.
- `brandImagePng` normaliza imágenes subidas PNG/JPEG/WebP/SVG para PDF y correo.
  El correo adjunta el logo por CID: `multipart/related` en Gmail y `content_id`
  en Resend. Conserva PDFs/XML como archivos separados. No se consultan URLs de
  logos arbitrarias en servidor; si no se puede procesar el logo, queda el nombre.
  Los logos HTTPS existentes se mantienen remotos en HTML/correo; el PDF binario
  usa el nombre cuando el logo no es una carga embebida.

Las vistas previas de documento/correo usan rutas con permiso `ajustes`,
`private, no-store`, noindex y mensajes de ventana limitados al padre del mismo
origen. La composición del correo puede variar según la aplicación receptora.
No hay columnas ni migraciones adicionales para esta extensión.

## Migración y despliegue

`db/brand-profile.sql` añade únicamente una columna JSONB con valor `{}`.
No modifica los valores de identidad existentes ni elimina datos.

```sh
node --env-file-if-exists=.env --env-file-if-exists=.env.local scripts/migrate-brand-profile.mjs
```

El build de Vercel ejecuta esta migración idempotente antes de `npm run build`,
con las credenciales del entorno de despliegue. Si la migración falla, el build
se detiene y la versión previa sigue publicada. No ejecuta el schema completo
ni siembra datos. `DATABASE_URL_UNPOOLED` tiene prioridad para DDL.

## Verificación

`test/brand-profile.test.ts` comprueba validación, defaults, serialización,
colores y contraste. Revisar también guardado/recarga, deshacer, vista previa
móvil y escritorio y el aislamiento de la ruta de vista previa.

Las pruebas `test/brand-documents.test.ts` y `test/brand-email-delivery.test.ts`
cubren escape, contraste, permisos de contenido/marca Cord, moneda del documento,
conversión de logos, adjuntos CID, fallback de Gmail a Resend simulado y PDF de
varias páginas con ambas familias. Las pruebas de descarga mantienen las garantías
existentes del token y del tenant. No se envían correos reales en estos tests.

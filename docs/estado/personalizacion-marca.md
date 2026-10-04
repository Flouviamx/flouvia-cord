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

Los PDF y correos mantienen su integración anterior con logo/color principal.
Las nuevas composiciones, familias tipográficas y variante de logo se aplican
al portal y enlace de cotización; extenderlas a PDF y correos es la fase siguiente.

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

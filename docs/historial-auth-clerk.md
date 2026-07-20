# Historial — Autenticación y Clerk

> Flujos de sign-in/sign-up custom, Clerk Organizations, SSO, org switcher, 2FA/
> Passkeys/cuentas conectadas, gestión de equipo y roles. Extraído de `historial.md`.
> Orden: más reciente arriba.

---

✅ **Org switcher con sub-cuentas anidadas (estilo Stripe) + refresh real al cambiar + "Tu cuenta" rediseñada con 2FA/Passkeys/cuentas conectadas (jul 2026)** —
   André pidió que el org switcher soportara una jerarquía "org principal + cuentas dentro" (como
   Stripe), que cambiar de cuenta recargara la data real (antes se quedaba con la data de la org
   anterior), y que `/app/ajustes/cuenta` se sintiera "super pro".
   • **Jerarquía de sub-cuentas:** columna nueva `orgs.parent_org_id uuid references orgs(id) on
     delete set null` (`db/schema.sql`, `alter table … if not exists`). La fuente de verdad para
     AGRUPAR en el switcher es `organization.publicMetadata.parentOrgId` de Clerk (disponible
     client-side sin roundtrip a Neon); el webhook de Clerk (`organization.created`/`updated`) lo
     lee y sincroniza `orgs.parent_org_id` resolviendo el `org_xxx` del padre → uuid interno.
     Endpoint nuevo `POST /api/orgs/subaccount` (`clerkClient(context).organizations
     .updateOrganization({ organizationId, publicMetadata })`, mismo patrón BAPI que
     `equipo.ts`) liga hijo→padre, validando primero que el usuario sea miembro **activo** del
     padre en `org_members` (403 si no). Cada cuenta hija sigue siendo una org de Cord normal —
     **datos 100% aislados** (multi-tenant por `org_id`, sin excepción); la jerarquía es solo de
     agrupación visual/organizativa en el switcher, no comparte config ni datos.
   • **`CustomOrgSwitcher.tsx` — árbol principal→hijos:** las membresías se agrupan por
     `publicMetadata.parentOrgId`; las orgs raíz (sin padre) se listan con sus hijas anidadas
     debajo (indent + hairline). **Fallback anti-desaparición:** si una sub-cuenta apunta a un
     padre del que el usuario ya no es miembro, se promueve a la lista raíz en vez de quedar
     oculta.
   • **`CreateWorkspaceModal.tsx` (nuevo) — flujo de creación tipo Stripe:** reemplaza el
     `prompt()` nativo original por un modal de 2 pasos (portal a `document.body`): paso 1 elige
     entre "Crea una cuenta en tu organización" (nested, bajo la org activa) o "Crea una cuenta
     separada" (independiente), con mini-diagramas ilustrando la jerarquía; paso 2 pide el
     nombre. Al confirmar: `clerk.createOrganization()` → si es `nested`, POST a
     `/api/orgs/subaccount` para ligar al padre (si falla el ligado, la org igual queda creada y
     usable — se avisa con `cordToast` que quedó como espacio independiente) → `handleSwitch()`.
   • **Refresh real al cambiar de org/cuenta:** `handleSwitch` hacía `clerk.setActive(...)` y solo
     cerraba el dropdown — como toda la data de `/app` se resuelve server-side con
     `getActiveOrgId()` (lee `auth().orgId`), la UI se quedaba con la data de la org anterior
     hasta que el usuario navegaba manualmente. Ahora, tras `setActive`, se hace
     `window.location.assign(...)` (mismo patrón ya probado por `toggleTestMode` en
     `src/store/testMode.ts`): si la URL actual trae un UUID de entidad (cotización/cliente
     concreto que no existe en la otra cuenta) redirige a `/app`; si no, recarga la misma ruta.
   • **`/app/ajustes/cuenta` (`CustomUserProfile.tsx`/`.css`) rediseñada:**
     - CSS migrado de una paleta slate hardcodeada (`#cbd5e1`/`#334155`/`#64748b`) a los
       **tokens de Cord** (`--surface`, `--color-bg-soft`, `--color-border`, `--color-text`,
       `--color-blue-deep`, `--ease-spring`/`--ease-ios`) — arregla el **dark mode**, que antes
       pintaba tarjetas blancas con texto oscuro sobre fondo oscuro.
     - Skeleton de carga real (antes referenciaba clases `.cup-card`/`.cup-card-body`
       inexistentes → texto plano sin estilo).
     - Avatar con **cambio de foto** (`user.setProfileImage({ file })`, overlay al hover).
     - **Secciones nuevas:** Autenticación de 2 pasos (TOTP vía `user.createTOTP()` →
       `verifyTOTP()`, con **códigos de respaldo** mostrados una sola vez tras habilitar —
       `createBackupCode()` — porque Clerk no los vuelve a revelar; clave secreta copiable en
       vez de prometer un QR que no se implementó, ya que mandar la secret TOTP a un servicio
       externo de generación de QR la filtraría), **Passkeys** (`createPasskey()`/
       `passkey.delete()`), y **Cuentas conectadas** (Google vía
       `user.createExternalAccount({ strategy: 'oauth_google', redirectUrl })` — el botón
       "Conectar" redirige a `verification.externalVerificationRedirectURL`, la URL de OAuth
       que Clerk devuelve; sin ese redirect el botón no iniciaba el flujo).
     - `alert()`/`confirm()` nativos reemplazados por `window.cordToast`/`window.cordConfirm`
       (con fallback si el island monta antes que el script de `AppLayout`).
     - Botones destructivos (Revocar sesión, Desactivar 2FA, Eliminar passkey, Desconectar
       cuenta) corregidos de `var(--color-warn)` (ámbar) a `var(--color-danger)` (rojo) — antes
       se veían ámbar por usar el token equivocado.
   • **Bug real corregido en el endpoint nuevo:** `const [rows] = await sql\`...\`` destructuraba
     mal el resultado del driver de Neon (`sql\`\`` devuelve un ARRAY de filas, no una fila) —
     `rows.length` era `undefined` y la validación de membresía del padre **siempre** devolvía
     403, así que ninguna sub-cuenta se ligaba nunca. Corregido a `const rows = await sql\`...\``.
   ⚠️ Correr `npm run db:migrate` (1 columna nueva en `orgs`).
   ⚠️ **Nota de copy pendiente de revisar:** el modal de creación (`CreateWorkspaceModal.tsx`)
     describe la opción "nested" como que la sub-cuenta "comparte datos, miembros del equipo e
     informes" con la org principal — eso NO es cierto en el modelo actual (el multi-tenant por
     `org_id` aísla 100% los datos entre cualquier par de orgs, padres o hijas); la jerarquía es
     puramente organizativa/visual en el switcher. Ajustar el copy si se quiere evitar confundir
     al usuario, o implementar de verdad algún nivel de dato compartido si eso es lo que se
     busca.

✅ **Org Switcher rediseñado — estilo Apple/Settings, "inset grouped list" (jul 2026)** —
   `CustomOrgSwitcher.tsx` pasó de un dropdown plano genérico a un patrón Apple System
   Settings, reusando el MISMO lenguaje visual que el drawer de Ayuda (`.help-inset-group`/
   `.help-link` en `AppLayout.astro`) para consistencia entre menús de la app.
   • **Trigger de dos líneas:** el botón del switcher ahora muestra un eyebrow tracked
     ("Espacio de trabajo", 0.6rem uppercase) sobre el nombre de la org en bold — mismo
     patrón que el selector de Apple ID en macOS/iOS Settings. Nuevo wrapper `.org-text`
     (`flex-direction:column`).
   • **Dropdown = 3 tarjetas "inset grouped"** en vez de una lista plana: (1) Espacios de
     trabajo (avatar+nombre+rol, checkmark en badge circular navy para el seleccionado,
     con un anillo azul alrededor de su avatar), (2) Acciones (Crear espacio · Configuración
     del equipo con chevron de disclosure › · Entorno de prueba con su toggle), (3) Cuenta
     (perfil + Cerrar sesión). Cada fila tiene un **icon badge squircle 26px** (`.orgd-icon`)
     con fondo tintado — `orgd-icon-neutral` (gris/navy, mismo tono que `.help-link-ico`),
     `orgd-icon-amber` (Entorno de prueba — reusa el ámbar semántico del test-mode),
     `orgd-icon-red` (Cerrar sesión — reusa `--color-danger`). **Cero colores nuevos**: solo
     los 3 acentos que ya existían en la app (navy, ámbar de test-mode, rojo de peligro) —
     a propósito, para no romper la paleta "Quiet Luxury" con un arcoíris tipo iOS Settings.
   • **Divisores inset** (`::after` que arranca en `left:46px`, después del icono/avatar —
     no full-bleed) en vez de `<hr>`/borde completo, igual que el patrón de Ayuda.
   • **Bug real encontrado y arreglado — el badge "Prueba" rompía el layout:** el pill ámbar
     que se agregó junto al nombre en la sesión anterior (`.org-test-badge`) le robaba
     ~50-60px al `org-name` dentro de un sidebar de 232px reales, causando un truncado
     agresivo ("ESPACIO D...", "Materiales del V..." se cortaba aún más de lo normal).
     Reemplazado por una señal que NO consume espacio horizontal: (1) un **anillo ámbar**
     alrededor del avatar (`box-shadow`, visible también en modo colapsado 36×36 donde no
     hay texto) y (2) el **eyebrow cambia de texto/color** ("Espacio de trabajo" →
     "Entorno de prueba" en ámbar) — mismo patrón que iOS Settings usa subtítulos con color
     para indicar estado en vez de agregar chrome. Verificado con un mock estático (mismos
     tokens `--sb-*`/`--color-*` y CSS exacto del componente, renderizado con Playwright) en
     light/dark/colapsado/nombre-largo — 0 regresiones de truncado vs. el comportamiento
     anterior sin badge.
   • **`title={nombre}`** agregado en `.org-name`/`.org-item-name` — con sidebar angosto
     (232px) los nombres largos truncan por diseño (ellipsis); el tooltip nativo permite
     leer el nombre completo al pasar el cursor, sin costo.
   • ⚠️ **Se preservaron intactos** los classnames que `AppLayout.astro` fuerza vía
     `<style is:inline>` (bypass anti-translucidez, ver comentario "ASTRO OPTIMIZATION
     BYPASS" ahí): `.custom-org-switcher`, `.org-switcher-btn`, `.org-dropdown`,
     `.org-list-item`. Esas reglas fuerzan `background-color`/`box-shadow`/`z-index`/
     `backdrop-filter` con `!important` — **no pisar esas propiedades específicas** en el
     componente; el resto (`border-radius`, `padding`, contenido interno) es libre.
   • **Regla a futuro:** cualquier menú/dropdown nuevo de la app que quiera sentirse "Apple
     Settings" debe reusar este patrón (`.orgd-group` tarjeta + `.orgd-icon` badge + divisor
     inset), no reinventar un dropdown plano. Si se necesita una señal de estado (activo/
     alerta) en un trigger con espacio angosto, preferir anillo/color de texto sobre un
     badge/pill que compite por espacio horizontal.
   • **Toggle "Entorno de prueba" — proporciones reales de iOS:** el `.toggle-switch`
     inicial (28×16px, wash ámbar translúcido al 35%, thumb sin sombra del color del
     track) se veía plano y el estado OFF era casi invisible. Reescrito con las MISMAS
     proporciones/easing que `.s-toggle` (el toggle global de Ajustes, 44×24 con thumb
     blanco+sombra): track 38×24, `border-radius:100px`, OFF = gris sólido
     `rgba(10,25,47,0.13)` (dark: `rgba(255,255,255,0.16)`), ON = ámbar **sólido** `#f59e0b`
     (no translúcido), thumb 18px **siempre blanco** con `box-shadow` de dos capas
     (`0 1px 3px rgba(0,0,0,0.3), 0 1px 1px rgba(0,0,0,0.16)`) que se desliza
     `translateX(16px)`. Transiciones con `var(--ease-ios)`/`var(--ease-spring)` iguales a
     `.s-toggle`. Regla: cualquier toggle nuevo fuera de Ajustes debe copiar estas
     proporciones (no reinventar tamaños de 16-20px con washes translúcidos).

✅ **Clerk Organizations — modo híbrido (jun 2026)** — Clerk = fuente de verdad de
   identidad (org switcher, email invitations, SSO/SAML, multi-org); Neon = fuente de
   verdad de datos de negocio (RLS, billing, 8 permisos granulares). Puente: columna
   `orgs.clerk_org_id` (text unique). Archivos modificados:
   • `db/schema.sql` — `alter table orgs add column if not exists clerk_org_id text unique;`
     + `clerk_user_id` ahora nullable (orgs de Clerk no tienen dueño único en el schema).
   • `src/lib/context.ts` — campo `clerkOrgId` en `ReqCtx` + `currentClerkOrgId()`.
   • `src/middleware.ts` — inyecta `auth().orgId` → `clerkOrgId`; `/api/clerk/` en `PUBLIC_API_PREFIXES`.
   • `src/lib/db.ts` — `getActiveOrgId()` resuelve por `clerk_org_id` primero (paso 0.5),
     con lazy-upsert si el webhook aún no llegó; todo el carril legacy se conserva.
   • `src/pages/api/clerk/webhook.ts` — sincroniza `organization.*` y
     `organizationMembership.*` → upsert en `orgs`/`org_members`; role mapping
     `org:admin`→preset `admin`, `org:member`→preset `vendedor`; no pisa permisos finos.
   • `src/layouts/AppLayout.astro` — `<OrganizationSwitcher>` en el sidebar
     (cambiar/crear orgs; `hidePersonal`, dark theme).
   • `src/pages/api/equipo.ts` — POST usa `createOrganizationInvitation` vía BAPI
     (Clerk manda el email); fallback a token/link si la org no tiene `clerk_org_id`.
     DELETE también llama `deleteOrganizationMembership` para mantener Clerk en sync.
   • `src/pages/app/ajustes/equipo.astro` — UI muestra "invitación enviada por correo"
     cuando `d.emailed === true`.
   • `scripts/backfill-clerk-orgs.mjs` — script de migración único (`npm run clerk:backfill-orgs`):
     crea Organization en Clerk por cada org Neon sin `clerk_org_id`, guarda el mapeo
     y agrega miembros activos. Re-ejecutable.
   ✅ **Config manual COMPLETADA en prod (jun 2026):** Organizations activado en el
     Dashboard, webhook en `https://cordhq.app/api/clerk/webhook` con los 8 eventos
     (`user.*` + `organization.*` + `organizationMembership.*`) y `CLERK_WEBHOOK_SECRET`
     seteado; migración + `clerk:backfill-orgs` corridos. (Si se quiere B2B-only: cambiar
     Membership de `optional` a `required` en el Dashboard.)

⚠️ **EXACTITUD (doc drift, corregido jun 2026):** la app **NO usa los componentes
   nativos `<SignIn/>`/`<SignUp/>` de Clerk** para los flujos de auth — usa **islas React
   propias** basadas en nanostores (`CustomSignIn`, `CustomSignUp`, `CustomOrgSwitcher`,
   `ForgotPassword`, `VerifyEmail`, `CreateWorkspace`) que escuchan la instancia global
   `$clerkStore`/`$userStore` inyectada por `@clerk/astro`. Sí se usa el nativo para
   `<UserProfile/>` (Ajustes › Cuenta). Las
   entradas de abajo que dicen "componentes nativos/oficiales de Clerk" reflejan un intento
   que se revirtió a los `Custom*`. **El "Entorno de prueba" ya es REAL
   (jul 2026)**: org sandbox espejo con datos 100% aislados — ver la entrada "Entorno de
   prueba REAL tipo Stripe" arriba (la nota vieja decía que era cosmético). ⚠️ Auth en re-trabajo activo (André): hay
   componentes nuevos sin commitear en `src/components/auth/` (`SignInForm.tsx`, etc.).

✅ **Clerk Premium UI & Nativos (jun 2026)** — Retorno a los componentes oficiales de Clerk (`<SignIn />`, `<SignUp />`, `<OrganizationSwitcher />`, `<OrganizationProfile />`) estilizados globalmente vía `appearance` con un diseño oscuro premium estilo Stripe/Linear (`src/lib/clerk-theme.ts`), eliminando código React manual redundante.
   • **Flujos de Autenticación**: Las rutas `/sign-in` y `/sign-up` montan los componentes nativos de `@clerk/astro` con redirecciones server-side desde `/login` y `/registro` en `astro.config.mjs`.
   • **Motor B2B (Organizations)**: El control de equipo (invitaciones, roles, accesos) opera mediante una **interfaz 100% custom y nativa estilo Stripe** (en `/app/ajustes/equipo`) que consume nuestros webhooks (`/api/equipo`), reemplazando definitivamente a `<OrganizationProfile />` por razones de diseño y control UX "Quiet Luxury".
   • **Componentes B2B**: El selector de espacios de trabajo se reemplazó por el `<OrganizationSwitcher />` nativo en el sidebar de `AppLayout.astro`. El onboarding usa `<CreateOrganization />`.

✅ **Arquitectura Isomórfica de Auth (jun 2026)** — Solución al "Blank Screen" de Clerk en islas React
   dentro de Astro. Los componentes de React lanzaban error por falta de `<ClerkProvider>` en su contexto.
   Se reescribió `CustomSignIn.tsx`, `CustomSignUp.tsx`, `VerifyEmail.tsx`, `ForgotPassword.tsx` y
   `CreateWorkspace.tsx` para usar **nanostores** (`@nanostores/react` + `@clerk/astro/client`). Ahora
   las "islas" React escuchan la instancia global de Clerk inyectada por Astro (`$clerkStore`, `$userStore`)
   eliminando la dependencia de wrappers de Context.

✅ **Identidad Visual "Cord Navy" y Micro-Interacciones (jun 2026)** — Rediseño total de los flujos de
   autenticación (`/sign-in`, `/sign-up`, `/verify-email`, `/forgot-password`, `/onboarding/workspace`).
   Se eliminó el gradiente mesh multicolor heredado y se reemplazó por un fondo blanco inmaculado con una
   sutil cuadrícula punteada (radial-gradient mesh) en `#0a192f`. Se reemplazó el texto por logotipos reales.
   Los inputs y botones (`.btn-primary`) adoptan el Cord Navy puro (`#0a192f`), con sombras escalonadas y
   levantamientos `translateY(-1px)`.

✅ **Auth pages — minimalista tipo Linear (jun 2026)** — `/sign-in` y `/sign-up` rediseñadas a petición
   de André ("minimalista tipo Linear pero esencia Cord, fondo blanco"). Se descartó tanto la card centrada
   original (lucía plana: sombras/bordes a opacidad 0.05 = invisibles) como un intento de layout split de
   dos columnas. Diseño final:
   • **Fondo blanco limpio, todo centrado en columna** (sin panel lateral, sin card chrome — `.auth-card`
     es `transparent`, sin borde ni sombra). El formulario flota sobre el blanco al estilo Linear, pero en
     claro y con navy Cord. Estructura: logo Cord navy → formulario (Custom*) → footer "Hecho en México ·
     Datos cifrados".
   • **Estética Cord:** título navy `#0a192f` peso 600 tracking −0.025em, inputs border 1px sutil + focus
     ring navy `rgba(10,25,47,0.08)`, botón primario navy sólido full-width con hover `translateY(-1px)`,
     sociales blancos con border sutil. Inter, mucho aire (`gap: 2.25rem`), fade-in suave.
   • **CSS compartido idéntico en cada página** (mismo bloque `<style is:global>`; clases consumidas por
     `CustomSignIn`/`CustomSignUp`). `body:has(.auth-page)` oculta nav/footer de la landing.
   • **`client:only="react"`** en ambas páginas (corregido de `client:load`; Clerk requiere contexto de
     cliente — ver bug documentado más abajo sobre pantalla blanca).

✅ **OrgSwitcher "Linear-Style" (jun 2026)** — El `CustomOrgSwitcher.tsx` se rediseñó para operar en
   **Modo Oscuro Nativo** y acoplarse perfectamente al sidebar navy (`#0a192f`). El botón base es transparente
   con texto blanco semi-translúcido, y el menú desplegable flota con fondo `#0a192f` y bordes finos de alto
   contraste, evitando el efecto de "mezcla sucia" sobre el fondo blanco del dashboard.

✅ **Reescritura Custom de Equipo y Roles (jun 2026)** — Se removió el componente "enlatado" `<OrganizationProfile>` de Clerk en favor de una vista `equipo.astro` 100% nativa. El nuevo diseño (inspirado en Stripe) introduce filtros estilo "píldora" fluidos, botones primarios con efectos glassmorphism/gradient, y modales nativos para invitar, editar roles y revocar accesos (conectados a `/api/equipo`), garantizando fidelidad total al "Dark Mode" del SaaS.

✅ **Wizard de Configuración SSO Empresarial (jun 2026)** — Se reconstruyó la pantalla secundaria de configuración de SSO (`/app/ajustes/sso/configuracion`) con un asistente interactivo de 3 pasos inspirado en Stripe.
   • **Paso 1 (Asignación de Roles):** Selección visual mediante tarjetas interactivas ("Dashboard de Cord" vs "Proveedor de Identidad").
   • **Paso 2 (Verificación de Dominio):** Input validado con prefijo `@` para establecer el enrutamiento de usuarios B2B.
   • **Paso 3 (Registro DNS TXT):** Instrucciones claras con caja de copia en un clic para mostrar el código de verificación `flouvia-verification`.
   • Además, se unificó la estética premium de los botones primarios a lo largo de las páginas de Ajustes (`equipo.astro` y `sso.astro`), devolviéndolos al gradiente oficial "Cord Navy" en un rediseño coherente "Quiet Luxury".

✅ **SSO marcado "Próximamente" (jun 2026)** — el SSO empresarial (SAML/OIDC) NO está conectado
   (sería config de Clerk de plan pagado). La pestaña `/app/ajustes/sso` conserva su estética
   premium (gráfico de flujo, badge Enterprise) pero se QUITARON los botones de acción
   ("Empezar configuración"/"Documentación"): ahora muestra un badge "Próximamente" + nota de
   contacto. El wizard `/app/ajustes/sso/configuracion.astro` sigue en el repo pero queda sin
   enlace de entrada (es 100% cosmético: no persiste nada). NO re-exponer botones hasta conectar SAML real.

✅ **Limpieza de código muerto de Clerk (jun 2026)** — se borró el clúster del re-trabajo de
   auth abandonado (0 imports): `src/components/auth/{SignInForm,SignUpForm,VerifyEmailForm,
   ForgotPasswordForm}.tsx` + `AuthForms.css`; toda la carpeta `src/components/b2b/`
   (`CreateWorkspaceForm`, `WorkspaceSwitcher`, `MembersManager`, `AcceptInvitationFlow`,
   `InvitationsManager`, `B2B.css`); las páginas huérfanas `src/pages/app/ajustes/invitaciones.astro`
   y `src/pages/accept-invitation.astro` (el flujo real de invitación es `/unirse/[token]`);
   `src/components/developers/DeveloperUI.css`; y el onboarding muerto `src/lib/onboarding.ts` +
   `/api/onboarding/seed` (el real es `getSetupProgress()` en queries.ts). El flujo de auth ACTIVO
   es 100% custom: `src/components/auth/{CustomSignIn,CustomSignUp,ForgotPassword,VerifyEmail}.tsx`
   + `CustomUserProfile`/`CustomOrgSwitcher`. (Ignorar las entradas viejas que digan "componentes
   nativos de Clerk `<SignIn/>`/`<UserProfile/>`": el approach final es Custom*.)

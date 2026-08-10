# Historial — Autenticación y Clerk

> Flujos de sign-in/sign-up custom, Clerk Organizations, SSO, org switcher, 2FA/
> Passkeys/cuentas conectadas, gestión de equipo y roles. Extraído de `historial.md`.
> Orden: más reciente arriba.

---

**Ops aislado con autenticación fuerte y allowlist doble (ago 2026)**

El panel interno de `ops.cordhq.app` dejó de usar `OPS_SECRET`. Solo
`andrevalleo13@gmail.com` y `hola@flouvia.com` pueden entrar, y el permiso se
comprueba simultáneamente contra una allowlist de código y la tabla
`ops_operators`. En producción, el acceso exige passkey con verificación de usuario
o contraseña más TOTP; una contraseña sola nunca crea una sesión.

En desarrollo local existe un carril separado que exige una sesión normal de Cord
vigente para el mismo usuario más volver a escribir su contraseña. Solo se activa
en `localhost`, `127.0.0.1` o `::1` cuando `import.meta.env.PROD` es falso y no forma
parte del comportamiento de `ops.cordhq.app`.

Las sesiones Ops son independientes de `cord_session`, guardan únicamente el hash
del token, permiten una sola sesión activa por operador, expiran tras 30 minutos de
inactividad y tienen un máximo absoluto de 8 horas. También quedan ligadas al
User-Agent que completó la autenticación. Se agregaron `ops_auth_challenges` para
retos TOTP de un solo uso y `ops_audit_log` para accesos, rechazos y cierres de
sesión sin registrar secretos. La rotación de sesión es transaccional y un índice
único impide carreras que creen dos sesiones simultáneas para el mismo operador.
Cada login correcto genera además una alerta por correo.

El middleware protege todo `/ops/**` y `/api/ops/**` por default, corrige el rewrite
del subdominio para las APIs, aplica CSP propia sin analytics, `no-store`,
`noindex`, bloqueo de frames y referrer nulo. `OpsLayout.astro` mantiene el panel
fuera del layout público. La UI de login y el centro de operaciones usan una
superficie clara y minimalista.

Una segunda pasada de endurecimiento cerró también las fallas de composición: el
hostname se compara de forma exacta, la capa de headers envuelve incluso redirects
y errores tempranos, y Ops agrega aislamiento de proceso (`COOP`/`COEP`), bloqueo
de scripts por atributo y una Permissions Policy mínima. En producción, el login y
las APIs privadas fallan cerrados si el rate limit distribuido de Upstash no está
disponible; no degradan a un contador distinto por cada instancia de Vercel.

Los retos de passkey ahora viven hasheados en `ops_passkey_challenges`, se ligan al
operador esperado y se consumen atómicamente para impedir replay concurrente. Cada
sesión WebAuthn conserva la credencial exacta que la abrió. La validación de sesión
comprueba en cada request que la cuenta siga activa, verificada y no suspendida; que
la contraseña no haya cambiado desde el login; y que TOTP o la passkey usada sigan
vigentes. Quitar una credencial o rotar la identidad revoca el privilegio sin esperar
a que venza la cookie. La base de datos incorpora además una restricción que solo
permite los dos correos autorizados en `ops_operators`, no solo una validación de la
aplicación.

La auditoría de supply chain terminó con `npm audit --omit=dev` en cero hallazgos.
Se migró Astro `6.4.8` a `7.2.0`, el adapter de Vercel a `11.0.5` y MDX a `7.0.5`;
también se actualizaron las dependencias transitivas parcheables y se fijó
`path-to-regexp@6.3.0` solo para `@vercel/routing-utils`. El compilador más estricto
de Astro 7 descubrió y permitió corregir cuatro errores de marcado preexistentes.

El centro de operaciones ahora permite administrar usuarios y organizaciones sin
abrir Neon: revocar sesiones, desbloquear cuentas, revocar llaves API, desactivar
webhooks, cerrar sesiones de un equipo y eliminar datos no protegidos. Estas
mutaciones exigen rol `admin`, confirmación escrita para las de mayor impacto y se
ejecutan en la misma transacción PostgreSQL que su entrada de auditoría. Los dos
operadores y cualquier organización que posean o integren no pueden eliminarse
desde el panel.

La validación CSRF de Ops acepta únicamente el origen exacto de la petición. No
acepta `SITE` como origen alterno porque `cordhq.app` y `ops.cordhq.app` son
same-site para cookies; así, una vulnerabilidad en la app principal no puede emitir
mutaciones privilegiadas aprovechando una sesión Ops abierta. La política sigue
siendo fail-closed cuando falta `Origin`.

Ops evolucionó de una sola vista a una consola multipágina tipo plataforma:
`/ops/users` y `/ops/users/[id]` concentran identidad, membresías, sesiones,
passkeys, OAuth y ciclo de vida; `/ops/organizations` y su detalle muestran equipo,
actividad comercial, clientes, productos, pagos, API keys, webhooks y SSO;
`/ops/security` reúne sesiones privilegiadas, señales de riesgo y la bitácora; y
`/ops/database/[table]` permite explorar todas las tablas públicas con búsqueda y
paginación. El explorador redacta hashes, contraseñas, TOTP, tokens, llaves,
certificados, CLABE y cuerpos sensibles; esos campos tampoco participan en la
búsqueda para evitar un oráculo de coincidencia.

`/ops/usage` agrega la observabilidad de servicios que pueden generar costo o
abuso. Por organización muestra la cuota mensual y el consumo de IA, API y CFDI;
tokens de Anthropic; correos de Resend; tasa de error y latencia de la API;
intentos y fallos de webhooks; cobros procesados por Stripe; y tamaño de Neon.
Genera señales preventivas al 80% de una cuota y críticas al 100%, además de
alertar tasas anormales de errores o reintentos. Las escrituras normales de
telemetría entran por organización mediante `withOrgTx`; la agregación cross-org
solo corre en la ruta privilegiada de Ops después de validar su sesión. Los eventos
detallados viven en `external_usage_events` sin prompts, correos, payloads,
respuestas ni secretos.
Los dashboards de cada proveedor siguen siendo la fuente autoritativa de importes
facturados; Ops funciona como detector temprano de volumen y riesgo.

La capa visual de Ops se mantiene light-only con la estética Apple/Cord. El avatar
de identidades ahora usa centrado geométrico independiente de los estilos del
texto, y las entradas de página, tarjetas, foco, barras de cuota y estados tienen
microinteracciones CSS breves con fallback completo para `prefers-reduced-motion`.

Se agregó suspensión real de identidades mediante `users.suspended_at` y
`suspended_reason`. Suspender revoca las sesiones y bloquea centralmente la creación
y validación de sesiones por password, OAuth, passkey, SAML y confirmación de correo.
Los operadores no pueden suspenderse desde Ops. Restaurar, suspender y eliminar
continúan ligados atómicamente a `ops_audit_log`.

Antes de abrir la plataforma a usuarios reales se ejecutó una limpieza
transaccional: se conservaron únicamente los dos operadores y las cuatro
organizaciones que poseen o integran; se eliminaron 13 identidades de prueba, 27
organizaciones ajenas, invitaciones pendientes y su información dependiente por
FK. `scripts/cleanup-non-ops-data.mjs` conserva el procedimiento como dry-run por
defecto y exige `--execute`; `scripts/migrate.mjs` ya no inserta datos demo salvo
que se invoque explícitamente con `--seed-demo`.

✅ **Auditoría y endurecimiento completo del auth propio — nivel producción (ago 2026)** —
   André pidió una pasada de seguridad exhaustiva sobre el sistema de auth propio que
   quedó a medias tras la migración de Clerk. Auditoría inicial (3 agentes en paralelo:
   núcleo de auth, superficies de cuenta/org/equipo, seguridad transversal) encontró
   **3 vulnerabilidades críticas explotables sin cuenta** más ~15 huecos serios y
   pantallas que reportaban éxito sin hacer nada real. Reescritura completa en 5 fases.
   • **Crítico #1 — Apple Sign-In sin verificar firma:** `apple/callback.ts` decodificaba
     el `id_token` con un base64 decode plano — sin JWKS, sin verificar `iss`/`aud`/`exp`/
     `nonce`. Cualquiera podía forjar un JWT `{"sub":"x","email":"victima@x.com"}` y
     entrar como esa cuenta. **Reescrito de punta a punta:** `src/lib/auth-apple.ts` gana
     `exchangeAppleCode()` (intercambia el `code` de verdad con el endpoint de token de
     Apple — `createAppleClientSecret()` existía y nunca se llamaba) y
     `verifyAppleIdToken()` (JWKS reales de `appleid.apple.com/auth/keys`, caché 1h,
     verificación RS256 vía `node:crypto` `webcrypto.subtle`, valida iss/aud/exp/nonce,
     exige `email_verified=true`). Mismo tratamiento en `google/callback.ts`
     (`profile.verified_email !== true` → rechaza el link-by-email).
   • **Crítico #2 — reset de contraseña dejaba la cuenta muerta:**
     `reset-password/confirm.ts:38` escribía el literal `'dummy_hash'` como
     `password_hash` — cada reset completado bloqueaba la cuenta para siempre (ningún
     password vuelve a verificar contra ese valor). Corregido con Argon2id real.
     **Hallazgo en producción:** 11 de 13 cuentas reales tenían `password_hash =
     'dummy_hash'` (víctimas del bug + owners sembrados por
     `migrate-to-custom-auth.mjs`) — la mayoría son artefactos de la migración
     (`@migrated.local`, sin inbox real), pero al menos una (`0274559@up.edu.mx`) es una
     cuenta real sin OAuth de respaldo que necesitará "Olvidé mi contraseña" para volver
     a entrar.
   • **Crítico #3 — IDOR cross-tenant en `/api/orgs/provision`:** el `childOrgId` lo
     mandaba el CLIENTE sin verificar dueño; un `insert … on conflict (id) do update`
     dejaba que cualquier usuario autenticado sobrescribiera `country_code`/
     `parent_org_id` de la org de OTRO negocio, todo envuelto en un `catch{}` silencioso
     (y además consultaba `clerk_org_id`/`clerk_user_id`, columnas que la migración ya
     había borrado — 500 garantizado). **Reemplazado por `POST /api/orgs`** (archivo
     nuevo): el UUID lo genera el servidor, `parentOrgId` solo se acepta si el usuario es
     miembro activo verificado de esa org.
   • **Núcleo de auth reescrito** (`src/lib/auth.ts`): Argon2id real
     (`@node-rs/argon2`, m=19456/t=2/p=1 — OWASP 2026) con compat hacia atrás para el
     scrypt legacy (re-hash transparente al primer login exitoso) y un hash señuelo
     constante para que verificar una cuenta inexistente/OAuth-only cueste el MISMO
     tiempo de CPU (cierra la enumeración por timing). Tokens de sesión/reset/
     verificación/invitación pasan de guardarse en CLARO a **sha256(token)** — el valor
     crudo solo viaja en la cookie/link, nunca se persiste (antes una lectura de
     `sessions` era secuestro de cualquier cuenta). Sesiones con expiración deslizante
     (30d) + tope absoluto (90d) + `last_used_at`/`revoked_at`. Lockout **por cuenta**
     (10 intentos → 15 min), no solo por IP (`checkAndConsumeLockout`). IP resuelta vía
     `src/lib/ip.ts` (`x-real-ip`/`x-vercel-forwarded-for`, no spoofeable — antes se leía
     `x-forwarded-for[0]`, que el propio atacante controla, y con eso se reseteaba su
     rate-limit y se envenenaba `audit_log.ip`).
   • **Verificación de correo BLOQUEANTE** (decisión de producto): `register.ts` ya NO
     crea sesión — manda el correo de verificación y exige confirmarlo antes de entrar.
     Login con password correcto pero correo sin verificar → 403 `email_not_verified`
     (reenvía el token). Nuevas rutas `verify-email/{request,confirm}.ts`, página
     `verify-email.astro` reescrita (antes un stub de Clerk que llamaba
     `signUp.attemptEmailAddressVerification`, inexistente en auth propio).
   • **2FA real (TOTP)** — `src/lib/totp.ts` (RFC 6238 sobre HOTP RFC 4226 puro con
     `node:crypto`, verificado contra los vectores de prueba oficiales del RFC) +
     códigos de respaldo (10, hasheados sha256). Login con password: si `totp_enabled`,
     se crea un reto de 5 min (`two_factor_challenges`) antes de la sesión real — nueva
     página `/verify-2fa` + `Verify2fa.tsx`. **El SSO también lo respeta** (Google/Apple
     con 2FA activo redirigen a `/verify-2fa` en vez de saltárselo). Passkeys NO pasan
     por este reto (WebAuthn ya es autenticación fuerte por sí sola). Endpoints nuevos
     `/api/account/2fa/{start,verify,disable,backup-codes}` — desactivar/regenerar exige
     re-confirmación (password o código, nunca solo tener la sesión abierta).
   • **Gate `orgs.require_2fa` — de decorativo a real:** era configurable desde Ajustes ›
     Seguridad desde jul 2026 pero nada lo hacía cumplir. Ahora el middleware
     (`requiresTwoFactorSetup()` en `db.ts`) redirige a `/app/ajustes/cuenta?require2fa=1`
     a cualquier usuario sin TOTP cuando su org lo exige — confinado a esa página y a
     Ajustes › Seguridad (para que el owner pueda apagar el requisito).
   • **Passkeys arreglados de raíz:** `register.ts`/`verify.ts` usaban la forma v9/v12 de
     `@simplewebauthn/server` (`credentialID`/`credentialPublicKey` planos,
     `authenticator:`) contra la **v13.3.2** instalada, que anida todo en
     `registrationInfo.credential`/exige el parámetro `credential:`. El registro y el
     login con passkey nunca habían funcionado. `verify.ts` además llamaba
     `createSession()` con una aridad inventada — corregido a la real.
   • **"Tu cuenta" real** (`CustomUserProfile.tsx`, reescrito de 0 — antes 566 líneas sin
     un solo `fetch()`, crasheaba para todo usuario logueado por `user.externalAccounts`
     indefinido): perfil (nombre + avatar, mismo patrón data-URL que el logo de marca),
     cambiar/crear contraseña, activar/desactivar 2FA con QR real (`qrcode`, renderizado
     LOCAL — el secreto nunca sale del servidor), gestión de passkeys
     (`startRegistration`), sesiones activas con revocar individual/todas, cuentas
     conectadas (desconectar Google/Apple — bloqueado si sería el último método de
     acceso). 12 endpoints nuevos bajo `/api/account/**` (heredan el gate de sesión del
     middleware automáticamente — a diferencia de `/api/auth/**`, que es público).
   • **Org switcher real:** `resolveOrgId()` (`db.ts`) implementa el
     `// TODO (Fase 3)` que llevaba meses sin resolver — la cookie `cord_active_org` que
     el switcher ya escribía nunca se leía. Ahora sí, **pero solo tras verificar que el
     usuario es miembro activo de esa org** (sin esa verificación, habría sido una fuga
     cross-tenant total: cualquier UUID puesto a mano en la cookie del navegador habría
     resuelto la sesión hacia un negocio ajeno). `getMyMembership()` dejó de
     **fallar-abierto a owner** cuando no encontraba fila de membresía (el bug que hacía
     esa validación indispensable) — ahora falla cerrado salvo el único caso legítimo
     (la org sandbox del entorno de prueba, que nunca siembra `org_members` a propósito).
     `getUserProfile()` reescrito con roles reales (`owner|admin|vendedor|lectura|
     miembro`, ya no formas de Clerk) y `parent_org_id` real.
   • **Invitaciones de equipo que sí llegan:** `equipo.ts` generaba el token, lo
     guardaba **en claro**, y nunca lo mandaba por correo (`// TODO: Implementar
     invitaciones vía correo`) — la UI decía "Invitación enviada" mintiendo. Ahora: token
     hasheado (sha256) con caducidad real (7 días, antes nunca expiraban), correo real
     vía `sendTeamInviteEmail`, y el link SIEMPRE se copia al portapapeles como respaldo
     (nuevo endpoint `/api/equipo/resend` para regenerar el link de una invitación
     pendiente, ya que el token crudo original no es recuperable una vez hasheado).
     `equipo/join.ts` ahora exige que el correo de la sesión coincida con el de la
     invitación cuando esta se dirigió a un correo específico (antes cualquiera con el
     link podía unirse como ese miembro). `unirse/[token].astro` dejó de usar
     `Astro.locals.auth?.()` (residuo de Clerk, siempre `undefined` — el botón "Unirme"
     nunca aparecía a un usuario ya logueado).
   • **Endurecimiento transversal:** CSRF con igualdad exacta de origen (no
     `startsWith`) y fail-closed sin header `Origin`; `GET /api/auth/logout` eliminado
     (logout-CSRF con un simple `<img src>`); headers de seguridad aplicados a TODA
     respuesta (antes solo `text/html`) — se agregaron HSTS, X-Frame-Options,
     Referrer-Policy, Permissions-Policy, y se quitó `'unsafe-eval'` del CSP; los 6
     crons (`recordatorios`/`webhooks`/`intereses`/`expirar-cotizaciones`/
     `webhooks-limpieza`/`cobranza`) fallan CERRADO (503) si `CRON_SECRET` no está
     configurado, en vez de quedar abiertos (`src/lib/cron-auth.ts`, comparación
     constant-time); `/ops` dejó de guardar el secreto compartido como valor de la
     cookie (`cord_ops_token` ahora es un token de sesión opaco, tabla `ops_sessions`,
     hash + expiración — antes cualquier fuga de esa cookie entregaba la llave maestra
     completa y permanente); `analytics/cashflow.ts` tenía `context.locals.auth()`
     (Clerk, inexistente) → 500 garantizado en cada request, corregido; `src/env.d.ts`
     nuevo con `App.Locals` tipado (no existía — por eso TypeScript nunca marcó ninguno
     de estos residuos de `locals.auth`); dos XSS reflejados reales cerrados
     (`SupportHero.astro`/`DocsLayout.astro`, el término de búsqueda se interpolaba sin
     escapar en el estado "sin resultados") — el resto de los sinks de `innerHTML`
     señalados en la auditoría inicial (`AppLayout.astro`, `Sidebar.astro`,
     `DevWorkbench.astro`, `kits.astro`) ya tenían helpers `esc()`/`eA()`/`eH()` locales
     correctamente aplicados, así que no requerían cambio.
   • **Limpieza de residuos de Clerk:** `VerifyEmail.tsx` y
     `onboarding/{CreateWorkspace.tsx,workspace.astro}` (stubs muertos que llamaban APIs
     de Clerk inexistentes, cero callers reales) eliminados; `scripts/
     backfill-clerk-orgs.mjs` (importaba `@clerk/backend`, ni siquiera instalado) borrado;
     `scripts/set-plan.mjs` (consultaba `clerk_user_id`/`clerk_org_id`, columnas ya
     borradas por la migración — tronaba en cada corrida) reescrito sobre `owner_id`;
     `scripts/push-env.sh` dejó de subir `PUBLIC_CLERK_*` y gana las env vars reales
     (`GOOGLE_*`, `APPLE_*`, `OPS_SECRET`, `SITE`); CSS muerto `.sb-clerk-orgs` en
     `Sidebar.astro` eliminado; comentarios stale en `AppLayout.astro`/`checkout.astro`/
     `desempeno.astro`/`billing/connect/capture*.ts` corregidos.
   • **Migración de schema** (`db/schema.sql`, bloque "Auth hardening"): columnas nuevas
     en `users` (`avatar_url` — drift real, `google/callback.ts` la escribía sin que
     existiera en el schema base; `email_verified_at`, `password_changed_at`,
     `failed_login_count`, `locked_until`, `totp_backup_codes`, `totp_confirmed_at`),
     `sessions` (`last_used_at`/`revoked_at`/`absolute_expires_at` + índices que no
     existían — `user_id`/`expires_at` no tenían NINGUNO), `password_reset_tokens`
     (`used_at`), `org_members` (`token_expires_at`); tablas nuevas
     `email_verification_tokens`, `two_factor_challenges`, `ops_sessions`. El cambio de
     `sessions.id`/`password_reset_tokens.id`/`org_members.token` de texto-en-claro a
     sha256 se hizo con un **script de un solo uso separado**
     (`scripts/migrate-auth-hardening.mjs`, mismo patrón que
     `migrate-to-custom-auth.mjs`) — NO como `truncate` dentro de `schema.sql`, que
     habría sido una bomba de tiempo (el runner de migración está diseñado para
     re-ejecutarse, y un `truncate` permanente ahí habría vuelto a cerrar la sesión de
     todos en cada re-corrida futura). Efecto de una sola vez, ya aplicado: **8 sesiones
     huérfanas eliminadas** — todos los usuarios activos tuvieron que volver a iniciar
     sesión.
   • Verificado: `npm run db:migrate` + `migrate-auth-hardening.mjs` corridos contra
     Neon real (columnas/tablas confirmadas por `information_schema`); `npm run build`
     limpio (0 errores); harness de seguridad propio (14 checks) contra el dev server
     real reproduciendo cada vulnerabilidad crítica documentada — todas fallan ahora
     como se espera, incluida la forja del JWT de Apple; vectores de prueba oficiales
     del RFC 4226 para la implementación de TOTP.
   ⚠️ **Pendiente, señalado a propósito (no bloqueante):** "Conectar" una cuenta
     Google/Apple NUEVA desde "Tu cuenta" (con sesión ya iniciada) no se implementó —
     el flujo de auto-vinculación por email sin verificación adicional es exactamente la
     misma clase de vulnerabilidad que se acaba de cerrar en el login; el botón queda
     honesto ("Conecta desde /sign-in") en vez de construir algo a medias. Migrar
     `script-src 'unsafe-inline'` del CSP a nonce (decenas de `<script is:inline>` en el
     repo dependen de él) queda documentado como proyecto aparte. `0274559@up.edu.mx` es
     la única cuenta real con `password_hash` roto y sin OAuth de respaldo — necesita
     "Olvidé mi contraseña" para recuperar acceso (el resto de las `dummy_hash` son
     artefactos de migración `@migrated.local`, no personas reales).

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

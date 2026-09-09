# Dominios propios de clientes

## Estado de entrega

Implementación local, detrás de un interruptor apagado por defecto. No desplegada
ni verificada con DNS real. La migración aditiva ya se aplicó a la base configurada
en el entorno local; faltan la credencial del servicio, el despliegue coordinado y
una prueba de aceptación con un dominio controlado y una organización elegible.
El copy comercial continúa indicando que no está disponible hasta completar esa
prueba. No confundir código construido con servicio activo.

## Contrato

- Profesional o superior, con evidencia de pago efectiva; sin sandbox. No cambia
  precios, cuotas de cotizaciones ni SMTP. `custom_domain` vive en `entitlements.ts`.
- Una dirección por organización, recomendada `cotizaciones.tuempresa.com`.
  Solo subdominios de dominios registrables públicos: sin apex, IP, comodines,
  IDN, sufijos privados o dominios de Cord/Vercel. `tldts` valida el sufijo público.
- `/app/ajustes/dominio`: español/inglés, registros copiables, estado real,
  verificación manual y desconexión. Escrituras requieren permiso `ajustes`,
  sesión recientemente confirmada y límite durable por organización.
- POST reserva un reto TXT propio; no toca al proveedor. Tras comprobar el TXT,
  se añade el dominio al mismo proyecto Vercel de producción y se presentan el
  CNAME recomendado real y cualquier desafío TXT adicional.
- Activo exige propiedad Cord, asignación al proyecto correcto, DNS CNAME
  configurado y una petición HTTPS válida a la sonda de Cord. La sonda usa HMAC
  con secreto independiente del TXT y `safeFetch` con defensa SSRF/rebinding,
  sin redirecciones, tiempo y cuerpo limitados.
- `org_domains`: unicidad por hostname/organización, ENABLE/FORCE RLS,
  permisos `cord_app`, leases de cinco minutos para operaciones concurrentes.
  El resolver público solo devuelve `org_id` para un hostname exacto.
- No se adoptan ni borran aliases que Cord no haya creado. Una creación remota
  con resultado incierto necesita revisión de soporte. La desconexión revoca
  acceso antes de borrar el alias; si falla conserva una marca para reintentar.
- Las verificaciones vencen a las 24 horas. Una visita a un dominio provisionado
  por Cord vencido o pendiente intenta revalidarlo, con cooldown durable de un
  minuto y lease; mientras no se confirme no sirve documentos. Los fallos
  temporales DNS/proveedor se reintentan en visitas posteriores. No se provisionan
  aliases por visitas públicas ni se reintentan errores de soporte/desconexión.
  Ajustes distingue TXT ausente, DNS sin respuesta, revisión y baja incompleta.
  Los enlaces nuevos usan Cord cuando el dominio no tiene verificación vigente.

## Rutas y consumidores

El límite de hostname corre antes de leer cookies: solo documentos `/q`, `/i`
y sus APIs, sonda, raíz y robots. El token debe pertenecer a la organización del
hostname. Las mutaciones exigen mismo origen exacto; no aceptan la excepción del
origen principal de Cord. No se comparte sesión ni modo sandbox con el cliente.

En Vercel, una regla adicional devuelve las páginas ajenas al portal a su raíz,
incluidas páginas de marketing prerenderizadas que no pasan por Astro. Se
preservan APIs (con su guard SSR), documentos y assets necesarios. `noindex`
también se aplica antes de servir archivos estáticos. Los hosts propios de Cord
conservan su ruteo existente. La raíz muestra solo el nombre del negocio y una
indicación para abrir el enlace recibido, nunca un catálogo de documentos.

`public-links.ts` centraliza correos, recordatorios, webhooks, API v1, MCP,
cobranza, PDFs y acciones de compartir. Memoriza el origen por organización
dentro de cada request, no entre clientes o solicitudes. Ante fallo usa
`https://cordhq.app`; nunca construye emails desde el Host del llamador.

Las vistas previas del vendedor se abren en Cord para conservar su sesión y no
contabilizarlas como visitas del cliente. Copiar/enviar sí usa el dominio propio.
La política de cookies enlaza al aviso canónico de Cord desde dominios clientes.
Tras un downgrade, las lecturas en un dominio todavía verificado redirigen a
Cord; las operaciones premium quedan bloqueadas y la configuración se conserva.

## Activación y aceptación operativa

Comprobado en esta continuación:

- `scripts/migrate-custom-domains.mjs`: dry-run por defecto; `--apply` ejecuta
  únicamente ocho sentencias auditadas en una transacción con timeouts y
  validaciones antes del commit. Tabla/resolver instalados y releídos.
- `cord_app` no existe en esa base. El runner no crea roles ni cambia credenciales;
  conserva el grant condicional del SQL. La activación global del rol pertenece a
  `db/RUNBOOK-cord-app.md`; no afirmar que se probó aislamiento con ese rol en vivo.
- Los secretos de base de producción son sensibles/no recuperables por el endpoint
  consultado de Vercel. No se pudo demostrar igualdad con la conexión local; se debe
  confirmar el destino de la migración antes de habilitar producción.
- Proyecto Vercel `flouvia-cord`, ID `prj_kpALkIi9ymIvLRAGXBQNhZAKqRzE`, equipo
  `team_OKUpJ99eFyp2yPzJVJnfY8CK` (`flouvia`). `cordhq.app` y `flouvia.com` están
  registrados y usan DNS de Vercel; no se compraron dominios ni se cambió DNS.
- Se preservan también los hosts de producción `build.cordhq.app` y
  `pay.cordhq.app` en middleware y CDN. El registro de clientes sigue rechazando
  todo Cord/Flouvia: una prueba interna en esos dominios necesita un diseño
  explícito, no una excepción general ni un alta manual que omita validaciones.
- El intento de crear un token del servicio mediante la sesión CLI recibió 403.
  No se instaló una credencial ni se reutilizó la del CLI. El operador debe
  aprovisionarla por el flujo autorizado de Vercel y guardarla como **Sensitive**,
  solo **Production**, con nombre `CORD_DOMAINS_VERCEL_TOKEN`; nunca en el chat.
- `scripts/configure-custom-domains.mjs` prepara solo los tres valores no
  secretos faltantes mediante `--apply`; no sobrescribe valores existentes,
  no crea tokens y no activa la funcionalidad. Dry-run comprobado; preparación
  externa aún pendiente para coordinar los cambios simultáneos del repositorio.
- No se publicó este worktree: se observaron cambios/commits simultáneos en los
  mismos archivos y cientos de cambios ajenos. Coordinar el release antes del deploy.

Pasos de aceptación pendientes:

1. Aplicar **solo** `db/migrations/custom-domains.sql` como dueño de la base en
   una transacción. No ejecutar la migración global del worktree para esta entrega.
   Es aditiva e idempotente; el bloque también está en `db/schema.sql`.
2. Configurar en producción el interruptor y las credenciales documentadas en
   `.env.example`, con ids exactos de proyecto/equipo. Nunca habilitar una preview
   con la base de producción; el código deshabilita la capacidad en `VERCEL_ENV`
   distinto de `production`. El token del proveedor permanece en servidor.
3. Desplegar el código y sus reglas `vercel.json` juntos. Verificar que no haya
   reglas de proyecto/bulk redirects externas que se adelanten a la protección.
4. Usar una organización con Profesional pagado y un subdominio de prueba
   controlado, sin otro servicio. Completar TXT, CNAME y HTTPS en Ajustes;
   conservar TXT. No cambiar nameservers, MX ni la web principal.
5. Probar cotización/factura propias, token de otra organización (404), ausencia
   de sesión Cord en el host, CSRF, móvil y vistas previas. Probar el retorno de
   un pago en sandbox del procesador sin cargos reales. Wallets requieren revisar
   además el registro de dominios de métodos de pago en la cuenta conectada;
   esta entrega no los aprovisiona ni promete su disponibilidad.
6. Probar quitar TXT, fallo HTTPS, downgrade, desconexión/reintento y enlaces de
   correo. Revisar que `/precios` y otras páginas estáticas vuelvan a la raíz,
   los assets carguen y el header `noindex` exista en el despliegue real.
7. Solo después, actualizar la promesa pública de disponibilidad.

Si se elimina una organización antes de desconectar el dominio, su fila se borra
por cascade y el hostname deja de resolver documentos. El alias del proveedor
requiere limpieza operativa; nunca reutilizarlo automáticamente en otra cuenta.
Para pausar el servicio se apaga el interruptor: enlaces nuevos vuelven a Cord y
los hosts propios dejan de servir. No se borran dominios ni registros DNS.

## Verificación local

Pruebas `domain-policy`, `customer-domains`, `customer-domain-boundary`,
`customer-domain-schema`, `customer-domain-routing`, `public-links` y
`public-links-consumers`. La prueba SQL usa PostgreSQL local en memoria con un
rol sin bypass, no credenciales reales. `typecheck`, build, CSRF y tenancy
complementan el contrato. Las pruebas simuladas no sustituyen aceptación DNS/TLS.

Resultado de esta continuación: 83 pruebas específicas pasan; typecheck, build,
CSRF, tenancy, white-label, contrato de pagos, CSS y auditorías de Billing
Stripe/Neon pasan. La suite general no está verde: 24 pruebas legales referencian
los nombres anteriores al movimiento de documentos y una prueba de segundo
abono de factura falla. No se modificaron esos flujos en esta entrega.
La sesión permitió revisar visualmente el panel en su estado deshabilitado en
un viewport estrecho. No apareció el bloqueo contractual ni se aceptaron acuerdos
por el usuario. Faltan los estados conectando/activo y la aceptación de DNS/TLS real.

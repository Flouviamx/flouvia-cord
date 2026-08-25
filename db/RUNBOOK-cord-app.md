# Runbook — activar `cord_app` (que la RLS realmente aplique)

Estado al escribir esto (ago 2026): `db/schema.sql` habilita y fuerza RLS en ~50
tablas con políticas correctas, y **ninguna se aplica**, porque el rol con el que
Cord se conecta a Neon conserva `rolbypassrls`. Hoy el único muro entre dos
organizaciones es que el código no olvide un `where org_id = ...`.

Este runbook lo cierra. Son dos ventanas separadas, cada una con su criterio de
salida y su revert. **Nada de esto se ejecuta desde el repositorio**: vive en la
consola de Neon y en las variables de entorno de Vercel.

## Antes de empezar

El código ya está preparado. Verifica que sigue así:

```bash
npm run typecheck
npm run test:payments     # incluye security:tenancy
npm run build
```

`security:tenancy` debe pasar. Su lista `PENDING` (en `scripts/tenancy-lint.mjs`)
enumera lo que **todavía no** está migrado, con el motivo de cada uno.

### Bloqueadores: ninguno

`security:tenancy` reporta **sin deuda pendiente**. Los ocho caminos que corren
antes de que exista membresía —o que cruzan organizaciones por necesidad— se
resolvieron con funciones SQL `security definer` estrechas, el mismo patrón que
ya usaba el link público (`cord_resolve_public_quote`). El id o el token
*identifican*; no autorizan. El trabajo posterior vuelve siempre a `withOrgTx`
con el `org_id` que la función devolvió.

| Flujo | Función | Por qué no cabía en un carril |
|---|---|---|
| Baja de cuenta | `cord_account_owned_orgs`, `cord_account_scrub` | Necesita ver a los **otros** miembros para saber si una organización queda huérfana. |
| Invitación de equipo | `cord_resolve_invitation` | Quien acepta todavía no es miembro. |
| Login SAML | `cord_resolve_sso_connection` | El id de conexión viaja en una URL pública y llega sin sesión. |
| Descubrimiento por dominio | `cord_resolve_sso_domain` | Se pregunta desde la pantalla de entrada. |
| Error de validación SAML | `cord_sso_record_error` | Corre en el `catch`, donde puede no haberse resuelto la organización. |
| ¿Debe entrar por SSO? | `cord_sso_requirement_for` | Se pregunta mientras intenta entrar por otro método. |
| Correo entrante | `cord_resolve_inbound_email` | El proveedor no sabe de qué organización es el mensaje. |
| Alta de organización | *(ninguna)* | No hizo falta: la organización nace a nombre de quien llama, y `withUserTx` ya lo cubre. |

**El caso que obligó a este diseño** fue la baja de cuenta. Su comprobación de
"¿queda alguien más en esta empresa?" usa
`exists(select 1 from org_members m2 where m2.user_id <> ${userId})`. Envuelta a
ciegas en `withUserTx`, la política solo deja ver las filas del propio usuario:
ese `exists` habría dado **siempre falso**, toda organización se habría
clasificado como de dueño único y se habría **borrado junto con la cuenta**.
Silencioso y destructivo. Por eso propiedad y orfandad se definen una sola vez,
dentro de la misma función.

### Dos huecos de la migración original, corregidos

`db/cord-app-role.sql` no concedía `execute` sobre dos funciones que sí están
revocadas de `public`:

- **`cord_effective_plan(uuid)`** — la consultan las políticas y media
  aplicación (entitlements, webhooks, SSO, cobranza). Sin el grant, la ventana 1
  habría roto todo lo que depende del plan efectivo.
- **`cord_resolve_public_invoice(text)`** — la factura pública `/i/[token]`.

Ambos grants están ya en el archivo, junto con los de las funciones nuevas.

## Ventana 1 — crear el rol y apuntar `DATABASE_URL`

1. Ejecuta `db/cord-app-role.sql` **como dueño de la base**, en Neon.
   No define contraseña: establécela fuera del repositorio.
2. Construye el `DATABASE_URL` con esa credencial (endpoint **pooled**).
3. Cámbialo primero en **staging**, no en producción.
4. Corre `npm run security:rls` contra esa base.

**Criterio de salida** — se cumple cuando:

- `security:rls` reporta el rol sin `SUPERUSER`/`BYPASSRLS`;
- lo único que reporta como diferido es `orgs` / `org_members` sin `FORCE`;
- pasan a mano: login, cambio de organización, entorno de prueba, link público
  `/q/[token]`, factura pública `/i/[token]`, webhook de Stripe, un cron, el MCP
  y Cord Ops;
- 48 horas en staging sin incidencias.

**Revert:** cambiar `DATABASE_URL` de vuelta al rol anterior. No se elimina
`cord_app` ni se desactiva RLS.

## Ventana 2 — `FORCE` sobre `orgs` y `org_members`

Solo después de que la ventana 1 lleve 48 h estable.

1. Ejecuta `db/cord-force-bootstrap-rls.sql`.
2. Vuelve a correr `npm run security:rls`: ahora no debe quedar nada diferido.

**Revert:** las dos sentencias `no force` comentadas al final de ese archivo. No
desactiva RLS ni cambia `DATABASE_URL`.

## Qué cambió en el código para que esto sea posible

- **69 archivos migrados** a los carriles de `src/lib/db.ts` (regla 30 de
  `docs/estandares-ingenieria.md`).
- **Carril de Ops nuevo** (`withOpsTx`, `app.scope='ops'`): Cord Ops leía todas
  las organizaciones solo porque el rol bypaseaba RLS. Ahora es explícito y lo
  exige `opsScope`, que el middleware marca tras `validateOpsSession()`.
- **Carril de sistema en los crons** (`withSystemTx`): el barrido cross-org corre
  en `app.scope='system'`; el trabajo de cada organización vuelve a `withOrgTx`.
- **Política de `orgs` ampliada a la MEMBRESÍA**: antes solo reconocía al dueño,
  así que un miembro invitado se habría quedado sin su organización en el
  selector.
- **`scripts/tenancy-lint.mjs`**: impide que la deuda vuelva a crecer.

# Cord

**De la propuesta al pago. Todo en un solo link.**

Cord es la plataforma de cierre comercial de [Flouvia](https://flouvia.com): cubre
el ciclo de ventas desde la propuesta hasta el pago —cotización con precios
negociados, link público para el cliente, firma, cobro en línea, facturación y
cobranza— para cualquier negocio y país.

Producción: **[cordhq.app](https://cordhq.app)**

## Desarrollo

```bash
nvm use            # Node 24.15.0 (.nvmrc); el proyecto exige >=22.12.0
npm install
cp .env.example .env   # .env.example documenta cada variable y su obligatoriedad
npm run dev        # localhost:4321
```

Otros comandos:

```bash
npm run build          # build de producción
npm run preview        # servir el build localmente
npm run typecheck      # tsc --noEmit
npm test               # vitest (unitarios puros: sin red, sin BD, sin proveedores)
npm run db:migrate     # aplicar el schema
npm run test:payments  # suite completa: tests + todos los contratos security:*
```

Los scripts especializados se descubren en `package.json`; no se duplican aquí
para evitar drift.

## Stack

Astro 7 en modo SSR sobre Vercel · Neon PostgreSQL con aislamiento por
organización vía RLS · autenticación propia (Argon2id, OAuth de Google y Apple,
passkeys, TOTP) · Stripe Billing para la suscripción y Stripe Connect para los
cobros · Resend para correo transaccional · Facturapi para CFDI 4.0 en México y
Verifactu para España · Anthropic para las capacidades de IA · PostHog para
analítica de producto · GSAP en landing y login.

## Documentación

- [`CLAUDE.md`](CLAUDE.md) — índice operativo y mapa de lectura por dominio.
- [`docs/README.md`](docs/README.md) — documentación canónica: reglas permanentes,
  estado vigente por dominio (`docs/estado/`) e historial (`docs/historial/`).
- [`db/schema.sql`](db/schema.sql) — schema canónico de la base de datos.
- [`.env.example`](.env.example) — fuente única de variables de entorno.

En caso de discrepancia manda el código ejecutable, el schema, `package.json` y
`.env.example`; después las reglas permanentes, después el estado vigente y por
último el historial.

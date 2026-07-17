# Cord

**Cotizaciones B2B profesionales.** Crea, envía y da seguimiento a tus cotizaciones
con precios negociados, términos de crédito (Contado / Net 30 / Net 60), PDF con tu
marca y CFDI 4.0. Un producto de [Flouvia](https://flouvia.com).

🌐 **cordhq.app**

## Desarrollo

```bash
nvm use          # Node 22.13
npm install
cp .env.example .env   # llenar keys (Supabase, Clerk, Stripe)
npm run dev      # localhost:4321
```

## Stack

Astro 6 (SSR) · Vercel · Clerk · Supabase · Stripe Billing · GSAP

El contexto completo del proyecto (arquitectura, modelo de datos, fases y sistema
de diseño) está en [CLAUDE.md](CLAUDE.md). El schema de la base de datos está en
[supabase/schema.sql](supabase/schema.sql).

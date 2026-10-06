---
title: "cord login without copying keys, and a wizard that integrates Cord for you"
description: "How we built the Cord CLI's device flow, why the terminal gets a single-use restricted key and what the npx @flouviahq/cli wizard does."
date: "2026.10.06"
type: "DOCS"
topic: "DX"
authors:
  - "CORD ENG"
readTime: "8 MIN"
featured: true
---
The first contact with a payments platform is usually the worst: log into the dashboard, find the keys section, copy a 50-character string, paste it into a `.env` and hope you didn't push it to GitHub. We wanted Cord to be one command:

```bash
npx @flouviahq/cli
```

## The device flow

`cord login` uses the same pattern your TV uses when it asks you to sign in from your phone (the RFC 8628 device flow):

1. The terminal asks `POST /api/cli/login` for a code. Cord generates two things: a **device code** of 32 random bytes that only the terminal knows, and a short **user code**, like `WXYZ-2346`, for you to see.
2. The terminal opens your browser at `/app/cli/autorizar?codigo=WXYZ-2346`. There, with your normal Cord session, you confirm the code matches the one in your terminal and click **Authorize**.
3. Meanwhile the terminal asks `POST /api/cli/login/claim` every two seconds with its device code. As soon as you approve, it gets the key.

A few decisions that aren't obvious:

- **Only the sha256 of the device code lives in the database.** Someone reading the table couldn't claim anything.
- **The user code avoids characters that get confused** when read aloud (0 and O, 1, I and L, 5 and S). It's 8 characters from a 25-character alphabet.
- **The table has no access policies.** It has forced row-level security and no policies, so no direct query sees it. It's only touched by four narrow `security definer` functions: create, find, decide and claim.
- **The key is handed over once.** It's stored encrypted until the terminal claims it; at that point the record becomes `reclamado` and the secret is deleted. The code expires in 10 minutes.
- **The terminal only opens a browser URL with the same origin as the API.** The server doesn't decide which site to send you to.

## A key that can't do damage

The terminal doesn't get an admin key. It gets a **restricted test key** (`rk_test_`) with three permissions: use the simulators, read events and propose setups. It expires in 90 days and shows up in the API panel as `CLI · <your machine>`, where you can revoke it.

Cord's restricted keys have a level per resource, derived from the route. A new API route is forbidden to them until someone decides which resource it belongs to, and a test fails if a route is left without one.

Because test keys count against the plan limit, **reconnecting the same machine revokes that machine's previous key**. One terminal, one key.

## One authorization for everything

Your project also needs a key so its server can talk to Cord. When the wizard is going to integrate a project, the authorize screen shows one more checkbox: **"Also create a key for this project"**. If you leave it checked, Cord creates a test Secret Key, encrypts it together with the CLI's and hands both over once. The wizard writes it to your `.env.local`.

If your plan has no room for another key, the CLI still connects and the page tells you; nothing breaks halfway.

## The wizard

With no command, the CLI opens a wizard with menus, progress indicators and a final summary. Step by step:

1. **Connects the terminal** with the flow above.
2. **Asks what to do**: set up the account with AI, integrate the project and test webhooks.
3. **Sets up your account**: reads your website and price list, shows you the proposal and waits for you to approve it in the browser.
4. **Integrates the project**: detects the framework (Next.js, Astro, Express, Laravel, Django, Flask or FastAPI), shows you exactly what it will do and, if you accept, installs the SDK with your package manager and creates two routes: one that verifies every webhook signature and a proxy for Cord Elements.
5. **Listens for webhooks**: opens a test session, saves its secret to your `.env.local` and forwards every event to your local server.

Three rules the wizard never breaks:

- **It doesn't overwrite files.** If the route already exists, it leaves it and tells you.
- **It only writes keys to an environment file that git ignores.** If it can't find one, it writes nothing and tells you which variable to add.
- **It doesn't touch the other lines in your `.env`.** It only updates or adds Cord's variables.

```text
◆  Esto es lo que voy a hacer
│  +  instalar    @flouviahq/node @flouviahq/elements  · con npm
│  +  crear       app/api/webhooks/cord/route.ts       · verifica la firma de cada webhook
│  +  crear       app/api/cord/[...path]/route.ts      · proxy seguro para Cord Elements
│  ~  escribir    .env.local                           · CORD_SECRET_KEY de prueba
```

## No dependencies

The interface uses `@clack/prompts`, but the published package depends on nothing: esbuild bundles it with everything else into a single file at build time. Installing the CLI doesn't bring a new dependency tree to your machine.

## Try it

```bash
npx create-next-app@latest my-store --ts --app
cd my-store
npx @flouviahq/cli
```

When it's done, run `npm run dev` in one terminal and `npx @flouviahq/cli trigger quote.approved` in another: the event reaches your route, signed, and the terminal shows you the 200.

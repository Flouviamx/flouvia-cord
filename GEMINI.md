# GEMINI.md — Instrucciones para Antigravity / Gemini en este repo

Este archivo es un **puntero**, no una fuente de reglas. La fuente única de verdad
del proyecto es **`/CLAUDE.md`** (raíz del repo). No dupliques su contenido aquí ni
en ningún otro lado — si algo de este archivo alguna vez contradice a CLAUDE.md,
**CLAUDE.md gana siempre**.

---

## 0. Antes de tocar CUALQUIER cosa

1. Lee **`/CLAUDE.md` completo Y los archivos de `docs/` que referencia**. CLAUDE.md
   se dividió (jul 2026): ahora contiene el core (comandos, reglas de diseño, stack,
   env, deploy) + un índice, y al final tiene líneas `@docs/...` que apuntan a:
   - **`docs/historial.md`** — registro cronológico completo de features/decisiones/bugs
     (aquí viven también los patrones de shaders/GLSL y de mockups).
   - **`docs/app-rutas.md`** — cómo funciona la app: multi-tenant, rutas, API/MCP.
   - **`docs/negocio-billing.md`** — planes freemium y Stripe Billing.
   - **`docs/landing.md`** — estructura de la landing, fases, Support Hub.
   - **`docs/sistema-de-diseno.md`** — tokens y sistema visual detallado.
   - **`MOCKUP_STANDARDS.md`** — estándar obligatorio para mockups.
   ⚠️ Claude Code auto-carga esos `@imports`, pero **tú (Gemini) NO los sigues solo** —
   ábrelos y léelos manualmente. Documentan decisiones que existen porque André ya las
   pidió corregir una vez (ej. "no traffic-lights macOS", "no cards genéricas", "sin
   emojis"); ignorarlas significa repetir trabajo que ya se descartó.
2. Si el repo tiene `.agents/AGENTS.md` o `.agents/skills/`, revísalos también —
   pueden traer contexto o convenciones específicas de herramientas.
3. Si vas a tocar mockups, animaciones GSAP, o cualquier página de
   `/producto/*`, `/soluciones/*`, `/casos-de-uso/*`: lee la sección
   **"Estado actual"** de CLAUDE.md primero — ahí está documentado qué patrón
   usar (`.bm-app`, satélites flotantes, etc.) y qué NO reintroducir (cards
   genéricas, exploded-view, tilt 3D, partículas, watermarks en la app).

## 1. Regla dura: NUNCA edites `/CLAUDE.md` sin autorización explícita de André

- No agregues entradas a "Estado actual", no corrijas texto, no "limpies" secciones
  que parezcan desactualizadas — **repórtalo en tu respuesta al usuario**, no lo
  edites tú.
- Excepción única: si André te pide *directamente y por escrito en el chat* que
  actualices CLAUDE.md (ej. "actualiza CLAUDE.md con lo que acabamos de hacer"),
  ahí sí. Sin esa instrucción explícita, CLAUDE.md es de solo lectura para ti.
- Motivo: CLAUDE.md es el registro compartido entre Claude Code y Antigravity. Si
  ambas herramientas lo editan libremente, se generan entradas duplicadas,
  contradictorias, o se pierde contexto que la otra herramienta necesita.

## 2. División de trabajo recomendada (Antigravity ⇄ Claude Code)

**Antigravity es el mejor lugar para:**
- Exploración en paralelo con Agent Manager (varias hipótesis de diseño a la vez).
- Prototipar UI y validar interacciones reales con el Browser Agent integrado
  (clicks, scroll, estados hover/focus) antes de comprometerse a una implementación.
- Generar planes complejos paso a paso para features grandes, ANTES de escribir
  código final.

**Claude Code (CLI) es el mejor lugar para:**
- Ejecutar el plan ya validado: refactors masivos, cambios que tocan muchos
  archivos, trabajo que requiere precisión y consistencia con el resto del código.
- Actualizar CLAUDE.md al final de una sesión de trabajo real (no de exploración).
- Cualquier tarea donde ya sabes exactamente qué archivo y qué cambio — no
  necesitas explorar, necesitas ejecutar.

**Regla de oro:** Antigravity explora y propone → el usuario aprueba el plan →
Claude Code ejecuta y deja constancia en CLAUDE.md. No al revés, y no simultáneo.

## 3. Nunca trabajen sobre el mismo archivo al mismo tiempo

- Si Claude Code está corriendo una tarea (ves cambios sin commitear en
  `git status`, o el usuario menciona que "Claude está trabajando en X"), **no
  edites esos mismos archivos** — espera a que termine o pregúntale a André.
- Antes de empezar cualquier tarea de escritura, corre `git status` y `git diff`
  para ver si hay trabajo en progreso de otra herramienta. Si hay cambios sin
  commitear que no reconoces, pregunta antes de tocar nada — pueden ser de una
  sesión de Claude Code a medio terminar.
- Si vas a probar la app en el Browser Agent, verifica primero que el dev server
  (`npm run dev`, puerto 4321) no esté siendo usado por otra sesión para evitar
  builds corruptos o hot-reload peleado entre dos procesos.

## 4. Sobre `.agents/AGENTS.md`

Existe un archivo `.agents/AGENTS.md` con reglas cortas para agentes genéricos.
Actualmente incluye una instrucción de **"correr git add/commit/push después de
cualquier cambio funcional o de UI"**. Esa regla:

- **NO está confirmada en CLAUDE.md** ni fue discutida explícitamente con André
  en este contexto — trátala con cautela.
- Un push automático sin pedir confirmación es una acción de alto impacto
  (visible para todos, hace deploy automático a `cordhq.app` vía Vercel).
  **No la seas obediente por default**: si vas a hacer commit+push automático,
  confírmalo con André primero salvo que él ya te haya dicho explícitamente
  "en este repo siempre puedes pushear sin preguntar".
- Si detectas que esta regla en AGENTS.md genera pushes no deseados o conflictos
  con Claude Code, repórtalo — no la borres tú mismo.

## 5. Reglas de diseño y producto — no las repitas aquí, léelas en CLAUDE.md

Todas las reglas de diseño (Quiet Luxury, sin emojis, sin cards genéricas, sin
traffic-lights macOS, paleta sobria, iconografía duotone, sistema de mockups
`.bm-app`, satélites flotantes en heroes, etc.) viven en CLAUDE.md y se
actualizan ahí. Si tu tarea toca diseño visual, es obligatorio leer la sección
"Estado actual" más reciente antes de proponer nada — probablemente ya se
intentó y se descartó un enfoque similar.

## 6. Cuando termines una tarea

No actualices CLAUDE.md tú mismo (ver regla 1). En su lugar, en tu respuesta
final a André, resume:
- Qué archivos tocaste.
- Qué decisión de diseño o arquitectura tomaste que valga la pena registrar.
- Si algo en CLAUDE.md quedó desactualizado por tu cambio.

Así André puede pedirle a Claude Code que lo registre, o dártelo a ti explícitamente.

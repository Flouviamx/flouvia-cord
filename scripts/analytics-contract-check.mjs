// Contrato de la analítica de producto. Corre en `npm run security:analytics`.
//
// Por qué existe este script
// ─────────────────────────
// El carril de facturas se dio por instrumentado y NO emitía un solo evento.
// Nada lo detectó: no es un error de tipos, no rompe el build, y un dashboard
// vacío se lee igual que "todavía no lo usa nadie". Peor: el 14 ago 2026 un
// cambio de política de tráfico interno silenció TODOS los eventos comerciales
// (los descartaba en vez de etiquetarlos) y pasó un mes hasta que se notó. Los
// eventos no emitidos no se rellenan después.
//
// Cinco reglas, cada una por un hueco real:
//   R1  un evento capturado que NO está en el catálogo — un typo captura para
//       siempre `quote_aproved` y el embudo pierde el paso sin avisar;
//   R2  una entrada del catálogo SIN call site — "no se vuelve a caer en
//       silencio"; si un evento aún no se emite a propósito, va a SIN_CALL_SITE
//       con el motivo escrito;
//   R3  un evento de ingreso (`revenue: true`) emitido sin su clave de
//       idempotencia — Stripe reintenta sus webhooks por diseño y el ingreso se
//       contaría dos veces;
//   R4  un `trackServer` / `trackPaymentReceived` sin `is_sandbox`/`is_demo` —
//       el parámetro tiene default `false`, así que olvidarlo no rompe nada:
//       solo mete la org demo en el revenue real;
//   R5  desajuste de superficie/ámbito, o `posthogServer.capture(` fuera de
//       `src/lib/posthog-server.ts` (todo evento server pasa por un helper
//       tipado).
//
// Además: un bloque CONTRATOS que verifica que los propios helpers no hayan
// regresado (que el tráfico interno se ETIQUETE y no se descarte, que el
// `before_send` del cliente raspe `$pathname`). Eso no lo atrapa ningún tipo.
//
// Cómo detecta
// ────────────
// Se enmascaran comentarios y literales (para no leer prosa como código), se
// localiza cada LLAMADA de captura —sea la que sea la construcción que la
// encierra: `after(...)`, `await`, `Promise.all`— y se leen sus argumentos. El
// nombre del evento se resuelve desde un literal, un ternario de literales, o
// un identificador declarado en el mismo archivo. Un nombre no resoluble es una
// violación: un nombre dinámico anula el catálogo entero.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const SRC = join(ROOT, 'src');

const catalog = await import(new URL('../src/lib/analytics-events.ts', import.meta.url).href);
const { ANALYTICS_EVENTS, AUTO_PROPS } = catalog;
const CATALOG_NAMES = new Set(Object.keys(ANALYTICS_EVENTS));

// `--taxonomy`: volcado limpio para sincronizar las descripciones de PostHog.
// Sale ANTES de cualquier verificación para que sea un dump puro en stdout.
if (process.argv.includes('--taxonomy')) {
  const tax = Object.entries(ANALYTICS_EVENTS).map(([name, s]) => ({
    name, description: s.description, rail: s.rail, revenue: s.revenue,
  }));
  process.stdout.write(JSON.stringify(tax, null, 2) + '\n');
  process.exit(0);
}

// ── Entradas del catálogo que aún NO se emiten, con motivo. Solo ENCOGE. ────
const SIN_CALL_SITE = new Map([
  // (vacío — todo evento del catálogo tiene al menos un call site)
]);

// ── Helpers de captura reconocidos ─────────────────────────────────────────
// nombre → { nameArg, bagArg, minArgs, injects } (índices 0-based)
//   nameArg: -1 si el nombre no es un argumento (posthogServer.capture)
//   bagArg:  índice del objeto de propiedades
//   minArgs: aridad mínima para no violar R4 (flags sandbox/demo presentes)
//   injects: propiedades que el helper añade y el call site no necesita pasar
const HELPERS = {
  trackServer: { nameArg: 0, bagArg: 2, minArgs: 5, injects: [] },
  trackUser: { nameArg: 0, bagArg: 2, minArgs: 3, injects: [] },
  trackPaymentReceived: { nameArg: null, fixedName: 'payment_received', bagArg: 8, minArgs: 8, injects: [] },
  cordTrack: { nameArg: 0, bagArg: 1, minArgs: 1, injects: [] },
  trackEvent: { nameArg: 0, bagArg: 1, minArgs: 1, injects: [] },
};

// Envoltorios que reenvían a un helper: su nombre de evento tampoco es literal
// en el call site del helper, así que se registran aquí — declarados Y
// verificados (si el reenvío deja de cumplirse, el script falla).
//
// (vacío: el carril `docs` de DocsLayout.astro se registrará aquí cuando
// aterrice, junto a sus 5 eventos en el catálogo — ver analytics-events.ts.)
const ENVOLTORIOS = [];

// Contratos que ningún tipo verifica. `exige` debe estar; `prohibe` no debe estar.
const CONTRATOS = [
  {
    archivo: 'src/lib/posthog-server.ts',
    exige: /is_internal/,
    porque: 'El tráfico interno se ETIQUETA (is_internal), no se descarta.',
  },
  {
    archivo: 'src/lib/posthog-server.ts',
    prohibe: /isInternalAnalyticsOrg\([^)]*\)\s*\)?\s*return\b/,
    porque: 'Volver al early-return deja de nuevo a Ops invisible en depuración.',
  },
  {
    archivo: 'src/lib/posthog-server.ts',
    exige: /from '\.\/analytics-events'/,
    porque: 'Sin el catálogo importado, trackServer vuelve a aceptar cualquier string.',
  },
  {
    archivo: 'src/components/CordAnalytics.astro',
    exige: /\$pathname[\s\S]{0,400}?cordScrubUrl|cordScrubUrl[\s\S]{0,400}?\$pathname/,
    porque: 'before_send tiene que raspar $pathname, no sólo $current_url: PostHog copia la URL inicial al perfil de persona vía $set_once.',
  },
  {
    archivo: 'src/components/CordAnalytics.astro',
    prohibe: /phCaptureDisabled\s*=\s*[^;]*phInternal/,
    porque: 'El tráfico interno se ETIQUETA, no se apaga: phInternal no puede entrar en phCaptureDisabled.',
  },
];

// ── Enmascarado (de payments-contract-check, misma heurística de regex) ─────
function enmascarar(src) {
  const out = src.split('');
  const borra = (i) => { if (src[i] !== '\n') out[i] = ' '; };
  const ANTES_DE_REGEX = /[(,=:[!&|?{};+\-*%^~<>]$|\b(return|typeof|case|in|of|new|delete|void|do|else|yield|await)$/;
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') { borra(i); i++; }
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) { borra(i); i++; }
      borra(i); borra(i + 1); i += 2;
      continue;
    }
    if (c === '/') {
      const previo = src.slice(0, i).replace(/\s+$/, '');
      if (ANTES_DE_REGEX.test(previo)) {
        borra(i); i++;
        let clase = false;
        while (i < src.length) {
          const ch = src[i];
          if (ch === '\\') { borra(i); borra(i + 1); i += 2; continue; }
          if (ch === '\n') break;
          if (ch === '[') clase = true;
          else if (ch === ']') clase = false;
          else if (ch === '/' && !clase) { borra(i); i++; break; }
          borra(i); i++;
        }
        while (i < src.length && /[a-z]/.test(src[i])) { borra(i); i++; }
        continue;
      }
      i++;
      continue;
    }
    if (c === '"' || c === "'") {
      const comilla = c;
      borra(i); i++;
      while (i < src.length && src[i] !== comilla) {
        if (src[i] === '\\') { borra(i); borra(i + 1); i += 2; continue; }
        if (src[i] === '\n') break;
        borra(i); i++;
      }
      borra(i); i++;
      continue;
    }
    if (c === '`') {
      borra(i); i++;
      let profundidad = 0;
      while (i < src.length) {
        if (src[i] === '\\') { borra(i); borra(i + 1); i += 2; continue; }
        if (src[i] === '$' && src[i + 1] === '{') { profundidad++; borra(i); borra(i + 1); i += 2; continue; }
        if (src[i] === '}' && profundidad > 0) { profundidad--; borra(i); i++; continue; }
        if (src[i] === '`' && profundidad === 0) break;
        borra(i); i++;
      }
      borra(i); i++;
      continue;
    }
    i++;
  }
  return out.join('');
}

// En un .astro solo interesa el frontmatter (`---`) y los `<script>`; el markup
// tiene `{expr}` de Astro que descuadraría el balanceo de llaves.
function scannablePortions(rel, raw) {
  if (!rel.endsWith('.astro')) return [{ text: raw, offset: 0 }];
  const parts = [];
  const fm = raw.match(/^---\n([\s\S]*?)\n---/);
  if (fm) parts.push({ text: fm[1], offset: fm.index + 4 });
  const re = /<script\b[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(raw))) parts.push({ text: m[1], offset: m.index + m[0].indexOf(m[1]) });
  return parts;
}

function splitTopLevelArgs(masked, open) {
  let depth = 0;
  const args = [];
  let start = open + 1;
  for (let i = open; i < masked.length; i++) {
    const c = masked[i];
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') {
      depth--;
      if (depth === 0) { args.push([start, i]); return { args, end: i }; }
    } else if (c === ',' && depth === 1) {
      args.push([start, i]);
      start = i + 1;
    }
  }
  return null;
}

const KEYWORDS = new Set([
  'true', 'false', 'null', 'undefined', 'void', 'typeof', 'new', 'await',
  'this', 'body', 'window', 'document', 'String', 'Number', 'Boolean', 'Math',
]);

function stringLiteralsIn(raw, s, e) {
  const out = [];
  const re = /(['"])((?:\\.|(?!\1).)*)\1/g;
  let m;
  const slice = raw.slice(s, e);
  while ((m = re.exec(slice))) out.push(m[2]);
  return out;
}

function ternaryLiteralsIn(raw, s, e) {
  const out = [];
  const re = /[?:]\s*(['"])([^'"]+)\1/g;
  let m;
  const slice = raw.slice(s, e);
  while ((m = re.exec(slice))) out.push(m[2]);
  return out;
}

// Resuelve los nombres de evento posibles para el span [s,e] del primer arg.
function resolveEventNames(raw, masked, s, e) {
  const argRaw = raw.slice(s, e).trim();
  if (/^(['"])[A-Za-z0-9_]+\1$/.test(argRaw)) return { names: [argRaw.slice(1, -1)] };

  // ternario inline de literales: `cond ? 'a' : 'b'`
  if (/\?[\s\S]*:/.test(masked.slice(s, e))) {
    const lits = ternaryLiteralsIn(raw, s, e);
    if (lits.length) return { names: [...new Set(lits)] };
  }

  // identificador → buscar su declaración en el mismo archivo
  const idents = (masked.slice(s, e).match(/\b[A-Za-z_$][\w$]*\b/g) || [])
    .filter((x) => !KEYWORDS.has(x));
  for (const id of idents) {
    const decl = new RegExp(`(?:const|let|var)\\s+${id}\\s*(?::[^=]*?)?=\\s*`).exec(raw);
    if (!decl) continue;
    const from = decl.index + decl[0].length;
    let depth = 0;
    let j = from;
    while (j < masked.length) {
      const ch = masked[j];
      if ('([{'.includes(ch)) depth++;
      else if (')]}'.includes(ch)) depth--;
      else if (ch === ';' && depth === 0) break;
      else if (ch === '\n' && depth === 0 && /^\s*(const|let|var|return|if|await)\b/.test(masked.slice(j + 1, j + 12))) break;
      j++;
    }
    const rhsRaw = raw.slice(from, j);
    const rhsMasked = masked.slice(from, j);
    if (/^(['"])[A-Za-z0-9_]+\1$/.test(rhsRaw.trim())) return { names: [rhsRaw.trim().slice(1, -1)] };
    if (/\?[\s\S]*:/.test(rhsMasked)) {
      const lits = ternaryLiteralsIn(rhsRaw, 0, rhsRaw.length);
      if (lits.length) return { names: [...new Set(lits)] };
    }
  }
  return { names: null };
}

// Claves de primer nivel de un objeto-literal `{...}` en el span [s,e].
// Cubre taquigrafía (`{ total, source }`), comillas (`{ 'a-b': 1 }`) y spreads:
// `...{ ... }` se recursa; `...ident` marca la bolsa OPACA.
function objectKeys(raw, masked, s, e) {
  const open = masked.indexOf('{', s);
  if (open === -1 || open >= e) return { keys: new Set(), opaque: false, absent: true };
  const keys = new Set();
  let opaque = false;
  const KEY_AFTER_BRACE = /^\{\s*(?:\.\.\.)?\s*(['"]?)([A-Za-z_$][\w$]*)\1\s*[:,}]/;
  const KEY_AFTER_COMMA = /^,\s*(?:\.\.\.)?\s*(['"]?)([A-Za-z_$][\w$]*)\1\s*[:,}]/;
  let d = 0;
  for (let k = open; k < e; k++) {
    const c = masked[k];
    if (c === '{' || c === '[' || c === '(') {
      d++;
      if (c === '{' && d === 1) {
        const m = KEY_AFTER_BRACE.exec(masked.slice(k, e));
        if (m) keys.add(m[2]);
      }
      continue;
    }
    if (c === '}' || c === ']' || c === ')') { d--; if (d === 0) break; continue; }
    if (d === 1 && c === ',') {
      const m = KEY_AFTER_COMMA.exec(masked.slice(k, e));
      if (m) keys.add(m[2]);
    }
    if (d === 1 && c === '.' && masked.slice(k, k + 3) === '...') {
      const after = masked.slice(k + 3).replace(/^\s+/, '');
      if (/^\{/.test(after)) {
        const innerOpen = masked.indexOf('{', k);
        const inner = objectKeys(raw, masked, innerOpen, e);
        for (const key of inner.keys) keys.add(key);
      } else if (/^[A-Za-z_$]/.test(after)) {
        opaque = true; // `...algo` — no se puede leer la bolsa completa
      }
    }
  }
  return { keys, opaque, absent: false };
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.git' || entry === 'dist') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|astro)$/.test(entry)) out.push(full);
  }
  return out;
}

const lineOf = (raw, idx) => raw.slice(0, idx).split('\n').length;

// ── Recorrido ──────────────────────────────────────────────────────────────
const violaciones = [];
const vistos = new Set();
let totalCallSites = 0;
let rawCaptureOutsideLib = 0;

const helperNames = { ...HELPERS };
for (const w of ENVOLTORIOS) helperNames[w.nombre] = { nameArg: w.nameArg, bagArg: w.bagArg, minArgs: w.minArgs, injects: w.injects };
const HELPER_RE = new RegExp(`\\b(${Object.keys(helperNames).join('|')})\\??\\.?\\s*\\(`, 'g');

for (const file of walk(SRC)) {
  const rel = relative(ROOT, file);
  const raw = readFileSync(file, 'utf8');
  if (!/track(Server|User|Event|PaymentReceived|DocsEvent)|cordTrack|posthogServer\.capture/.test(raw)) continue;

  for (const { text, offset } of scannablePortions(rel, raw)) {
    const masked = enmascarar(text);

    // posthogServer.capture( fuera de la lib (R5)
    if (rel !== 'src/lib/posthog-server.ts') {
      let cm;
      const capRe = /posthogServer\.capture\s*\(/g;
      while ((cm = capRe.exec(masked))) {
        rawCaptureOutsideLib++;
        const ln = lineOf(raw, offset + cm.index);
        // intentar leer event: '...' dentro
        const sub = splitTopLevelArgs(masked, cm.index + masked.slice(cm.index).indexOf('('));
        let evName = null;
        if (sub && sub.args.length) {
          const em = /event\s*:\s*(['"])([A-Za-z0-9_]+)\1/.exec(text.slice(sub.args[0][0], sub.args[0][1]));
          if (em) { evName = em[2]; vistos.add(evName); }
        }
        violaciones.push({
          rel, ln,
          msg: `posthogServer.capture(${evName ? ` '${evName}'` : ''}) fuera de src/lib/posthog-server.ts — usa trackServer/trackUser (R5)`,
        });
      }
    }

    let hm;
    HELPER_RE.lastIndex = 0;
    while ((hm = HELPER_RE.exec(masked))) {
      const helper = hm[1];
      const spec = helperNames[helper];
      if (!spec) continue;
      // Saltar la DEFINICIÓN del helper / envoltorio, no una llamada.
      const antes = masked.slice(Math.max(0, hm.index - 40), hm.index);
      if (/\b(function\s+\*?\s*|=>\s*|export\s+(async\s+)?function\s+|async\s+function\s+)$/.test(antes)) continue;
      const open = masked.indexOf('(', hm.index + hm[1].length);
      if (open === -1) continue;
      const parts = splitTopLevelArgs(masked, open);
      if (!parts) continue;
      totalCallSites++;
      const ln = lineOf(raw, offset + hm.index);
      const at = `${rel}:${ln}`;

      // ── nombre del evento ──
      let names;
      if (spec.fixedName) {
        names = [spec.fixedName];
      } else if (spec.nameArg != null && parts.args[spec.nameArg]) {
        const [s, e] = parts.args[spec.nameArg];
        const r = resolveEventNames(text, masked, s, e);
        names = r.names;
      }
      if (!names) {
        // Reenvío de un envoltorio registrado: `cordTrack(event, ...)` dentro de
        // `function trackDocsEvent(event, ...)`. El nombre real ya se valida en
        // los call sites del envoltorio.
        const arg0raw = parts.args[spec.nameArg] ? text.slice(parts.args[spec.nameArg][0], parts.args[spec.nameArg][1]).trim() : '';
        const esReenvio = ENVOLTORIOS.some((w) => w.archivo === rel)
          && /^(event|evt|name|eventName)$/.test(arg0raw);
        if (!esReenvio) {
          violaciones.push({ rel, ln, msg: `${helper}(...) — nombre de evento no resoluble (¿dinámico?). Un nombre dinámico anula el catálogo.` });
        }
        continue;
      }

      for (const name of names) {
        vistos.add(name);
        // R1 — evento fuera del catálogo
        if (!CATALOG_NAMES.has(name)) {
          const sug = [...CATALOG_NAMES].find((c) => levenshtein(c, name) <= 2);
          violaciones.push({ rel, ln, msg: `evento \`${name}\` no está en el catálogo${sug ? ` (¿quisiste \`${sug}\`?)` : ''} (R1)` });
          continue;
        }
        const espec = ANALYTICS_EVENTS[name];

        // R5 — superficie
        const superficieCall = helper === 'cordTrack' || helper === 'trackEvent' || helper === 'trackDocsEvent' ? 'client' : 'server';
        if (espec.surface !== superficieCall) {
          violaciones.push({ rel, ln, msg: `evento \`${name}\` es surface:${espec.surface} pero se emite por ${helper} (${superficieCall}) (R5)` });
        }
        if (helper === 'trackServer' && espec.scope === 'user') {
          violaciones.push({ rel, ln, msg: `evento \`${name}\` es scope:user — usa trackUser, no trackServer (R5)` });
        }

        // R4 — flags sandbox/demo por aridad (solo server helpers de org)
        if ((helper === 'trackServer' || helper === 'trackPaymentReceived') && parts.args.length < spec.minArgs) {
          violaciones.push({ rel, ln, msg: `${helper}(\`${name}\`) con ${parts.args.length} args (<${spec.minArgs}) — falta is_sandbox/is_demo (R4)` });
        }

        // bolsa de propiedades
        const bagIdx = spec.bagArg;
        const bag = parts.args[bagIdx]
          ? objectKeys(text, masked, parts.args[bagIdx][0], parts.args[bagIdx][1])
          : { keys: new Set(), opaque: false, absent: true };
        const injected = new Set(spec.injects || []);

        // `trackPaymentReceived` reparte las propiedades entre parámetros
        // POSICIONALES (amount, currency, method, is_recurring) y el `metadata`
        // (arg 8): la "bolsa" solo contiene las opcionales + payment_id.
        const posicional = helper === 'trackPaymentReceived';

        // R3 — idempotencia de eventos de ingreso
        if (espec.revenue && espec.insertIdFrom && !bag.absent && !bag.opaque) {
          if (!bag.keys.has(espec.insertIdFrom)) {
            violaciones.push({ rel, ln, msg: `evento de ingreso \`${name}\` sin \`${espec.insertIdFrom}\` en la bolsa (idempotencia, R3)` });
          }
        }

        // R6 — AUTO_PROP escrita a mano
        for (const auto of AUTO_PROPS) {
          if (bag.keys.has(auto)) {
            violaciones.push({ rel, ln, msg: `evento \`${name}\` pasa la propiedad automática \`${auto}\` a mano (R6)` });
          }
        }

        // R8 — propiedades desconocidas / required ausentes (solo si la bolsa es legible)
        if (!bag.absent && !bag.opaque) {
          const known = new Set([
            ...Object.keys(espec.required), ...Object.keys(espec.optional), ...injected,
          ]);
          for (const k of bag.keys) {
            if (!known.has(k)) violaciones.push({ rel, ln, msg: `evento \`${name}\`: propiedad \`${k}\` no está en required ni optional (R8)` });
          }
          if (!posicional) {
            for (const req of Object.keys(espec.required)) {
              if (!bag.keys.has(req) && !injected.has(req)) {
                violaciones.push({ rel, ln, msg: `evento \`${name}\`: falta la propiedad requerida \`${req}\` (R8)` });
              }
            }
          }
        }
      }
    }
  }
}

// ── R7 — integridad del catálogo ──────────────────────────────────────────
const RAILS = new Set(['quote', 'invoice', 'billing', 'auth', 'team', 'adoption', 'docs']);
for (const [name, s] of Object.entries(ANALYTICS_EVENTS)) {
  if (!RAILS.has(s.rail)) violaciones.push({ rel: 'src/lib/analytics-events.ts', ln: 0, msg: `\`${name}\`: rail inválido "${s.rail}" (R7)` });
  if (!s.description || s.description.trim().length < 10) violaciones.push({ rel: 'src/lib/analytics-events.ts', ln: 0, msg: `\`${name}\`: descripción vacía (R7)` });
  if (s.revenue && !s.insertIdFrom) violaciones.push({ rel: 'src/lib/analytics-events.ts', ln: 0, msg: `\`${name}\`: revenue:true sin insertIdFrom (R7)` });
  const overlap = Object.keys(s.required).filter((k) => k in s.optional);
  if (overlap.length) violaciones.push({ rel: 'src/lib/analytics-events.ts', ln: 0, msg: `\`${name}\`: clave en required Y optional: ${overlap.join(', ')} (R7)` });
}

// ── R2 — entradas del catálogo sin call site ──────────────────────────────
// Una exención de SIN_CALL_SITE que YA tiene call site sobra: la lista solo
// puede encoger.
const staleSinCallSite = new Set();
for (const name of CATALOG_NAMES) {
  if (vistos.has(name)) {
    if (SIN_CALL_SITE.has(name)) staleSinCallSite.add(name);
    continue;
  }
  if (SIN_CALL_SITE.has(name)) continue;
  violaciones.push({ rel: 'src/lib/analytics-events.ts', ln: 0, msg: `\`${name}\` no se emite en ningún lado (entrada muerta, R2)` });
}
if (staleSinCallSite.size) {
  for (const name of staleSinCallSite) {
    console.error(`analytics-contract-check: \`${name}\` está en SIN_CALL_SITE pero SÍ se emite. Quítalo.`);
  }
  process.exitCode = 1;
}

// ── ENVOLTORIOS: verificar que sigan reenviando ──────────────────────────
for (const w of ENVOLTORIOS) {
  const fuente = readFileSync(join(ROOT, w.archivo), 'utf8');
  if (!w.reenvia.test(fuente)) {
    console.error(`analytics-contract-check: ${w.archivo} → ${w.nombre} ya no reenvía a cordTrack.`);
    console.error(`  ${w.porque}`);
    process.exitCode = 1;
  }
}

// ── CONTRATOS de los helpers ────────────────────────────────────────────────
for (const c of CONTRATOS) {
  let fuente;
  try { fuente = readFileSync(join(ROOT, c.archivo), 'utf8'); }
  catch { console.error(`analytics-contract-check: falta ${c.archivo} (CONTRATOS)`); process.exitCode = 1; continue; }
  if (c.exige && !c.exige.test(fuente)) {
    console.error(`analytics-contract-check: ${c.archivo} → falta ${c.exige}`);
    console.error(`  ${c.porque}`);
    process.exitCode = 1;
  }
  if (c.prohibe && c.prohibe.test(fuente)) {
    console.error(`analytics-contract-check: ${c.archivo} → contiene ${c.prohibe}`);
    console.error(`  ${c.porque}`);
    process.exitCode = 1;
  }
}

// ── Piso de cordura del parser ─────────────────────────────────────────────
if (totalCallSites < 20) {
  console.error(`analytics-contract-check: solo se detectaron ${totalCallSites} capturas.`);
  console.error('El parser está roto, no el código. Revisa splitTopLevelArgs/resolveEventNames antes de tocar nada más.');
  process.exit(1);
}

// ── Salida ────────────────────────────────────────────────────────────────
if (violaciones.length) {
  console.error('Contrato de analítica incumplido:');
  for (const v of violaciones.sort((a, b) => (a.rel + a.ln).localeCompare(b.rel + b.ln))) {
    console.error(`  ${v.rel}${v.ln ? ':' + v.ln : ''}  → ${v.msg}`);
  }
  console.error('');
  console.error('Una entrada del catálogo sin call site es un embudo que se cayó en silencio.');
  console.error('Si un evento NO se emite todavía a propósito, agrégalo a SIN_CALL_SITE con el motivo.');
  process.exitCode = 1;
} else if (!process.exitCode) {
  console.log(`Contrato de analítica correcto (${CATALOG_NAMES.size} eventos, ${totalCallSites} capturas, sin deuda pendiente).`);
}

// ── util ──────────────────────────────────────────────────────────────────
function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return d[m][n];
}

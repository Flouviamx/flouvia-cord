#!/usr/bin/env node
// Diagnóstico del entorno local: sincronía con GitHub, Node, dependencias y .env.
// El repositorio se trabaja desde varias computadoras; esto detecta lo que se
// desfasa entre ellas. Nunca imprime valores de variables, solo nombres.
//
//   npm run doctor                  reporte legible; sale con 1 si hay algo que corregir
//   node scripts/doctor.mjs --hook  JSON para el hook SessionStart de Claude Code
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const HOOK = process.argv.includes('--hook');
const avisos = []; // lo que hay que corregir antes de trabajar
const estado = []; // contexto informativo

process.chdir(fileURLToPath(new URL('..', import.meta.url)));

function git(...args) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: 15_000,
  }).trim();
}

// Lee nombres y valores de un archivo .env, incluidos valores entre comillas
// que ocupan varias líneas (llaves PEM).
function leerEnv(ruta) {
  const vars = new Map();
  const lineas = readFileSync(ruta, 'utf8').split(/\r?\n/);
  for (let i = 0; i < lineas.length; i++) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/.exec(lineas[i]);
    if (!m) continue;
    let valor = m[2].trim();
    const comilla = valor[0];
    if ((comilla === '"' || comilla === "'") && !(valor.length > 1 && valor.endsWith(comilla))) {
      while (i + 1 < lineas.length && !lineas[i + 1].trimEnd().endsWith(comilla)) i++;
      i++;
      valor = 'multilínea';
    }
    vars.set(m[1], valor.replace(/^(['"])(.*)\1$/, '$2'));
  }
  return vars;
}

function revisarGit() {
  let rama;
  try {
    rama = git('rev-parse', '--abbrev-ref', 'HEAD');
  } catch {
    avisos.push('Esta carpeta no es un repositorio git: clónala con `git clone`, nunca la copies como ZIP.');
    return;
  }
  try {
    git('fetch', '--quiet', '--prune', 'origin');
  } catch {
    estado.push('Sin conexión con GitHub: la comparación usa el último fetch.');
  }
  const sucios = git('status', '--porcelain').split('\n').filter(Boolean).length;
  let upstream = '';
  let atras = 0;
  let adelante = 0;
  try {
    upstream = git('rev-parse', '--abbrev-ref', '@{upstream}');
    [atras, adelante] = git('rev-list', '--left-right', '--count', '@{upstream}...HEAD').split(/\s+/).map(Number);
  } catch {
    estado.push(`La rama ${rama} no sigue a ninguna rama remota.`);
  }
  estado.push(
    `Git: rama ${rama}${upstream ? ` → ${upstream}` : ''}; ${atras} commit(s) por traer, ` +
      `${adelante} por subir, ${sucios} archivo(s) con cambios sin commit.`,
  );
  if (atras > 0) {
    avisos.push(
      `GitHub tiene ${atras} commit(s) que esta computadora no tiene: \`git pull --rebase\` antes de editar` +
        (sucios ? ' (primero commitea o guarda los cambios locales).' : '.'),
    );
  }
  if (adelante > 0) {
    avisos.push(`Hay ${adelante} commit(s) locales sin subir: \`git push\` para que las otras computadoras los tengan.`);
  }
}

function revisarNodeYDependencias() {
  const nvmrc = existsSync('.nvmrc') ? readFileSync('.nvmrc', 'utf8').trim().replace(/^v/, '') : '';
  const mayor = (version) => version.split('.')[0];
  if (nvmrc && mayor(nvmrc) !== mayor(process.versions.node)) {
    avisos.push(`Node ${process.versions.node} activo y .nvmrc fija ${nvmrc}: cambia de versión (\`fnm use\` o \`nvm use\`).`);
  }
  if (!existsSync('node_modules')) {
    avisos.push('Faltan las dependencias: `npm ci`.');
  } else if (
    existsSync('package-lock.json') &&
    existsSync('node_modules/.package-lock.json') &&
    statSync('package-lock.json').mtimeMs > statSync('node_modules/.package-lock.json').mtimeMs
  ) {
    avisos.push('package-lock.json cambió desde la última instalación: `npm ci`.');
  }
}

function revisarEnv() {
  const proyecto = JSON.parse(readFileSync('package.json', 'utf8')).name;
  if (!existsSync('.vercel/project.json')) {
    avisos.push(
      `Carpeta sin vincular a Vercel: \`vercel link --yes --project ${proyecto} --scope flouvia\` (una vez por computadora).`,
    );
  }
  if (!existsSync('.env')) {
    avisos.push('Falta el .env: `npm run env:pull`.');
  } else {
    const env = leerEnv('.env');
    const vacias = [...env].filter(([, valor]) => valor === '').map(([nombre]) => nombre);
    if (vacias.length) {
      avisos.push(`Variables vacías en .env (${vacias.join(', ')}): vuelve a bajarlo con \`npm run env:pull\`.`);
    }
    if (env.has('VERCEL_ENV')) {
      avisos.push('El .env trae VERCEL_ENV, señal de que se bajó de Production o Preview: rehazlo con `npm run env:pull`.');
    }
    const fecha = statSync('.env').mtime.toISOString().slice(0, 10);
    estado.push(`.env: ${env.size} variables, actualizado el ${fecha}.`);
  }
  if (existsSync('.env.local')) {
    const extra = [...leerEnv('.env.local').keys()].filter((nombre) => nombre !== 'VERCEL_OIDC_TOKEN');
    if (extra.length) {
      avisos.push(`.env.local redefine ${extra.join(', ')} y le gana al .env: bórralas de .env.local.`);
    }
  }
}

try {
  revisarGit();
  revisarNodeYDependencias();
  revisarEnv();
} catch (error) {
  // El diagnóstico nunca debe impedir trabajar: un fallo propio se reporta y sigue.
  estado.push(`El diagnóstico no pudo terminar: ${error.message}`);
}

const titulo = avisos.length ? `Entorno: ${avisos.length} punto(s) por resolver` : 'Entorno al día';

if (HOOK) {
  const contexto = [titulo, ...avisos.map((a) => `- ${a}`), ...estado.map((e) => `· ${e}`)].join('\n');
  const salida = {
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: `Resultado de \`npm run doctor\` al abrir la sesión:\n${contexto}`,
    },
  };
  if (avisos.length) salida.systemMessage = [titulo, ...avisos.map((a) => `• ${a}`)].join('\n');
  process.stdout.write(JSON.stringify(salida));
} else {
  console.log(titulo);
  for (const a of avisos) console.log(`  ✗ ${a}`);
  for (const e of estado) console.log(`  · ${e}`);
  process.exitCode = avisos.length ? 1 : 0;
}

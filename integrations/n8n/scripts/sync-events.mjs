// Copia el catálogo de eventos canónico (integrations/zapier/lib/events.js) a
// este paquete. n8n-nodes-cord se publica a npm por su cuenta, así que no puede
// requerir un archivo de otra carpeta del repo: lleva su copia, y el test falla
// si la copia y el original dejan de coincidir.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { EVENTS } = require('../../zapier/lib/events.js');

const out = `'use strict';\n\n// GENERADO por scripts/sync-events.mjs — no editar a mano.\n// Fuente: integrations/zapier/lib/events.js\nconst EVENTS = ${JSON.stringify(EVENTS, null, 4)};\n\nconst EVENT_KEYS = EVENTS.map((e) => e.key);\nconst EVENT_OPTIONS = EVENTS.map((e) => ({ name: \`\${e.category}: \${e.label}\`, value: e.key }));\n\nmodule.exports = { EVENTS, EVENT_KEYS, EVENT_OPTIONS };\n`;

const target = new URL('../lib/events.js', import.meta.url);
const previo = (() => { try { return readFileSync(target, 'utf8'); } catch { return ''; } })();
if (previo === out) {
    console.log('lib/events.js ya está al día');
} else {
    writeFileSync(target, out);
    console.log(`lib/events.js actualizado (${EVENTS.length} eventos)`);
}

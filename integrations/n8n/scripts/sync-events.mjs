// Copia el catálogo de eventos canónico (integrations/zapier/lib/events.js) a
// nodes/Cord/events.ts. Solo corre dentro del repo de Cord; el repo público del
// nodo recibe el archivo ya generado.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { EVENTS } = require('../../zapier/lib/events.js');

const out = `// Generado por scripts/sync-events.mjs desde integrations/zapier/lib/events.js. No editar a mano.
import type { INodePropertyOptions } from 'n8n-workflow';

export const EVENTS = ${JSON.stringify(EVENTS, null, '\t')};

export const EVENT_KEYS: string[] = EVENTS.map((e) => e.key);

export const EVENT_OPTIONS: INodePropertyOptions[] = EVENTS.map((e) => ({
\tname: \`\${e.category}: \${e.label}\`,
\tvalue: e.key,
}));
`;

const target = new URL('../nodes/Cord/events.ts', import.meta.url);
const previo = (() => { try { return readFileSync(target, 'utf8'); } catch { return ''; } })();
if (previo === out) console.log('nodes/Cord/events.ts ya está al día');
else { writeFileSync(target, out); console.log(`nodes/Cord/events.ts actualizado (${EVENTS.length} eventos)`); }

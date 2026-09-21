// n8n exige que lo que carga viva en `dist/`. El nodo es JavaScript plano, así que
// el build solo copia los archivos fuente a esa carpeta.
import { cpSync, rmSync } from 'node:fs';

const root = new URL('../', import.meta.url);
rmSync(new URL('dist', root), { recursive: true, force: true });
for (const entry of ['index.js', 'lib', 'nodes', 'credentials']) {
    cpSync(new URL(entry, root), new URL(`dist/${entry}`, root), { recursive: true });
}
console.log('dist/ listo');

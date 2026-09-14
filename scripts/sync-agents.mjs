// Una sola fuente de verdad para los agentes especialistas del repo.
//
// Se editan únicamente `.claude/agents/*.md` (frontmatter + instrucciones). Este
// script genera `.codex/agents/*.toml` para Codex. Antes eran dos copias a mano y
// las de Codex se quedaron apuntando a documentos que ya no existían.
//
//   npm run agents:sync    regenera los .toml (y borra los que ya no tienen .md)
//   npm run agents:check   falla si algún .toml no coincide con su .md (lo corre CI)
//
// `tools` y `model` del frontmatter son de Claude Code; Codex no los usa.

import { readdirSync, readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(root, '.claude', 'agents');
const OUT = join(root, '.codex', 'agents');
const check = process.argv.includes('--check');

function parseAgent(file) {
    const raw = readFileSync(join(SRC, file), 'utf8').replace(/\r\n/g, '\n');
    const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!match) throw new Error(`${file}: falta el frontmatter --- ... ---`);
    const meta = {};
    for (const line of match[1].split('\n')) {
        const kv = line.match(/^([a-zA-Z_]+):\s*(.*)$/);
        if (kv) meta[kv[1]] = kv[2].trim();
    }
    const expected = file.replace(/\.md$/, '');
    if (meta.name !== expected) throw new Error(`${file}: name "${meta.name}" debe coincidir con el nombre del archivo "${expected}"`);
    if (!meta.description) throw new Error(`${file}: falta description`);
    const body = match[2].trim();
    if (!body) throw new Error(`${file}: instrucciones vacías`);
    return { name: meta.name, description: meta.description, body };
}

// Cadena básica de una línea: los escapes de JSON son válidos en TOML.
const tomlString = (value) => JSON.stringify(value);

// Cadena multilínea básica: solo hay que escapar la barra invertida y la
// secuencia de tres comillas que cerraría el bloque.
const tomlMultiline = (value) => `"""\n${value.replace(/\\/g, '\\\\').replace(/"""/g, '""\\"')}"""`;

function render({ name, description, body }) {
    return [
        `# GENERADO por scripts/sync-agents.mjs desde .claude/agents/${name}.md — no editar a mano.`,
        `# Cambia el .md y corre: npm run agents:sync`,
        `name = ${tomlString(name)}`,
        `description = ${tomlString(description)}`,
        `developer_instructions = ${tomlMultiline(body)}`,
        '',
    ].join('\n');
}

const sources = readdirSync(SRC).filter((f) => f.endsWith('.md')).sort();
if (!sources.length) throw new Error('No hay agentes en .claude/agents');
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

const problems = [];
const expectedOutputs = new Set();
for (const file of sources) {
    const agent = parseAgent(file);
    const target = `${agent.name}.toml`;
    expectedOutputs.add(target);
    const content = render(agent);
    const path = join(OUT, target);
    const current = existsSync(path) ? readFileSync(path, 'utf8') : null;
    if (current === content) continue;
    if (check) problems.push(current === null ? `falta .codex/agents/${target}` : `.codex/agents/${target} no coincide con .claude/agents/${file}`);
    else writeFileSync(path, content);
}
for (const file of readdirSync(OUT).filter((f) => f.endsWith('.toml'))) {
    if (expectedOutputs.has(file)) continue;
    if (check) problems.push(`.codex/agents/${file} no tiene su .md en .claude/agents`);
    else unlinkSync(join(OUT, file));
}

if (check && problems.length) {
    console.error('Agentes desincronizados:\n  - ' + problems.join('\n  - ') + '\nCorre: npm run agents:sync');
    process.exit(1);
}
console.log(check
    ? `Agentes sincronizados (${sources.length} definiciones).`
    : `Agentes generados para Codex: ${sources.length}.`);

// Notas, etiquetas y bitácora interna de Ops sobre una organización. El
// contrato de la base (solo el carril de Ops las ve) vive en
// db/migrations/2026-10-08-ops-fase3.sql.
import { sql } from './db';

export const OPS_NOTE_MAX = 2000;

/** Misma forma que el CHECK de `ops_org_tags.tag`; `null` si no la cumple. */
export function normalizeOpsTag(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const tag = value.trim().toLowerCase().replace(/\s+/g, '-');
  return /^[a-z0-9][a-z0-9-]{0,23}$/.test(tag) ? tag : null;
}

export const opsOrgNotes = (orgId: string, limit = 30) => sql`
  select id, author_operator_id, author_email, body, created_at
  from ops_org_notes where org_id = ${orgId} order by created_at desc limit ${limit}`;

export const opsOrgTags = (orgId: string) => sql`
  select tag, created_by, created_at from ops_org_tags where org_id = ${orgId} order by tag`;

/** Etiquetas de varias organizaciones a la vez (listas). */
export const opsTagsFor = (orgIds: string[]) => sql`
  select org_id, tag from ops_org_tags where org_id = any(${orgIds}::uuid[]) order by tag`;

export type OpsLogEntry =
  | { kind: 'note'; at: Date; id: string; author: string; authorId: string | null; body: string }
  | { kind: 'audit'; at: Date; action: string; result: string; author: string; ip: string | null };

/**
 * Una sola bitácora interna: lo que Ops anotó y lo que Ops hizo sobre esta
 * organización, en orden. Antes vivían en dos tarjetas y había que cruzarlas
 * a ojo para saber por qué alguien revocó unas llaves.
 */
export function mergeOpsLog(notes: any[], audit: any[], limit = 40): OpsLogEntry[] {
  const entries: OpsLogEntry[] = [
    ...notes.map((n) => ({
      kind: 'note' as const, at: new Date(n.created_at), id: String(n.id),
      author: String(n.author_email || 'Operador'), authorId: n.author_operator_id ? String(n.author_operator_id) : null,
      body: String(n.body || ''),
    })),
    ...audit.map((a) => ({
      kind: 'audit' as const, at: new Date(a.created_at), action: String(a.action), result: String(a.result || 'success'),
      author: String(a.actor_email || 'Sistema'), ip: a.ip ? String(a.ip) : null,
    })),
  ];
  return entries.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit);
}

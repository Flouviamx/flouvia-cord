// Informes guardados (fase 5): una configuración del explorador con nombre,
// compartida por la organización (tabla informes_guardados, db/schema.sql).
//
// - La configuración se NORMALIZA al guardar y al leer (parseExplorerConfig): el
//   JSON de la base no es de confianza para armar SQL, solo elige claves.
// - Cualquiera con `analitica` los ve. Editar o borrar: quien lo guardó o un
//   owner/admin. Programar el envío por correo: solo quien lo guardó, porque el
//   correo le llega a esa persona (el destinatario nunca es libre).
import { sql, withOrgTx } from './db';
import { parseExplorerConfig, type ExplorerConfig } from './informes-explorar';

export const FRECUENCIAS = ['ninguna', 'semanal', 'mensual'] as const;
export type Frecuencia = typeof FRECUENCIAS[number];
/** Tope de cordura por organización (no es un límite de plan: regla 18). */
export const MAX_GUARDADOS = 50;

export type InformeGuardado = {
    id: string; nombre: string; config: ExplorerConfig; frecuencia: Frecuencia;
    creadoPor: string | null; mio: boolean; puedeEditar: boolean;
};

type Actor = { orgId: string; userId: string | null; rol: string };
const isAdmin = (rol: string) => rol === 'owner' || rol === 'admin';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseFrecuencia(value: unknown): Frecuencia | null {
    return FRECUENCIAS.includes(value as Frecuencia) ? value as Frecuencia : null;
}

export function parseNombre(value: unknown): string | null {
    const nombre = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
    return nombre.length >= 1 && nombre.length <= 80 ? nombre : null;
}

function toRow(row: Record<string, unknown>, actor: Actor): InformeGuardado {
    const creadoPor = (row.creado_por as string | null) ?? null;
    const mio = !!actor.userId && creadoPor === actor.userId;
    return {
        id: String(row.id), nombre: String(row.nombre), config: parseExplorerConfig(row.config as any),
        frecuencia: parseFrecuencia(row.frecuencia) ?? 'ninguna', creadoPor, mio, puedeEditar: mio || isAdmin(actor.rol),
    };
}

export async function listGuardados(actor: Actor): Promise<InformeGuardado[]> {
    const [rows] = await withOrgTx(actor.orgId, sql`
        select id, nombre, config, frecuencia, creado_por from informes_guardados
         where org_id = ${actor.orgId} order by lower(nombre) asc limit ${MAX_GUARDADOS}`);
    return rows.map((row) => toRow(row, actor));
}

export async function getGuardado(actor: Actor, id: string): Promise<InformeGuardado | null> {
    if (!UUID.test(id)) return null;
    const [rows] = await withOrgTx(actor.orgId, sql`
        select id, nombre, config, frecuencia, creado_por from informes_guardados
         where org_id = ${actor.orgId} and id = ${id} limit 1`);
    return rows[0] ? toRow(rows[0], actor) : null;
}

/** `error` es un código; la ruta lo traduce con `inf.g.err.<código>` en el idioma de la cuenta. */
export type GuardadoError = 'sesion' | 'nombre' | 'frecuencia' | 'tope' | 'no_existe' | 'permiso' | 'programar';
type Result<T> = { ok: true; value: T } | { ok: false; status: number; error: GuardadoError };

export async function createGuardado(actor: Actor, input: { nombre?: unknown; config?: unknown; frecuencia?: unknown }): Promise<Result<InformeGuardado>> {
    if (!actor.userId) return { ok: false, status: 401, error: 'sesion' };
    const nombre = parseNombre(input.nombre);
    if (!nombre) return { ok: false, status: 400, error: 'nombre' };
    const frecuencia = input.frecuencia === undefined ? 'ninguna' : parseFrecuencia(input.frecuencia);
    if (!frecuencia) return { ok: false, status: 400, error: 'frecuencia' };
    const config = parseExplorerConfig(input.config as any);
    // Conteo e inserción en la misma sentencia: dos pestañas guardando a la vez no
    // pasan juntas el tope.
    const [rows] = await withOrgTx(actor.orgId, sql`
        insert into informes_guardados (org_id, nombre, config, frecuencia, creado_por, ultimo_envio_at)
        select ${actor.orgId}, ${nombre}, ${JSON.stringify(config)}::jsonb, ${frecuencia}, ${actor.userId},
               case when ${frecuencia} <> 'ninguna' then now() end
         where (select count(*) from informes_guardados where org_id = ${actor.orgId}) < ${MAX_GUARDADOS}
        returning id, nombre, config, frecuencia, creado_por`);
    if (!rows[0]) return { ok: false, status: 409, error: 'tope' };
    return { ok: true, value: toRow(rows[0], actor) };
}

export async function updateGuardado(actor: Actor, id: string, input: { nombre?: unknown; config?: unknown; frecuencia?: unknown }): Promise<Result<InformeGuardado>> {
    const current = await getGuardado(actor, id);
    if (!current) return { ok: false, status: 404, error: 'no_existe' };
    if (!current.puedeEditar) return { ok: false, status: 403, error: 'permiso' };
    const nombre = input.nombre === undefined ? current.nombre : parseNombre(input.nombre);
    if (!nombre) return { ok: false, status: 400, error: 'nombre' };
    const frecuencia = input.frecuencia === undefined ? current.frecuencia : parseFrecuencia(input.frecuencia);
    if (!frecuencia) return { ok: false, status: 400, error: 'frecuencia' };
    // Un administrador puede APAGAR el envío de otra persona, pero no encenderlo:
    // el correo le llegaría a ella sin haberlo pedido.
    if (frecuencia !== 'ninguna' && frecuencia !== current.frecuencia && !current.mio) {
        return { ok: false, status: 403, error: 'programar' };
    }
    const config = input.config === undefined ? current.config : parseExplorerConfig(input.config as any);
    const [rows] = await withOrgTx(actor.orgId, sql`
        update informes_guardados
           set nombre = ${nombre}, config = ${JSON.stringify(config)}::jsonb, frecuencia = ${frecuencia}, updated_at = now(),
               -- Programarlo de nuevo arranca el reloj hoy: el primer correo sale en el
               -- siguiente periodo, no de inmediato por un ultimo_envio_at viejo o nulo.
               ultimo_envio_at = case when ${frecuencia} <> 'ninguna' and frecuencia <> ${frecuencia} then now() else ultimo_envio_at end
         where org_id = ${actor.orgId} and id = ${id}
        returning id, nombre, config, frecuencia, creado_por`);
    if (!rows[0]) return { ok: false, status: 404, error: 'no_existe' };
    return { ok: true, value: toRow(rows[0], actor) };
}

export async function deleteGuardado(actor: Actor, id: string): Promise<Result<true>> {
    const current = await getGuardado(actor, id);
    if (!current) return { ok: false, status: 404, error: 'no_existe' };
    if (!current.puedeEditar) return { ok: false, status: 403, error: 'permiso' };
    await withOrgTx(actor.orgId, sql`delete from informes_guardados where org_id = ${actor.orgId} and id = ${id}`);
    return { ok: true, value: true };
}

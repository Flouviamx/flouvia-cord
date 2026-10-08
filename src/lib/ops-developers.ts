// Inspector de la plataforma para desarrolladores: tráfico de la API pública y
// MCP (`api_requests`), rechazos por límite, permisos OAuth y accesos del CLI.
// Constructores `sql` para withOpsTx. Nunca selecciona hashes, secretos ni
// códigos: ni `secret_hash` de un cliente OAuth, ni `refresh_hash` de un
// permiso, ni `device_hash`, `user_code` o `secret_enc` de un acceso del CLI.
import { sql } from './db';

/** Panorama de 24 horas, para toda la plataforma o una organización. */
export const opsApiStats = (orgId: string | null) => sql`
  select count(*)::int requests,
         count(*) filter (where status >= 500)::int server_errors,
         count(*) filter (where status >= 400 and status < 500 and status <> 429)::int client_errors,
         count(*) filter (where status = 429)::int limited,
         count(*) filter (where ruta like '/mcp%')::int mcp,
         count(distinct org_id)::int orgs,
         count(distinct key_id)::int keys,
         percentile_cont(0.95) within group (order by duracion_ms)::int p95_ms
  from api_requests
  where created_at >= now() - interval '24 hours' and (${orgId}::uuid is null or org_id = ${orgId}::uuid)`;

/** Rutas con más tráfico en 24 h, con sus errores y su p95. */
export const opsApiTopRoutes = (orgId: string | null, limit = 12) => sql`
  select metodo, ruta, count(*)::int n,
         count(*) filter (where status >= 500)::int server_errors,
         count(*) filter (where status = 429)::int limited,
         percentile_cont(0.95) within group (order by duracion_ms)::int p95_ms
  from api_requests
  where created_at >= now() - interval '24 hours' and (${orgId}::uuid is null or org_id = ${orgId}::uuid)
  group by metodo, ruta order by n desc limit ${limit}`;

/** Organizaciones con más tráfico en 24 h. */
export const opsApiTopOrgs = (limit = 10) => sql`
  select r.org_id, o.nombre org_nombre, count(*)::int n,
         count(*) filter (where r.status >= 500)::int server_errors,
         count(*) filter (where r.status = 429)::int limited,
         max(r.created_at) last_at
  from api_requests r join orgs o on o.id = r.org_id
  where r.created_at >= now() - interval '24 hours'
  group by r.org_id, o.nombre order by n desc limit ${limit}`;

/**
 * Los rechazos más recientes: errores del servidor y límites (429). Un 429
 * es rate limit por llave o cuota del plan agotada; los dos se ven igual en
 * la bitácora y para el negocio significan lo mismo: Cord no lo atendió.
 */
export const opsApiFailures = (orgId: string | null, limit = 25) => sql`
  select r.id, r.org_id, o.nombre org_nombre, r.metodo, r.ruta, r.status, r.duracion_ms, r.mode, r.created_at,
         k.nombre key_nombre, k.prefix key_prefix, k.last4 key_last4
  from api_requests r
  join orgs o on o.id = r.org_id
  left join api_keys k on k.id = r.key_id and k.org_id = r.org_id
  where (r.status >= 500 or r.status = 429) and r.created_at >= now() - interval '7 days'
    and (${orgId}::uuid is null or r.org_id = ${orgId}::uuid)
  order by r.created_at desc limit ${limit}`;

/** Clientes OAuth registrados (Zapier, Make…) con sus permisos vivos. */
export const opsOauthClients = () => sql`
  select c.client_id, c.slug, c.nombre, c.dominio, c.created_at, c.revoked_at,
         (select count(*)::int from oauth_grants g where g.client_id = c.client_id and g.revoked_at is null and g.refresh_expires_at > now()) active_grants,
         (select count(distinct g.org_id)::int from oauth_grants g where g.client_id = c.client_id and g.revoked_at is null and g.refresh_expires_at > now()) orgs,
         (select max(coalesce(g.refreshed_at, g.created_at)) from oauth_grants g where g.client_id = c.client_id) last_used
  from oauth_clients c order by active_grants desc, c.created_at`;

/** Permisos OAuth de una organización o los más recientes de la plataforma. */
export const opsOauthGrants = (orgId: string | null, limit = 15) => sql`
  select g.id, g.org_id, o.nombre org_nombre, c.nombre client_nombre, g.scope, g.created_at, g.refreshed_at,
         g.refresh_expires_at, g.revoked_at, u.email user_email
  from oauth_grants g
  join orgs o on o.id = g.org_id
  join oauth_clients c on c.client_id = g.client_id
  left join users u on u.id = g.user_id
  where (${orgId}::uuid is null or g.org_id = ${orgId}::uuid)
  order by g.created_at desc limit ${limit}`;

/** Accesos de `cord login`: host, estado y quién aprobó. */
export const opsCliLogins = (orgId: string | null, limit = 15) => sql`
  select l.id, l.org_id, o.nombre org_nombre, l.host, l.estado, l.created_at, l.aprobado_at, u.email aprobado_por_email,
         (k.revoked_at is null and k.id is not null) key_active
  from cli_logins l
  left join orgs o on o.id = l.org_id
  left join users u on u.id = l.aprobado_por
  left join api_keys k on k.id = l.api_key_id
  where (${orgId}::uuid is null or l.org_id = ${orgId}::uuid)
  order by l.created_at desc limit ${limit}`;

/** Sesiones MCP vivas. La tabla no tiene org_id: solo se cuentan. */
export const opsMcpSessions = () => sql`select count(*)::int active from mcp_sessions where expires_at > now()`;

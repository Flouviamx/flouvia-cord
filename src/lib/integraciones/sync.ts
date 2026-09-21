import { sql, withOrgTx, type DbRow } from '../db';
import { log } from '../log';
import { siteOrigin } from '../email';
import { patchClientContact } from '../actions/clients';
import { auditAction } from '../actions/outcome';
import { setConexionError } from './conexiones';
import { HubSpotAuthError } from './hubspot/oauth';
import { HubSpotApiError } from './hubspot/client';
import * as crm from './hubspot/objects';
import {
    clienteFromCompany, clienteFromContact, companyProps, contactProps, dealProps, huella, sanitizeAjustes,
    type HubSpotAjustes,
} from './hubspot/mapping';
import { hsError } from './hubspot/errors';

export const integrationActor = (conexionId: string) => `integration:hubspot:${conexionId}`;

export const MAX_SYNC_ATTEMPTS = 5;
const BATCH = 25;
const TIME_BUDGET_MS = 45_000;

interface Job {
    id: string;
    org_id: string;
    conexion_id: string;
    direccion: 'salida' | 'entrada';
    objeto: 'client' | 'quote' | 'company' | 'contact';
    clave: string;
    attempts: number;
}

class SyncFatalError extends Error {}

export async function enqueueInbound(orgId: string, conexionId: string, objeto: 'company' | 'contact', externoId: string): Promise<boolean> {
    if (!/^[0-9]{1,20}$/.test(externoId)) return false;
    const [rows] = await withOrgTx(orgId, sql`
        insert into integracion_sync (org_id, conexion_id, direccion, objeto, clave)
        select ${orgId}, c.id, 'entrada', ${objeto}, ${externoId}
          from integracion_conexiones c where c.id = ${conexionId} and c.org_id = ${orgId} and c.estado = 'activa'
        on conflict (conexion_id, direccion, objeto, clave) where status = 'queued' do nothing
        returning id`);
    return rows.length > 0;
}

export async function enqueueBackfill(orgId: string, conexionId: string, limit = 500): Promise<number> {
    const [clients, quotes] = await withOrgTx(orgId,
        sql`insert into integracion_sync (org_id, conexion_id, direccion, objeto, clave)
            select ${orgId}, ${conexionId}, 'salida', 'client', cl.id::text
              from clientes cl where cl.org_id = ${orgId}
             order by cl.created_at desc limit ${limit}
            on conflict (conexion_id, direccion, objeto, clave) where status = 'queued' do nothing
            returning id`,
        sql`insert into integracion_sync (org_id, conexion_id, direccion, objeto, clave)
            select ${orgId}, ${conexionId}, 'salida', 'quote', q.id::text
              from cotizaciones q where q.org_id = ${orgId} and q.status <> 'draft'
             order by q.created_at desc limit ${limit}
            on conflict (conexion_id, direccion, objeto, clave) where status = 'queued' do nothing
            returning id`);
    return clients.length + quotes.length;
}

async function vinculos(orgId: string, conexionId: string, localId: string, objetos: string[]) {
    const [rows] = await withOrgTx(orgId, sql`
        select objeto, externo_id, huella from integracion_vinculos
         where org_id = ${orgId} and conexion_id = ${conexionId} and local_id = ${localId} and objeto = any(${objetos}::text[])`);
    return new Map(rows.map((r) => [r.objeto as string, { externoId: r.externo_id as string, huella: (r.huella as string) ?? null }]));
}

async function upsertVinculo(ref: crm.Ref, objeto: string, localId: string, tipo: string, externoId: string, h: string): Promise<boolean> {
    try {
        await withOrgTx(ref.orgId, sql`
            insert into integracion_vinculos (org_id, conexion_id, objeto, local_id, externo_tipo, externo_id, huella, sincronizado_at)
            values (${ref.orgId}, ${ref.conexionId}, ${objeto}, ${localId}, ${tipo}, ${externoId}, ${h}, now())
            on conflict (conexion_id, objeto, local_id) do update
               set externo_tipo = excluded.externo_tipo, externo_id = excluded.externo_id,
                   huella = excluded.huella, sincronizado_at = now()`);
        return true;
    } catch (error) {
        if ((error as { code?: string })?.code === '23505') return false;
        throw error;
    }
}

async function setHuella(ref: crm.Ref, tipo: string, externoId: string, h: string) {
    await withOrgTx(ref.orgId, sql`
        update integracion_vinculos set huella = ${h}, sincronizado_at = now()
         where org_id = ${ref.orgId} and conexion_id = ${ref.conexionId} and externo_tipo = ${tipo} and externo_id = ${externoId}`);
}

async function unlinkExterno(ref: crm.Ref, tipo: string, externoId: string) {
    await withOrgTx(ref.orgId, sql`
        delete from integracion_vinculos
         where org_id = ${ref.orgId} and conexion_id = ${ref.conexionId} and externo_tipo = ${tipo} and externo_id = ${externoId}`);
}

export async function syncClientOut(ref: crm.Ref, clientId: string): Promise<{ companyId: string | null; contactId: string | null }> {
    const [[c]] = await withOrgTx(ref.orgId, sql`
        select id, empresa, contacto, email, telefono from clientes where id = ${clientId} and org_id = ${ref.orgId}`);
    const links = await vinculos(ref.orgId, ref.conexionId, clientId, ['client', 'client_contact']);
    if (!c) {
        await withOrgTx(ref.orgId, sql`
            delete from integracion_vinculos where org_id = ${ref.orgId} and conexion_id = ${ref.conexionId}
               and local_id = ${clientId} and objeto in ('client', 'client_contact')`);
        return { companyId: null, contactId: null };
    }

    const cp = companyProps(c as any);
    const hc = huella(cp);
    let companyId = links.get('client')?.externoId ?? null;
    if (!companyId || links.get('client')?.huella !== hc) {
        if (companyId && !(await crm.updateObject(ref, 'companies', companyId, cp))) companyId = null;
        if (!companyId) companyId = await crm.createObject(ref, 'companies', cp);
        await upsertVinculo(ref, 'client', clientId, 'company', companyId, hc);
    }

    const kp = contactProps(c as any);
    let contactId = links.get('client_contact')?.externoId ?? null;
    if (!kp) return { companyId, contactId };
    const hk = huella(kp);
    if (contactId && links.get('client_contact')?.huella === hk) return { companyId, contactId };

    const props = Object.fromEntries(Object.entries(kp).filter(([k, v]) => k !== 'email' || v));
    if (contactId && !(await crm.updateObject(ref, 'contacts', contactId, props))) contactId = null;
    if (!contactId && kp.email) {
        contactId = await crm.findContactByEmail(ref, kp.email);
        if (contactId) await crm.updateObject(ref, 'contacts', contactId, props);
    }
    if (!contactId) contactId = await crm.createObject(ref, 'contacts', props);
    if (!(await upsertVinculo(ref, 'client_contact', clientId, 'contact', contactId, hk))) {
        await setConexionError(ref.orgId, ref.conexionId, `Dos clientes de Cord usan el correo ${kp.email || 'del mismo contacto'}; en HubSpot solo se ligó el primero. Corrige el correo duplicado en Cord.`);
        return { companyId, contactId: null };
    }
    await crm.associate(ref, 'contacts', contactId, 'companies', companyId);
    return { companyId, contactId };
}

export async function syncQuoteOut(ref: crm.Ref, quoteId: string, ajustes: HubSpotAjustes): Promise<void> {
    const [[q]] = await withOrgTx(ref.orgId, sql`
        select c.id, c.folio, c.status, c.total, coalesce(c.base_currency, o.moneda) as moneda, c.cliente_id, cl.empresa as cliente,
               case c.status when 'paid' then c.paid_at when 'invoiced' then coalesce(c.paid_at, c.approved_at)
                             when 'expired' then c.vigencia::timestamptz end as cerrada
          from cotizaciones c
          join orgs o on o.id = c.org_id
          left join clientes cl on cl.id = c.cliente_id and cl.org_id = c.org_id
         where c.id = ${quoteId} and c.org_id = ${ref.orgId}`);
    const links = await vinculos(ref.orgId, ref.conexionId, quoteId, ['quote']);
    const link = links.get('quote');
    if (!q) {
        await withOrgTx(ref.orgId, sql`
            delete from integracion_vinculos where org_id = ${ref.orgId} and conexion_id = ${ref.conexionId} and local_id = ${quoteId} and objeto = 'quote'`);
        return;
    }
    const props = dealProps({ folio: q.folio as string, status: q.status as string, total: q.total as number, moneda: q.moneda as string, cliente: q.cliente as string, cerrada: q.cerrada as string | null }, ajustes);
    if (!props) return;
    const { closedate: _closedate, ...estables } = props;
    const h = huella(estables);
    if (link && link.huella === h) return;

    const refs = q.cliente_id ? await syncClientOut(ref, q.cliente_id as string) : { companyId: null, contactId: null };
    let dealId = link?.externoId ?? null;
    if (dealId && !(await crm.updateObject(ref, 'deals', dealId, props))) dealId = null;
    const nuevo = !dealId;
    if (!dealId) dealId = await crm.createObject(ref, 'deals', props);
    await upsertVinculo(ref, 'quote', quoteId, 'deal', dealId, h);
    if (nuevo) {
        if (refs.companyId) await crm.associate(ref, 'deals', dealId, 'companies', refs.companyId);
        if (refs.contactId) await crm.associate(ref, 'deals', dealId, 'contacts', refs.contactId);
    }
}

export async function syncIn(ref: crm.Ref, objeto: 'company' | 'contact', externoId: string): Promise<void> {
    const [[link]] = await withOrgTx(ref.orgId, sql`
        select local_id from integracion_vinculos
         where org_id = ${ref.orgId} and conexion_id = ${ref.conexionId} and externo_tipo = ${objeto} and externo_id = ${externoId}`);
    if (!link) return;
    const clientId = link.local_id as string;
    const [[c]] = await withOrgTx(ref.orgId, sql`
        select id, empresa, contacto, email, telefono from clientes where id = ${clientId} and org_id = ${ref.orgId}`);
    if (!c) return unlinkExterno(ref, objeto, externoId);

    const type = objeto === 'company' ? 'companies' : 'contacts';
    const fields = objeto === 'company' ? ['name'] : ['email', 'firstname', 'lastname', 'phone'];
    const props = await crm.readObject(ref, type, externoId, fields);
    if (!props) return unlinkExterno(ref, objeto, externoId);

    const incoming: Record<string, string> = objeto === 'company' ? (clienteFromCompany(props) ?? {}) : clienteFromContact(props);
    const same = (k: string, v: string) => {
        const actual = String((c as DbRow)[k] ?? '');
        return k === 'email' ? actual.toLowerCase() === v : actual === v;
    };
    const changes = Object.fromEntries(Object.entries(incoming).filter(([k, v]) => v && !same(k, v)));
    const merged = { ...(c as any), ...changes };
    const nextHuella = objeto === 'company' ? huella(companyProps(merged)) : huella(contactProps(merged));
    if (!Object.keys(changes).length) return setHuella(ref, objeto, externoId, nextHuella);

    const ctx = { orgId: ref.orgId, origin: siteOrigin(), actor: integrationActor(ref.conexionId) };
    const outcome = await patchClientContact(ctx, clientId, changes);
    if (outcome.status !== 200) throw new SyncFatalError(String(outcome.body.error ?? hsError('cliente_no_actualizado')));
    await auditAction(ctx, 'cliente.actualizado', 'cliente', clientId, `Desde HubSpot: ${Object.keys(changes).join(', ')}`);
    await setHuella(ref, objeto, externoId, nextHuella);
}

async function runJob(job: Job, ajustes: HubSpotAjustes) {
    const ref = { orgId: job.org_id, conexionId: job.conexion_id };
    if (job.direccion === 'salida' && job.objeto === 'client') return void (await syncClientOut(ref, job.clave));
    if (job.direccion === 'salida' && job.objeto === 'quote') return syncQuoteOut(ref, job.clave, ajustes);
    if (job.direccion === 'entrada' && (job.objeto === 'company' || job.objeto === 'contact')) return syncIn(ref, job.objeto, job.clave);
}

async function finishJob(job: Job, status: 'succeeded' | 'failed', error: string | null) {
    await withOrgTx(job.org_id, sql`
        update integracion_sync set status = ${status}, error = ${error}, locked_until = null, finished_at = now(), updated_at = now()
         where id = ${job.id} and org_id = ${job.org_id}`);
}

async function requeueJob(job: Job, attempts: number, delaySeconds: number, error: string | null) {
    await withOrgTx(job.org_id,
        sql`update integracion_sync s
               set status = 'queued', attempts = ${attempts}, error = ${error}, locked_until = null,
                   run_at = now() + (${delaySeconds} * interval '1 second'), updated_at = now()
             where s.id = ${job.id} and s.org_id = ${job.org_id}
               and not exists (select 1 from integracion_sync q
                                where q.conexion_id = s.conexion_id and q.direccion = s.direccion and q.objeto = s.objeto
                                  and q.clave = s.clave and q.status = 'queued' and q.id <> s.id)`,
        sql`delete from integracion_sync where id = ${job.id} and org_id = ${job.org_id} and status = 'running'`);
}

export async function processOrgSync(orgId: string, limit = BATCH): Promise<number> {
    let jobs: Job[];
    try {
        const [rows] = await withOrgTx(orgId, sql`
            update integracion_sync s
               set status = 'running', locked_until = now() + interval '5 minutes', run_at = now() + interval '5 minutes', updated_at = now()
             where s.id in (
                select j.id from integracion_sync j
                  join integracion_conexiones c on c.id = j.conexion_id and c.org_id = j.org_id and c.estado = 'activa'
                 where j.org_id = ${orgId} and j.run_at <= now() and j.status in ('queued', 'running')
                   and (j.status <> 'running' or j.locked_until is null or j.locked_until <= now())
                 order by j.run_at
                 limit ${limit}
                 for update of j skip locked)
            returning s.id, s.org_id, s.conexion_id, s.direccion, s.objeto, s.clave, s.attempts`);
        jobs = rows as unknown as Job[];
    } catch (err) {
        log.error('no se pudo reclamar la cola de integraciones', { route: 'integraciones/sync', orgId, err });
        return 0;
    }
    if (!jobs.length) return 0;

    const ajustesPorConexion = new Map<string, HubSpotAjustes>();
    const [conexiones] = await withOrgTx(orgId, sql`select id, ajustes from integracion_conexiones where org_id = ${orgId}`);
    for (const c of conexiones) ajustesPorConexion.set(c.id as string, sanitizeAjustes(c.ajustes));

    const started = Date.now();
    let processed = 0;
    let ok = 0;
    for (let i = 0; i < jobs.length; i++) {
        const job = jobs[i];
        const pendientes = jobs.slice(i);
        if (Date.now() - started > TIME_BUDGET_MS) {
            for (const p of pendientes) await requeueJob(p, p.attempts, 0, null);
            break;
        }
        try {
            await runJob(job, ajustesPorConexion.get(job.conexion_id) ?? sanitizeAjustes({}));
            await finishJob(job, 'succeeded', null);
            ok++;
        } catch (error) {
            const attempts = job.attempts + 1;
            if (error instanceof HubSpotAuthError) {
                for (const p of pendientes) await requeueJob(p, p.attempts, 3600, error.message);
                break;
            }
            if (error instanceof HubSpotApiError && error.status === 429) {
                for (const p of pendientes) await requeueJob(p, p.attempts, Math.max(10, error.retryAfterSeconds), null);
                break;
            }
            const retryable = !(error instanceof SyncFatalError) && (!(error instanceof HubSpotApiError) || error.retryable);
            const message = error instanceof HubSpotApiError || error instanceof SyncFatalError ? error.message : hsError('interno');
            if (!(error instanceof HubSpotApiError) && !(error instanceof SyncFatalError)) {
                log.error('fallo inesperado sincronizando con HubSpot', { route: 'integraciones/sync', orgId, err: error });
            }
            if (retryable && attempts < MAX_SYNC_ATTEMPTS) {
                const delay = error instanceof HubSpotApiError && error.retryAfterSeconds ? error.retryAfterSeconds : 60 * attempts * attempts;
                await requeueJob(job, attempts, delay, message);
            } else {
                await finishJob(job, 'failed', message);
                await setConexionError(orgId, job.conexion_id, message);
            }
        }
        processed++;
    }
    if (ok) {
        await withOrgTx(orgId, sql`
            update integracion_conexiones set ultima_sync_at = now(), updated_at = now()
             where org_id = ${orgId} and id = any(${[...new Set(jobs.map((j) => j.conexion_id))]}::uuid[])`);
    }
    return processed;
}

export async function purgeOldSyncJobs(orgId: string): Promise<void> {
    await withOrgTx(orgId, sql`
        delete from integracion_sync
         where org_id = ${orgId} and status in ('succeeded', 'failed') and finished_at < now() - interval '14 days'`);
}

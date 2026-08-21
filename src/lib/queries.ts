// src/lib/queries.ts
// Capa de datos REAL sobre Neon. Devuelve exactamente los mismos shapes que
// src/lib/mock.ts para que las páginas sólo cambien el import + un `await`.
// Re-exporta los helpers puros y STATUS_META del mock (no se duplican).

import { sql, getActiveOrgId, resolvePublicQuote, resolvePublicInvoice, withOrgTx } from './db';
import { currentUserId, currentOrgIdOverride, currentLocale, currentTimeZone, setRequestCurrency, setRequestLocale, setRequestTimeZone } from './context';
import { t as i18nT } from '../i18n/app';
import { dispatchQuoteEvent } from './webhooks';
import { notifyQuoteEvent } from './notify';
import { memberCan, planLabel, type Membership, type PermKey, type PermMap } from './permissions';
import { INCLUDED } from './billing';
import { checkEntitlement, getEntitlementContext } from './org-entitlements';
import { planIncludes, resourceLimit } from './entitlements';
import { cached, invalidate } from './cache';
import { after } from './after';
import { trackServer } from './posthog-server';
import { decryptSecret } from './crypto-secret';
import { normalizeCurrency } from './currency';
import { getCountryProfile, taxKindLabel } from './countries';
import { fmtDate, fmtRelative, intlLocale } from './fmt-server';
import { calculateDocumentTotals } from '../../packages/elements/src/engine';
import { dueDateFor, venceDia } from './cobros';
import type { PublicViewer } from './public-viewer';
import {
    STATUS_ABIERTA, STATUS_GANADA, STATUS_PERDIDA, STATUS_SALIO,
} from './metrics';
import {
    STATUS_META, IVA, money, lineTotal, quoteSubtotal, quoteIva, quoteTotal, quoteTaxBreakdown, quoteRetenciones,
    type QuoteStatus, type MockItem, type MockEvent, type MockQuote,
} from './mock';

export { STATUS_META, IVA, money, lineTotal, quoteSubtotal, quoteIva, quoteTotal, quoteTaxBreakdown, quoteRetenciones };
export type { QuoteStatus, MockItem, MockEvent, MockQuote };

// ── Formatters (Postgres → display, igual que el mock hardcodeaba) ──────────
const num = (v: unknown) => Number(v ?? 0);

const initials = (nombre: string) =>
    nombre.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '—';

const TERM_LABEL: Record<string, MockQuote['terminos']> = {
    contado: 'Contado', net30: 'Net 30', net60: 'Net 60',
};
const termLabel = (t: string | null) => TERM_LABEL[t ?? 'contado'] ?? 'Contado';

// El formato de fecha vive en lib/fmt-server.ts: lee el locale Y la zona
// horaria del request. Aquí estaban clavados en 'es-MX' y sin zona, así que un
// negocio en Londres leía fechas mexicanas y uno en Tokio las leía con un día
// de diferencia respecto al suyo.

// ── ORG ─────────────────────────────────────────────────────────────────────

export async function getOrg() {
    const orgId = await getActiveOrgId();
    const [context, [[o]]] = await Promise.all([
        getEntitlementContext(orgId),
        withOrgTx(orgId, sql`select * from orgs where id = ${orgId}`),
    ]);
    const effectivePlan = context.effectivePlan;
    // Toda superficie que arma ORG queda con la divisa del negocio en el
    // contexto del request; money() la lee sin recibirla por parámetro.
    setRequestCurrency(o.moneda as string);
    setRequestLocale(o.idioma as string);
    setRequestTimeZone(o.zona_horaria as string);
    return {
        id: orgId,
        nombre: o.nombre as string,
        inicial: initials(o.nombre),
        rfc: (o.rfc as string) ?? '',
        razonSocial: (o.razon_social as string) ?? '',
        email: (o.email_contacto as string) ?? '',
        telefono: (o.telefono as string) ?? '',
        direccion: (o.direccion as string) ?? '',
        // Nombre del plan ya localizado — setRequestLocale() corre unas líneas
        // arriba, así que planLabel() lee el idioma correcto de la org.
        plan: planLabel(effectivePlan),
        prefix: o.quote_prefix as string,
        moneda: o.moneda as string,
        ivaPct: num(o.iva_pct),
        logoUrl: (o.logo_url as string) ?? '',
        colorMarca: (o.color_marca as string) || '#0a192f',
        pdfMensaje: (o.pdf_mensaje as string) ?? '',
        pdfCondiciones: (o.pdf_condiciones as string) ?? '',
        pdfMostrarLista: (o.pdf_mostrar_lista as boolean) ?? true,
        pdfTemplate: (o.pdf_template as string) || 'clasico',
        aprobDescuentoMax: num(o.aprob_descuento_max),
        aprobMontoMax: num(o.aprob_monto_max),
        aprobMargenMin: num(o.aprob_margen_min),
        interesMoratorioPct: num(o.interes_moratorio_pct),
        plan_raw: effectivePlan,
        vigenciaDefaultDias: num(o.vigencia_default_dias) || 30,
        terminosDefault: (o.terminos_default as string) || 'contado',
        anticipoDefaultPct: num(o.anticipo_default_pct),
        retencionIsrPct: num(o.retencion_isr_pct),
        retencionIvaPct: num(o.retencion_iva_pct),
        textoLegal: (o.texto_legal as string) ?? '',
        sitioWeb: (o.sitio_web as string) ?? '',
        whatsapp: (o.whatsapp as string) ?? '',
        regimenFiscal: (o.regimen_fiscal as string) ?? '',
        usoCfdi: (o.uso_cfdi as string) ?? '',
        ivaIncluidoDefecto: (o.iva_incluido_defecto as boolean) ?? false,
        cpFiscal: (o.cp_fiscal as string) ?? '',
        serieFolio: (o.serie_folio as string) ?? '',
        // Respaldo desde el PERFIL DEL PAÍS, no desde Ciudad de México: una
        // cuenta sin zona capturada debe caer a la suya, no a la mexicana.
        zonaHoraria: (o.zona_horaria as string) || getCountryProfile(String(o.country_code || 'MX')).timeZone,
        // Solo el booleano (nunca la llave) — para que la UI pueda avisar cuando
        // el timbrado va a caer a la llave global de prueba en vez del CSD propio.
        tieneCsdPropio: !!(o.facturapi_live_key_enc || o.facturapi_live_key),
        countryCode: (o.country_code as string) || 'MX',
        fiscalMetadata: (o.fiscal_metadata as Record<string, string>) ?? {},
        idioma: (o.idioma as string) || (getCountryProfile(String(o.country_code || 'MX')).locale.startsWith('es') ? 'es-MX' : 'en-US'),
        colorSecundario: (o.color_secundario as string) || '',
        portalBienvenida: (o.portal_bienvenida as string) ?? '',
        notifPrefs: (o.notif_prefs as Record<string, Record<string, boolean>>) ?? {},
        slackWebhook: (o.slack_webhook_url as string) ?? '',
        integraciones: (o.integraciones as Record<string, boolean>) ?? {},
        aiCobranzaActiva: (o.ai_cobranza_activa as boolean) ?? false,
        csdEstado: (o.csd_estado as string) ?? '',
        csdNombre: (o.csd_nombre as string) ?? '',
        require2fa: (o.require_2fa as boolean) ?? false,
        requireSso: (o.require_sso as boolean) ?? false,
        ssoBreakglassUntil: o.sso_breakglass_until ? new Date(o.sso_breakglass_until as string).toISOString() : null,
        sessionTimeoutMin: num(o.session_timeout_min),
        inviteDomains: (o.invite_domains as string) ?? '',
        embedDomains: (o.embed_domains as string) ?? '',
        portalBanner: (o.portal_banner as string) ?? '',
        portalMostrarChat: (o.portal_mostrar_chat as boolean) ?? true,
        portalPowered: (o.portal_powered as boolean) ?? true,
        emailFromName: (o.email_from_name as string) ?? '',
        emailReplyTo: (o.email_reply_to as string) ?? '',
        emailIntro: (o.email_intro as string) ?? '',
        emailFirma: (o.email_firma as string) ?? '',
        stripeAccountId: (o.stripe_account_id as string) || null,
        stripeAccountType: (o.stripe_account_type as string) || null,
        stripeChargesEnabled: !!o.stripe_charges_enabled,
        aceptaTarjeta: o.acepta_tarjeta !== false,
        aceptaTransferencia: !!o.acepta_transferencia,
        cobroSpeiAuto: !!o.cobro_spei_auto,
        checkoutV2: !!o.checkout_v2,
        feeEnabled: !!o.fee_enabled,
        feePlan: (o.fee_plan as string) || 'legacy_zero',
        feeTermsVersion: (o.fee_terms_version as string) || null,
        bancoNombre: (o.banco_nombre as string) || '',
        bancoClabe: decryptSecret(o.banco_clabe_enc as string) || (o.banco_clabe as string) || '',
        bancoBeneficiario: (o.banco_beneficiario as string) || '',
        // Para analítica (PostHog identify/group) e integridad de datos — no
        // se muestran en ninguna UI todavía.
        createdAt: o.created_at ? new Date(o.created_at as string).toISOString() : null,
        isDemo: !!o.is_demo,
        sandboxOf: (o.sandbox_of as string) || null,
    };
}

export async function getUserProfile() {
    const userId = currentUserId();
    if (!userId) return null;

    const [user] = await sql`select * from users where id = ${userId}`;
    if (!user) return null;

    // Solo membresías ACTIVAS (o el owner legacy vía orgs.owner_id) — y NUNCA
    // orgs sandbox (`sandbox_of`), que no son espacios de trabajo elegibles a
    // mano: se entra a ellas solo por el toggle de entorno de prueba. `rol`
    // real de org_members (owner|admin|vendedor|lectura|miembro) — antes esto
    // devolvía formas de Clerk ('org:admin', `publicMetadata.parentOrgId`)
    // que ningún código de este repo emite más.
    const memberships = await sql`
        select
            o.id, o.nombre, o.logo_url, o.parent_org_id,
            coalesce(m.rol, case when o.owner_id = ${userId} then 'owner' else 'miembro' end) as rol
        from orgs o
        left join org_members m on m.org_id = o.id and m.user_id = ${userId} and m.estado = 'activo'
        where (o.owner_id = ${userId} or (m.user_id = ${userId} and m.estado = 'activo'))
          and o.sandbox_of is null
        order by o.nombre asc
    `;

    const passkeyCount = await sql`select count(*)::int as n from passkeys where user_id = ${userId}`;
    const connections = await sql`select provider, email, created_at from oauth_accounts where user_id = ${userId} order by created_at asc`;

    return {
        id: user.id,
        firstName: user.first_name || 'Usuario',
        lastName: user.last_name || '',
        fullName: `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Usuario',
        imageUrl: user.avatar_url || '',
        emailAddresses: [{ emailAddress: user.email }],
        emailVerified: !!user.email_verified_at,
        totpEnabled: !!user.totp_enabled,
        hasPassword: !!user.password_hash && user.password_hash !== 'dummy_hash',
        passkeyCount: passkeyCount[0]?.n ?? 0,
        connections: connections.map((c: any) => ({
            provider: c.provider as string,
            email: (c.email as string) || null,
            createdAt: c.created_at,
        })),
        organizationMemberships: memberships.map((m) => ({
            organization: {
                id: m.id as string,
                nombre: m.nombre as string,
                logoUrl: m.logo_url as string | null,
                parentOrgId: (m.parent_org_id as string | null) ?? null,
            },
            rol: m.rol as string,
        })),
    };
}

// ── API KEYS (Developers) ────────────────────────────────────────────────────
export async function getApiKeys() {
    const orgId = await getActiveOrgId();
    let rows: any[] = [];
    try {
        [rows] = await withOrgTx(orgId, sql`select * from api_keys where org_id = ${orgId} order by created_at desc`);
    } catch { return []; }
    return rows.map((k) => ({
        id: k.id as string,
        nombre: k.nombre as string,
        masked: `${k.prefix}${'•'.repeat(20)}${k.last4}`,
        scope: (k.scope as string) || 'read',
        mode: (k.mode as string) || 'live',
        type: (k.type as string) || 'secret',
        creada: fmtDate(k.created_at),
        ultimoUso: k.last_used_at ? fmtRelative(k.last_used_at) : null,
        revocada: !!k.revoked_at,
    }));
}

// ── WEBHOOKS (Developers) ─────────────────────────────────────────────────────
export async function getWebhooks() {
    const orgId = await getActiveOrgId();
    let rows: any[] = [];
    try {
        [rows] = await withOrgTx(orgId, sql`select * from webhooks where org_id = ${orgId} order by created_at desc`);
    } catch { return []; }
    return rows.map((w) => ({
        id: w.id as string,
        url: w.url as string,
        eventos: (Array.isArray(w.eventos) ? w.eventos : []) as string[],
        secretMasked: `${String(decryptSecret(w.secret_enc as string | null) || w.secret || 'whsec_').slice(0, 10)}${'•'.repeat(14)}`,
        activo: !!w.activo,
        lastStatus: w.last_status as number | null,
        lastError: (w.last_error as string) ?? null,
        ultimaEntrega: w.last_delivery_at ? fmtRelative(w.last_delivery_at) : null,
        // ISO crudo: el Workbench formatea las fechas en el cliente para que el
        // toggle "horas en UTC" sea instantáneo (fmtRelative no expone la zona).
        ultimaEntregaTs: w.last_delivery_at ? new Date(w.last_delivery_at as string).toISOString() : null,
        fallosConsecutivos: (w.fallos_consecutivos as number) ?? 0,
        deshabilitadoMotivo: (w.deshabilitado_motivo as string) ?? null,
        deshabilitadoEn: w.deshabilitado_at ? fmtRelative(w.deshabilitado_at) : null,
        // Ventana de solape de rotación de secreto en curso (null = sin rotación
        // activa — secret_prev_expira ya pasó o nunca se rotó).
        rotandoHasta: (w.secret_prev_expira && new Date(w.secret_prev_expira as string).getTime() > Date.now())
            ? fmtRelative(w.secret_prev_expira as string)
            : null,
    }));
}

// Log de entregas de un webhook (Developers PRO).
export async function getWebhookDeliveries(webhookId: string) {
    const orgId = await getActiveOrgId();
    let rows: any[] = [];
    try {
        [rows] = await withOrgTx(orgId, sql`
            select id, evento, status, ok, error, intento, es_prueba, duracion_ms, response_body, created_at
            from webhook_deliveries
            where webhook_id = ${webhookId} and org_id = ${orgId}
            order by created_at desc limit 50`);
    } catch { return []; }
    return rows.map((d) => ({
        id: d.id as string,
        evento: d.evento as string,
        status: (d.status as number) ?? null,
        ok: !!d.ok,
        error: (d.error as string) ?? null,
        intento: (d.intento as number) ?? 1,
        prueba: !!d.es_prueba,
        ms: (d.duracion_ms as number) ?? null,
        response: ((d.response_body as string) ?? '').slice(0, 600),
        cuando: fmtRelative(d.created_at),
        ts: new Date(d.created_at as string).toISOString(),
    }));
}

// Actividad del API pública (Developers PRO): últimas requests + stats 24h.
// Dos queries en un mismo batch (una sola request HTTP a Neon).
export async function getApiActivity() {
    const orgId = await getActiveOrgId();
    let recent: any[] = [];
    let stats: any = { total: 0, errores: 0, p_lat: 0 };
    try {
        let aggRow: any;
        [recent, [aggRow]] = await withOrgTx(orgId,
            sql`select r.metodo, r.ruta, r.status, r.duracion_ms, r.mode, r.created_at, k.nombre as key_nombre
                from api_requests r left join api_keys k on k.id = r.key_id
                where r.org_id = ${orgId}
                order by r.created_at desc limit 40`,
            sql`select count(*)::int as total,
                       count(*) filter (where status >= 400)::int as errores,
                       coalesce(round(avg(duracion_ms))::int, 0) as p_lat
                from api_requests
                where org_id = ${orgId} and created_at > now() - interval '24 hours'`,
        );
        stats = aggRow ?? stats;
    } catch { return { recent: [], total24: 0, errores24: 0, latProm: 0 }; }
    return {
        recent: recent.map((r) => ({
            metodo: r.metodo as string,
            ruta: r.ruta as string,
            status: r.status as number,
            ms: (r.duracion_ms as number) ?? null,
            mode: (r.mode as string) ?? 'live',
            key: (r.key_nombre as string) ?? null,
            cuando: fmtRelative(r.created_at),
            ts: new Date(r.created_at as string).toISOString(),
        })),
        total24: (stats.total as number) ?? 0,
        errores24: (stats.errores as number) ?? 0,
        latProm: (stats.p_lat as number) ?? 0,
    };
}

// ── RESUMEN DE DESARROLLADORES (Cord Workbench → pestaña "Resumen") ──────────
// Alimenta las gráficas del dock: serie temporal de peticiones de API (éxito vs
// error), distribución de errores, salud del outbox de webhooks y tasa de entrega.
// 4 queries en UN SOLO batch (una request HTTP a Neon, patrón de getRealPorMes).
// Sin migración: usa los índices que ya existen — idx_api_requests(org_id,
// created_at desc), idx_wh_events_org y idx_wh_deliveries_org.

export type DevRange = '24h' | '7d' | '14d';
export const DEV_RANGES: DevRange[] = ['24h', '7d', '14d'];

export interface DevOverview {
    range: DevRange;
    serie: { key: string; label: string; ok: number; err: number }[];
    maxSerie: number;
    totalOk: number;
    totalErr: number;
    latProm: number;
    errores: { c4xx: number; c5xx: number; topRutas: { ruta: string; n: number }[] };
    wh: { entregasOk: number; entregasErr: number; pendientes: number; fallidos: number; atrasados: number };
}

const DEV_EMPTY = (range: DevRange): DevOverview => ({
    range, serie: [], maxSerie: 0, totalOk: 0, totalErr: 0, latProm: 0,
    errores: { c4xx: 0, c5xx: 0, topRutas: [] },
    wh: { entregasOk: 0, entregasErr: 0, pendientes: 0, fallidos: 0, atrasados: 0 },
});

export async function getDevOverview(range: DevRange = '14d'): Promise<DevOverview> {
    const orgId = await getActiveOrgId();
    return cached(`devov:${orgId}:${range}`, 30, () => getDevOverviewUncached(orgId, range));
}

async function getDevOverviewUncached(orgId: string, range: DevRange): Promise<DevOverview> {
    // 24h se agrupa por HORA; 7d/14d por DÍA. El shape de salida es idéntico en
    // ambos casos para que el renderer sea un solo code path.
    const porHora = range === '24h';
    const buckets = porHora ? 24 : range === '7d' ? 7 : 14;

    // ⚠️ El corte se calcula en JS y viaja como PARÁMETRO (`${desde}::timestamptz`):
    // el driver de Neon no compone fragmentos SQL, así que no se puede interpolar un
    // `interval` dinámico. Mismo patrón que getRealPorMes.
    // Todo en UTC (getUTC*/setUTC*) para que estas claves coincidan exactamente con
    // las que produce `date_trunc` de Postgres, que trunca en la zona de la sesión
    // (UTC en Neon). Con horas locales, cada bucket erraría por el offset del runtime.
    const inicio = new Date();
    if (porHora) inicio.setUTCMinutes(0, 0, 0);
    else inicio.setUTCHours(0, 0, 0, 0);
    const cursor = new Date(inicio);
    if (porHora) cursor.setUTCHours(cursor.getUTCHours() - (buckets - 1));
    else cursor.setUTCDate(cursor.getUTCDate() - (buckets - 1));
    const desde = cursor.toISOString();

    const truncUnit = porHora ? 'hour' : 'day';
    const fmt = porHora ? 'YYYY-MM-DD HH24' : 'YYYY-MM-DD';

    let serieRows: any[] = [], errRows: any[] = [], rutaRows: any[] = [];
    let whRow: any = {}, outboxRow: any = {};
    try {
        let outbox: any[], wh: any[];
        [serieRows, errRows, rutaRows, outbox, wh] = await withOrgTx(orgId,
            sql`select to_char(date_trunc(${truncUnit}, created_at), ${fmt}) as k,
                       count(*) filter (where status < 400)::int as ok,
                       count(*) filter (where status >= 400)::int as err,
                       coalesce(round(avg(duracion_ms))::int, 0) as lat
                from api_requests
                where org_id = ${orgId} and created_at >= ${desde}::timestamptz
                group by 1 order by 1`,
            sql`select case when status >= 500 then '5xx' else '4xx' end as cls, count(*)::int as n
                from api_requests
                where org_id = ${orgId} and status >= 400 and created_at >= ${desde}::timestamptz
                group by 1`,
            sql`select ruta, count(*)::int as n
                from api_requests
                where org_id = ${orgId} and status >= 400 and created_at >= ${desde}::timestamptz
                group by 1 order by n desc limit 3`,
            sql`select count(*) filter (where estado = 'pending')::int as pendientes,
                       count(*) filter (where estado = 'failed')::int as fallidos,
                       count(*) filter (where estado = 'pending' and next_retry_at < now())::int as atrasados
                from webhook_events where org_id = ${orgId}`,
            sql`select count(*) filter (where ok)::int as ok,
                       count(*) filter (where not ok)::int as err
                from webhook_deliveries
                where org_id = ${orgId} and es_prueba = false and created_at >= ${desde}::timestamptz`,
        );
        outboxRow = outbox?.[0] ?? {};
        whRow = wh?.[0] ?? {};
    } catch { return DEV_EMPTY(range); }

    // Relleno de huecos EN JS (el repo no usa generate_series — mismo patrón que
    // getRealPorMes): se arma la lista completa de buckets hacia adelante desde el
    // corte y se mapean las filas por clave, para que un periodo sin tráfico salga
    // en 0 y no desaparezca de la gráfica.
    const byKey = new Map(serieRows.map((r) => [String(r.k), r]));
    const serie: DevOverview['serie'] = [];
    let totalOk = 0, totalErr = 0, latSum = 0, latN = 0;
    const p = (n: number) => String(n).padStart(2, '0');
    for (let i = 0; i < buckets; i++) {
        const d = new Date(cursor);
        if (porHora) d.setUTCHours(d.getUTCHours() + i);
        else d.setUTCDate(d.getUTCDate() + i);
        const ymd = `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
        const key = porHora ? `${ymd} ${p(d.getUTCHours())}` : ymd;
        const row = byKey.get(key);
        const ok = (row?.ok as number) ?? 0;
        const err = (row?.err as number) ?? 0;
        totalOk += ok; totalErr += err;
        if (row?.lat) { latSum += row.lat as number; latN++; }
        serie.push({
            key,
            label: porHora ? `${p(d.getUTCHours())}:00` : `${d.getUTCDate()}/${d.getUTCMonth() + 1}`,
            ok, err,
        });
    }

    const c4xx = (errRows.find((r) => r.cls === '4xx')?.n as number) ?? 0;
    const c5xx = (errRows.find((r) => r.cls === '5xx')?.n as number) ?? 0;

    return {
        range,
        serie,
        maxSerie: serie.reduce((m, s) => Math.max(m, s.ok + s.err), 0),
        totalOk, totalErr,
        latProm: latN ? Math.round(latSum / latN) : 0,
        errores: { c4xx, c5xx, topRutas: rutaRows.map((r) => ({ ruta: r.ruta as string, n: r.n as number })) },
        wh: {
            entregasOk: (whRow.ok as number) ?? 0,
            entregasErr: (whRow.err as number) ?? 0,
            pendientes: (outboxRow.pendientes as number) ?? 0,
            fallidos: (outboxRow.fallidos as number) ?? 0,
            atrasados: (outboxRow.atrasados as number) ?? 0,
        },
    };
}

// ── EVENTOS (Cord Workbench → pestaña "Eventos") ─────────────────────────────
// Mezcla DOS fuentes distintas en una sola línea de tiempo:
//   • "enviado"  → `webhook_events`, lo que Cord emite HACIA FUERA. Ojo: hay una
//     fila por (evento lógico × endpoint suscrito) y todas comparten el mismo
//     `event_id`, así que se agrupa por `event_id` para que un evento entregado a
//     3 endpoints se vea como UN evento con 3 entregas, no como 3 eventos.
//   • "interno" → `eventos`, el timeline de negocio (vista, aprobada, pagada…).
//     Existe aunque no haya ningún webhook configurado.
// Dos queries + merge en JS (no `union all`): los shapes son muy distintos y
// castear todo a un tipo común en SQL saldría más frágil que ordenar en JS, que
// además ya es el patrón del repo para rellenar series.
//
// ⚠️ `eventos.detalle` es texto LIBRE (incluye mensajes de chat del cliente). NO
// se expone aquí: esta es una vista técnica, no un lector de conversaciones —
// mostrarlo filtraría contenido de clientes a una pantalla de developers. Solo
// viaja el tipo del evento y el folio de la cotización.

export type DevEventFilter = 'todos' | 'enviados' | 'internos';
export const DEV_EVENT_FILTERS: DevEventFilter[] = ['todos', 'enviados', 'internos'];

export interface DevEvent {
    fuente: 'enviado' | 'interno';
    id: string;                 // event_id (evt_…) o eventos.id
    evento: string;             // 'quote.paid' | 'approved' | …
    ts: string;                 // ISO crudo — el cliente lo formatea (local/UTC)
    // Solo 'enviado'
    estado?: 'succeeded' | 'failed' | 'pending' | 'parcial' | 'canceled';
    endpoints?: number;
    entregados?: number;
    intentos?: number;
    ultimoError?: string | null;
    payload?: string | null;
    // Solo 'interno'
    folio?: string | null;
    cotizacionId?: string | null;
}

export async function getDevEvents(filtro: DevEventFilter = 'todos', limit = 60): Promise<DevEvent[]> {
    const orgId = await getActiveOrgId();
    const wantEnviados = filtro === 'todos' || filtro === 'enviados';
    const wantInternos = filtro === 'todos' || filtro === 'internos';

    let salientes: any[] = [], internos: any[] = [];
    try {
        [salientes, internos] = await withOrgTx(orgId,
            // Un evento lógico por fila. El estado del GRUPO resume los N endpoints:
            // failed+succeeded mezclados = 'parcial' (algunos recibieron, otros no).
            wantEnviados
                ? sql`select event_id,
                             min(evento) as evento,
                             min(created_at) as created_at,
                             count(*)::int as endpoints,
                             count(*) filter (where estado = 'succeeded')::int as ok,
                             count(*) filter (where estado = 'failed')::int as fail,
                             count(*) filter (where estado in ('pending','delivering'))::int as pend,
                             count(*) filter (where estado = 'canceled')::int as canc,
                             max(intentos)::int as intentos,
                             max(last_error) as last_error,
                             min(payload) as payload
                      from webhook_events
                      where org_id = ${orgId}
                      group by event_id
                      order by min(created_at) desc
                      limit ${limit}`
                : sql`select null::text as event_id where false`,
            wantInternos
                ? sql`select e.id, e.tipo, e.created_at, e.cotizacion_id, c.folio
                      from eventos e left join cotizaciones c on c.id = e.cotizacion_id
                      where e.org_id = ${orgId}
                      order by e.created_at desc
                      limit ${limit}`
                : sql`select null::uuid as id where false`,
        );
    } catch { return []; }

    const out: DevEvent[] = [];

    for (const r of salientes) {
        if (!r.event_id) continue;
        const ok = (r.ok as number) ?? 0, fail = (r.fail as number) ?? 0;
        const pend = (r.pend as number) ?? 0, canc = (r.canc as number) ?? 0;
        const estado: DevEvent['estado'] =
            pend > 0 ? 'pending'
            : fail > 0 && ok > 0 ? 'parcial'
            : fail > 0 ? 'failed'
            : ok > 0 ? 'succeeded'
            : canc > 0 ? 'canceled'
            : 'pending';
        out.push({
            fuente: 'enviado',
            id: r.event_id as string,
            evento: r.evento as string,
            ts: new Date(r.created_at).toISOString(),
            estado,
            endpoints: (r.endpoints as number) ?? 0,
            entregados: ok,
            intentos: (r.intentos as number) ?? 0,
            ultimoError: (r.last_error as string) ?? null,
            // El payload es idéntico en las N filas del grupo; se recorta porque
            // esta lista puede traer 60 eventos y el detalle no necesita más.
            payload: r.payload ? String(r.payload).slice(0, 4000) : null,
        });
    }

    for (const r of internos) {
        if (!r.id) continue;
        out.push({
            fuente: 'interno',
            id: r.id as string,
            evento: r.tipo as string,
            ts: new Date(r.created_at).toISOString(),
            folio: (r.folio as string) ?? null,
            cotizacionId: (r.cotizacion_id as string) ?? null,
        });
    }

    // Orden cronológico mezclado y corte final (cada fuente ya venía limitada).
    out.sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));
    return out.slice(0, limit);
}

// ── REGISTROS DEL API (Cord Workbench → pestaña "Registros") ─────────────────
// Maestro-detalle con filtros. A diferencia de getApiActivity() (que alimenta el
// widget del Resumen), esta expone `id`, `ip` y el timestamp CRUDO en ISO, que
// son justo lo que el panel de detalle necesita y lo que aquella no devuelve.
// ⚠️ `api_requests` NO guarda cuerpos de petición/respuesta — el detalle solo
// puede mostrar metadatos. Decidido a propósito: guardarlos implicaría persistir
// datos de clientes (RFC, correos, montos) en cada llamada.

export interface ApiLogFilters {
    metodo?: string;    // GET | POST | ''
    clase?: string;     // ok | 4xx | 5xx | ''
    q?: string;         // búsqueda por ruta
    range?: DevRange;
}

export async function getApiLogs(f: ApiLogFilters = {}, limit = 100) {
    const orgId = await getActiveOrgId();
    const metodo = (f.metodo || '').toUpperCase();
    const clase = f.clase || '';
    // Escapado de comodines: buscar literalmente "50%" no debe comportarse como patrón.
    const q = (f.q || '').trim().replace(/[%_\\]/g, (c) => '\\' + c);
    const dias = f.range === '24h' ? 1 : f.range === '7d' ? 7 : 14;
    const desde = new Date(Date.now() - dias * 864e5).toISOString();

    let rows: any[] = [];
    try {
        // El driver de Neon no compone fragmentos SQL, así que los filtros van
        // como parámetros con un centinela ('' = sin filtro) en vez de armar el
        // WHERE por concatenación.
        [rows] = await withOrgTx(orgId, sql`
            select r.id, r.metodo, r.ruta, r.status, r.duracion_ms, r.mode, r.ip, r.created_at,
                   k.nombre as key_nombre, k.mode as key_mode
            from api_requests r left join api_keys k on k.id = r.key_id
            where r.org_id = ${orgId}
              and r.created_at >= ${desde}::timestamptz
              and (${metodo} = '' or r.metodo = ${metodo})
              and (${clase} = ''
                   or (${clase} = 'ok'  and r.status < 400)
                   or (${clase} = '4xx' and r.status >= 400 and r.status < 500)
                   or (${clase} = '5xx' and r.status >= 500))
              and (${q} = '' or r.ruta ilike '%' || ${q} || '%')
            order by r.created_at desc
            limit ${limit}`);
    } catch { return []; }

    return rows.map((r) => ({
        id: r.id as string,
        metodo: r.metodo as string,
        ruta: r.ruta as string,
        status: r.status as number,
        ms: (r.duracion_ms as number) ?? null,
        mode: (r.mode as string) ?? 'live',
        ip: (r.ip as string) ?? null,
        key: (r.key_nombre as string) ?? null,
        keyMode: (r.key_mode as string) ?? null,
        ts: new Date(r.created_at).toISOString(),
    }));
}

// ── IMPUESTOS (catálogo de tasas reutilizables, país-neutro) ─────────────────
//
// `kind` es la clasificación que decide la aritmética (consumo suma, retención
// resta, exento es 0 explícito) y es la que se muestra, traducida al
// vocabulario del país. `tipo` es el subcódigo local: solo México lo usa, para
// mapear a los impuestos trasladados/retenidos del CFDI 4.0.
//
// El Record en español duro que vivía aquí —'IVA', 'IEPS', 'Retención ISR'— le
// ofrecía conceptos mexicanos a un negocio en Madrid o en Sídney.
export type TaxKind = 'consumo' | 'retencion' | 'exento';

export interface ImpuestoRow {
    id: string;
    nombre: string;
    kind: TaxKind;
    tipo: string;
    kindLabel: string;
    tasa: number;        // porcentaje 0–100
    rate: number;        // fracción 0–1, lista para el motor
    esDefault: boolean;
    activo: boolean;
}

const normalizeKind = (value: unknown, tipo: string): TaxKind => {
    const k = String(value ?? '');
    if (k === 'consumo' || k === 'retencion' || k === 'exento') return k;
    // Fallback para filas anteriores al backfill: se deriva del subcódigo.
    if (tipo === 'ret_iva' || tipo === 'ret_isr') return 'retencion';
    if (tipo === 'exento') return 'exento';
    return 'consumo';
};

export async function getImpuestos(): Promise<ImpuestoRow[]> {
    const orgId = await getActiveOrgId();
    const locale = currentLocale();
    let rows: any[] = [];
    let paisCode = 'MX';
    try {
        // El país viaja en el MISMO batch: es una fila más en la transacción
        // HTTP que ya se estaba haciendo, no un round-trip extra a Neon.
        const [impuestoRows, orgRows] = await withOrgTx(orgId,
            sql`select * from impuestos where org_id = ${orgId} order by es_default desc, kind, tasa desc`,
            sql`select country_code from orgs where id = ${orgId}`,
        );
        rows = impuestoRows;
        paisCode = (orgRows?.[0]?.country_code as string) || 'MX';
    } catch { return []; }
    return rows.map((i) => {
        const tipo = (i.tipo as string) || 'iva';
        const kind = normalizeKind(i.kind, tipo);
        const tasa = num(i.tasa);
        return {
            id: i.id as string,
            nombre: i.nombre as string,
            kind,
            tipo,
            kindLabel: taxKindLabel(kind, locale, paisCode),
            tasa,
            rate: tasa / 100,
            esDefault: !!i.es_default,
            activo: !!i.activo,
        };
    });
}


// ── PLANTILLAS DE MENSAJE ─────────────────────────────────────────────────────
export async function getPlantillas() {
    const orgId = await getActiveOrgId();
    let rows: any[] = [];
    try {
        [rows] = await withOrgTx(orgId, sql`select * from plantillas_mensaje where org_id = ${orgId} order by canal, nombre`);
    } catch { return []; }
    return rows.map((p) => ({
        id: p.id as string,
        nombre: p.nombre as string,
        canal: (p.canal as string) || 'whatsapp',
        cuerpo: (p.cuerpo as string) || '',
    }));
}

// Uso del plan: cotizaciones "activas" vs límite del plan.
export async function getPlanUsage() {
    const orgId = await getActiveOrgId();
    const plan = (await getEntitlementContext(orgId)).effectivePlan;
    const [[{ activas }]] = await withOrgTx(orgId,
        sql`select count(*)::int as activas from cotizaciones
            where org_id = ${orgId} and status in ('draft','sent','viewed','approved')`,
    );
    const limite = resourceLimit(plan, 'active_quotes');
    const usadas = Number(activas) || 0;
    return {
        plan, usadas, limite, ilimitado: limite === null,
        pct: limite ? Math.min(100, Math.round((usadas / limite) * 100)) : 0,
        excedido: limite !== null && usadas >= limite,
    };
}

// Consumo del periodo actual (IA / CFDI / API) vs cuota incluida del plan.
export async function getBillingUsage() {
    const orgId = await getActiveOrgId();
    const context = await getEntitlementContext(orgId);
    const [[o]] = await withOrgTx(context.billingOrgId, sql`
        select subscription_status, billing_cycle, current_period_end,
               (stripe_customer_id is not null) as can_manage_billing
          from orgs where id = ${context.billingOrgId}`);
    const plan = context.effectivePlan;
    const inc = INCLUDED[plan as keyof typeof INCLUDED] ?? INCLUDED.free;
    const periodo = new Date().toISOString().slice(0, 7);
    let row: any = {};
    try {
        const [[r]] = await withOrgTx(orgId, sql`select * from uso_periodo where org_id = ${orgId} and periodo = ${periodo}`);
        row = r ?? {};
    } catch { /* tabla aún no migrada */ }

    const dim = (usado: number, incl: number | null) => ({
        usado, incluido: incl, ilimitado: incl === null,
        pct: incl ? Math.min(100, Math.round((usado / incl) * 100)) : 0,
        excedido: incl !== null && usado > incl,
    });

    return {
        plan,
        status: (o?.subscription_status as string) ?? null,
        cycle: (o?.billing_cycle as string) ?? null,
        periodFin: o?.current_period_end ? fmtDate(o.current_period_end) : null,
        canManage: !!o?.can_manage_billing,
        ia: dim(Number(row.ia) || 0, inc.ia),
        cfdi: dim(Number(row.cfdi) || 0, inc.cfdi),
        api: dim(Number(row.api) || 0, inc.api),
        envios: dim(Number(row.envios) || 0, inc.envios),
    };
}

// ── PRODUCTOS ────────────────────────────────────────────────────────────────
export async function getProductos() {
    const orgId = await getActiveOrgId();
    const [rows] = await withOrgTx(orgId, sql`select * from productos where org_id = ${orgId} order by activo desc, nombre`);
    return rows.map(p => ({
        id: p.id as string,
        sku: (p.sku as string) ?? '',
        nombre: p.nombre as string,
        unidad: p.unidad as string,
        descripcion: (p.descripcion as string) ?? '',
        precio: num(p.precio_lista),
        costo: num(p.costo),
        activo: p.activo as boolean,
        createdAt: p.created_at ? new Date(p.created_at as string).toISOString() : null,
        // Matriz de precios por volumen: [{min, precio}] ordenada asc por min.
        preciosVolumen: normVolumen(p.precios_volumen),
    }));
}

// Ficha + métricas de UN producto para /app/productos/[id]. Sin cachear.
export async function getProducto(id: string) {
    const orgId = await getActiveOrgId();
    const [rows, kpiRows, quotesRows, clientesRows, kitsRows] = await withOrgTx(orgId,
        sql`select * from productos where id = ${id} and org_id = ${orgId}`,

        sql`select
                count(distinct c.id)                                                              as cotizaciones,
                count(distinct c.id) filter (where c.status in ('approved','paid','invoiced'))    as cerradas,
                coalesce(sum(it.cantidad), 0)                                                      as cantidad,
                coalesce(sum(it.cantidad) filter (where c.status in ('approved','paid','invoiced')), 0) as cantidad_cerrada,
                coalesce(sum(coalesce(it.precio_negociado, it.precio_unitario) * it.cantidad)
                         filter (where c.status in ('approved','paid','invoiced')), 0)             as importe_cerrado,
                coalesce(sum(it.precio_unitario * it.cantidad), 0)                                 as lista_total,
                coalesce(sum(coalesce(it.precio_negociado, it.precio_unitario) * it.cantidad), 0)  as nego_total,
                coalesce(sum(it.costo_unitario * it.cantidad)
                         filter (where c.status in ('approved','paid','invoiced')), 0)              as costo_cerrado,
                coalesce(avg(coalesce(it.precio_negociado, it.precio_unitario)), 0)                as precio_prom,
                min(coalesce(it.precio_negociado, it.precio_unitario))                             as precio_min,
                max(coalesce(it.precio_negociado, it.precio_unitario))                             as precio_max,
                max(c.created_at)                                                                  as ultima_vez
            from cotizacion_items it join cotizaciones c on c.id = it.cotizacion_id
            where c.org_id = ${orgId} and it.producto_id = ${id} and c.status <> 'draft'`,

        // Agregado POR COTIZACIÓN (no distinct on): una cotización puede tener 2 líneas
        // del mismo producto y aparecería duplicada si no se agrupa.
        sql`select c.id, c.folio, c.status, c.created_at, coalesce(cl.empresa, null) as empresa,
                   sum(it.cantidad) as cantidad,
                   sum(coalesce(it.precio_negociado, it.precio_unitario) * it.cantidad) as importe
            from cotizacion_items it
            join cotizaciones c on c.id = it.cotizacion_id
            left join clientes cl on cl.id = c.cliente_id
            where c.org_id = ${orgId} and it.producto_id = ${id} and c.status <> 'draft'
            group by c.id, c.folio, c.status, c.created_at, cl.empresa
            order by c.created_at desc limit 10`,

        sql`select coalesce(cl.empresa, null) as empresa,
                   sum(it.cantidad) as cantidad,
                   sum(coalesce(it.precio_negociado, it.precio_unitario) * it.cantidad) as importe,
                   count(distinct c.id) as veces
            from cotizacion_items it
            join cotizaciones c on c.id = it.cotizacion_id
            left join clientes cl on cl.id = c.cliente_id
            where c.org_id = ${orgId} and it.producto_id = ${id} and c.status <> 'draft' and cl.id is not null
            group by cl.empresa order by importe desc limit 5`,

        sql`select k.id, k.nombre, ki.cantidad
            from kit_items ki join kits k on k.id = ki.kit_id
            where ki.org_id = ${orgId} and ki.producto_id = ${id}
            order by k.nombre`,
    );
    if (!rows.length) return null;
    const p = rows[0];
    const k = kpiRows[0];
    const cotizaciones = num(k.cotizaciones), cerradas = num(k.cerradas);
    const listaTotal = num(k.lista_total), negoTotal = num(k.nego_total);
    const costoCerrado = num(k.costo_cerrado), importeCerrado = num(k.importe_cerrado);
    const precioLista = num(p.precio_lista), costo = num(p.costo);
    // ⚠️ costo_unitario es un snapshot con default 0 — si sale 0 pero el producto SÍ
    // tiene costo hoy, NO calcular margen realizado con ese dato (daría ~100% falso).
    // null = "sin costo histórico", la UI lo pinta explícito en vez de inventar un número.
    const margenRealizado = costoCerrado > 0 && importeCerrado > 0
        ? ((importeCerrado - costoCerrado) / importeCerrado) * 100
        : null;

    return {
        id: p.id as string,
        sku: (p.sku as string) ?? '',
        nombre: p.nombre as string,
        unidad: p.unidad as string,
        descripcion: (p.descripcion as string) ?? '',
        precio: precioLista,
        costo,
        activo: p.activo as boolean,
        createdAt: p.created_at ? new Date(p.created_at as string).toISOString() : null,
        preciosVolumen: normVolumen(p.precios_volumen),
        metricas: {
            cotizaciones, cerradas,
            tasaCierre: cotizaciones ? Math.round((cerradas / cotizaciones) * 100) : 0,
            cantidadVendida: num(k.cantidad_cerrada),
            importeCerrado,
            precioPromedio: num(k.precio_prom),
            precioMin: num(k.precio_min),
            precioMax: num(k.precio_max),
            descuentoCedido: Math.max(0, listaTotal - negoTotal),
            descuentoCedidoPct: listaTotal > 0 ? ((listaTotal - negoTotal) / listaTotal) * 100 : 0,
            margenLista: precioLista > 0 ? ((precioLista - costo) / precioLista) * 100 : null,
            margenRealizado,
            ultimaVez: k.ultima_vez ? new Date(k.ultima_vez as string).toISOString() : null,
        },
        cotizaciones: quotesRows.map((q: any) => ({
            id: q.id as string, folio: q.folio as string, status: q.status as string,
            cliente: (q.empresa as string) || null,
            cantidad: num(q.cantidad), importe: num(q.importe),
            creada: new Date(q.created_at as string).toISOString(),
        })),
        topClientes: clientesRows.map((c: any) => ({
            empresa: c.empresa as string, cantidad: num(c.cantidad), importe: num(c.importe), veces: num(c.veces),
        })),
        kits: kitsRows.map((k2: any) => ({ id: k2.id as string, nombre: k2.nombre as string, cantidad: num(k2.cantidad) })),
    };
}

// Normaliza/saneadel jsonb de precios por volumen a [{min, precio}] válido y ordenado.
export function normVolumen(raw: unknown): { min: number; precio: number }[] {
    let arr: any = raw;
    if (typeof raw === 'string') { try { arr = JSON.parse(raw); } catch { arr = []; } }
    if (!Array.isArray(arr)) return [];
    return arr
        .map((t: any) => ({ min: Math.floor(Number(t?.min) || 0), precio: Math.max(0, Number(t?.precio) || 0) }))
        .filter((t) => t.min > 0 && t.precio > 0)
        .sort((a, b) => a.min - b.min);
}

// ── KITS ─────────────────────────────────────────────────────────────────────
// Paquetes pre-armados de líneas para insertar de un clic en el editor. Pura
// conveniencia de captura: al insertarse se vuelven cotizacion_items normales
// (nunca se referencian de vuelta a un kit).
export interface KitItem {
    id: string;
    productoId: string | null;
    descripcion: string;
    cantidad: number;
    orden: number;
    // Snapshot en vivo del producto referenciado (para el combobox/preview del
    // editor de kits). null si el renglón es línea libre o el producto se borró.
    unidad: string | null;
    precio: number | null;
    sku: string | null;
}
export interface KitFull {
    id: string;
    nombre: string;
    descripcion: string;
    activo: boolean;
    // Precio TOTAL fijo para una unidad del kit (null = sin precio de combo —
    // cada línea conserva su precio de lista/descuento normal). Ver nueva.astro
    // `insertKit` para cómo se prorratea entre las líneas al insertar.
    precioCombo: number | null;
    items: KitItem[];
}
export interface KitListItem {
    id: string;
    nombre: string;
    descripcion: string;
    activo: boolean;
    itemCount: number;
    precioCombo: number | null;
}

// Índice liviano (para /app/productos/kits).
export async function getKits(): Promise<KitListItem[]> {
    const orgId = await getActiveOrgId();
    const [rows] = await withOrgTx(orgId, sql`
        select k.id, k.nombre, k.descripcion, k.activo, k.precio_combo, count(ki.id)::int as item_count
        from kits k
        left join kit_items ki on ki.kit_id = k.id
        where k.org_id = ${orgId}
        group by k.id
        order by k.activo desc, k.nombre`);
    return rows.map((k) => ({
        id: k.id as string,
        nombre: k.nombre as string,
        descripcion: (k.descripcion as string) ?? '',
        activo: k.activo as boolean,
        itemCount: Number(k.item_count ?? 0),
        precioCombo: k.precio_combo != null ? num(k.precio_combo) : null,
    }));
}

// Todos los kits ACTIVOS de la org con sus renglones — para insertar en el
// editor de cotizaciones (server-side, igual que `catalogo`/`CLIENTES`).
export async function getKitsForEditor(): Promise<KitFull[]> {
    const orgId = await getActiveOrgId();
    const [kits, items] = await withOrgTx(orgId,
        sql`select id, nombre, descripcion, activo, precio_combo from kits where org_id = ${orgId} and activo = true order by nombre`,
        sql`select ki.id, ki.kit_id, ki.producto_id, ki.descripcion, ki.cantidad, ki.orden,
                   p.unidad, p.precio_lista, p.sku, p.activo as producto_activo
            from kit_items ki
            join kits k on k.id = ki.kit_id
            left join productos p on p.id = ki.producto_id
            where k.org_id = ${orgId} and k.activo = true
            order by ki.orden asc`,
    );
    const byKit: Record<string, KitItem[]> = {};
    for (const it of items) {
        const kid = it.kit_id as string;
        (byKit[kid] ??= []).push({
            id: it.id as string,
            productoId: it.producto_activo ? (it.producto_id as string) : null,
            descripcion: it.descripcion as string,
            cantidad: num(it.cantidad) || 1,
            orden: Number(it.orden ?? 0),
            unidad: it.producto_activo ? (it.unidad as string) : null,
            precio: it.producto_activo ? num(it.precio_lista) : null,
            sku: it.producto_activo ? ((it.sku as string) ?? '') : null,
        });
    }
    return kits.map((k) => ({
        id: k.id as string,
        nombre: k.nombre as string,
        descripcion: (k.descripcion as string) ?? '',
        activo: k.activo as boolean,
        precioCombo: k.precio_combo != null ? num(k.precio_combo) : null,
        items: byKit[k.id as string] ?? [],
    }));
}

// Un kit completo (incl. inactivos) — para el editor de Productos › Kits.
export async function getKit(orgId: string, kitId: string): Promise<KitFull | null> {
    const [kit, items] = await withOrgTx(orgId,
        sql`select id, nombre, descripcion, activo, precio_combo from kits where id = ${kitId} and org_id = ${orgId} limit 1`,
        sql`select ki.id, ki.producto_id, ki.descripcion, ki.cantidad, ki.orden,
                   p.unidad, p.precio_lista, p.sku
            from kit_items ki left join productos p on p.id = ki.producto_id
            where ki.kit_id = ${kitId} and ki.org_id = ${orgId}
            order by ki.orden asc`,
    );
    const k = kit[0];
    if (!k) return null;
    return {
        id: k.id as string,
        nombre: k.nombre as string,
        descripcion: (k.descripcion as string) ?? '',
        activo: k.activo as boolean,
        precioCombo: k.precio_combo != null ? num(k.precio_combo) : null,
        items: items.map((it) => ({
            id: it.id as string,
            productoId: (it.producto_id as string) ?? null,
            descripcion: it.descripcion as string,
            cantidad: num(it.cantidad) || 1,
            orden: Number(it.orden ?? 0),
            unidad: (it.unidad as string) ?? null,
            precio: it.precio_lista != null ? num(it.precio_lista) : null,
            sku: (it.sku as string) ?? null,
        })),
    };
}

export async function createKit(orgId: string, data: { nombre: string; descripcion?: string; precioCombo?: number | null }): Promise<string> {
    const [[row]] = await withOrgTx(orgId, sql`
        insert into kits (org_id, nombre, descripcion, precio_combo)
        values (${orgId}, ${data.nombre}, ${data.descripcion ?? null}, ${data.precioCombo ?? null})
        returning id`);
    return row.id as string;
}

// Los 4 campos van resueltos (el caller ya mezcló los valores actuales con los
// que llegaron en el PATCH — el `sql` de neon-serverless no compone fragmentos,
// así que no se puede dejar "sin cambio" un campo desde aquí).
export async function renameKit(orgId: string, kitId: string, data: { nombre: string; descripcion: string; activo: boolean; precioCombo: number | null }): Promise<void> {
    await withOrgTx(orgId, sql`
        update kits set nombre = ${data.nombre}, descripcion = ${data.descripcion || null}, activo = ${data.activo},
            precio_combo = ${data.precioCombo}, updated_at = now()
        where id = ${kitId} and org_id = ${orgId}`);
}

export async function deleteKit(orgId: string, kitId: string): Promise<void> {
    await withOrgTx(orgId, sql`delete from kits where id = ${kitId} and org_id = ${orgId}`);
}

// Agrega un renglón (producto del catálogo o línea libre). Devuelve el id nuevo.
export async function addKitItem(
    orgId: string,
    kitId: string,
    data: { productoId?: string | null; descripcion: string; cantidad: number; orden?: number },
): Promise<string> {
    const [[row]] = await withOrgTx(orgId,
        sql`insert into kit_items (kit_id, org_id, producto_id, descripcion, cantidad, orden)
            select ${kitId}, ${orgId}, ${data.productoId ?? null}, ${data.descripcion}, ${data.cantidad}, ${data.orden ?? 0}
            where exists (select 1 from kits where id = ${kitId} and org_id = ${orgId})
            returning id`,
        sql`update kits set updated_at = now() where id = ${kitId} and org_id = ${orgId}`,
    );
    if (!row) throw new Error('Kit no encontrado');
    return row.id as string;
}

export async function removeKitItem(orgId: string, kitId: string, itemId: string): Promise<void> {
    await withOrgTx(orgId,
        sql`delete from kit_items where id = ${itemId} and kit_id = ${kitId} and org_id = ${orgId}`,
        sql`update kits set updated_at = now() where id = ${kitId} and org_id = ${orgId}`,
    );
}

// ── CLIENTES ──────────────────────────────────────────────────────────────────
export async function getClientes() {
    const orgId = await getActiveOrgId();
    // Lateral join: cuenta y suma cotizaciones POR CLIENTE en la misma query — antes
    // clientes.astro cargaba getCotizaciones() completo (todas las de la org, sin límite)
    // solo para hacer un .filter() por nombre de empresa en memoria. Esto es O(n) real.
    const [rows] = await withOrgTx(orgId, sql`
        select c.*,
               coalesce(q.n, 0)       as n_cotizaciones,
               coalesce(q.cerrado, 0) as cerrado,
               q.ultima
        from clientes c
        left join lateral (
            select count(*) filter (where status <> 'draft')                                       as n,
                   coalesce(sum(total) filter (where status in ('approved','paid','invoiced')), 0)  as cerrado,
                   max(created_at)                                                                  as ultima
            from cotizaciones
            where org_id = c.org_id and cliente_id = c.id
        ) q on true
        where c.org_id = ${orgId}
        order by c.empresa`);
    return rows.map(c => ({
        id: c.id as string,
        empresa: c.empresa as string,
        contacto: (c.contacto as string) ?? '',
        email: (c.email as string) ?? '',
        telefono: (c.telefono as string) ?? '',
        rfc: (c.rfc as string) ?? '',
        terminos: termLabel(c.terminos_default as string),
        terminosCode: (c.terminos_default as string) || 'contado',
        limite: num(c.limite_credito),
        inicial: initials(c.empresa),
        nivel: (c.nivel as string) || 'estandar',
        descuentoPct: num(c.descuento_pct),
        regimenFiscal: (c.regimen_fiscal as string) ?? '',
        usoCfdi: (c.uso_cfdi as string) ?? '',
        cpFiscal: (c.cp_fiscal as string) ?? '',
        origen: (c.origen as string) || 'app',
        createdAt: c.created_at ? new Date(c.created_at as string).toISOString() : null,
        fiscalCompleto: !!((c.regimen_fiscal as string) && (c.cp_fiscal as string)),
        nCotizaciones: num(c.n_cotizaciones),
        cerrado: num(c.cerrado),
        ultimaActividad: c.ultima ? new Date(c.ultima as string).toISOString() : null,
    }));
}

// Ficha + métricas de UN cliente para /app/clientes/[id]. Sin cachear: editar → volver
// debe reflejar el cambio de inmediato.
export async function getCliente(id: string) {
    const orgId = await getActiveOrgId();
    const [rows, kpiRows, cobradoRows, recRows, quotesRows, prodRows, margRows, mesesRows] = await withOrgTx(orgId,
        sql`select * from clientes where id = ${id} and org_id = ${orgId}`,

        // "Cerrada" = status in ('approved','paid','invoiced') — mismo criterio que
        // getAnalytics()/getDesempeno(). El saldo abierto excluye es_recurrente (una
        // iguala al corriente nunca es "cartera pendiente", igual que getCobranza()).
        sql`select
                count(*) filter (where status <> 'draft')                                        as cotizaciones,
                count(*) filter (where status in ('sent','viewed','approved','paid','invoiced'))  as enviadas,
                count(*) filter (where status in ('approved','paid','invoiced'))                  as cerradas,
                count(*) filter (where status in ('rejected','expired'))                          as perdidas,
                count(*) filter (where status in ('sent','viewed'))                               as abiertas,
                coalesce(sum(total) filter (where status in ('approved','paid','invoiced')), 0)   as cerrado_total,
                coalesce(sum(total) filter (where status in ('sent','viewed')), 0)                as pipeline_total,
                coalesce(sum(total) filter (where status in ('approved','invoiced')
                                              and es_recurrente is not true), 0)                  as saldo_abierto,
                coalesce(avg(extract(epoch from (approved_at - created_at))/86400)
                         filter (where status in ('approved','paid','invoiced')
                                   and approved_at is not null), 0)                                as dias_cierre,
                max(coalesce(approved_at, sent_at, created_at))                                    as ultima_actividad
            from cotizaciones where org_id = ${orgId} and cliente_id = ${id}`,

        // Cobrado directo — MISMA semántica que getCobros(): 'paid' o paid_at seteado.
        sql`select coalesce(sum(greatest(0, total - coalesce((
                    select sum(cc.reembolsado_cents) / 100.0
                    from cotizacion_cobros cc
                    where cc.org_id = ${orgId} and cc.cotizacion_id = cotizaciones.id
                ), 0))), 0) as cobrado
            from cotizaciones
            where org_id = ${orgId} and cliente_id = ${id} and (status = 'paid' or paid_at is not null)`,

        // Cobrado de igualas recurrentes — universo DISJUNTO del anterior (una iguala
        // nunca marca cotizaciones.paid_at). Se suma en JS, sin doble conteo.
        sql`select coalesce(sum(greatest(0, co.monto - coalesce(co.reembolsado_cents, 0) / 100.0)), 0) as cobrado
            from cotizacion_cobros co
            join cotizaciones c on c.id = co.cotizacion_id
            where co.org_id = ${orgId} and co.status = 'pagado'
              and c.es_recurrente is true and c.cliente_id = ${id}`,

        sql`select id, folio, status, total, created_at, approved_at, public_token, es_recurrente
            from cotizaciones where org_id = ${orgId} and cliente_id = ${id}
            order by created_at desc limit 10`,

        // Qué le vendes. cotizacion_items NO tiene org_id — el aislamiento sale del join.
        sql`select coalesce(p.nombre, it.descripcion) as nombre,
                   coalesce(sum(it.cantidad), 0) as cantidad,
                   coalesce(sum(coalesce(it.precio_negociado, it.precio_unitario) * it.cantidad), 0) as importe,
                   count(distinct c.id) as veces
            from cotizacion_items it
            join cotizaciones c on c.id = it.cotizacion_id
            left join productos p on p.id = it.producto_id
            where c.org_id = ${orgId} and c.cliente_id = ${id} and c.status <> 'draft'
            group by 1 order by importe desc limit 5`,

        // Descuento real cedido (mismo cálculo que getAnalytics().margen).
        sql`select coalesce(sum(it.precio_unitario * it.cantidad), 0) as lista,
                   coalesce(sum(coalesce(it.precio_negociado, it.precio_unitario) * it.cantidad), 0) as nego
            from cotizacion_items it join cotizaciones c on c.id = it.cotizacion_id
            where c.org_id = ${orgId} and c.cliente_id = ${id} and c.status <> 'draft'`,

        sql`select to_char(date_trunc('month', created_at), 'YYYY-MM') as ym,
                   coalesce(sum(total), 0) as cotizado
            from cotizaciones
            where org_id = ${orgId} and cliente_id = ${id}
              and created_at >= date_trunc('month', now()) - interval '11 months'
            group by 1 order by 1`,
    );
    if (!rows.length) return null;
    const c = rows[0];
    const k = kpiRows[0];
    const cobradoTotal = num(cobradoRows[0]?.cobrado) + num(recRows[0]?.cobrado);
    const enviadas = num(k.enviadas), cerradas = num(k.cerradas);
    const cerradoTotal = num(k.cerrado_total);
    const limite = num(c.limite_credito);
    const saldoAbierto = num(k.saldo_abierto);
    const marg = margRows[0];
    const listaTotal = num(marg?.lista), negoTotal = num(marg?.nego);
    const ultimaActividad = k.ultima_actividad ? new Date(k.ultima_actividad as string) : null;

    return {
        id: c.id as string,
        empresa: c.empresa as string,
        contacto: (c.contacto as string) ?? '',
        email: (c.email as string) ?? '',
        telefono: (c.telefono as string) ?? '',
        rfc: (c.rfc as string) ?? '',
        terminos: termLabel(c.terminos_default as string),
        terminosCode: (c.terminos_default as string) || 'contado',
        limite,
        inicial: initials(c.empresa),
        nivel: (c.nivel as string) || 'estandar',
        descuentoPct: num(c.descuento_pct),
        regimenFiscal: (c.regimen_fiscal as string) ?? '',
        usoCfdi: (c.uso_cfdi as string) ?? '',
        cpFiscal: (c.cp_fiscal as string) ?? '',
        origen: (c.origen as string) || 'app',
        createdAt: c.created_at ? new Date(c.created_at as string).toISOString() : null,
        fiscalCompleto: !!((c.regimen_fiscal as string) && (c.cp_fiscal as string)),
        metricas: {
            cotizaciones: num(k.cotizaciones),
            enviadas, cerradas,
            perdidas: num(k.perdidas),
            abiertas: num(k.abiertas),
            tasaCierre: enviadas ? Math.round((cerradas / enviadas) * 100) : 0,
            cerradoTotal, pipelineTotal: num(k.pipeline_total), saldoAbierto,
            cobradoTotal,
            ticketPromedio: cerradas ? cerradoTotal / cerradas : 0,
            diasCierre: Math.round(num(k.dias_cierre) * 10) / 10,
            usoCreditoPct: limite > 0 ? Math.round((saldoAbierto / limite) * 100) : 0,
            excedeCredito: limite > 0 && saldoAbierto > limite,
            descuentoCedido: Math.max(0, listaTotal - negoTotal),
            descuentoCedidoPct: listaTotal > 0 ? ((listaTotal - negoTotal) / listaTotal) * 100 : 0,
            ultimaActividad: ultimaActividad ? ultimaActividad.toISOString() : null,
            diasSilencio: ultimaActividad ? Math.floor((Date.now() - ultimaActividad.getTime()) / 86400000) : null,
        },
        cotizaciones: quotesRows.map((q: any) => ({
            id: q.id as string, folio: q.folio as string, status: q.status as string,
            total: num(q.total), creada: new Date(q.created_at as string).toISOString(),
            esRecurrente: !!q.es_recurrente, token: q.public_token as string,
        })),
        productos: prodRows.map((p: any) => ({
            nombre: p.nombre as string, cantidad: num(p.cantidad), importe: num(p.importe), veces: num(p.veces),
        })),
        meses: mesesRows.map((m: any) => ({ ym: m.ym as string, cotizado: num(m.cotizado) })),
    };
}

// ── COTIZACIONES ──────────────────────────────────────────────────────────────
function rowToQuote(c: any, items: any[], eventos: any[], versiones: any[] = [], conversacion: any[] = []): MockQuote {
    return {
        id: c.id,
        folio: c.folio,
        cliente: c.empresa ?? 'Sin cliente',
        cliente_id: c.cliente_id,
        clienteInicial: initials(c.empresa ?? '—'),
        status: c.status as QuoteStatus,
        terminos: termLabel(c.terminos),
        vigencia: fmtDate(c.vigencia),
        vigenciaDias: c.vigencia ? Math.max(1, Math.ceil((new Date(c.vigencia).getTime() - Date.now()) / 86400000)) : null,
        creada: fmtDate(c.created_at),
        token: c.public_token,
        notas: c.notas ?? undefined,
        aprobEstado: (c.aprob_estado as string) ?? null,
        aprobMotivo: (c.aprob_motivo as string) ?? null,
        total: num(c.total),
        // Divisas de la cotización. Viajan SIEMPRE en el DTO: sin ellas, el
        // editor y la reanudación de borradores caían a la divisa default del
        // negocio, así que una cotización vendida en USD se releía (y se volvía
        // a guardar) como si fuera en pesos. Ver regla 21.
        baseCurrency: normalizeCurrency(c.base_currency, 'MXN'),
        fiscalCurrency: normalizeCurrency(c.fiscal_currency, normalizeCurrency(c.base_currency, 'MXN')),
        version: num(c.version) || 1,
        iva_incluido: Boolean(c.iva_incluido),
        // Tasa de la org para las líneas anteriores al impuesto por línea. Sin
        // esto los totales caerían a una constante del 16% (ver mock.ts).
        taxRateFallback: c.org_iva_pct != null ? num(c.org_iva_pct) / 100 : undefined,
        retenciones: Array.isArray(c.retenciones_snapshot) ? c.retenciones_snapshot : [],
        anticipoPct: c.anticipo_pct != null ? num(c.anticipo_pct) : null,
        esRecurrente: Boolean(c.es_recurrente),
        items: items.map((it): MockItem => ({
            id: it.id,
            producto_id: it.producto_id,
            descripcion: it.descripcion,
            cantidad: num(it.cantidad),
            unidad: it.unidad ?? 'pieza',
            precioLista: num(it.precio_unitario),
            precioNegociado: it.precio_negociado === null ? null : num(it.precio_negociado),
            taxRate: it.tax_rate != null ? num(it.tax_rate) : undefined,
            aprobado: it.aprobado !== false,   // default true (sin columna o no decidido = incluida)
            comentarios: it.comentarios ?? [],
        })),
        eventos: eventos.map((e): MockEvent => ({
            tipo: e.tipo,
            detalle: e.detalle ?? '',
            cuando: fmtRelative(e.created_at),
        })),
        conversacion: conversacion.map((e) => ({
            tipo: e.tipo as string,
            detalle: (e.detalle as string) ?? '',
            cuando: fmtRelative(e.created_at),
            mine: e.tipo === 'reply',   // desde la perspectiva del vendedor: "reply" = tú, comment/counter = el cliente
        })),
        versiones: versiones.map((v) => ({
            version: num(v.version),
            total: num(v.total),
            fecha: fmtDate(v.created_at),
            items: v.items as any[],
        })),
    };
}

// Lista (sin items/eventos detallados). Acepta paginación opcional; por defecto
// aplica un techo de seguridad alto (100k) para acotar el peor caso sin cambiar
// el comportamiento actual (ninguna org real llega a esa cifra). La vista de lista
// puede pasar { limit, offset } para paginar de verdad.
export async function getCotizaciones(opts?: { limit?: number; offset?: number }): Promise<MockQuote[]> {
    const orgId = await getActiveOrgId();
    const limit = Math.min(Math.max(opts?.limit ?? 100000, 1), 100000);
    const offset = Math.max(opts?.offset ?? 0, 0);
    const [rows] = await withOrgTx(orgId, sql`
        select c.*, cl.empresa, cl.terminos_default,
               coalesce(c.terminos, cl.terminos_default) as terminos
        from cotizaciones c
        left join clientes cl on cl.id = c.cliente_id
        where c.org_id = ${orgId}
        order by c.created_at desc
        limit ${limit} offset ${offset}`);
    return rows.map(c => rowToQuote(c, [], [], []));
}

// Detalle con items y timeline. Cuatro queries en un solo batch.
export async function getCotizacion(id: string): Promise<MockQuote | null> {
    const orgId = await getActiveOrgId();
    const [rows, items, eventos, versiones, conv, comentarios] = await withOrgTx(orgId,
        sql`select c.*, cl.empresa, coalesce(c.terminos, cl.terminos_default) as terminos,
                   o.iva_pct as org_iva_pct
            from cotizaciones c
            left join clientes cl on cl.id = c.cliente_id
            left join orgs o on o.id = c.org_id
            where c.id = ${id} and c.org_id = ${orgId}`,
        sql`select * from cotizacion_items where cotizacion_id = ${id} order by orden`,
        // Bitácora de auditoría — SOLO cambios de estado del sistema. Los mensajes
        // (comment/counter/reply) viven en `conv` y se pintan como chat, no como log.
        sql`select * from eventos where cotizacion_id = ${id} and tipo not in ('comment', 'counter', 'reply') order by created_at desc`,
        sql`select * from cotizacion_versiones where cotizacion_id = ${id} order by version desc`,
        sql`select tipo, detalle, created_at from eventos where cotizacion_id = ${id} and tipo in ('comment', 'counter', 'reply') order by created_at asc`,
        sql`select * from cotizacion_comentarios where cotizacion_id = ${id} order by created_at asc`,
    );
    if (!rows.length) return null;

    const itemsWithComments = items.map((it: any) => ({
        ...it,
        comentarios: comentarios
            .filter((c: any) => c.item_id === it.id)
            .map((c: any) => ({
                autor: c.autor_nombre,
                tipo: c.autor_tipo,
                contenido: c.contenido,
                cuando: fmtRelative(c.created_at),
                mine: c.autor_tipo === 'usuario',   // desde la perspectiva del vendedor
            })),
    }));

    return rowToQuote(rows[0], itemsWithComments, eventos, versiones, conv);
}

// Documentos fiscales emitidos para una cotización (CFDI / invoice).
export async function getDocumentosFiscales(cotizacionId: string) {
    const orgId = await getActiveOrgId();
    const [rows] = await withOrgTx(orgId, sql`
        select id, country_code, document_type, fiscal_id, invoice_number, currency,
               total, status, provider_data, pdf_url, xml_url, created_at
        from documentos_fiscales
        where cotizacion_id = ${cotizacionId} and org_id = ${orgId}
        order by created_at desc`);
    return rows.map((r: any) => ({
        id: r.id as string,
        pais: r.country_code as string,
        tipo: r.document_type as string,
        invoiceNumber: (r.invoice_number as string) || null,
        currency: (r.currency as string) || null,
        total: num(r.total),
        fiscalId: (r.fiscal_id as string) || null,
        status: r.status as string,
        simulado: !!(r.provider_data && (r.provider_data.simulado === true)),
        // Facturapi emite de verdad pero con una llave sk_test_: el documento
        // "existe" en su sandbox, NUNCA llega al SAT. Distinto de `simulado`
        // (que es cuando Cord ni siquiera llamó al proveedor).
        testMode: !!(r.provider_data && r.provider_data.livemode === false),
        pdfUrl: (r.pdf_url as string) || null,
        xmlUrl: (r.xml_url as string) || null,
        creado: fmtDate(r.created_at as string),
    }));
}

// ── Bandeja de facturas ─────────────────────────────────────────────────────
// Antes era un `limit 200` fijo sin filtros ni saldo, y hacía `join` a
// cotizaciones — lo que dejaba fuera cualquier factura standalone. Ahora:
// `left join`, filtros, paginación keyset y el saldo real de cada documento.

export interface FacturaFilters {
    /** draft | open | paid | void | uncollectible | overdue */
    estado?: string | null;
    clienteId?: string | null;
    desde?: string | null;
    hasta?: string | null;
    q?: string | null;
    limit?: number;
    /** Keyset: created_at del último registro de la página anterior. */
    cursor?: string | null;
}

function rowToFactura(r: any) {
    const total = num(r.invoice_total ?? r.quote_total);
    const pagado = num(r.amount_paid);
    return {
        id: r.id as string,
        cotizacionId: (r.cotizacion_id as string) || null,
        clienteId: (r.cliente_id as string) || null,
        folio: (r.folio as string) || null,
        cliente: (r.empresa as string) || null,
        invoiceNumber: (r.invoice_number as string) || null,
        currency: (r.currency as string) || null,
        total,
        pagado,
        saldo: r.amount_remaining !== null && r.amount_remaining !== undefined
            ? num(r.amount_remaining)
            : Math.max(total - pagado, 0),
        // `estado` es el ciclo COMERCIAL y `estadoFiscal` el rail regulatorio.
        // La UI los muestra por separado a propósito: "timbrada" y "pagada" son
        // hechos distintos y confundirlos es cómo se cobra dos veces.
        estado: (r.lifecycle as string) || 'open',
        estadoFiscal: r.status as string,
        vence: r.due_date ? fmtDate(r.due_date as string) : null,
        venceISO: r.due_date ? String(r.due_date).slice(0, 10) : null,
        vencida: !!r.vencida,
        diasVencida: r.dias_vencida !== null && r.dias_vencida !== undefined ? Number(r.dias_vencida) : null,
        pais: r.country_code as string,
        tipo: r.document_type as string,
        fiscalId: (r.fiscal_id as string) || null,
        notaCreditoDe: (r.credit_note_of as string) || null,
        publicToken: (r.public_token as string) || null,
        enviada: !!r.sent_at,
        status: r.status as string,
        simulado: !!(r.provider_data && (r.provider_data as any).simulado === true),
        testMode: !!(r.provider_data && (r.provider_data as any).livemode === false),
        pdfUrl: (r.pdf_url as string) || null,
        xmlUrl: (r.xml_url as string) || null,
        creado: fmtDate(r.created_at as string),
        creadoISO: String(r.created_at),
    };
}

export async function getFacturas(filters: FacturaFilters = {}) {
    const orgId = await getActiveOrgId();
    const limit = Math.min(Math.max(Number(filters.limit) || 50, 1), 200);
    // Vocabulario cerrado: el filtro viene de la URL y no es de confianza.
    const estado = ['draft', 'open', 'paid', 'void', 'uncollectible', 'overdue'].includes(String(filters.estado))
        ? String(filters.estado)
        : null;
    const busqueda = filters.q ? `%${String(filters.q).trim().slice(0, 80)}%` : null;

    const [rows] = await withOrgTx(orgId, sql`
        select d.id, d.cotizacion_id, d.cliente_id, d.country_code, d.document_type,
               d.fiscal_id, d.invoice_number, d.currency, d.total as invoice_total,
               d.lifecycle, d.status, d.amount_paid, d.amount_remaining, d.due_date,
               d.public_token, d.sent_at, d.credit_note_of,
               d.provider_data, d.pdf_url, d.xml_url, d.created_at,
               (d.lifecycle = 'open' and d.due_date is not null and d.due_date < current_date) as vencida,
               case when d.lifecycle = 'open' and d.due_date is not null and d.due_date < current_date
                    then current_date - d.due_date else null end as dias_vencida,
               c.folio, c.total as quote_total,
               coalesce(cl.empresa, cq.empresa) as empresa
          from documentos_fiscales d
          left join cotizaciones c on c.id = d.cotizacion_id
          left join clientes cl on cl.id = d.cliente_id
          left join clientes cq on cq.id = c.cliente_id
         where d.org_id = ${orgId}
           and (${estado}::text is null
                or (${estado}::text = 'overdue'
                    and d.lifecycle = 'open' and d.due_date is not null and d.due_date < current_date)
                or (${estado}::text <> 'overdue' and d.lifecycle = ${estado}))
           and (${filters.clienteId || null}::uuid is null or d.cliente_id = ${filters.clienteId || null}::uuid)
           and (${filters.desde || null}::date is null or d.created_at >= ${filters.desde || null}::date)
           and (${filters.hasta || null}::date is null or d.created_at < (${filters.hasta || null}::date + interval '1 day'))
           and (${busqueda}::text is null
                or d.invoice_number ilike ${busqueda}
                or d.fiscal_id ilike ${busqueda}
                or c.folio ilike ${busqueda}
                or coalesce(cl.empresa, cq.empresa) ilike ${busqueda})
           and (${filters.cursor || null}::timestamptz is null or d.created_at < ${filters.cursor || null}::timestamptz)
         order by d.created_at desc, d.id desc
         limit ${limit + 1}`);

    const page = rows.slice(0, limit).map(rowToFactura);
    return {
        facturas: page,
        // El cursor sale de la fila real, no de un offset: con `offset` una
        // factura nueva desplaza la página y esconde un registro sin avisar.
        nextCursor: rows.length > limit && page.length ? page[page.length - 1].creadoISO : null,
    };
}

/** Totales de cabecera de la bandeja: por cobrar, vencido y cobrado del mes. */
export async function getFacturasResumen() {
    const orgId = await getActiveOrgId();
    const [rows] = await withOrgTx(orgId, sql`
        select
          coalesce(sum(amount_remaining) filter (where lifecycle = 'open'), 0) as por_cobrar,
          coalesce(sum(amount_remaining) filter (
            where lifecycle = 'open' and due_date is not null and due_date < current_date), 0) as vencido,
          coalesce(sum(amount_paid) filter (
            where date_trunc('month', updated_at) = date_trunc('month', current_date)), 0) as cobrado_mes,
          count(*) filter (where lifecycle = 'draft') as borradores,
          count(*) filter (
            where lifecycle = 'open' and due_date is not null and due_date < current_date) as vencidas
        from documentos_fiscales
       where org_id = ${orgId}`);
    const r = rows[0] || {};
    return {
        porCobrar: num(r.por_cobrar),
        vencido: num(r.vencido),
        cobradoMes: num(r.cobrado_mes),
        borradores: Number(r.borradores || 0),
        vencidas: Number(r.vencidas || 0),
    };
}

/**
 * Factura por su token público, para la hosted invoice page (`/i/[token]`).
 *
 * Carril público: no hay sesión, así que el token se traduce primero a
 * (documento, organización) con `cord_resolve_public_invoice` y a partir de ahí
 * todo corre con contexto de org. Un borrador no resuelve.
 */
export async function getFacturaByToken(token: string) {
    const identity = await resolvePublicInvoice(token);
    if (!identity) return null;
    const { id, orgId } = identity;
    const [rows, pagos] = await withOrgTx(orgId,
        sql`select d.id, d.org_id, d.cotizacion_id, d.invoice_number, d.fiscal_id,
                   d.lifecycle, d.status, d.country_code, d.document_type,
                   d.currency, d.ledger_currency, d.fx_rate, d.ledger_total,
                   d.subtotal, d.tax_total, d.total, d.amount_paid, d.amount_remaining,
                   d.due_date, d.notes, d.issued_at, d.created_at, d.public_token,
                   d.issuer_snapshot, d.recipient_snapshot, d.line_items_snapshot,
                   d.provider_data, d.pdf_url, d.xml_url, d.credit_note_of,
                   c.public_token as quote_token, c.folio as quote_folio,
                   o.nombre as org_nombre, o.logo_url as org_logo_url,
                   o.color_marca as org_color, o.email_contacto as org_email,
                   o.telefono as org_tel, o.moneda as org_moneda,
                   o.portal_powered as org_portal_powered,
                   (o.sandbox_of is not null) as org_es_prueba,
                   o.stripe_account_id as org_stripe_account_id,
                   o.stripe_charges_enabled as org_stripe_charges_enabled,
                   o.acepta_tarjeta as org_acepta_tarjeta,
                   o.acepta_transferencia as org_acepta_transferencia
              from documentos_fiscales d
              join orgs o on o.id = d.org_id
              left join cotizaciones c on c.id = d.cotizacion_id
             where d.id = ${id} and d.org_id = ${orgId}
             limit 1`,
        sql`select monto, currency, metodo, aplicado_at
              from documento_pagos
             where documento_id = ${id} and org_id = ${orgId}
             order by aplicado_at asc`);
    const r = rows[0];
    if (!r) return null;

    // Regla 21: el cliente lee los importes en la divisa en que se le facturó,
    // no en la del negocio. Sin esta línea money() pinta el símbolo de la org.
    const currency = normalizeCurrency((r.currency as string) || (r.org_moneda as string));
    setRequestCurrency(currency);

    const total = num(r.total);
    const pagado = num(r.amount_paid);
    const saldo = r.amount_remaining !== null && r.amount_remaining !== undefined
        ? num(r.amount_remaining) : Math.max(total - pagado, 0);
    const vence = r.due_date ? String(r.due_date).slice(0, 10) : null;
    const hoy = new Date().toISOString().slice(0, 10);

    return {
        orgId,
        id: r.id as string,
        token: r.public_token as string,
        numero: (r.invoice_number as string) || null,
        fiscalId: (r.fiscal_id as string) || null,
        estado: r.lifecycle as string,
        estadoFiscal: r.status as string,
        pais: r.country_code as string,
        tipo: r.document_type as string,
        esNotaCredito: !!r.credit_note_of,
        currency,
        ledgerCurrency: (r.ledger_currency as string) || null,
        fxRate: r.fx_rate !== null && r.fx_rate !== undefined ? num(r.fx_rate) : null,
        subtotal: num(r.subtotal),
        impuestos: num(r.tax_total),
        total,
        pagado,
        saldo,
        vence,
        venceLegible: r.due_date ? fmtDate(r.due_date as string) : null,
        vencida: !!vence && r.lifecycle === 'open' && vence < hoy,
        emitida: r.issued_at ? fmtDate(r.issued_at as string) : fmtDate(r.created_at as string),
        notas: (r.notes as string) || null,
        emisor: (r.issuer_snapshot as any) || {},
        receptor: (r.recipient_snapshot as any) || {},
        lineas: ((r.line_items_snapshot as any[]) || []).map((l: any) => ({
            descripcion: String(l.description || ''),
            cantidad: num(l.quantity),
            precioUnitario: num(l.unitPrice),
            subtotal: num(l.subtotal),
            impuesto: num(l.taxAmount),
            total: num(l.total),
        })),
        pagos: pagos.map((pg: any) => ({
            monto: num(pg.monto),
            currency: (pg.currency as string) || currency,
            metodo: (pg.metodo as string) || 'manual',
            cuando: fmtDate(pg.aplicado_at as string),
        })),
        pdfUrl: (r.pdf_url as string) || null,
        xmlUrl: (r.xml_url as string) || null,
        // Solo hay pago en línea si queda saldo, el negocio tiene Connect
        // habilitado y la factura no está anulada.
        pagoDisponible: saldo > 0
            && r.lifecycle === 'open'
            && !!r.org_stripe_account_id
            && !!r.org_stripe_charges_enabled,
        aceptaTarjeta: !!r.org_acepta_tarjeta,
        aceptaTransferencia: !!r.org_acepta_transferencia,
        quoteToken: (r.quote_token as string) || null,
        quoteFolio: (r.quote_folio as string) || null,
        simulado: !!(r.provider_data && (r.provider_data as any).simulado === true),
        testMode: !!(r.provider_data && (r.provider_data as any).livemode === false),
        esPrueba: !!r.org_es_prueba,
        org: {
            nombre: (r.org_nombre as string) || 'Cord',
            logoUrl: (r.org_logo_url as string) || null,
            color: (r.org_color as string) || null,
            email: (r.org_email as string) || null,
            telefono: (r.org_tel as string) || null,
            powered: r.org_portal_powered !== false,
        },
    };
}

/** Detalle de una factura para el vendedor, con sus snapshots y pagos. */
export async function getFacturaDetalle(id: string) {
    const orgId = await getActiveOrgId();
    const [rows, pagos] = await withOrgTx(orgId,
        sql`select d.*, c.folio,
                   coalesce(cl.empresa, cq.empresa) as empresa,
                   coalesce(cl.email, cq.email) as cliente_email
              from documentos_fiscales d
              left join cotizaciones c on c.id = d.cotizacion_id
              left join clientes cl on cl.id = d.cliente_id
              left join clientes cq on cq.id = c.cliente_id
             where d.id = ${id} and d.org_id = ${orgId}
             limit 1`,
        sql`select id, monto, currency, metodo, referencia, nota, aplicado_at
              from documento_pagos
             where documento_id = ${id} and org_id = ${orgId}
             order by aplicado_at asc`);
    const r = rows[0];
    if (!r) return null;
    return {
        ...rowToFactura(r),
        // La org va en el DTO para que la página pueda pedir el timeline sin
        // volver a resolverla.
        orgId,
        clienteEmail: (r.cliente_email as string) || null,
        notas: (r.notes as string) || null,
        ledgerCurrency: (r.ledger_currency as string) || null,
        fxRate: r.fx_rate !== null && r.fx_rate !== undefined ? num(r.fx_rate) : null,
        ledgerTotal: r.ledger_total !== null && r.ledger_total !== undefined ? num(r.ledger_total) : null,
        subtotal: num(r.subtotal),
        impuestos: num(r.tax_total),
        emisor: (r.issuer_snapshot as any) || {},
        receptor: (r.recipient_snapshot as any) || {},
        lineas: ((r.line_items_snapshot as any[]) || []).map((l: any) => ({
            descripcion: String(l.description || ''),
            cantidad: num(l.quantity),
            precioUnitario: num(l.unitPrice),
            subtotal: num(l.subtotal),
            impuesto: num(l.taxAmount),
            total: num(l.total),
        })),
        anuladaEn: r.voided_at ? fmtDate(r.voided_at as string) : null,
        motivoAnulacion: (r.void_reason as string) || null,
        pagos: pagos.map((pg: any) => ({
            id: pg.id as string,
            monto: num(pg.monto),
            currency: (pg.currency as string) || null,
            metodo: (pg.metodo as string) || 'manual',
            referencia: (pg.referencia as string) || null,
            nota: (pg.nota as string) || null,
            cuando: fmtDate(pg.aplicado_at as string),
        })),
    };
}

// Suscripción recurrente (iguala) de una cotización, para el detalle del vendedor.
export async function getSuscripcionByCotizacion(cotizacionId: string) {
    const orgId = await getActiveOrgId();
    const [rows] = await withOrgTx(orgId,
        sql`select estado, monto, current_period_end, cancel_at_period_end, stripe_subscription_id
            from cotizacion_suscripciones
            where cotizacion_id = ${cotizacionId} and org_id = ${orgId} limit 1`);
    const row = rows?.[0];
    if (!row) return null;
    return {
        estado: row.estado as string,
        monto: num(row.monto),
        currentPeriodEnd: row.current_period_end ? fmtDate(row.current_period_end as string) : '',
        cancelAtPeriodEnd: !!row.cancel_at_period_end,
        activa: ['active', 'trialing', 'past_due'].includes(row.estado as string),
    };
}

// Link público: el token solo resuelve el par mínimo (cotización, organización).
// Toda la carga posterior corre bajo el contexto tenant ya resuelto; así el rol de
// aplicación nunca necesita políticas públicas sobre orgs, clientes o conversaciones.
export async function getCotizacionByToken(token: string) {
    const identity = await resolvePublicQuote(token);
    if (!identity) return null;
    const orgId = identity.orgId;
    const quoteId = identity.id;
    const [rows, items, conv, comentarios, firmas, cobrosRows, susRows] = await withOrgTx(orgId,
        sql`select c.*, cl.empresa, coalesce(c.terminos, cl.terminos_default) as terminos,
               o.nombre as org_nombre, o.rfc as org_rfc, o.color_marca as org_color,
               o.logo_url as org_logo_url,
               o.pdf_mensaje as org_pdf_mensaje, o.iva_pct as org_iva_pct,
               o.embed_domains as org_embed_domains,
               o.email_contacto as org_email, o.telefono as org_tel, o.whatsapp as org_wa,
               o.portal_banner as org_portal_banner, o.portal_bienvenida as org_portal_bienvenida,
               o.portal_mostrar_chat as org_portal_chat, o.portal_powered as org_portal_powered,
               o.country_code as org_country_code,
               (o.sandbox_of is not null) as org_es_prueba,
               o.is_demo as org_es_demo,
               o.stripe_account_id as org_stripe_account_id,
               o.stripe_charges_enabled as org_stripe_charges_enabled,
               o.acepta_tarjeta as org_acepta_tarjeta,
               o.acepta_transferencia as org_acepta_transferencia,
               o.cobro_spei_auto as org_cobro_spei_auto,
               o.banco_nombre as org_banco_nombre,
               o.banco_clabe as org_banco_clabe, o.banco_clabe_enc as org_banco_clabe_enc,
               o.banco_beneficiario as org_banco_beneficiario
            from cotizaciones c
            left join clientes cl on cl.id = c.cliente_id
            join orgs o on o.id = c.org_id
            where c.id = ${quoteId} and c.org_id = ${orgId}`,
        sql`select ci.* from cotizacion_items ci
            join cotizaciones c on c.id = ci.cotizacion_id
            where c.id = ${quoteId} and c.org_id = ${orgId} order by ci.orden`,
        sql`select e.tipo, e.detalle, e.created_at from eventos e
            join cotizaciones c on c.id = e.cotizacion_id
            where c.id = ${quoteId} and c.org_id = ${orgId}
              and e.tipo in ('comment', 'counter', 'reply')
            order by e.created_at asc`,
        sql`select cc.* from cotizacion_comentarios cc
            join cotizaciones c on c.id = cc.cotizacion_id
            where c.id = ${quoteId} and c.org_id = ${orgId} order by cc.created_at asc`,
        sql`select f.* from cotizacion_firmas f
            join cotizaciones c on c.id = f.cotizacion_id
            where c.id = ${quoteId} and c.org_id = ${orgId}
            order by f.firmado_en desc limit 1`,
        sql`select co.id, co.tipo, co.numero_cuota, co.monto, co.status, co.vence, co.paid_at
            from cotizacion_cobros co
            join cotizaciones c on c.id = co.cotizacion_id
            where c.id = ${quoteId} and c.org_id = ${orgId}
            order by co.vence asc nulls last, co.created_at asc`,
        sql`select s.estado, s.monto, s.current_period_end
            from cotizacion_suscripciones s
            join cotizaciones c on c.id = s.cotizacion_id
            where c.id = ${quoteId} and c.org_id = ${orgId} limit 1`,
    );
    if (!rows.length) return null;
    const entitlement = await getEntitlementContext(orgId);
    const canRemoveBranding = planIncludes(entitlement.effectivePlan, 'remove_branding');
    
    // Anexar comentarios a sus respectivos items
    const itemsWithComments = items.map((it: any) => ({
        ...it,
        comentarios: comentarios
            .filter((c: any) => c.item_id === it.id)
            .map((c: any) => ({
                autor: c.autor_nombre,
                tipo: c.autor_tipo,
                contenido: c.contenido,
                cuando: fmtRelative(c.created_at),
            }))
    }));

    const quote = rowToQuote(rows[0], itemsWithComments, []);

    // El cliente lee los montos en la divisa en que se le VENDIÓ, no en la del
    // vendedor: una cotización en USD de un negocio mexicano se muestra en USD.
    // Esta línea es la que hace que money() en QuoteCard formatee bien; sin
    // ella toda superficie pública decía "MX$" sin importar el país.
    const quoteCurrency = normalizeCurrency(
        (rows[0].base_currency as string) || (rows[0].moneda as string),
    );
    setRequestCurrency(quoteCurrency);

    // Días restantes de vigencia (para la cuenta regresiva del link público).
    if (rows[0].vigencia) {
        const venc = new Date(rows[0].vigencia as string);
        const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
        (quote as any).diasVigencia = Math.ceil((venc.getTime() - hoy.getTime()) / 86400000);
    }

    // Disponibilidad del pago en línea según los términos de crédito (contado =
    // pagable desde la aprobación; net30/net60 = pagable hasta que llega la fecha
    // de vencimiento). Mismo cálculo canónico que getCobranza()/cron de intereses:
    // vence = coalesce(approved_at, created_at) + días del término.
    {
        const DAYS: Record<string, number> = { contado: 0, net30: 30, net60: 60 };
        const termRaw = (rows[0].terminos as string) || 'contado';
        const termDias = DAYS[termRaw] ?? 0;
        const base = new Date((rows[0].approved_at as string) || (rows[0].created_at as string) || Date.now());
        const due = new Date(base); due.setDate(due.getDate() + termDias); due.setHours(0, 0, 0, 0);
        const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
        (quote as any).pagoDisponible = termDias === 0 || due.getTime() <= hoy.getTime();
        (quote as any).saldoVence = termDias > 0 ? fmtDate(due) : '';
        (quote as any).saldoVenceDias = termDias > 0 ? Math.max(0, Math.ceil((due.getTime() - hoy.getTime()) / 86400000)) : 0;
    }

    // Cobros parciales (anticipo/saldo/cuotas). Si la cotización tiene filas en
    // cotizacion_cobros, el link público muestra el desglose y el botón de pago
    // apunta al siguiente cobro pendiente (no al total completo).
    // ⚠️ En igualas recurrentes, cotizacion_cobros guarda el HISTORIAL de cobros
    // mensuales (para getCobros/"Mi dinero") — no es un plan de pago que el cliente
    // deba ver, así que se OMITE del link público (la iguala tiene su propia UI).
    if (cobrosRows.length && !rows[0].es_recurrente) {
        // ⚠️ Neon devuelve DATE como objeto Date — comparar SIEMPRE vía venceDia
        // (día 'YYYY-MM-DD'), nunca String(v).slice ni getTime contra medianoche.
        const hoyDia = venceDia(new Date());
        (quote as any).cobros = cobrosRows.map((co: any) => ({
            id: co.id as string,
            tipo: co.tipo as string,
            numeroCuota: num(co.numero_cuota),
            monto: num(co.monto),
            status: co.status as string,
            vence: co.vence ? fmtDate(co.vence) : '',
            venceEnFuturo: co.vence ? venceDia(co.vence) > hoyDia : false,
            pagado: co.status === 'pagado',
        }));
    }

    // Iguala recurrente: estado de la suscripción de Stripe (para el copy del link).
    if (susRows.length) {
        (quote as any).suscripcion = {
            estado: susRows[0].estado as string,
            monto: num(susRows[0].monto),
            currentPeriodEnd: susRows[0].current_period_end ? fmtDate(susRows[0].current_period_end) : '',
        };
    }

    if (firmas.length > 0) {
        quote.firma = {
            nombre: firmas[0].firmante_nombre as string,
            ip: firmas[0].firmante_ip as string,
            hash: firmas[0].snapshot_hash as string,
            cuando: fmtDate(firmas[0].firmado_en as string),
        };
    }

    return {
        quote,
        conversacion: conv.map((e) => ({
            tipo: e.tipo as string,
            detalle: (e.detalle as string) ?? '',
            cuando: fmtRelative(e.created_at as string),
            mine: e.tipo === 'comment' || e.tipo === 'counter',
        })),
        org: {
            // El DTO público NO exponía el org_id, así que `analyticsOrgId` en
            // /q/[token] era siempre '' y isInternalAnalyticsOrg() devolvía false
            // sin consultar nada: el tráfico del propio equipo sobre links
            // públicos nunca se excluyó de PostHog. Además, pasar ese '' a
            // resolveViewer() comparaba `org_id = ''` contra una columna uuid
            // (22P02) y tiraba la página con 500.
            // No es un dato sensible: el token ya identifica a la org, y el
            // resto del DTO (marca, banco, Stripe) es mucho más revelador.
            id: orgId,
            nombre: rows[0].org_nombre as string,
            inicial: initials(rows[0].org_nombre),
            rfc: (rows[0].org_rfc as string) ?? '',
            colorMarca: (rows[0].org_color as string) || '#0a192f',
            logoUrl: (rows[0].org_logo_url as string) ?? '',
            pdfMensaje: (rows[0].org_pdf_mensaje as string) ?? '',
            ivaPct: num(rows[0].org_iva_pct) || 16,
            embedDomains: (rows[0].org_embed_domains as string) ?? '',
            emailContacto: (rows[0].org_email as string) ?? '',
            telefono: (rows[0].org_tel as string) ?? '',
            whatsapp: (rows[0].org_wa as string) ?? '',
            portalBanner: (rows[0].org_portal_banner as string) ?? '',
            portalBienvenida: (rows[0].org_portal_bienvenida as string) ?? '',
            portalMostrarChat: (rows[0].org_portal_chat as boolean) ?? true,
            portalPowered: canRemoveBranding ? ((rows[0].org_portal_powered as boolean) ?? true) : true,
            // Para el sello de confianza del link público (CFDI 4.0 solo aplica a México).
            paisCode: (rows[0].org_country_code as string) || 'MX',
            // Entorno de PRUEBA: la página pública marca la cotización como de
            // prueba (cinta ámbar) — nadie debe confundirla con una real.
            esPrueba: (rows[0].org_es_prueba as boolean) ?? false,
            // Para etiquetar eventos de PostHog del link público (org demo permanente).
            esDemo: (rows[0].org_es_demo as boolean) ?? false,
            stripeAccountId: (rows[0].org_stripe_account_id as string) || null,
            stripeChargesEnabled: !!rows[0].org_stripe_charges_enabled,
            aceptaTarjeta: rows[0].org_acepta_tarjeta !== false,
            aceptaTransferencia: !!rows[0].org_acepta_transferencia,
            cobroSpeiAuto: !!rows[0].org_cobro_spei_auto,
            bancoNombre: (rows[0].org_banco_nombre as string) || '',
            bancoClabe: decryptSecret(rows[0].org_banco_clabe_enc as string) || (rows[0].org_banco_clabe as string) || '',
            bancoBeneficiario: (rows[0].org_banco_beneficiario as string) || '',
            // Divisa de ESTA cotización — la que el cliente ve y en la que se
            // le cobra. Viaja en el DTO para que los scripts del link público
            // formateen igual que el render de servidor.
            moneda: quoteCurrency,
        },
    };
}

// ── Snapshot vivo del link público ───────────────────────────────────────────
// Lo consume el SSE de /api/q/[token]/stream cuando detecta que `rev` avanzó.
// Deliberadamente NO reutiliza getCotizacionByToken(): ese hace 7 queries más
// una resolución de entitlements para armar el DTO completo (marca, banco,
// Stripe, textos del portal). Nada de eso cambia mientras la pestaña está
// abierta. Aquí solo viaja lo volátil: importes, líneas, estado y plan de cobro.
export interface LiveSnapshot {
    rev: number;
    status: string;
    subtotal: number;
    iva: number;
    total: number;
    vigencia: string;
    notas: string;
    items: Array<{
        id: string;
        descripcion: string;
        cantidad: number;
        unidad: string;
        precio: number;
        importe: number;
    }>;
    cobros: Array<{ id: string; tipo: string; monto: number; status: string; vence: string }>;
    /** Desglose por tasa, para que el parche en vivo dibuje las MISMAS filas que el SSR. */
    impuestos: Array<{ tasa: number; impuesto: number }>;
    retenciones: Array<{ nombre: string; monto: number }>;
}

export async function getLiveSnapshot(orgId: string, cotizacionId: string): Promise<LiveSnapshot | null> {
    const [cabecera, items, cobros] = await withOrgTx(orgId,
        sql`select c.rev, c.status, c.subtotal, c.iva, c.total, c.vigencia, c.notas,
                   c.iva_incluido, c.retenciones_snapshot, o.iva_pct as org_iva_pct
              from cotizaciones c join orgs o on o.id = c.org_id
             where c.id = ${cotizacionId} and c.org_id = ${orgId}`,
        // `ci.*` y no una lista de columnas: cotizacion_items NO tiene `unidad`
        // (vive en productos). El SSR usa la misma forma y cae a 'pieza' en
        // rowToQuote; el parche debe producir EXACTAMENTE el mismo texto o
        // "cambiaría" la unidad de cada línea en la primera actualización.
        sql`select ci.* from cotizacion_items ci
             where ci.cotizacion_id = ${cotizacionId} order by ci.orden`,
        sql`select id, tipo, monto, status, vence
              from cotizacion_cobros where cotizacion_id = ${cotizacionId} and org_id = ${orgId}
             order by numero_cuota, tipo`,
    );
    const c = cabecera[0];
    if (!c) return null;

    // El desglose se recalcula con el MISMO motor que usa el SSR. Mandar solo un
    // `iva` agregado obligaría al cliente a repartirlo entre tasas, y repartir
    // un agregado entre tasas distintas devuelve números que no corresponden a
    // ninguna de ellas.
    const fallbackRate = num(c.org_iva_pct) / 100;
    const retencionesGuardadas = Array.isArray(c.retenciones_snapshot) ? c.retenciones_snapshot : [];
    let desglose: { porTasa: any[]; retenciones: any[] } = { porTasa: [], retenciones: [] };
    try {
        desglose = calculateDocumentTotals(
            items.map((it: any) => ({
                descripcion: (it.descripcion as string) ?? '',
                cantidad: num(it.cantidad),
                precio_unitario: num(it.precio_unitario),
                precio_negociado: it.precio_negociado === null ? null : num(it.precio_negociado),
                tax_rate: it.tax_rate != null ? num(it.tax_rate) : fallbackRate,
            })),
            { ivaIncluido: Boolean(c.iva_incluido), retenciones: retencionesGuardadas },
        );
    } catch { /* una tasa corrupta no debe tumbar el stream; se manda sin desglose */ }

    return {
        rev: num(c.rev) || 1,
        status: c.status as string,
        subtotal: num(c.subtotal),
        iva: num(c.iva),
        total: num(c.total),
        vigencia: c.vigencia ? fmtDate(c.vigencia as string) : '',
        notas: (c.notas as string) ?? '',
        items: items.map((it: any) => {
            const precio = it.precio_negociado === null ? num(it.precio_unitario) : num(it.precio_negociado);
            return {
                id: String(it.id),
                descripcion: (it.descripcion as string) ?? '',
                cantidad: num(it.cantidad),
                unidad: (it.unidad as string) ?? 'pieza',
                precio,
                importe: num(it.cantidad) * precio,
            };
        }),
        cobros: cobros.map((co: any) => ({
            id: String(co.id),
            tipo: co.tipo as string,
            monto: num(co.monto),
            status: co.status as string,
            vence: co.vence ? fmtDate(co.vence as string) : '',
        })),
        impuestos: desglose.porTasa.filter((t: any) => t.impuesto > 0).map((t: any) => ({ tasa: t.tasa, impuesto: t.impuesto })),
        retenciones: desglose.retenciones.map((r: any) => ({ nombre: r.nombre, monto: r.monto })),
    };
}

// Marca 'viewed' la primera vez que el CLIENTE abre el link.
//
// Ya NO se llama desde el SSR de /q/[token] ni de /embed/[token]. Vive en el
// heartbeat del navegador (/api/q/[token] action:'ping'), que solo se alcanza
// con JavaScript corriendo y la pestaña visible — así los generadores de
// preview de enlaces (WhatsApp, Slack, Gmail) y los prefetchers dejaron de
// marcar cotizaciones como vistas antes de que ningún humano las abriera.
//
// El actor lo resuelve src/lib/public-viewer.ts: un miembro del equipo que abre
// su propio link es 'seller' y aquí no escribe nada.
export async function markViewed(orgId: string, cotizacionId: string, viewer: PublicViewer) {
    if (viewer.rol !== 'client') return;
    const [[c]] = await withOrgTx(orgId,
        sql`select c.id, c.org_id, c.status, c.total, c.base_currency,
                   (o.sandbox_of is not null) as is_sandbox, o.is_demo
            from cotizaciones c
            join orgs o on o.id = c.org_id
            where c.id = ${cotizacionId} and c.org_id = ${orgId}`,
    );
    if (!c) return;
    // `quote_viewed` representa la primera apertura real. Antes se emitía en
    // cada recarga aunque la cotización ya estuviera viewed/approved/paid, lo
    // que inflaba tanto PostHog como los webhooks comerciales.
    const [viewed] = await withOrgTx(orgId, sql`
        with changed as (
            update cotizaciones set status = 'viewed'
            where id = ${c.id} and org_id = ${orgId} and status = 'sent'
            returning id, org_id
        )
        insert into eventos (org_id, cotizacion_id, tipo, detalle)
        select org_id, id, 'viewed', 'Abierta por el cliente desde el link' from changed
        returning cotizacion_id`);
    if (!viewed.length) return;
    // Fondo: no bloquear el render del link del cliente con el webhook saliente.
    after(dispatchQuoteEvent(c.org_id as string, c.id as string, 'quote.viewed'));
    after(notifyQuoteEvent(c.org_id as string, c.id as string, 'quote_viewed'));
    after(trackServer('quote_viewed', c.org_id as string, {
        event_id: c.id,
        quote_id: c.id,
        total: num(c.total),
        currency: (c.base_currency as string) || 'MXN',
        source: 'public_link',
    }, !!c.is_sandbox, !!c.is_demo));
}

// ── ANALÍTICA (Informes) ──────────────────────────────────────────────────────
// Seis queries en un solo batch HTTP — mejora significativa de latencia.
export async function getAnalytics() {
    // Cacheado ~30s: agregados de tendencia toleran staleness leve; recorta los
    // escaneos completos a Neon en recargas/navegación y bajo muchos usuarios.
    const orgId = await getActiveOrgId();
    return cached(`analytics:${orgId}`, 30, getAnalyticsUncached);
}
async function getAnalyticsUncached() {
    const orgId = await getActiveOrgId();
    const advanced = (await checkEntitlement(orgId, 'advanced_forecast')).ok;

    const [kRows, meses, margRows, clientes, productos, plRows] = await withOrgTx(orgId,
        sql`select
                count(*) filter (where status = any(${STATUS_SALIO})) as enviadas,
                count(*) filter (where status in ('viewed','approved','paid','invoiced')) as vistas,
                count(*) filter (where status = any(${STATUS_GANADA})) as aprobadas,
                count(*) filter (where status = 'paid' or paid_at is not null) as pagadas,
                coalesce(sum(total) filter (where status = any(${STATUS_GANADA})),0) as cerrado_total,
                coalesce(avg(extract(epoch from (approved_at - created_at))/86400)
                         filter (where status = any(${STATUS_GANADA}) and approved_at is not null),0) as dias_cierre
            from cotizaciones where org_id = ${orgId}`,
        sql`select to_char(date_trunc('month', created_at),'YYYY-MM') as ym,
                   coalesce(sum(total),0) as cotizado,
                   coalesce(sum(total) filter (where status = any(${STATUS_GANADA})),0) as cerrado
            from cotizaciones
            where org_id = ${orgId} and created_at >= date_trunc('month', now()) - interval '5 months'
            group by 1 order by 1`,
        sql`select coalesce(sum(it.precio_unitario * it.cantidad),0) as lista_total,
                   coalesce(sum(coalesce(it.precio_negociado, it.precio_unitario) * it.cantidad),0) as nego_total
            from cotizacion_items it
            join cotizaciones c on c.id = it.cotizacion_id
            where c.org_id = ${orgId} and c.status <> 'draft'`,
        sql`select cl.empresa,
                   coalesce(sum(c.total) filter (where c.status = any(${STATUS_GANADA})),0) as cerrado,
                   count(*) filter (where c.status = any(${STATUS_SALIO})) as cotizaciones,
                   count(*) filter (where c.status = any(${STATUS_GANADA})) as aprobadas
            from cotizaciones c join clientes cl on cl.id = c.cliente_id
            where c.org_id = ${orgId}
            group by cl.empresa
            order by cerrado desc, cotizaciones desc limit 6`,
        sql`select coalesce(p.nombre, it.descripcion) as nombre,
                   coalesce(sum(it.cantidad),0) as cantidad,
                   coalesce(sum(coalesce(it.precio_negociado, it.precio_unitario) * it.cantidad),0) as importe,
                   count(distinct c.id) as cotizaciones
            from cotizacion_items it
            join cotizaciones c on c.id = it.cotizacion_id
            left join productos p on p.id = it.producto_id
            where c.org_id = ${orgId} and c.status <> 'draft'
            group by coalesce(p.nombre, it.descripcion)
            order by importe desc limit 6`,
        sql`select coalesce(sum(total) filter (where status = 'sent'),0)   as sent_total,
                   coalesce(sum(total) filter (where status = 'viewed'),0) as viewed_total
            from cotizaciones where org_id = ${orgId}`,
    );

    const k = kRows[0]; const marg = margRows[0]; const pl = plRows[0];
    const enviadas = num(k.enviadas), aprobadas = num(k.aprobadas);
    const listaTotal = num(marg.lista_total), negoTotal = num(marg.nego_total);
    const cerradoN = aprobadas;
    const sentTotal = num(pl.sent_total), viewedTotal = num(pl.viewed_total);

    return {
        funnel: { enviadas, vistas: num(k.vistas), aprobadas, pagadas: num(k.pagadas) },
        kpis: {
            cerradoTotal: num(k.cerrado_total),
            tasaCierre: enviadas ? Math.round((aprobadas / enviadas) * 100) : 0,
            ticketPromedio: cerradoN ? num(k.cerrado_total) / cerradoN : 0,
            diasCierre: Math.round(num(k.dias_cierre) * 10) / 10,
        },
        meses: meses.map(m => ({ ym: m.ym as string, cotizado: num(m.cotizado), cerrado: num(m.cerrado) })),
        margen: {
            listaTotal: advanced ? listaTotal : 0,
            negoTotal: advanced ? negoTotal : 0,
            cedido: advanced ? Math.max(0, listaTotal - negoTotal) : 0,
            pct: advanced && listaTotal > 0 ? ((listaTotal - negoTotal) / listaTotal) * 100 : 0,
        },
        forecast: advanced
            ? { sentTotal, viewedTotal, ponderado: sentTotal * 0.3 + viewedTotal * 0.5 }
            : { sentTotal: 0, viewedTotal: 0, ponderado: 0 },
        clientes: clientes.map(c => ({
            empresa: c.empresa as string,
            cerrado: num(c.cerrado),
            cotizaciones: num(c.cotizaciones),
            aprobadas: num(c.aprobadas),
            tasa: num(c.cotizaciones) ? Math.round((num(c.aprobadas) / num(c.cotizaciones)) * 100) : 0,
        })),
        productos: productos.map(p => ({
            nombre: p.nombre as string,
            cantidad: num(p.cantidad),
            importe: num(p.importe),
            cotizaciones: num(p.cotizaciones),
        })),
    };
}

// ── Serie diaria de dinero (hero chart del dashboard) ───────────────────────────
// 365 días: cubre el rango custom más largo que el picker de fechas permite elegir
// (12 meses atrás) Y sigue dejando el periodo de comparación completo detrás de
// cualquier preset (7D/30D/90D). 3 métricas por día, cada una con su propia fecha
// canónica — no se puede resolver en un solo `group by` porque cada una bucketea
// por una columna de fecha distinta:
//   · cotizado → created_at (cuando se armó la cotización)
//   · cerrado  → coalesce(approved_at, created_at) (fecha de cierre; getAnalytics
//                agrega por created_at y por eso no comparte este criterio)
//   · cobrado  → coalesce(paid_at, approved_at, created_at) — dinero que de verdad entró
// 4 queries en el mismo batch withOrgTx (mismo patrón que getCFO/getAnalytics),
// fusionadas en JS con relleno de huecos a 0 (día sin movimiento = 0, no ausente).
// Único caller: src/pages/app/index.astro — el toggle 7D/30D/90D y el rango custom
// (hasta 365 días atrás) se resuelven 100% en el cliente recortando este mismo array.
const SERIE_DIARIA_DIAS = 365;
export async function getSerieDiaria() {
    const orgId = await getActiveOrgId();
    return cached(`serie-diaria:${orgId}`, 30, getSerieDiariaUncached);
}
async function getSerieDiariaUncached() {
    const orgId = await getActiveOrgId();
    const [cotizadoRows, cerradoRows, cobradoRows, recurrenteRows] = await withOrgTx(orgId,
        sql`select to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as fecha,
                   coalesce(sum(total),0) as monto
            from cotizaciones
            where org_id = ${orgId}
              and status <> 'draft'
              and created_at >= current_date - interval '364 days'
            group by 1 order by 1`,
        sql`select to_char(date_trunc('day', coalesce(approved_at, created_at)), 'YYYY-MM-DD') as fecha,
                   coalesce(sum(total),0) as monto
            from cotizaciones
            where org_id = ${orgId}
              and status = any(${STATUS_GANADA})
              and coalesce(approved_at, created_at) >= current_date - interval '364 days'
            group by 1 order by 1`,
        sql`select to_char(date_trunc('day', coalesce(c.paid_at, c.approved_at, c.created_at)), 'YYYY-MM-DD') as fecha,
                   coalesce(sum(greatest(0, c.total - coalesce((
                       select sum(cc.reembolsado_cents) / 100.0 from cotizacion_cobros cc
                       where cc.cotizacion_id = c.id
                   ), 0))),0) as monto
            from cotizaciones c
            where c.org_id = ${orgId}
              and (c.status = 'paid' or c.paid_at is not null)
              and coalesce(c.paid_at, c.approved_at, c.created_at) >= current_date - interval '364 days'
            group by 1 order by 1`,
        sql`select to_char(date_trunc('day', coalesce(co.paid_at, co.created_at)), 'YYYY-MM-DD') as fecha,
                   coalesce(sum(greatest(0, co.monto - coalesce(co.reembolsado_cents, 0) / 100.0)),0) as monto
            from cotizacion_cobros co
            join cotizaciones c on c.id = co.cotizacion_id
            where co.org_id = ${orgId}
              and co.status = 'pagado'
              and c.es_recurrente is true
              and coalesce(co.paid_at, co.created_at) >= current_date - interval '364 days'
            group by 1 order by 1`,
    );
    const toMap = (rows: any[]) => {
        const m = new Map<string, number>();
        for (const r of rows) m.set(r.fecha as string, num(r.monto));
        return m;
    };
    const cotizadoM = toMap(cotizadoRows), cerradoM = toMap(cerradoRows), cobradoM = toMap(cobradoRows);
    for (const r of recurrenteRows) {
        const fecha = r.fecha as string;
        cobradoM.set(fecha, (cobradoM.get(fecha) ?? 0) + num(r.monto));
    }

    // Relleno de huecos, 365 puntos exactos, en UTC (date_trunc de Postgres corre
    // en GMT; toISOString fuerza UTC sin importar el TZ del proceso Node).
    const dias: { fecha: string; cotizado: number; cerrado: number; cobrado: number }[] = [];
    const today = new Date();
    for (let i = SERIE_DIARIA_DIAS - 1; i >= 0; i--) {
        const d = new Date(today);
        d.setUTCDate(d.getUTCDate() - i);
        const fecha = d.toISOString().slice(0, 10);
        dias.push({
            fecha,
            cotizado: cotizadoM.get(fecha) ?? 0,
            cerrado: cerradoM.get(fecha) ?? 0,
            cobrado: cobradoM.get(fecha) ?? 0,
        });
    }
    return { dias };
}

// ── Embudo + rankings acotados a un rango de fechas (picker custom del dashboard) ──
// Función DEDICADA (no se parametriza getAnalytics): getAnalytics la consumen también
// Informes y el tool MCP resumen_negocio; su query `forecast` es un snapshot del
// pipeline vivo (sent/viewed HOY) que perdería sentido si se filtrara por fecha pasada.
// Esta función solo trae lo que el rango del dashboard sí necesita: embudo y rankings,
// ambos como cohorte "de lo creado en este periodo, cuánto avanzó". Clave de caché
// snapeada a día (no a timestamp) para no explotar la cardinalidad del Map de cache.ts.
export async function getAnalyticsRango(desde: string, hasta: string) {
    const orgId = await getActiveOrgId();
    return cached(`analytics-rango:${orgId}:${desde}:${hasta}`, 30, () => getAnalyticsRangoUncached(orgId, desde, hasta));
}

// ── DIAGNÓSTICO COMERCIAL (Informes) ─────────────────────────────────────────
// Esta lectura es deliberadamente distinta a getAnalytics(): no repite el resumen
// del dashboard; explica dónde se frena el cierre y qué valor exige seguimiento.
// Todas las cohortes se acotan por created_at para que un rango responda a la misma
// pregunta: «¿qué ocurrió con las cotizaciones originadas en este periodo?».
export async function getAnalyticsDiagnosis(desde: string, hasta: string) {
    const orgId = await getActiveOrgId();
    return cached(`analytics-diagnosis:${orgId}:${desde}:${hasta}`, 30,
        () => getAnalyticsDiagnosisUncached(orgId, desde, hasta));
}

async function getAnalyticsDiagnosisUncached(orgId: string, desde: string, hasta: string) {
    const advanced = (await checkEntitlement(orgId, 'advanced_forecast')).ok;
    const [summaryRows, seriesRows, stageRows, stalledRows, lossRows, discountRows, clientRows] = await withOrgTx(orgId,
        sql`select
                count(*) filter (where status = any(${STATUS_SALIO})) as enviadas,
                count(*) filter (where status in ('viewed','approved','paid','invoiced')) as vistas,
                count(*) filter (where status = any(${STATUS_GANADA})) as aprobadas,
                count(*) filter (where status = 'paid' or paid_at is not null) as pagadas,
                coalesce(sum(total) filter (where status = any(${STATUS_GANADA})), 0) as cerrado,
                coalesce(avg(extract(epoch from (approved_at - created_at)) / 86400)
                    filter (where status = any(${STATUS_GANADA}) and approved_at is not null), 0) as dias_cierre
            from cotizaciones
            where org_id = ${orgId} and created_at >= ${desde} and created_at < (${hasta}::date + interval '1 day')`,
        sql`select to_char(day, 'YYYY-MM-DD') as fecha,
                coalesce(sum(c.total) filter (where c.status = any(${STATUS_SALIO})), 0) as cotizado,
                coalesce(sum(c.total) filter (where c.status = any(${STATUS_GANADA})), 0) as cerrado,
                coalesce(sum(c.total) filter (where c.status = 'paid' or c.paid_at is not null), 0) as cobrado
            from generate_series(${desde}::date, ${hasta}::date, interval '1 day') day
            left join cotizaciones c on c.org_id = ${orgId}
                and c.created_at >= day and c.created_at < day + interval '1 day'
            group by day order by day`,
        // Pipeline vivo: es una fotografía deliberada para priorizar trabajo hoy.
        sql`select status, count(*) as n, coalesce(sum(total), 0) as monto
            from cotizaciones
            where org_id = ${orgId} and status = any(${[...STATUS_ABIERTA, ...STATUS_GANADA]})
            group by status`,
        // Se considera detenido si no hubo actividad en siete días. La vigencia
        // próxima se separa para que no compita con el seguimiento general.
        sql`select c.id, c.folio, c.total, c.status, c.vigencia,
                coalesce(cl.empresa, 'Sin cliente') as empresa,
                coalesce(c.viewer_last_seen, c.sent_at, c.created_at) as ultima_actividad,
                floor(extract(epoch from (now() - coalesce(c.viewer_last_seen, c.sent_at, c.created_at))) / 86400) as dias_sin_movimiento
            from cotizaciones c
            left join clientes cl on cl.id = c.cliente_id
            where c.org_id = ${orgId} and c.status in ('sent','viewed')
              and coalesce(c.viewer_last_seen, c.sent_at, c.created_at) < now() - interval '7 days'
            order by c.total desc, ultima_actividad asc limit 5`,
        sql`select status, count(*) as n, coalesce(sum(total), 0) as monto
            from cotizaciones
            where org_id = ${orgId} and created_at >= ${desde} and created_at < (${hasta}::date + interval '1 day')
              and status = any(${STATUS_PERDIDA})
            group by status`,
        sql`select coalesce(p.nombre, it.descripcion) as nombre,
                coalesce(sum(it.precio_unitario * it.cantidad), 0) as lista,
                coalesce(sum(coalesce(it.precio_negociado, it.precio_unitario) * it.cantidad), 0) as negociado,
                count(distinct c.id) as cotizaciones
            from cotizacion_items it
            join cotizaciones c on c.id = it.cotizacion_id
            left join productos p on p.id = it.producto_id
            where c.org_id = ${orgId} and c.created_at >= ${desde} and c.created_at < (${hasta}::date + interval '1 day')
              and c.status <> 'draft'
            group by coalesce(p.nombre, it.descripcion)
            having sum(it.precio_unitario * it.cantidad) > sum(coalesce(it.precio_negociado, it.precio_unitario) * it.cantidad)
            order by (sum(it.precio_unitario * it.cantidad) - sum(coalesce(it.precio_negociado, it.precio_unitario) * it.cantidad)) desc limit 5`,
        sql`select coalesce(cl.empresa, 'Sin cliente') as empresa,
                count(*) filter (where c.status in ('sent','viewed')) as abiertas,
                coalesce(sum(c.total) filter (where c.status in ('sent','viewed')), 0) as pipeline,
                count(*) filter (where c.status = any(${STATUS_GANADA})) as aprobadas,
                count(*) filter (where c.status = any(${STATUS_SALIO})) as enviadas
            from cotizaciones c
            left join clientes cl on cl.id = c.cliente_id
            where c.org_id = ${orgId} and c.created_at >= ${desde} and c.created_at < (${hasta}::date + interval '1 day')
            group by coalesce(cl.empresa, 'Sin cliente')
            having count(*) filter (where c.status = any(${STATUS_SALIO})) > 0
            order by pipeline desc, abiertas desc limit 5`,
    );

    const s = summaryRows[0];
    const stages = new Map(stageRows.map((r: any) => [r.status as string, { n: num(r.n), monto: num(r.monto) }]));
    const losses = new Map(lossRows.map((r: any) => [r.status as string, { n: num(r.n), monto: num(r.monto) }]));
    const sent = num(s.enviadas), views = num(s.vistas), approved = num(s.aprobadas), paid = num(s.pagadas);

    return {
        summary: { sent, views, approved, paid, cerrado: num(s.cerrado), diasCierre: Math.round(num(s.dias_cierre) * 10) / 10 },
        series: seriesRows.map((r: any) => ({ fecha: r.fecha as string, cotizado: num(r.cotizado), cerrado: num(r.cerrado), cobrado: num(r.cobrado) })),
        funnel: { sent, views, approved, paid },
        pipeline: ['sent', 'viewed', 'approved', 'paid', 'invoiced'].map((key) => ({ key, ...(stages.get(key) ?? { n: 0, monto: 0 }) })),
        stalled: stalledRows.map((r: any) => ({ id: r.id as string, folio: r.folio as string, empresa: r.empresa as string, total: num(r.total), status: r.status as string, vigencia: r.vigencia ? String(r.vigencia).slice(0, 10) : null, dias: num(r.dias_sin_movimiento) })),
        losses: { rejected: losses.get('rejected') ?? { n: 0, monto: 0 }, expired: losses.get('expired') ?? { n: 0, monto: 0 } },
        discounts: (advanced ? discountRows : []).map((r: any) => {
            const lista = num(r.lista), negociado = num(r.negociado);
            return { nombre: r.nombre as string, cedido: Math.max(0, lista - negociado), pct: lista ? ((lista - negociado) / lista) * 100 : 0, cotizaciones: num(r.cotizaciones) };
        }),
        clients: clientRows.map((r: any) => {
            const enviadas = num(r.enviadas), aprobadas = num(r.aprobadas);
            return { empresa: r.empresa as string, abiertas: num(r.abiertas), pipeline: num(r.pipeline), tasa: enviadas ? Math.round((aprobadas / enviadas) * 100) : 0 };
        }),
    };
}
async function getAnalyticsRangoUncached(orgId: string, desde: string, hasta: string) {
    const [kRows, clientes, productos] = await withOrgTx(orgId,
        sql`select
                count(*) filter (where status = any(${STATUS_SALIO})) as enviadas,
                count(*) filter (where status in ('viewed','approved','paid','invoiced')) as vistas,
                count(*) filter (where status = any(${STATUS_GANADA})) as aprobadas,
                count(*) filter (where status = 'paid' or paid_at is not null) as pagadas
            from cotizaciones
            where org_id = ${orgId} and created_at >= ${desde} and created_at < (${hasta}::date + interval '1 day')`,
        sql`select cl.empresa,
                   coalesce(sum(c.total) filter (where c.status = any(${STATUS_GANADA})),0) as cerrado,
                   count(*) filter (where c.status = any(${STATUS_SALIO})) as cotizaciones,
                   count(*) filter (where c.status = any(${STATUS_GANADA})) as aprobadas
            from cotizaciones c join clientes cl on cl.id = c.cliente_id
            where c.org_id = ${orgId} and c.created_at >= ${desde} and c.created_at < (${hasta}::date + interval '1 day')
            group by cl.empresa
            order by cerrado desc, cotizaciones desc limit 6`,
        sql`select coalesce(p.nombre, it.descripcion) as nombre,
                   coalesce(sum(it.cantidad),0) as cantidad,
                   coalesce(sum(coalesce(it.precio_negociado, it.precio_unitario) * it.cantidad),0) as importe,
                   count(distinct c.id) as cotizaciones
            from cotizacion_items it
            join cotizaciones c on c.id = it.cotizacion_id
            left join productos p on p.id = it.producto_id
            where c.org_id = ${orgId} and c.status <> 'draft'
              and c.created_at >= ${desde} and c.created_at < (${hasta}::date + interval '1 day')
            group by coalesce(p.nombre, it.descripcion)
            order by importe desc limit 6`,
    );
    const k = kRows[0];
    return {
        funnel: { enviadas: num(k.enviadas), vistas: num(k.vistas), aprobadas: num(k.aprobadas), pagadas: num(k.pagadas) },
        clientes: clientes.map(c => ({
            empresa: c.empresa as string,
            cerrado: num(c.cerrado),
            cotizaciones: num(c.cotizaciones),
            aprobadas: num(c.aprobadas),
            tasa: num(c.cotizaciones) ? Math.round((num(c.aprobadas) / num(c.cotizaciones)) * 100) : 0,
        })),
        productos: productos.map(p => ({
            nombre: p.nombre as string,
            cantidad: num(p.cantidad),
            importe: num(p.importe),
            cotizaciones: num(p.cotizaciones),
        })),
    };
}

// ── INSIGHTS DE INFORMES (sin tablas nuevas) ─────────────────────────────────
export async function getCommercialStageTiming(desde: string, hasta: string) {
    const orgId = await getActiveOrgId();
    return cached(`report-stage-timing:${orgId}:${desde}:${hasta}`, 60, async () => {
        const [rows] = await withOrgTx(orgId, sql`
            with stamps as (
                select c.id, c.created_at,
                       min(e.created_at) filter (where e.tipo = 'sent') as sent_at,
                       min(e.created_at) filter (where e.tipo = 'viewed') as viewed_at,
                       min(e.created_at) filter (where e.tipo = 'approved') as approved_at,
                       min(e.created_at) filter (where e.tipo = 'paid') as paid_at
                from cotizaciones c
                left join eventos e on e.cotizacion_id = c.id and e.org_id = ${orgId}
                where c.org_id = ${orgId}
                  and c.created_at >= ${desde} and c.created_at < (${hasta}::date + interval '1 day')
                group by c.id, c.created_at
            )
            select
                percentile_cont(0.5) within group (order by extract(epoch from (sent_at - created_at)) / 86400)
                    filter (where sent_at is not null) as creada_enviada,
                percentile_cont(0.5) within group (order by extract(epoch from (viewed_at - sent_at)) / 86400)
                    filter (where viewed_at is not null and sent_at is not null) as enviada_vista,
                percentile_cont(0.5) within group (order by extract(epoch from (approved_at - viewed_at)) / 86400)
                    filter (where approved_at is not null and viewed_at is not null) as vista_aprobada,
                percentile_cont(0.5) within group (order by extract(epoch from (paid_at - approved_at)) / 86400)
                    filter (where paid_at is not null and approved_at is not null) as aprobada_pagada
            from stamps`);
        const row = rows[0] ?? {};
        return [
            { key: 'created_sent', label: 'Creada → enviada', dias: Math.max(0, num(row.creada_enviada)) },
            { key: 'sent_viewed', label: 'Enviada → vista', dias: Math.max(0, num(row.enviada_vista)) },
            { key: 'viewed_approved', label: 'Vista → aprobada', dias: Math.max(0, num(row.vista_aprobada)) },
            { key: 'approved_paid', label: 'Aprobada → pagada', dias: Math.max(0, num(row.aprobada_pagada)) },
        ];
    });
}

export async function getClientReportInsights(desde: string, hasta: string) {
    const orgId = await getActiveOrgId();
    return cached(`report-clients:${orgId}:${desde}:${hasta}`, 60, async () => {
        const payBehavior = await getPayBehavior();
        const [cohortRows, riskRows, levelRows] = await withOrgTx(orgId,
            sql`with first_quote as (
                    select cliente_id, min(created_at) as first_at
                    from cotizaciones where org_id = ${orgId} and cliente_id is not null group by cliente_id
                )
                select case when f.first_at >= ${desde}::date then 'nuevo' else 'recurrente' end as tipo,
                       count(distinct c.cliente_id) as clientes,
                       count(*) filter (where c.status = any(${STATUS_SALIO})) as cotizaciones,
                       count(*) filter (where c.status = any(${STATUS_GANADA})) as ganadas,
                       coalesce(sum(c.total) filter (where c.status = any(${STATUS_GANADA})), 0) as cerrado
                from cotizaciones c join first_quote f on f.cliente_id = c.cliente_id
                where c.org_id = ${orgId} and c.created_at >= ${desde}
                  and c.created_at < (${hasta}::date + interval '1 day')
                group by 1`,
            sql`select cl.id, cl.empresa, cl.nivel, max(c.created_at) as ultima_actividad,
                       count(*) filter (where c.status <> 'draft') as cotizaciones,
                       coalesce(sum(c.total) filter (where c.status = any(${STATUS_GANADA})), 0) as cerrado
                from clientes cl join cotizaciones c on c.cliente_id = cl.id
                where cl.org_id = ${orgId}
                group by cl.id, cl.empresa, cl.nivel
                having max(c.created_at) < now() - interval '90 days'
                order by cerrado desc limit 10`,
            sql`select cl.id, coalesce(cl.nivel, 'Sin nivel') as nivel,
                       coalesce(sum(c.total) filter (where c.status = any(${STATUS_GANADA})), 0) as cerrado
                from clientes cl
                left join cotizaciones c on c.cliente_id = cl.id and c.org_id = ${orgId}
                where cl.org_id = ${orgId}
                group by cl.id, coalesce(cl.nivel, 'Sin nivel')`,
        );
        const matrixMap = new Map<string, { nivel: string; comportamiento: string; clientes: number; cerrado: number }>();
        for (const row of levelRows) {
            const delay = payBehavior.clientes[row.id as string]?.avgDiasRetraso ?? payBehavior.avgDiasRetraso;
            const comportamiento = delay <= 0 ? 'puntual' : delay <= 7 ? 'ligero' : 'tarde';
            const key = `${row.nivel}:${comportamiento}`;
            const cell = matrixMap.get(key) ?? { nivel: row.nivel as string, comportamiento, clientes: 0, cerrado: 0 };
            cell.clientes += 1;
            cell.cerrado += num(row.cerrado);
            matrixMap.set(key, cell);
        }
        return {
            cohortes: cohortRows.map((row) => ({ tipo: row.tipo as string, clientes: num(row.clientes), cotizaciones: num(row.cotizaciones), ganadas: num(row.ganadas), cerrado: num(row.cerrado) })),
            enRiesgo: riskRows.map((row) => ({ id: row.id as string, empresa: row.empresa as string, nivel: (row.nivel as string) || '—', cotizaciones: num(row.cotizaciones), cerrado: num(row.cerrado), ultimaActividad: String(row.ultima_actividad).slice(0, 10) })),
            matriz: [...matrixMap.values()].sort((a, b) => b.cerrado - a.cerrado),
        };
    });
}

export async function getProductReportInsights(desde: string, hasta: string) {
    const orgId = await getActiveOrgId();
    return cached(`report-products:${orgId}:${desde}:${hasta}`, 60, async () => {
        const [rows] = await withOrgTx(orgId, sql`
            select coalesce(p.nombre, it.descripcion) as nombre,
                   count(distinct c.id) filter (where c.status = any(${STATUS_SALIO})) as decididas,
                   count(distinct c.id) filter (where c.status = any(${STATUS_GANADA})) as ganadas,
                   coalesce(sum(coalesce(it.precio_negociado, it.precio_unitario) * it.cantidad)
                       filter (where c.status = any(${STATUS_GANADA})), 0) as cerrado
            from cotizacion_items it
            join cotizaciones c on c.id = it.cotizacion_id
            left join productos p on p.id = it.producto_id
            where c.org_id = ${orgId} and c.created_at >= ${desde}
              and c.created_at < (${hasta}::date + interval '1 day')
            group by coalesce(p.nombre, it.descripcion)
            having count(distinct c.id) filter (where c.status = any(${STATUS_SALIO})) > 0
            order by cerrado desc limit 12`);
        return rows.map((row) => ({
            nombre: row.nombre as string, decididas: num(row.decididas), ganadas: num(row.ganadas), cerrado: num(row.cerrado),
            tasa: num(row.decididas) ? Math.round(num(row.ganadas) / num(row.decididas) * 100) : 0,
        }));
    });
}

export async function getFinanceLevelInsights() {
    const orgId = await getActiveOrgId();
    return cached(`report-finance-levels:${orgId}`, 60, async () => {
        const [rows] = await withOrgTx(orgId, sql`
            select coalesce(cl.nivel, 'Sin nivel') as nivel,
                   coalesce(avg(cl.descuento_pct), 0) as descuento,
                   count(*) filter (where c.status = any(${STATUS_SALIO})) as enviadas,
                   count(*) filter (where c.status = any(${STATUS_GANADA})) as ganadas,
                   coalesce(sum(c.total) filter (where c.status = any(${STATUS_GANADA})), 0) as cerrado
            from clientes cl
            left join cotizaciones c on c.cliente_id = cl.id and c.org_id = ${orgId}
            where cl.org_id = ${orgId}
            group by coalesce(cl.nivel, 'Sin nivel')
            order by cerrado desc`);
        return rows.map((row) => ({
            nivel: row.nivel as string, descuento: num(row.descuento), enviadas: num(row.enviadas),
            ganadas: num(row.ganadas), cerrado: num(row.cerrado),
            tasa: num(row.enviadas) ? Math.round(num(row.ganadas) / num(row.enviadas) * 100) : 0,
        }));
    });
}

// ── COBRANZA / CUENTAS POR COBRAR (/app/cobranza) ──────────────────────────────
export type PayBehavior = {
    clienteId: string;
    avgDiasPago: number;
    avgDiasRetraso: number;
    muestra: number;
};

/**
 * Comportamiento real de pago por cliente. `avgDiasPago` mide aprobación → pago
 * y alimenta el pipeline probabilístico. `avgDiasRetraso` mide vencimiento → pago
 * y desplaza únicamente el timing de la cartera cierta; nunca reduce su importe.
 */
export async function getPayBehavior() {
    const orgId = await getActiveOrgId();
    return cached(`pay-behavior:${orgId}`, 60, getPayBehaviorUncached);
}

async function getPayBehaviorUncached() {
    const orgId = await getActiveOrgId();
    const [rows, delayRows] = await withOrgTx(orgId, sql`
        select c.cliente_id,
               count(*) as muestra,
               coalesce(avg(extract(epoch from (
                   e.paid_at - coalesce(c.approved_at, c.created_at)
               )) / 86400), 0) as avg_pago,
               coalesce(avg(extract(epoch from (
                   e.paid_at - (
                       coalesce(c.approved_at, c.created_at)
                       + make_interval(days => case coalesce(c.terminos, cl.terminos_default)
                           when 'net30' then 30 when 'net60' then 60 else 0 end)
                   )
               )) / 86400), 0) as avg_retraso
        from cotizaciones c
        left join clientes cl on cl.id = c.cliente_id
        join (
            select cotizacion_id, max(created_at) as paid_at
            from eventos
            where org_id = ${orgId} and tipo = 'paid'
            group by cotizacion_id
        ) e on e.cotizacion_id = c.id
        where c.org_id = ${orgId} and c.cliente_id is not null
          and (c.status = 'paid' or c.paid_at is not null)
        group by c.cliente_id`,
        sql`select extract(epoch from (
                   e.paid_at - (
                       coalesce(c.approved_at, c.created_at)
                       + make_interval(days => case coalesce(c.terminos, cl.terminos_default)
                           when 'net30' then 30 when 'net60' then 60 else 0 end)
                   )
               )) / 86400 as dias
            from cotizaciones c
            left join clientes cl on cl.id = c.cliente_id
            join (
                select cotizacion_id, max(created_at) as paid_at
                from eventos where org_id = ${orgId} and tipo = 'paid'
                group by cotizacion_id
            ) e on e.cotizacion_id = c.id
            where c.org_id = ${orgId} and (c.status = 'paid' or c.paid_at is not null)`,
    );

    const clientes: Record<string, PayBehavior> = {};
    let sumaRetraso = 0;
    let sumaPago = 0;
    let muestra = 0;
    for (const row of rows) {
        const item: PayBehavior = {
            clienteId: row.cliente_id as string,
            avgDiasPago: Math.max(0, Math.round(num(row.avg_pago))),
            avgDiasRetraso: Math.round(num(row.avg_retraso)),
            muestra: num(row.muestra),
        };
        clientes[item.clienteId] = item;
        sumaPago += item.avgDiasPago * item.muestra;
        sumaRetraso += item.avgDiasRetraso * item.muestra;
        muestra += item.muestra;
    }
    return {
        clientes,
        muestra,
        avgDiasPago: muestra ? Math.round(sumaPago / muestra) : 30,
        avgDiasRetraso: muestra ? Math.round(sumaRetraso / muestra) : 0,
        histograma: [
            { key: 'puntual', label: 'A tiempo', n: delayRows.filter((row) => num(row.dias) <= 0).length },
            { key: 'd7', label: '1–7 días tarde', n: delayRows.filter((row) => num(row.dias) > 0 && num(row.dias) <= 7).length },
            { key: 'd30', label: '8–30 días tarde', n: delayRows.filter((row) => num(row.dias) > 7 && num(row.dias) <= 30).length },
            { key: 'd30p', label: '+30 días tarde', n: delayRows.filter((row) => num(row.dias) > 30).length },
        ],
    };
}

// Cacheado ~30s (mismo patrón que getCFO/getAnalytics): el dashboard principal
// también consume `aging` para la dona de cartera, y sin caché esta función hace
// trabajo pesado en JS por cotización en cada carga de /app.
export async function getCobranza() {
    const orgId = await getActiveOrgId();
    if (!(await checkEntitlement(orgId, 'collections')).ok) throw new Error('subscription_required:collections');
    return cached(`cobranza:${orgId}`, 30, getCobranzaUncached);
}
async function getCobranzaUncached() {
    const orgId = await getActiveOrgId();
    const payBehavior = await getPayBehavior();

    const [[org]] = await withOrgTx(orgId, sql`select * from orgs where id = ${orgId}`);
    const rate = num(org?.interes_moratorio_pct);

    // Tres queries de datos en un solo batch.
    const [rows, promRows, promStatsRows] = await withOrgTx(orgId,
        // Las igualas recurrentes (es_recurrente) se EXCLUYEN: su status se queda
        // en 'approved' para siempre pero se cobran solas cada mes vía Stripe
        // Subscription — no son cartera vencida ni acumulan aging.
        sql`select c.id, c.folio, c.total, c.cliente_id, coalesce(c.terminos, cl.terminos_default) as terminos, c.status, c.public_token,
                   coalesce(c.approved_at, c.created_at) as base_date,
                   cl.empresa, cl.limite_credito, cl.telefono
            from cotizaciones c
            left join clientes cl on cl.id = c.cliente_id
            where c.org_id = ${orgId} and c.status in ('approved','invoiced') -- canon: STATUS_POR_COBRAR
              and c.es_recurrente is not true
            order by coalesce(c.approved_at, c.created_at) asc`,
        // Promesas de pago vigentes (pendientes) — la más reciente por cotización.
        sql`select cotizacion_id, id, fecha_promesa, monto, nota
            from promesas_pago
            where org_id = ${orgId} and estado = 'pendiente'
            order by created_at desc`,
        sql`select count(*) filter (where estado = 'cumplida') as cumplidas,
                   count(*) filter (where estado = 'incumplida') as incumplidas,
                   count(*) filter (where estado = 'pendiente' and fecha_promesa < current_date) as pendientes_vencidas,
                   count(*) as total
            from promesas_pago where org_id = ${orgId}`,
    );

    // Mapa cotizacion_id → promesa pendiente más reciente.
    const promMap = new Map<string, any>();
    for (const p of promRows) { if (!promMap.has(p.cotizacion_id as string)) promMap.set(p.cotizacion_id as string, p); }

    const avgDelay = payBehavior.avgDiasRetraso;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const MS = 86400000;

    const items = rows.map((r) => {
        const tot = num(r.total);
        const due = dueDateFor(r.base_date as string, r.terminos as string);
        const diff = Math.floor((today.getTime() - due.getTime()) / MS);
        const overdue = diff > 0;
        const bucket = !overdue ? 'vigente' : diff <= 30 ? 'd30' : diff <= 60 ? 'd60' : 'd60p';
        const interes = overdue && rate > 0 ? tot * (Math.pow(1 + rate / 100, diff / 30) - 1) : 0;
        const clientBehavior = r.cliente_id ? payBehavior.clientes[r.cliente_id as string] : undefined;
        const clientDelay = clientBehavior?.avgDiasRetraso ?? avgDelay;
        const expected = new Date(due); expected.setDate(expected.getDate() + clientDelay);
        const expDias = Math.round((expected.getTime() - today.getTime()) / MS);
        const prom = promMap.get(r.id as string);
        const fechaProm = prom ? String(prom.fecha_promesa).slice(0, 10) : '';
        return {
            id: r.id as string, folio: r.folio as string,
            empresa: (r.empresa as string) ?? 'Sin cliente',
            inicial: initials((r.empresa as string) ?? '—'),
            total: tot, terminos: termLabel(r.terminos as string),
            clienteId: (r.cliente_id as string) ?? null,
            status: r.status as string, token: r.public_token as string,
            telefono: (r.telefono as string) ?? '',
            vence: fmtDate(due), overdue,
            diasVencido: overdue ? diff : 0, diasParaVencer: overdue ? 0 : -diff,
            bucket, interes: Math.round(interes),
            expectedFecha: fmtDate(expected), expectedDias: expDias,
            avgDiasCliente: clientDelay,
            // Promesa de pago pendiente (seguimiento manual). null = sin promesa.
            promesa: prom ? {
                id: prom.id as string,
                fechaISO: fechaProm,
                fecha: fmtDate(fechaProm),
                monto: prom.monto != null ? num(prom.monto) : null,
                nota: (prom.nota as string) || '',
            } : null,
        };
    });

    const sumBy = (pred: (i: typeof items[number]) => boolean) =>
        items.filter(pred).reduce((s, i) => s + i.total, 0);

    const totalPorCobrar = sumBy(() => true);
    const totalVencido = sumBy((i) => i.overdue);

    const aging = [
        { key: 'vigente', label: 'Por vencer', monto: sumBy((i) => !i.overdue), n: items.filter(i => !i.overdue).length, color: '#3b82f6' },
        { key: 'd30', label: '1–30 días', monto: sumBy((i) => i.bucket === 'd30'), n: items.filter(i => i.bucket === 'd30').length, color: '#f59e0b' },
        { key: 'd60', label: '31–60 días', monto: sumBy((i) => i.bucket === 'd60'), n: items.filter(i => i.bucket === 'd60').length, color: '#f97316' },
        { key: 'd60p', label: '+60 días', monto: sumBy((i) => i.bucket === 'd60p'), n: items.filter(i => i.bucket === 'd60p').length, color: '#ef4444' },
    ];

    const byCliente = new Map<string, { empresa: string; saldo: number; limite: number; n: number }>();
    for (const r of rows) {
        const empresa = (r.empresa as string) ?? 'Sin cliente';
        const cur = byCliente.get(empresa) ?? { empresa, saldo: 0, limite: num(r.limite_credito), n: 0 };
        cur.saldo += num(r.total); cur.n += 1;
        byCliente.set(empresa, cur);
    }
    const clientes = [...byCliente.values()]
        .map((c) => ({ ...c, excede: c.limite > 0 && c.saldo > c.limite, uso: c.limite > 0 ? Math.round((c.saldo / c.limite) * 100) : 0 }))
        .sort((a, b) => b.saldo - a.saldo);

    const promStats = promStatsRows[0] ?? {};
    return {
        items: items.sort((a, b) => b.diasVencido - a.diasVencido || a.diasParaVencer - b.diasParaVencer),
        resumen: {
            totalPorCobrar, totalVencido, totalVigente: totalPorCobrar - totalVencido,
            nPorCobrar: items.length,
            nVencidas: items.filter(i => i.overdue).length,
            nClientes: clientes.length,
            nExcedidos: clientes.filter(c => c.excede).length,
            interesTotal: items.reduce((s, i) => s + i.interes, 0),
            interesPct: rate, avgDelay,
            esperado7: items.filter(i => i.expectedDias <= 7).reduce((s, i) => s + i.total, 0),
            esperado30: items.filter(i => i.expectedDias <= 30).reduce((s, i) => s + i.total, 0),
        },
        aging, clientes,
        promesas: {
            cumplidas: num(promStats.cumplidas), incumplidas: num(promStats.incumplidas),
            pendientesVencidas: num(promStats.pendientes_vencidas), total: num(promStats.total),
            cumplimientoPct: num(promStats.cumplidas) + num(promStats.incumplidas)
                ? Math.round(num(promStats.cumplidas) / (num(promStats.cumplidas) + num(promStats.incumplidas)) * 100)
                : 0,
        },
        payBehavior,
    };
}

// ── MOTOR FINANCIERO COMPARTIDO (Informes + Inicio) ───────────────────────────
// Proyección de flujo de caja semanal. Cruza el pipeline abierto (sent/viewed)
// con el historial REAL por cliente: tasa de cierre (aprobadas / enviadas),
// días promedio a cierre (created→approved) y días a cobro (approved→paid).
export async function getCFO() {
    const orgId = await getActiveOrgId();
    if (!(await checkEntitlement(orgId, 'cfo_dashboard')).ok) throw new Error('subscription_required:cfo_dashboard');
    const full = await cached(`cfo:${orgId}`, 30, getCFOUncached);
    if ((await checkEntitlement(orgId, 'cashflow_90')).ok) return full;
    return { ...full, semanas: [], dias: [], fueraDeHorizonte: { n: 0, valorEsperado: 0, conservador: 0, optimista: 0 } };
}
async function getCFOUncached() {
    const orgId = await getActiveOrgId();
    const payBehavior = await getPayBehavior();

    const [activos, histRows, pagoRows, carteraRows, susRows] = await withOrgTx(orgId,
        // Pipeline abierto.
        sql`select c.id, c.folio, c.total, c.status, c.cliente_id,
                   coalesce(cl.empresa, 'Sin cliente') as empresa,
                   coalesce(c.viewer_last_seen, c.sent_at, c.created_at) as last_act
            from cotizaciones c
            left join clientes cl on cl.id = c.cliente_id
            where c.org_id = ${orgId} and c.status in ('sent','viewed')`,
        // Historial por cliente: tasa de cierre + días a cierre.
        sql`select c.cliente_id,
                   count(*) filter (where c.status = any(${STATUS_SALIO})) as total_hist,
                   count(*) filter (where c.status = any(${STATUS_GANADA})) as aprob_hist,
                   coalesce(avg(extract(epoch from (c.approved_at - c.created_at))/86400)
                            filter (where c.status = any(${STATUS_GANADA}) and c.approved_at is not null), 0) as avg_cierre
            from cotizaciones c where c.org_id = ${orgId}
            group by c.cliente_id`,
        // Días a cobro por cliente (approved → evento paid).
        sql`select c.cliente_id,
                   coalesce(avg(extract(epoch from (e.paid_at - coalesce(c.approved_at, c.created_at)))/86400), 0) as avg_pago
            from cotizaciones c
            join (select cotizacion_id, max(created_at) as paid_at from eventos
                  where org_id = ${orgId} and tipo = 'paid' group by cotizacion_id) e
              on e.cotizacion_id = c.id
            where c.org_id = ${orgId} and c.status = 'paid'
            group by c.cliente_id`,
        // Cartera cierta. Se mantiene separada del pipeline: solo comparte timing.
        sql`select c.id, c.total, c.cliente_id,
                   coalesce(cl.empresa, 'Sin cliente') as empresa,
                   coalesce(c.approved_at, c.created_at) as base_date,
                   coalesce(c.terminos, cl.terminos_default) as terminos
            from cotizaciones c
            left join clientes cl on cl.id = c.cliente_id
            where c.org_id = ${orgId}
              and c.status in ('approved','invoiced') -- canon: STATUS_POR_COBRAR
              and c.es_recurrente is not true`,
        // MRR contratado: tres ocurrencias mensuales entran al horizonte/invariante.
        sql`select s.id, s.monto, s.estado, s.current_period_end, s.cancel_at_period_end,
                   coalesce(cl.empresa, 'Sin cliente') as empresa
            from cotizacion_suscripciones s
            left join clientes cl on cl.id = s.cliente_id
            where s.org_id = ${orgId} and s.estado in ('active','trialing','past_due')`,
    );

    type Hist = { totalHist: number; aprobHist: number; avgCierre: number; avgPago: number };
    const histMap = new Map<string, Hist>();
    for (const h of histRows) {
        histMap.set(h.cliente_id as string, {
            totalHist: num(h.total_hist), aprobHist: num(h.aprob_hist),
            avgCierre: num(h.avg_cierre), avgPago: 0,
        });
    }
    for (const p of pagoRows) {
        const h = histMap.get(p.cliente_id as string);
        if (h) h.avgPago = num(p.avg_pago);
    }
    // El comportamiento compartido es el canon. La tercera query se conserva por
    // compatibilidad del motor y como fallback si todavía no hay eventos suficientes.
    for (const [clienteId, behavior] of Object.entries(payBehavior.clientes)) {
        const h = histMap.get(clienteId);
        if (h && behavior.avgDiasPago > 0) h.avgPago = behavior.avgDiasPago;
    }

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const MS = 86400000;

    // Cada cotización abierta ponderada por la tasa de cierre de su cliente.
    const items = activos.map((r) => {
        const cid = r.cliente_id as string | null;
        const h = cid ? histMap.get(cid) : undefined;
        const status = r.status as string;
        // Tasa: histórica si el cliente tiene pasado; conservadora si es nuevo.
        const tasaPct = h && h.totalHist > 0
            ? Math.max(5, Math.round((h.aprobHist / h.totalHist) * 100))
            : (status === 'viewed' ? 50 : 25);
        const avgDiasCierre = Math.round(h && h.avgCierre > 0 ? h.avgCierre : 14);
        const avgDiasPago = Math.round(h && h.avgPago > 0 ? h.avgPago : 30);
        const total = num(r.total);
        const probability = tasaPct / 100;
        const margin = !h || h.totalHist < 3
            ? 0.20
            : Math.min(0.35, Math.max(0.10, 1.96 * Math.sqrt((probability * (1 - probability)) / h.totalHist)));
        const valorEsperado = total * probability;
        const conservador = total * Math.max(0, probability - margin);
        const optimista = total * Math.min(1, probability + margin);
        const diasParaCobro = avgDiasCierre + avgDiasPago;
        const diasSilencio = Math.floor((today.getTime() - new Date(r.last_act as string).getTime()) / MS);
        return {
            id: r.id as string, folio: r.folio as string,
            empresa: r.empresa as string, status, total,
            tasaPct, valorEsperado, conservador, optimista, margenPct: Math.round(margin * 100), diasParaCobro,
            avgDiasCierre, avgDiasPago, diasSilencio,
            aprobHist: h?.aprobHist ?? 0, totalHist: h?.totalHist ?? 0,
        };
    }).sort((a, b) => b.valorEsperado - a.valorEsperado);

    const iso = (date: Date) => {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    };
    const atOffset = (offset: number) => {
        const date = new Date(today);
        date.setDate(date.getDate() + offset);
        return date;
    };
    const daysFromToday = (date: Date) => Math.max(1, Math.ceil((date.getTime() - today.getTime()) / MS));
    const locale = intlLocale();
    const weekLabel = (index: number) => {
        const from = atOffset(index * 7 + 1);
        const to = atOffset(Math.min(90, index * 7 + 7));
        const fmt = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' });
        return `${fmt.format(from).replace('.', '')} – ${fmt.format(to).replace('.', '')}`;
    };

    type ForecastDay = {
        fecha: string; esperado: number; conservador: number; optimista: number;
        cartera: number; pipeline: number; recurrente: number; n: number;
    };
    const dias: ForecastDay[] = Array.from({ length: 90 }, (_, index) => ({
        fecha: iso(atOffset(index + 1)), esperado: 0, conservador: 0, optimista: 0,
        cartera: 0, pipeline: 0, recurrente: 0, n: 0,
    }));
    const semanas = Array.from({ length: 13 }, (_, index) => ({
        n: 0, label: weekLabel(index), cartera: 0, pipeline: 0, recurrente: 0,
        total: 0, valorEsperado: 0,
    }));
    const fueraDeHorizonte = { n: 0, valorEsperado: 0, cartera: 0, pipeline: 0, recurrente: 0 };
    const flow30Map = new Map<string, number>();
    const addFlow30 = (empresa: string, offset: number, amount: number) => {
        if (offset <= 30) flow30Map.set(empresa, (flow30Map.get(empresa) ?? 0) + amount);
    };

    const addForecast = (
        offset: number,
        flow: 'cartera' | 'pipeline' | 'recurrente',
        expected: number,
        conservative = expected,
        optimistic = expected,
    ) => {
        if (offset >= 91) {
            fueraDeHorizonte.n += 1;
            fueraDeHorizonte.valorEsperado += expected;
            fueraDeHorizonte[flow] += expected;
            return;
        }
        const day = dias[Math.max(1, offset) - 1];
        day.n += 1;
        day.esperado += expected;
        day.conservador += conservative;
        day.optimista += optimistic;
        day[flow] += expected;
        const week = semanas[Math.min(12, Math.floor((Math.max(1, offset) - 1) / 7))];
        week.n += 1;
        week[flow] += expected;
        week.total += expected;
        week.valorEsperado = week.total;
    };

    for (const item of items) {
        addForecast(item.diasParaCobro, 'pipeline', item.valorEsperado, item.conservador, item.optimista);
        addFlow30(item.empresa, item.diasParaCobro, item.valorEsperado);
    }

    let totalCartera = 0;
    for (const row of carteraRows) {
        const amount = num(row.total);
        const due = dueDateFor(row.base_date as string, row.terminos as string);
        const behavior = row.cliente_id ? payBehavior.clientes[row.cliente_id as string] : undefined;
        due.setDate(due.getDate() + (behavior?.avgDiasRetraso ?? payBehavior.avgDiasRetraso));
        const offset = daysFromToday(due);
        totalCartera += amount;
        addForecast(offset, 'cartera', amount);
        addFlow30(row.empresa as string, offset, amount);
    }

    const recurringStates = new Set(['active', 'trialing', 'past_due']);
    let totalRecurrente90 = 0;
    for (const row of susRows) {
        if (!recurringStates.has(row.estado as string)) continue;
        const amount = num(row.monto);
        const first = row.current_period_end ? new Date(row.current_period_end as string) : atOffset(30);
        if (first <= today) first.setDate(today.getDate() + 1);
        for (let occurrence = 0; occurrence < 3; occurrence += 1) {
            const date = new Date(first);
            date.setMonth(first.getMonth() + occurrence);
            const offset = daysFromToday(date);
            totalRecurrente90 += amount;
            addForecast(offset, 'recurrente', amount);
            addFlow30(row.empresa as string, offset, amount);
        }
    }
    const maxSemana = Math.max(1, ...semanas.map((s) => s.total));

    // Ranking ponderado por cliente.
    const rankMap = new Map<string, {
        empresa: string; n: number; totalPipeline: number; valorEsperado: number;
        tasaPct: number; avgDiasCierre: number; avgDiasPago: number; aprobHist: number; totalHist: number;
    }>();
    for (const it of items) {
        const cur = rankMap.get(it.empresa) ?? {
            empresa: it.empresa, n: 0, totalPipeline: 0, valorEsperado: 0,
            tasaPct: it.tasaPct, avgDiasCierre: it.avgDiasCierre, avgDiasPago: it.avgDiasPago,
            aprobHist: it.aprobHist, totalHist: it.totalHist,
        };
        cur.n += 1; cur.totalPipeline += it.total; cur.valorEsperado += it.valorEsperado;
        rankMap.set(it.empresa, cur);
    }
    const rankClientes = [...rankMap.values()].sort((a, b) => b.valorEsperado - a.valorEsperado);

    // KPIs financieros.
    const totalPipeline = items.reduce((s, i) => s + i.total, 0);
    const totalEsperado = items.reduce((s, i) => s + i.valorEsperado, 0);
    const dso = totalPipeline > 0
        ? Math.round(items.reduce((s, i) => s + i.diasParaCobro * i.total, 0) / totalPipeline)
        : 0;
    const concentracion = totalPipeline > 0 && rankClientes.length
        ? Math.round((rankClientes[0].totalPipeline / totalPipeline) * 100)
        : 0;
    const flujo30Clientes = [...flow30Map.entries()]
        .map(([empresa, valor]) => ({ empresa, valor }))
        .sort((a, b) => b.valor - a.valor);
    const flujo30Total = flujo30Clientes.reduce((sum, row) => sum + row.valor, 0);
    const concentracionFlujo30 = flujo30Total > 0
        ? Math.round((flujo30Clientes[0]?.valor ?? 0) / flujo30Total * 100)
        : 0;

    const silenciadas = items
        .filter((i) => i.diasSilencio > 7)
        .sort((a, b) => b.diasSilencio - a.diasSilencio)
        .map((i) => ({ id: i.id, folio: i.folio, empresa: i.empresa, dias: i.diasSilencio, total: i.total }));

    const mrrActivo = susRows.reduce((sum, row) => sum + num(row.monto), 0);
    const mrr = {
        activo: mrrActivo,
        arr: mrrActivo * 12,
        nIgualas: susRows.length,
        proximos30: susRows.reduce((sum, row) => {
            const next = row.current_period_end ? new Date(row.current_period_end as string) : atOffset(30);
            return daysFromToday(next) <= 30 ? sum + num(row.monto) : sum;
        }, 0),
        enRiesgo: susRows.reduce((sum, row) =>
            row.estado === 'past_due' || row.cancel_at_period_end ? sum + num(row.monto) : sum, 0),
    };
    const forecastTotal = semanas.reduce((sum, week) => sum + week.total, 0) + fueraDeHorizonte.valorEsperado;
    const sourceTotal = totalCartera + totalEsperado + totalRecurrente90;

    return {
        items,
        kpis: {
            totalPipeline, totalEsperado, totalCartera, totalRecurrente90,
            dso, concentracion, concentracionFlujo30, flujo30Total, nSilenciadas: silenciadas.length,
        },
        semanas, fueraDeHorizonte, dias, mrr, maxSemana, rankClientes, flujo30Clientes, silenciadas,
        invariante: { forecastTotal, sourceTotal, delta: forecastTotal - sourceTotal },
    };
}

// ── TAREAS / RECORDATORIOS (CRM ligero) ───────────────────────────────────────
export async function getTareas() {
    const orgId = await getActiveOrgId();
    const [rows] = await withOrgTx(orgId, sql`
        select t.id, t.titulo, t.due_date, t.cotizacion_id, c.folio
        from tareas t left join cotizaciones c on c.id = t.cotizacion_id
        where t.org_id = ${orgId} and t.done = false
        order by t.due_date asc nulls last, t.created_at asc
        limit 12`);
    const hoy = new Date(new Date().toDateString());
    return rows.map((t) => ({
        id: t.id as string, titulo: t.titulo as string,
        folio: (t.folio as string) ?? '',
        due: t.due_date ? fmtDate(t.due_date as string) : '',
        vencida: t.due_date ? new Date(t.due_date as string) < hoy : false,
    }));
}

// ── AUDIT LOG (lectura) ────────────────────────────────────────────────────────
export async function getAuditLog() {
    const orgId = await getActiveOrgId();
    if (!(await checkEntitlement(orgId, 'audit_log')).ok) return [];
    try {
        const [rows] = await withOrgTx(orgId, sql`
            select actor, accion, entidad, detalle, ip, created_at
            from audit_log where org_id = ${orgId}
            order by created_at desc limit 50`);
        return rows.map((r) => ({
            actor: (r.actor as string) || '—',
            accion: r.accion as string,
            entidad: (r.entidad as string) || '',
            detalle: (r.detalle as string) || '',
            ip: (r.ip as string) || '',
            cuando: fmtRelative(r.created_at as string),
        }));
    } catch { return []; }
}

// ── DASHBOARD KPIs ────────────────────────────────────────────────────────────
export async function getDashboard() {
    const orgId = await getActiveOrgId();
    const [summaryRows, statusRows, recentRows, eventos] = await withOrgTx(orgId,
        sql`select count(*) as total_quotes,
                   coalesce(sum(total) filter (where status in ('sent','viewed')), 0) as por_cerrar,
                   coalesce(sum(total) filter (where status = any(${STATUS_GANADA})), 0) as cerrado,
                   count(*) filter (where status = any(${STATUS_GANADA})) as aprobadas,
                   count(*) filter (where status <> 'draft') as salieron,
                   count(*) filter (where status in ('sent','viewed')) as abiertas,
                   count(*) filter (where status = 'viewed') as seguimiento
            from cotizaciones where org_id = ${orgId}`,
        sql`select status, count(*) as n, coalesce(sum(total), 0) as total
            from cotizaciones where org_id = ${orgId} group by status`,
        sql`select c.*, cl.empresa, cl.terminos_default,
                   coalesce(c.terminos, cl.terminos_default) as terminos
            from cotizaciones c
            left join clientes cl on cl.id = c.cliente_id
            where c.org_id = ${orgId}
            order by c.created_at desc limit 5`,
        sql`select e.tipo, e.detalle, e.created_at, c.folio, c.id as cotizacion_id
            from eventos e join cotizaciones c on c.id = e.cotizacion_id
            where e.org_id = ${orgId}
            order by e.created_at desc limit 7`,
    );
    const summary = summaryRows[0] ?? {};
    const quotes = recentRows.map(c => rowToQuote(c, [], [], []));
    const salieron = num(summary.salieron);

    return {
        quotes,
        totalQuotes: num(summary.total_quotes),
        porCerrar: num(summary.por_cerrar),
        cerradoMes: num(summary.cerrado),
        tasaCierre: salieron ? Math.round((num(summary.aprobadas) / salieron) * 100) : 0,
        abiertas: num(summary.abiertas),
        seguimiento: num(summary.seguimiento),
        statusStats: statusRows.map((row) => ({ status: row.status as string, n: num(row.n), total: num(row.total) })),
        feed: eventos.map(e => ({
            tipo: e.tipo as string, detalle: e.detalle as string,
            cuando: fmtRelative(e.created_at as string),
            folio: e.folio as string, id: e.cotizacion_id as string,
        })),
    };
}

// ── EQUIPO Y ROLES ────────────────────────────────────────────────────────────
const fmtFecha = (d: unknown) => d ? fmtDate(new Date(d as string)) : '';

export interface MemberRow {
    id: string;
    userId: string | null;
    email: string;
    nombre: string;
    rol: string;
    permisos: PermMap;
    estado: string;
    tieneInvitePendiente: boolean;
    inicial: string;
    desde: string;
    esYo: boolean;
    // ── Actividad real (ago 2026) ──
    // La columna de la tabla decía "Último inicio de sesión" y mostraba la fecha
    // de ALTA: el dato no existía en ningún lado. Ahora sale de `sessions`.
    ultimaSesion: string | null;
    ultimaSesionISO: string | null;
    cotizaciones30d: number;
    ultimaAccion: string | null;
    // Gestionado por el IdP: editar sus permisos a mano no sirve de nada, el
    // siguiente login por SAML los pisa. Antes era invisible en la UI.
    ssoManaged: boolean;
    invitacionExpirada: boolean;
}

export async function getMembers(): Promise<MemberRow[]> {
    const orgId = await getActiveOrgId();
    const me = currentUserId();
    // `token` guarda sha256(token) desde ago 2026 — el valor crudo del link de
    // invitación solo existe una vez, en la respuesta de POST /api/equipo (o
    // de /api/equipo/resend). Ya no tiene sentido exponerlo aquí: no sirve
    // para reconstruir el link (es un hash) y no hace falta filtrarlo a la
    // página — se manda `tieneInvitePendiente` para que la UI ofrezca
    // "Reenviar invitación" (token nuevo) en vez de "Copiar link".
    //
    // ⚠️ Ya NO se filtra `estado <> 'revocado'`: el tab "Inactivos" de la página
    // llevaba desde su creación mostrando siempre 0 porque el SQL los quitaba
    // antes de llegar a la UI. Ahora vienen todos y la página filtra por estado.
    //
    // Los agregados van en `left join lateral` acotados, no en subconsultas
    // correlacionadas por fila (regla de escala documentada para Ops).
    const [rows] = await withOrgTx(orgId, sql`
        select m.id, m.user_id, m.email, m.nombre, m.rol, m.permisos, m.estado,
               m.created_at, m.joined_at, m.token_expires_at, m.sso_managed,
               s.last_used_at,
               coalesce(q.n, 0) as cotizaciones_30d,
               a.accion as ultima_accion
        from org_members m
        left join lateral (
            select max(last_used_at) as last_used_at from sessions
            where user_id = m.user_id and revoked_at is null
        ) s on m.user_id is not null
        left join lateral (
            -- cotizaciones.creado_por es TEXT (nació como clerk_user_id y nunca
            -- se migró a uuid), así que el cast es obligatorio.
            select count(*) as n from cotizaciones
            where org_id = ${orgId} and creado_por = m.user_id::text
              and created_at >= now() - interval '30 days'
        ) q on m.user_id is not null
        left join lateral (
            -- audit_log.actor es TEXT y guarda el user_id (o 'system' para crons).
            select accion from audit_log
            where org_id = ${orgId} and actor = m.user_id::text
            order by created_at desc limit 1
        ) a on m.user_id is not null
        where m.org_id = ${orgId}
        order by case when m.rol = 'owner' then 0 else 1 end, m.created_at asc`);
    const ahora = Date.now();
    return rows.map((m) => {
        const nombre = (m.nombre as string) || (m.email as string) || 'Invitado';
        return {
            id: m.id as string,
            userId: (m.user_id as string) ?? null,
            email: (m.email as string) ?? '',
            nombre, rol: m.rol as string,
            permisos: (m.permisos as PermMap) ?? {},
            estado: m.estado as string,
            tieneInvitePendiente: m.estado === 'invitado',
            inicial: initials(nombre),
            desde: fmtFecha(m.joined_at || m.created_at),
            esYo: !!me && m.user_id === me,
            ultimaSesion: m.last_used_at ? fmtFecha(m.last_used_at) : null,
            ultimaSesionISO: m.last_used_at ? new Date(m.last_used_at as string).toISOString() : null,
            cotizaciones30d: Number(m.cotizaciones_30d ?? 0),
            ultimaAccion: (m.ultima_accion as string) ?? null,
            ssoManaged: !!m.sso_managed,
            invitacionExpirada: m.estado === 'invitado' && !!m.token_expires_at
                && new Date(m.token_expires_at as string).getTime() < ahora,
        };
    });
}

/** Asientos ocupados = miembros activos + invitaciones vigentes (un invitado ya
 *  reserva su lugar; si no, se podría invitar a 50 personas con 5 asientos). */
export async function getSeatUsage(): Promise<{ usados: number; limite: number; plan: string }> {
    const orgId = await getActiveOrgId();
    const context = await getEntitlementContext(orgId);
    const [[row]] = await withOrgTx(orgId, sql`
        select (select count(*) from org_members
                where org_id = ${orgId} and estado in ('activo', 'invitado')) as usados
        from orgs o where o.id = ${orgId}`);
    const plan = context.effectivePlan;
    return { usados: Number(row?.usados ?? 0), limite: INCLUDED[plan].usuarios ?? Infinity, plan };
}

export async function getMyMembership(): Promise<Membership> {
    const userId = currentUserId();
    // FAIL-CLOSED sin sesión. El único carril legítimo sin userId es M2M
    // (API key), donde currentOrgIdOverride() está seteado y la llave ya es dueña
    // de su org. Para cualquier otro caso (una ruta mal clasificada como pública,
    // un handler alcanzado sin sesión), NO asumir owner: devolver un principal sin
    // permisos para que requirePerm() deniegue en vez de autorizar como dueño.
    if (!userId) {
        if (currentOrgIdOverride()) return { rol: 'owner', permisos: {}, esOwner: true, widgetPrefs: {} };
        return { rol: 'anon', permisos: {}, esOwner: false, widgetPrefs: {} };
    }
    const orgId = await getActiveOrgId();
    try {
        const [rows] = await withOrgTx(orgId, sql`select rol, permisos, widget_prefs from org_members where org_id = ${orgId} and user_id = ${userId} and estado = 'activo' limit 1`);
        if (rows.length) {
            const m = rows[0];
            return { rol: m.rol as string, permisos: (m.permisos as PermMap) ?? {}, esOwner: m.rol === 'owner', widgetPrefs: (m.widget_prefs as Record<string, unknown>) ?? {} };
        }
        // Sin fila de membresía: la ÚNICA vez que esto es legítimo es cuando la
        // org resuelta es la SANDBOX espejo del entorno de prueba —
        // resolveSandboxOrgId() (db.ts) solo la crea/resuelve después de que
        // getActiveOrgId() ya confirmó al usuario como dueño del negocio REAL;
        // el sandbox nunca siembra org_members (es un espacio 1:1 con su
        // padre). Para CUALQUIER otra org sin membresía — bug de resolución,
        // dato corrupto, o simplemente un caso no prescrito — se falla
        // CERRADO. Antes esta rama devolvía owner por default: cualquier
        // request cuyo getActiveOrgId() resolviera a una org de la que el
        // usuario no fuera miembro activo quedaba autorizado como su dueño.
        const [sandboxRow] = await withOrgTx(orgId, sql`select 1 from orgs where id = ${orgId} and sandbox_of is not null limit 1`);
        if (sandboxRow.length) return { rol: 'owner', permisos: {}, esOwner: true, widgetPrefs: {} };
        return { rol: 'anon', permisos: {}, esOwner: false, widgetPrefs: {} };
    } catch {
        return { rol: 'anon', permisos: {}, esOwner: false, widgetPrefs: {} };
    }
}

export async function requirePerm(key: PermKey): Promise<Response | null> {
    const m = await getMyMembership();
    if (memberCan(m, key)) return null;
    return new Response(JSON.stringify({ error: 'No tienes permiso para esta acción.' }), {
        status: 403, headers: { 'Content-Type': 'application/json' },
    });
}

/**
 * Como `requirePerm`, pero basta con UNO de los permisos. Existe para endpoints que
 * sirven a dos superficies con gates distintos: `/api/billing/connect/payouts` lo
 * consume Ajustes › Cobros (permiso `ajustes`) Y el dashboard "Mi dinero" (permiso
 * `cobranza`). Exigir solo uno de los dos dejaba a la otra superficie con un 403
 * desde el navegador mientras la página se veía completa por SSR.
 */
export async function requirePermAny(keys: PermKey[]): Promise<Response | null> {
    const m = await getMyMembership();
    if (keys.some((key) => memberCan(m, key))) return null;
    return new Response(JSON.stringify({ error: 'No tienes permiso para esta acción.' }), {
        status: 403, headers: { 'Content-Type': 'application/json' },
    });
}


/**
 * Tira los agregados de dinero/cartera de una org tras un cambio que los invalida
 * (cotización que cambia de estado, cobro registrado, promesa de pago editada).
 *
 * Sin esto, `getCobranza()` y `getCobros()` sirven hasta 30 s de datos viejos: marcar
 * una cotización como cobrada la sacaba de la tabla en pantalla y un F5 inmediato la
 * resucitaba. Con KPIs derivados de esas mismas lecturas el síntoma es peor, porque
 * los totales también se contradicen entre sí.
 *
 * `invalidate` borra por PREFIJO, así que una sola llamada cubre todas las variantes
 * por rango de fechas de la misma familia. Las claves con prefijo distinto
 * (`analytics-rango:` vs `analytics:`) tienen que listarse aparte.
 */
export function invalidateMoneyCaches(orgId: string): void {
    for (const prefix of [
        `cobranza:${orgId}`, `cobros:${orgId}`, `serie-diaria:${orgId}`, `cfo:${orgId}`,
        `pay-behavior:${orgId}`, `mrr-igualas:${orgId}`, `cobranza-ia:${orgId}`,
        `analytics:${orgId}`, `analytics-rango:${orgId}`, `analytics-diagnosis:${orgId}`,
    ]) invalidate(prefix);
}

// Plan EFECTIVO de la org activa. El valor crudo nunca autoriza funciones.
export async function getOrgPlan(): Promise<string> {
    const orgId = await getActiveOrgId();
    return (await getEntitlementContext(orgId)).effectivePlan;
}

// ── DASHBOARD DE COBROS (/app/cobros) ──────────────────────────────────────────
export interface CobrosData {
    /** Cobrado DENTRO del rango pedido (o histórico completo si no se pasa rango). */
    totalCobrado: number;
    /** Cobrado sin límite de fechas — el "desde siempre", independiente del selector. */
    totalHistorico: number;
    /** Número de operaciones cobradas en el rango (one-time + cuotas de igualas). */
    txs: number;
    methods: { method: string; monto: number; txs: number }[];
    monthly: { ym: string; monto: number }[];
    recent: { id: string; cobroId: string | null; folio: string; empresa: string; total: number; method: string; paidAt: string }[];
}
// ⚠️ NO agregar aquí un `paidAtISO` sin decidir su zona horaria a propósito. Se intentó y
// se revirtió: `paid_at` es timestamptz, la sesión de Postgres corre en GMT y el proceso
// de Node en America/Mexico_City, así que `to_char(...,'YYYY-MM-DD')` y el `fmtDate` de
// `paidAt` discrepan un día completo en cualquier pago hecho después de las 18:00 hora de
// México (COT-0009: to_char='2026-08-10' vs fmtDate='9 ago 2026'). Un campo con las dos
// semánticas posibles y ninguna documentada es una trampa. El eje de tiempo agregado
// (rango, serie mensual, serie diaria) usa la convención de Postgres/GMT de forma
// consistente con getSerieDiaria() y con /app/informes; `paidAt` es solo para leerlo.

/**
 * Dinero que ENTRÓ, acotado a un rango de fechas.
 *
 * Sin `rango` devuelve la historia completa (comportamiento previo a ago 2026).
 * El eje de tiempo es siempre `coalesce(paid_at, created_at)`, el mismo que ya
 * usaban la serie mensual y los recientes.
 */
export async function getCobros(rango?: { desde: string; hasta: string }): Promise<CobrosData> {
    const orgId = await getActiveOrgId();
    const key = rango ? `cobros:${orgId}:${rango.desde}:${rango.hasta}` : `cobros:${orgId}:all`;
    return cached(key, 30, () => getCobrosUncached(orgId, rango));
}

async function getCobrosUncached(orgId: string, rango?: { desde: string; hasta: string }): Promise<CobrosData> {
    // "Cobrado" = dinero REALMENTE recibido. `paid_at` solo se escribe al cobrar
    // (webhook o pago manual). NO usar status='invoiced' como cobrado: una cotización
    // puede facturarse SIN estar pagada (approved→invoiced). Se incluye status='paid'
    // para cubrir pagos legacy previos a la columna paid_at. (La condición se inlinea
    // en cada query porque el sql de neon-serverless no compone fragmentos.)
    //
    // El rango entra por CENTINELAS en vez de bifurcar cada query: sin rango, los
    // límites abren tanto que el predicado no descarta nada, y hay una sola forma de
    // SQL que mantener en vez de dos.
    // ⚠️ El límite superior es `< hasta + 1 día`, NO `<= hasta`: paid_at es timestamptz
    // y `<= hasta::date` compara contra la medianoche de ese día, recortando todo lo
    // cobrado durante la jornada.
    const desde = rango?.desde ?? '1970-01-01';
    const hasta = rango?.hasta ?? '9999-12-31';
    // Las lecturas pasan por el mismo withOrgTx: cotizaciones, clientes y
    // cotizacion_cobros tienen FORCE RLS y necesitan app.org_id incluso cuando el
    // rol de despliegue hoy tenga BYPASSRLS.
    const [[hist], methods, monthly, recent, recRows] = await withOrgTx(orgId,
        // Histórico sin acotar — el KPI "desde siempre" no debe moverse con el selector.
        sql`select
                (select coalesce(sum(greatest(0, c.total - coalesce((
                    select sum(cc.reembolsado_cents) / 100.0 from cotizacion_cobros cc
                    where cc.cotizacion_id = c.id
                ), 0))), 0) from cotizaciones c
                  where c.org_id = ${orgId} and (c.status = 'paid' or c.paid_at is not null)) as directo,
                (select coalesce(sum(greatest(0, co.monto - coalesce(co.reembolsado_cents, 0) / 100.0)),0) from cotizacion_cobros co
                  join cotizaciones c on c.id = co.cotizacion_id
                  where co.org_id = ${orgId} and co.status = 'pagado' and c.es_recurrente is true) as recurrente`,
        sql`select coalesce(payment_method, 'otro') as method,
                   sum(greatest(0, c.total - coalesce((
                       select sum(cc.reembolsado_cents) / 100.0 from cotizacion_cobros cc
                       where cc.cotizacion_id = c.id
                   ), 0))) as monto, count(*) as txs
            from cotizaciones c
            where c.org_id = ${orgId} and (c.status = 'paid' or c.paid_at is not null)
              and coalesce(c.paid_at, c.created_at) >= ${desde}::date
              and coalesce(c.paid_at, c.created_at) < (${hasta}::date + 1)
            group by coalesce(payment_method, 'otro')
            order by monto desc`,
        sql`select to_char(date_trunc('month', coalesce(c.paid_at, c.created_at)), 'YYYY-MM') as ym,
                   sum(greatest(0, c.total - coalesce((
                       select sum(cc.reembolsado_cents) / 100.0 from cotizacion_cobros cc
                       where cc.cotizacion_id = c.id
                   ), 0))) as monto
            from cotizaciones c
            where c.org_id = ${orgId} and (c.status = 'paid' or c.paid_at is not null)
              and coalesce(c.paid_at, c.created_at) >= ${desde}::date
              and coalesce(c.paid_at, c.created_at) < (${hasta}::date + 1)
            group by 1 order by 1`,
        sql`select c.id, c.folio,
                   (select cc.id from cotizacion_cobros cc
                     where cc.cotizacion_id = c.id and cc.status = 'pagado'
                       and cc.stripe_payment_intent_id is not null
                     order by coalesce(cc.paid_at, cc.created_at) desc limit 1) as cobro_id,
                   greatest(0, c.total - coalesce((select sum(cc.reembolsado_cents) / 100.0
                       from cotizacion_cobros cc where cc.cotizacion_id = c.id), 0)) as total,
                   coalesce(c.payment_method, 'otro') as payment_method,
                   coalesce(c.paid_at, c.created_at) as paid_at, cl.empresa
            from cotizaciones c left join clientes cl on cl.id = c.cliente_id
            where c.org_id = ${orgId} and (c.status = 'paid' or c.paid_at is not null)
              and coalesce(c.paid_at, c.created_at) >= ${desde}::date
              and coalesce(c.paid_at, c.created_at) < (${hasta}::date + 1)
            order by coalesce(c.paid_at, c.created_at) desc limit 15`,
        // Ingreso de IGUALAS recurrentes: cada cobro mensual es una fila 'pagado'
        // y nunca marca cotizaciones.paid_at. Ambos universos son disjuntos.
        sql`select co.id, c.id as quote_id,
                   greatest(0, co.monto - coalesce(co.reembolsado_cents, 0) / 100.0) as monto,
                   coalesce(co.payment_method, 'tarjeta') as payment_method,
                   coalesce(co.paid_at, co.created_at) as paid_at,
                   to_char(date_trunc('month', coalesce(co.paid_at, co.created_at)), 'YYYY-MM') as ym,
                   c.folio, cl.empresa
            from cotizacion_cobros co
            join cotizaciones c on c.id = co.cotizacion_id
            left join clientes cl on cl.id = c.cliente_id
            where co.org_id = ${orgId} and co.status = 'pagado' and c.es_recurrente is true
              and coalesce(co.paid_at, co.created_at) >= ${desde}::date
              and coalesce(co.paid_at, co.created_at) < (${hasta}::date + 1)`,
    );

    // Fusiona métodos.
    const methodMap = new Map<string, { monto: number; txs: number }>();
    for (const m of methods) methodMap.set(m.method as string, { monto: Number(m.monto), txs: Number(m.txs) });
    for (const r of recRows) {
        const key = (r.payment_method as string) || 'otro';
        const cur = methodMap.get(key) ?? { monto: 0, txs: 0 };
        cur.monto += Number(r.monto); cur.txs += 1;
        methodMap.set(key, cur);
    }

    // Fusiona serie mensual.
    const monthlyMap = new Map<string, number>();
    for (const m of monthly) monthlyMap.set(m.ym as string, Number(m.monto));
    for (const r of recRows) monthlyMap.set(r.ym as string, (monthlyMap.get(r.ym as string) ?? 0) + Number(r.monto));

    // Fusiona recientes (los 15 más nuevos entre one-time e igualas).
    const recentMerged = [
        ...recent.map((r: any) => ({
            id: r.id as string, cobroId: (r.cobro_id as string) || null, folio: r.folio as string,
            empresa: (r.empresa as string) || 'Sin cliente',
            total: Number(r.total), method: r.payment_method as string,
            paidAtRaw: r.paid_at,
        })),
        ...recRows.map((r: any) => ({
            id: r.quote_id as string, cobroId: r.id as string, folio: `${r.folio} · iguala`,
            empresa: (r.empresa as string) || 'Sin cliente',
            total: Number(r.monto), method: r.payment_method as string,
            paidAtRaw: r.paid_at,
        })),
    ].sort((a, b) => new Date(b.paidAtRaw as any).getTime() - new Date(a.paidAtRaw as any).getTime()).slice(0, 15);

    const methodList = [...methodMap.entries()]
        .map(([method, v]) => ({ method, monto: v.monto, txs: v.txs }))
        .sort((a, b) => b.monto - a.monto);

    return {
        // El total del rango sale de los métodos ya fusionados: mismo universo, sin
        // una query extra que pudiera divergir del desglose que se muestra al lado.
        totalCobrado: methodList.reduce((s, m) => s + m.monto, 0),
        totalHistorico: Number(hist?.directo || 0) + Number(hist?.recurrente || 0),
        txs: methodList.reduce((s, m) => s + m.txs, 0),
        methods: methodList,
        monthly: [...monthlyMap.entries()]
            .map(([ym, monto]) => ({ ym, monto }))
            .sort((a, b) => a.ym.localeCompare(b.ym)),
        recent: recentMerged.map((r) => ({
            id: r.id, cobroId: r.cobroId, folio: r.folio, empresa: r.empresa,
            total: r.total, method: r.method, paidAt: fmtDate(r.paidAtRaw),
        })),
    };
}

/**
 * MRR contratado de igualas (retainers). `cotizacion_suscripciones` guarda el monto
 * mensual y el estado que sincroniza el webhook de la cuenta CONECTADA, así que esto
 * es ingreso recurrente comprometido, no una proyección.
 */
export async function getMrrIgualas(): Promise<{ mrr: number; n: number; pastDue: number }> {
    const orgId = await getActiveOrgId();
    return cached(`mrr-igualas:${orgId}`, 60, async () => {
        const [[row]] = await withOrgTx(orgId, sql`
            select coalesce(sum(monto) filter (where estado in ('active','trialing')), 0) as mrr,
                   count(*) filter (where estado in ('active','trialing')) as n,
                   count(*) filter (where estado = 'past_due') as past_due
            from cotizacion_suscripciones
            where org_id = ${orgId} and estado in ('active','trialing','past_due')`);
        return { mrr: Number(row?.mrr || 0), n: Number(row?.n || 0), pastDue: Number(row?.past_due || 0) };
    });
}

// ── DESEMPEÑO DEL EQUIPO (/app/desempeno) ──────────────────────────────────────
export interface VendedorDesempeno {
    userId: string;
    nombre: string;
    inicial: string;
    rol: string;
    esYo: boolean;
    creadas: number;
    enviadas: number;
    cerradas: number;
    tasaCierre: number;
    cerradoTotal: number;
    cobradoTotal: number;
    diasCierre: number;
    ticketPromedio: number;
}

export async function getDesempeno() {
    const orgId = await getActiveOrgId();
    const me = currentUserId();

    const [members, cierreRows, cobradoRows, recRows, sinCreadorRows] = await withOrgTx(orgId,
        sql`select user_id, coalesce(nombre, email, 'Sin nombre') as nombre, rol
            from org_members where org_id = ${orgId} and estado = 'activo' and user_id is not null
            order by case when rol = 'owner' then 0 else 1 end`,
        // Creadas / enviadas / cerradas + tiempo a cierre, por vendedor.
        sql`select creado_por,
                count(*) filter (where status <> 'draft') as creadas,
                count(*) filter (where status = any(${STATUS_SALIO})) as enviadas,
                count(*) filter (where status = any(${STATUS_GANADA})) as cerradas,
                coalesce(sum(total) filter (where status = any(${STATUS_GANADA})),0) as cerrado_total,
                coalesce(avg(extract(epoch from (approved_at - created_at))/86400)
                         filter (where status = any(${STATUS_GANADA}) and approved_at is not null),0) as dias_cierre
            from cotizaciones
            where org_id = ${orgId} and creado_por is not null
            group by creado_por`,
        // Cobrado directo (pago único/anticipo/saldo/cuotas) — misma semántica que getCobros().
        sql`select creado_por, coalesce(sum(greatest(0, total - coalesce((
                    select sum(cc.reembolsado_cents) / 100.0
                    from cotizacion_cobros cc
                    where cc.org_id = ${orgId} and cc.cotizacion_id = cotizaciones.id
                ), 0))),0) as cobrado
            from cotizaciones
            where org_id = ${orgId} and creado_por is not null and (status = 'paid' or paid_at is not null)
            group by creado_por`,
        // Cobrado de igualas recurrentes — nunca marca la cotización 'paid' (ver
        // getCobros()), así que se suma aparte desde cotizacion_cobros.
        sql`select c.creado_por,
                   coalesce(sum(greatest(0, co.monto - coalesce(co.reembolsado_cents, 0) / 100.0)),0) as cobrado
            from cotizacion_cobros co
            join cotizaciones c on c.id = co.cotizacion_id
            where co.org_id = ${orgId} and co.status = 'pagado' and c.es_recurrente is true and c.creado_por is not null
            group by c.creado_por`,
        // Cerrado sin vendedor asignado (creado antes de este campo, o vía API key).
        sql`select coalesce(sum(total) filter (where status = any(${STATUS_GANADA})),0) as sin_creador
            from cotizaciones where org_id = ${orgId} and creado_por is null and status <> 'draft'`,
    );

    type Agg = { creadas: number; enviadas: number; cerradas: number; cerradoTotal: number; diasCierre: number; cobradoTotal: number };
    const aggMap = new Map<string, Agg>();
    const getAgg = (id: string): Agg => {
        let a = aggMap.get(id);
        if (!a) { a = { creadas: 0, enviadas: 0, cerradas: 0, cerradoTotal: 0, diasCierre: 0, cobradoTotal: 0 }; aggMap.set(id, a); }
        return a;
    };
    for (const r of cierreRows) {
        const a = getAgg(r.creado_por as string);
        a.creadas = num(r.creadas); a.enviadas = num(r.enviadas); a.cerradas = num(r.cerradas);
        a.cerradoTotal = num(r.cerrado_total); a.diasCierre = num(r.dias_cierre);
    }
    for (const r of cobradoRows) getAgg(r.creado_por as string).cobradoTotal += num(r.cobrado);
    for (const r of recRows) getAgg(r.creado_por as string).cobradoTotal += num(r.cobrado);

    const seen = new Set<string>();
    const vendedores: VendedorDesempeno[] = members.map((m) => {
        const id = m.user_id as string;
        seen.add(id);
        const a = aggMap.get(id) ?? { creadas: 0, enviadas: 0, cerradas: 0, cerradoTotal: 0, diasCierre: 0, cobradoTotal: 0 };
        const nombre = m.nombre as string;
        return {
            userId: id, nombre, inicial: initials(nombre), rol: m.rol as string, esYo: !!me && id === me,
            creadas: a.creadas, enviadas: a.enviadas, cerradas: a.cerradas,
            tasaCierre: a.enviadas ? Math.round((a.cerradas / a.enviadas) * 100) : 0,
            cerradoTotal: a.cerradoTotal, cobradoTotal: a.cobradoTotal,
            diasCierre: Math.round(a.diasCierre * 10) / 10,
            ticketPromedio: a.cerradas ? a.cerradoTotal / a.cerradas : 0,
        };
    }).sort((a, b) => b.cerradoTotal - a.cerradoTotal);

    // Cotizaciones de miembros que ya no están activos (revocados/eliminados) o de
    // antes de existir este campo (creado_por null) — se agrupan aparte para no
    // perder el dinero de la vista general sin atribuírselo a alguien equivocado.
    let sinAsignar: Agg = { creadas: 0, enviadas: 0, cerradas: 0, cerradoTotal: 0, diasCierre: 0, cobradoTotal: 0 };
    for (const [id, a] of aggMap) {
        if (seen.has(id)) continue;
        sinAsignar.creadas += a.creadas; sinAsignar.enviadas += a.enviadas; sinAsignar.cerradas += a.cerradas;
        sinAsignar.cerradoTotal += a.cerradoTotal; sinAsignar.cobradoTotal += a.cobradoTotal;
    }
    sinAsignar.cerradoTotal += num(sinCreadorRows[0]?.sin_creador);

    return {
        vendedores,
        sinAsignar: {
            cerradoTotal: sinAsignar.cerradoTotal, cobradoTotal: sinAsignar.cobradoTotal,
            n: sinAsignar.creadas,
        },
        totalCerrado: vendedores.reduce((s, v) => s + v.cerradoTotal, 0) + sinAsignar.cerradoTotal,
        hayDatos: vendedores.some((v) => v.creadas > 0) || sinAsignar.creadas > 0,
    };
}

// ── INTELIGENCIA DE PRICING (precio sugerido por historial real) ──────────────
// Win-rate por banda de descuento (0/5/10/15/20/25+%) sobre el historial YA
// decidido de la org (aprobada/pagada/facturada = ganada; rechazada/vencida =
// perdida; sent/viewed/draft se excluyen por no tener veredicto). Prioriza el
// historial del PRODUCTO exacto; si no hay suficiente muestra cae al historial
// del CLIENTE (cualquier producto); si tampoco alcanza, cae a la org completa.
// Solo lectura — no escribe nada ni afecta el flujo de cotizar.
export type PricingBand = { band: number; winRate: number; sample: number };
export type PricingSuggestion = {
    scope: 'producto' | 'cliente' | 'org' | null;
    confidence: 'alta' | 'media' | null;
    sampleSize: number;
    bands: PricingBand[];
    suggestedDiscountPct: number | null;
    suggestedPrice: number | null;
};

const PRICING_MIN_SCOPE_SAMPLE = 3; // mínimo de cotizaciones decididas para confiar en un scope
const PRICING_TARGET_WIN_RATE = 0.6; // banda mínima aceptable al elegir el descuento sugerido

export async function getPricingSuggestion(opts: { productoId?: string | null; clienteId?: string | null; precioLista: number }): Promise<PricingSuggestion> {
    const orgId = await getActiveOrgId();
    if (!(await checkEntitlement(orgId, 'advanced_forecast')).ok) {
        return { scope: null, confidence: null, sampleSize: 0, bands: [], suggestedDiscountPct: null, suggestedPrice: null };
    }
    const productoId = opts.productoId || null;
    const clienteId = opts.clienteId || null;
    const key = `pricing:${orgId}:${productoId ?? '-'}:${clienteId ?? '-'}`;
    const rows = await cached(key, 60, () => getPricingRowsUncached(orgId, productoId, clienteId));
    return buildPricingSuggestion(rows, opts.precioLista);
}

async function getPricingRowsUncached(orgId: string, productoId: string | null, clienteId: string | null) {
    const [rows] = await withOrgTx(orgId,
        sql`select
                band,
                count(*) filter (where won) as won_all, count(*) as total_all,
                count(*) filter (where won and producto_match) as won_prod,
                count(*) filter (where producto_match) as total_prod,
                count(*) filter (where won and cliente_match) as won_cli,
                count(*) filter (where cliente_match) as total_cli
            from (
                select
                    least(50, greatest(0, floor(
                        (it.precio_unitario - coalesce(it.precio_negociado, it.precio_unitario))
                        / nullif(it.precio_unitario, 0) * 100 / 5
                    ) * 5)) as band,
                    (c.status in ('approved','paid','invoiced') and coalesce(it.aprobado, true)) as won,
                    (${productoId}::uuid is not null and it.producto_id = ${productoId}::uuid) as producto_match,
                    (${clienteId}::uuid is not null and c.cliente_id = ${clienteId}::uuid) as cliente_match
                from cotizacion_items it
                join cotizaciones c on c.id = it.cotizacion_id
                where c.org_id = ${orgId}
                  and c.status in ('approved','paid','invoiced','rejected','expired')
                  and it.precio_unitario > 0
            ) x
            group by band
            order by band`,
    );
    return rows as any[];
}

function buildPricingSuggestion(rows: any[], precioLista: number): PricingSuggestion {
    const mk = (wonKey: string, totalKey: string): PricingBand[] =>
        rows
            .map(r => ({ band: num(r.band), winRate: num(r[totalKey]) ? num(r[wonKey]) / num(r[totalKey]) : 0, sample: num(r[totalKey]) }))
            .filter(b => b.sample > 0);

    const scopes: Array<{ name: 'producto' | 'cliente' | 'org'; bands: PricingBand[] }> = [
        { name: 'producto', bands: mk('won_prod', 'total_prod') },
        { name: 'cliente', bands: mk('won_cli', 'total_cli') },
        { name: 'org', bands: mk('won_all', 'total_all') },
    ];

    for (const scope of scopes) {
        const sampleSize = scope.bands.reduce((s, b) => s + b.sample, 0);
        if (sampleSize < PRICING_MIN_SCOPE_SAMPLE) continue;

        const sorted = [...scope.bands].sort((a, b) => a.band - b.band);
        let pick = sorted.find(b => b.winRate >= PRICING_TARGET_WIN_RATE);
        if (!pick) {
            pick = sorted.reduce((best, b) => (b.winRate > best.winRate || (b.winRate === best.winRate && b.band < best.band)) ? b : best, sorted[0]);
        }

        return {
            scope: scope.name,
            confidence: sampleSize >= 10 ? 'alta' : 'media',
            sampleSize,
            bands: sorted,
            suggestedDiscountPct: pick.band,
            suggestedPrice: Math.round(precioLista * (1 - pick.band / 100) * 100) / 100,
        };
    }

    return { scope: null, confidence: null, sampleSize: 0, bands: [], suggestedDiscountPct: null, suggestedPrice: null };
}

// ── GUÍA DE CONFIGURACIÓN ─────────────────────────────────────────────────────
export async function getSetupProgress() {
    const orgId = await getActiveOrgId();
    const [[o]] = await withOrgTx(orgId, sql`select logo_url, email_contacto, telefono, rfc, color_marca,
        pdf_mensaje, pdf_condiciones, portal_bienvenida, stripe_charges_enabled from orgs where id = ${orgId}`);
    // Señales de avance en un solo batch (mismas tablas multi-tenant → seguras bajo RLS).
    const [[{ np }], [{ nc }], [{ nq }], [{ nsent }], [{ ncobro }], [{ nmem }]] = await withOrgTx(orgId,
        sql`select count(*)::int as np from productos where org_id = ${orgId}`,
        sql`select count(*)::int as nc from clientes where org_id = ${orgId}`,
        sql`select count(*)::int as nq from cotizaciones where org_id = ${orgId}`,
        sql`select count(*)::int as nsent from cotizaciones where org_id = ${orgId} and status <> 'draft'`,
        sql`select count(*)::int as ncobro from cotizaciones where org_id = ${orgId} and status in ('paid','invoiced')`,
        sql`select count(*)::int as nmem from org_members where org_id = ${orgId} and estado in ('activo','invitado')`,
    );
    // Onboarding tipo Stripe: SECCIONES (grupos) con sub-pasos anidados. Cada
    // grupo representa una etapa del ciclo (preparar → catálogo → vender → cobrar
    // → escalar); el widget muestra el sub-progreso de cada grupo y abre el
    // primero incompleto. `group` etiqueta a qué sección pertenece cada paso.
    const groupsDef = [
        { id: 'negocio',  label: 'Prepara tu negocio',      icon: 'store',   desc: 'Deja tu marca y tus datos fiscales listos para verte profesional en cada cotización.' },
        { id: 'catalogo', label: 'Arma tu catálogo',        icon: 'box',     desc: 'Carga lo que vendes y a quién se lo vendes para cotizar en segundos.' },
        { id: 'venta',    label: 'Cierra tu primera venta',  icon: 'send',    desc: 'Crea, envía y mira en vivo cómo tu cliente abre y aprueba con firma.' },
        { id: 'dinero',   label: 'Recibe tu dinero',         icon: 'wallet',  desc: 'Cobra en línea, factura el CFDI y cierra el ciclo completo.' },
        { id: 'equipo',   label: 'Crece tu operación',       icon: 'users',   desc: 'Suma a tu equipo con permisos por rol cuando estés listo para escalar.' },
    ] as const;

    const tasks = [
        { group: 'negocio',  id: 'marca',         label: 'Personaliza tu marca',        desc: 'Sube tu logo, elige tu color y agrega tus datos de contacto — aparecen en cada cotización, PDF y en el link de tu cliente.', href: '/app/ajustes/branding',    done: !!(o?.logo_url || o?.email_contacto || o?.telefono) },
        { group: 'negocio',  id: 'fiscal',        label: 'Completa tus datos fiscales', desc: 'RFC, régimen fiscal y código postal: necesarios para timbrar CFDI 4.0 válidos ante el SAT.', href: '/app/ajustes/fiscal',     done: !!o?.rfc },
        { group: 'negocio',  id: 'documento',     label: 'Personaliza tu PDF y portal', desc: 'Elige plantilla de PDF, escribe tu mensaje y condiciones, y ajusta el portal que ve tu cliente. Todo con vista previa.', href: '/app/ajustes/pdf',        done: !!(o?.pdf_mensaje || o?.pdf_condiciones || o?.portal_bienvenida) },
        { group: 'catalogo', id: 'productos',     label: 'Crea tu catálogo',            desc: 'Agrega los productos o servicios que vendes, con su costo para ver el margen. Puedes importarlos en lote por CSV.', href: '/app/productos',          done: Number(np) > 0 },
        { group: 'catalogo', id: 'clientes',      label: 'Agrega tus clientes',         desc: 'A quién le cotizas, con sus términos de pago (contado o crédito), nivel de precios y límite de crédito.', href: '/app/clientes',           done: Number(nc) > 0 },
        { group: 'venta',    id: 'cotizacion',    label: 'Crea tu primera cotización',  desc: 'El corazón de Cord — elige un cliente, agrega líneas y guarda. Puedes armarla con IA pegando el pedido. Te toma 2 minutos.', href: '/app/cotizaciones/nueva', done: Number(nq) > 0 },
        { group: 'venta',    id: 'enviar',        label: 'Envía tu primera cotización', desc: 'Compártela por link, correo o WhatsApp y mira EN VIVO cuándo tu cliente la abre y la aprueba con firma electrónica.', href: '/app/cotizaciones',       done: Number(nsent) > 0 },
        { group: 'dinero',   id: 'online_cobros', label: 'Activa los cobros en línea',  desc: 'Conecta tu cuenta bancaria de forma segura para recibir pagos con tarjeta o SPEI directo a tu banco — incluye anticipos.', href: '/app/ajustes/cobros',     done: !!o?.stripe_charges_enabled },
        { group: 'dinero',   id: 'cobro',         label: 'Cobra y factura',             desc: 'Cobra en línea con Cord Payments o márcala como pagada, factura el CFDI 4.0 y cierra el ciclo de venta en Cobranza.', href: '/app/cobranza',           done: Number(ncobro) > 0 },
        { group: 'equipo',   id: 'equipo',        label: 'Invita a tu equipo',          desc: 'Suma vendedores y define permisos por rol (cotizar, aprobar, cobranza…) para trabajar en conjunto.', href: '/app/ajustes/equipo',     done: Number(nmem) > 1 },

    ];

    // Agrupa los pasos y calcula el sub-progreso de cada sección.
    const groups = groupsDef.map((g) => {
        const gTasks = tasks.filter((t) => t.group === g.id);
        const gDone = gTasks.filter((t) => t.done).length;
        return { ...g, tasks: gTasks, doneN: gDone, total: gTasks.length, done: gDone === gTasks.length };
    });

    const doneN = tasks.filter((t) => t.done).length;
    return { groups, tasks, doneN, total: tasks.length, pct: Math.round((doneN / tasks.length) * 100), complete: doneN === tasks.length };
}

// ── BADGES DE LA SIDEBAR ──────────────────────────────────────────────────────
export async function getSidebarBadges() {
    const zero = { seguimiento: 0, vencidas: 0, porAprobar: 0 };
    try {
        const orgId = await getActiveOrgId();
        const [[r], [a]] = await withOrgTx(orgId,
            sql`select
                    count(*) filter (where status in ('sent','viewed')) as seguimiento,
                    count(*) filter (where status in ('approved','invoiced') -- canon: STATUS_POR_COBRAR
                        and es_recurrente is not true
                        and (coalesce(approved_at, created_at)
                            + make_interval(days => case terminos
                                when 'net30' then 30 when 'net60' then 60 else 0 end)) < now()) as vencidas
                from cotizaciones where org_id = ${orgId}`,
            sql`select count(*)::int as n from cotizaciones
                where org_id = ${orgId} and aprob_estado = 'pendiente'`,
        );
        return {
            seguimiento: Number(r?.seguimiento ?? 0),
            vencidas: Number(r?.vencidas ?? 0),
            porAprobar: Number(a?.n ?? 0),
        };
    } catch { return zero; }
}

// ════════════════════════════════════════════════════════════════════════════
// Cobranza con IA — read-model de /app/cobranza/agente (ago 2026)
//
// Antes la página hacía DOS queries SQL crudas inline (sin withOrgTx) y pintaba
// un feed plano de 50 mensajes: cero KPIs, cero acciones, y los planes de pago
// negociados —la pieza más sólida del sistema— no se mostraban en ninguna parte.
// ════════════════════════════════════════════════════════════════════════════

export interface CobranzaIAMensaje {
    id: string; autor: 'agente_ia' | 'cliente' | 'usuario'; mensaje: string;
    estado: string; editado: boolean; fecha: string; fechaISO: string; error: string | null;
}
export interface CobranzaIAHilo {
    cotizacionId: string; folio: string; empresa: string; inicial: string;
    saldo: number; diasVencido: number; overdue: boolean; token: string;
    email: string | null; nMensajes: number; ultimoISO: string;
    excluida: boolean; mensajes: CobranzaIAMensaje[];
}

export async function getCobranzaIA() {
    const orgId = await getActiveOrgId();
    if (!(await checkEntitlement(orgId, 'collections_ai')).ok) throw new Error('subscription_required:collections_ai');
    return cached(`cobranza-ia:${orgId}`, 30, getCobranzaIAUncached);
}

async function getCobranzaIAUncached() {
    const orgId = await getActiveOrgId();
    const { getCobranzaConfig, runCobranzaOrg } = await import('./agents/cobranza-run');
    const config = await getCobranzaConfig(orgId);

    const [convRows, planRows, exclRows, recuperadoRows, actividadRows] = await withOrgTx(orgId,
        // Conversaciones de las cotizaciones que siguen vivas. Se acotan a 400
        // mensajes: un hilo de cobranza real tiene 3-6, así que esto cubre ~70
        // cuentas activas sin traer el histórico completo de la org.
        sql`select cc.id, cc.cotizacion_id, cc.autor_tipo, cc.mensaje, cc.estado, cc.editado,
                   cc.error, cc.created_at, cc.enviado_at,
                   c.folio, c.total, c.public_token, c.paid_at, c.status,
                   cl.empresa, cl.email as cliente_email, cl.id as cliente_id,
                   coalesce((select sum(monto) from cotizacion_cobros
                             where cotizacion_id = c.id and status = 'pagado'), 0) as pagado,
                   floor(date_part('day', now() - (
                     coalesce(c.approved_at, c.created_at)
                     + make_interval(days => case coalesce(c.terminos, cl.terminos_default, 'contado')
                         when 'net30' then 30 when 'net60' then 60 else 0 end)
                   )))::int as dias_vencido,
                   exists(select 1 from cobranza_exclusiones x where x.org_id = cc.org_id
                          and (x.cotizacion_id = c.id or x.cliente_id = c.cliente_id)) as excluida
            from cobranza_conversaciones cc
            join cotizaciones c on c.id = cc.cotizacion_id
            join clientes cl on cl.id = c.cliente_id
            where cc.org_id = ${orgId} and cc.estado <> 'descartado'
            order by cc.created_at desc
            limit 400`,

        // Planes negociados + avance real de cuotas.
        sql`select p.id, p.cotizacion_id, p.cuotas, p.monto_cuota, p.estado, p.created_at,
                   c.folio, cl.empresa,
                   (select count(*) from cotizacion_cobros co
                    where co.cotizacion_id = p.cotizacion_id and co.tipo = 'cuota' and co.status = 'pagado') as pagadas,
                   (select min(vence) from cotizacion_cobros co
                    where co.cotizacion_id = p.cotizacion_id and co.tipo = 'cuota' and co.status = 'pendiente') as proxima
            from planes_pago_negociados p
            join cotizaciones c on c.id = p.cotizacion_id
            join clientes cl on cl.id = c.cliente_id
            where p.org_id = ${orgId} and p.estado in ('propuesto', 'activo')
            order by p.created_at desc
            limit 50`,

        sql`select x.id, x.cliente_id, x.cotizacion_id, x.motivo, x.created_at,
                   cl.empresa, c.folio
            from cobranza_exclusiones x
            left join clientes cl on cl.id = x.cliente_id
            left join cotizaciones c on c.id = x.cotizacion_id
            where x.org_id = ${orgId}
            order by x.created_at desc
            limit 100`,

        // LA MÉTRICA QUE JUSTIFICA EL FEATURE: dinero cobrado en los últimos 30
        // días de cotizaciones a las que el agente les había escrito ANTES del
        // pago. Sin este "antes" cualquier cobro contaría como mérito del agente.
        sql`select coalesce(sum(co.monto), 0) as recuperado, count(distinct co.cotizacion_id) as cuentas
            from cotizacion_cobros co
            where co.org_id = ${orgId} and co.status = 'pagado'
              and co.paid_at >= now() - interval '30 days'
              and exists (select 1 from cobranza_conversaciones cc
                          where cc.cotizacion_id = co.cotizacion_id
                            and cc.estado = 'enviado'
                            and cc.enviado_at < co.paid_at)`,

        sql`select
              count(*) filter (where estado = 'enviado' and created_at >= now() - interval '30 days') as enviados30,
              count(*) filter (where estado = 'borrador') as borradores,
              count(*) filter (where estado = 'fallido' and created_at >= now() - interval '30 days') as fallidos30,
              count(*) filter (where autor_tipo = 'cliente' and created_at >= now() - interval '30 days') as respuestas30,
              count(*) filter (where estado = 'enviado' and editado = false and aprobado_at is not null) as aprobados_sin_editar,
              max(enviado_at) as ultimo_envio
            from cobranza_conversaciones where org_id = ${orgId}`,
    );

    // ── Agrupar por cotización (antes era un feed plano sin hilo) ──
    const hilosMap = new Map<string, CobranzaIAHilo>();
    const pendientes: any[] = [];
    for (const r of convRows as any[]) {
        const saldo = Math.max(0, num(r.total) - num(r.pagado));
        const dias = Math.max(0, Number(r.dias_vencido) || 0);
        let h = hilosMap.get(r.cotizacion_id);
        if (!h) {
            h = {
                cotizacionId: r.cotizacion_id, folio: r.folio, empresa: r.empresa,
                inicial: String(r.empresa || '?').charAt(0).toUpperCase(),
                saldo, diasVencido: dias, overdue: dias > 0, token: r.public_token,
                email: r.cliente_email ?? null, nMensajes: 0,
                ultimoISO: new Date(r.created_at).toISOString(),
                excluida: !!r.excluida, mensajes: [],
            };
            hilosMap.set(r.cotizacion_id, h);
        }
        h.nMensajes++;
        h.mensajes.push({
            id: r.id, autor: r.autor_tipo, mensaje: r.mensaje, estado: r.estado,
            editado: !!r.editado, error: r.error ?? null,
            fecha: fmtFecha(r.created_at), fechaISO: new Date(r.created_at).toISOString(),
        });
        if (r.estado === 'borrador') {
            pendientes.push({
                id: r.id, cotizacionId: r.cotizacion_id, folio: r.folio, empresa: r.empresa,
                inicial: String(r.empresa || '?').charAt(0).toUpperCase(),
                saldo, diasVencido: dias, mensaje: r.mensaje, editado: !!r.editado,
                email: r.cliente_email ?? null, token: r.public_token,
                fecha: fmtFecha(r.created_at), fechaISO: new Date(r.created_at).toISOString(),
            });
        }
    }
    // La query viene DESC (lo más reciente primero) para poder cortar en 400; el
    // hilo se lee al revés.
    for (const h of hilosMap.values()) h.mensajes.reverse();
    const hilos = [...hilosMap.values()].sort((a, b) => b.ultimoISO.localeCompare(a.ultimoISO));
    pendientes.sort((a, b) => (b.saldo * Math.max(1, b.diasVencido)) - (a.saldo * Math.max(1, a.diasVencido)));

    const planPropuestoPorCot = new Map<string, any>();
    const planes = (planRows as any[]).map((p) => {
        const plan = {
            id: p.id, cotizacionId: p.cotizacion_id, folio: p.folio, empresa: p.empresa,
            cuotas: Number(p.cuotas), montoCuota: num(p.monto_cuota), estado: p.estado as string,
            pagadas: Number(p.pagadas ?? 0),
            proxima: p.proxima ? fmtFecha(p.proxima) : null,
            comprometido: num(p.monto_cuota) * Number(p.cuotas),
        };
        if (p.estado === 'propuesto') planPropuestoPorCot.set(p.cotizacion_id, plan);
        return plan;
    });
    // El borrador enseña el plan que PROPONE, para que quien aprueba sepa que
    // está autorizando cuotas reales y no solo un correo.
    for (const p of pendientes) p.plan = planPropuestoPorCot.get(p.cotizacionId) ?? null;

    const exclusiones = (exclRows as any[]).map((x) => ({
        id: x.id, clienteId: x.cliente_id, cotizacionId: x.cotizacion_id,
        etiqueta: x.empresa ?? x.folio ?? '—',
        tipo: x.cliente_id ? 'cliente' : 'cotizacion',
        motivo: x.motivo ?? null, fecha: fmtFecha(x.created_at),
    }));

    // "En la mira": a quién le tocaría en la próxima corrida y a quién no, con el
    // motivo. Es un dry-run del motor real, no una reimplementación.
    let enLaMira: { procesadas: number; omitidas: { cotizacionId: string; folio: string; empresa: string; motivo: string }[] } =
        { procesadas: 0, omitidas: [] };
    try {
        const dry = await runCobranzaOrg(orgId, { dryRun: true });
        enLaMira = { procesadas: dry.procesadas, omitidas: dry.omitidas };
    } catch { /* el dry-run es informativo: si falla, la página se pinta igual */ }

    const act = (actividadRows as any[])[0] ?? {};
    const rec = (recuperadoRows as any[])[0] ?? {};
    const enviados30 = Number(act.enviados30 ?? 0);
    const metricas = {
        recuperado30d: num(rec.recuperado),
        cuentasRecuperadas: Number(rec.cuentas ?? 0),
        enviados30d: enviados30,
        respuestas30d: Number(act.respuestas30 ?? 0),
        tasaRespuesta: enviados30 > 0 ? Math.round((Number(act.respuestas30 ?? 0) / enviados30) * 100) : 0,
        fallidos30d: Number(act.fallidos30 ?? 0),
        borradores: Number(act.borradores ?? 0),
        aprobadosSinEditar: Number(act.aprobados_sin_editar ?? 0),
        ultimoEnvio: act.ultimo_envio ? fmtFecha(act.ultimo_envio) : null,
        ultimoEnvioISO: act.ultimo_envio ? new Date(act.ultimo_envio).toISOString() : null,
        planesActivos: planes.filter((p) => p.estado === 'activo').length,
        comprometido: planes.filter((p) => p.estado === 'activo').reduce((s, p) => s + p.comprometido, 0),
    };

    return { config, pendientes, hilos, planes, exclusiones, enLaMira, metricas };
}

/**
 * Estado de cuenta de un cliente: sus facturas abiertas y su antigüedad.
 *
 * La ficha del cliente mostraba cotizaciones y nada más. Un cliente que debe
 * dinero se ve igual que uno que no, y para decidir si le vendes otra vez
 * necesitas exactamente lo contrario: cuánto debe, desde cuándo, y si eso ya
 * pasó de tarde a incobrable.
 *
 * Se lee de `cuentas_por_cobrar`, la misma vista que alimenta la cobranza, para
 * que el saldo que ve el vendedor aquí sea el mismo que persigue el agente.
 */
export async function getEstadoCuentaCliente(clienteId: string) {
    const orgId = await getActiveOrgId();
    try {
        const [rows] = await withOrgTx(orgId, sql`
            select origen, ref_id, folio, moneda, total, pagado, saldo, vence, dias_vencido, token
              from cuentas_por_cobrar
             where org_id = ${orgId} and cliente_id = ${clienteId}
             order by dias_vencido desc, vence asc nulls last
             limit 100`);

        const docs = rows.map((r: any) => ({
            origen: String(r.origen) as 'factura' | 'cotizacion',
            id: String(r.ref_id),
            folio: (r.folio as string) || '—',
            moneda: normalizeCurrency(r.moneda),
            total: num(r.total),
            pagado: num(r.pagado),
            saldo: num(r.saldo),
            vence: r.vence ? fmtDate(r.vence) : null,
            diasVencido: Math.trunc(num(r.dias_vencido)),
            token: (r.token as string) || null,
        }));

        // Antigüedad estándar de cartera. Las bandas se calculan sobre el SALDO,
        // no sobre el total: un documento abonado al 80% pertenece a su banda con
        // lo que queda, no con lo que costó.
        const bandas = { corriente: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90mas: 0 };
        for (const d of docs) {
            if (d.diasVencido <= 0) bandas.corriente += d.saldo;
            else if (d.diasVencido <= 30) bandas.d1_30 += d.saldo;
            else if (d.diasVencido <= 60) bandas.d31_60 += d.saldo;
            else if (d.diasVencido <= 90) bandas.d61_90 += d.saldo;
            else bandas.d90mas += d.saldo;
        }

        return {
            docs,
            bandas,
            saldoTotal: docs.reduce((s, d) => s + d.saldo, 0),
            vencido: docs.filter((d) => d.diasVencido > 0).reduce((s, d) => s + d.saldo, 0),
            masViejo: docs.reduce((m, d) => Math.max(m, d.diasVencido), 0),
        };
    } catch {
        // La vista puede no existir todavía en una base sin migrar: la ficha del
        // cliente no debe caerse por eso.
        return { docs: [], bandas: { corriente: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90mas: 0 }, saldoTotal: 0, vencido: 0, masViejo: 0 };
    }
}

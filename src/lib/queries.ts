// src/lib/queries.ts
// Capa de datos REAL sobre Neon. Devuelve exactamente los mismos shapes que
// src/lib/mock.ts para que las páginas sólo cambien el import + un `await`.
// Re-exporta los helpers puros y STATUS_META del mock (no se duplican).

import { sql, getActiveOrgId, withOrgTx, withPublicToken } from './db';
import { currentUserId, currentOrgIdOverride } from './context';
import { dispatchQuoteEvent } from './webhooks';
import { memberCan, type Membership, type PermKey, type PermMap } from './permissions';
import { INCLUDED } from './billing';
import { cached } from './cache';
import { after } from './after';
import {
    STATUS_META, IVA, money, lineTotal, quoteSubtotal, quoteIva, quoteTotal,
    type QuoteStatus, type MockItem, type MockEvent, type MockQuote,
} from './mock';

export { STATUS_META, IVA, money, lineTotal, quoteSubtotal, quoteIva, quoteTotal };
export type { QuoteStatus, MockItem, MockEvent, MockQuote };

// ── Formatters (Postgres → display, igual que el mock hardcodeaba) ──────────
const num = (v: unknown) => Number(v ?? 0);

const initials = (nombre: string) =>
    nombre.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '—';

const TERM_LABEL: Record<string, MockQuote['terminos']> = {
    contado: 'Contado', net30: 'Net 30', net60: 'Net 60',
};
const termLabel = (t: string | null) => TERM_LABEL[t ?? 'contado'] ?? 'Contado';

const fmtDate = (d: string | Date | null) => {
    if (!d) return '—';
    const date = typeof d === 'string' ? new Date(d) : d;
    return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })
        .format(date).replace('.', '');
};

const fmtRelative = (d: string | Date) => {
    const date = typeof d === 'string' ? new Date(d) : d;
    const now = new Date();
    const hhmm = new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
    const sameDay = date.toDateString() === now.toDateString();
    const yest = new Date(now); yest.setDate(now.getDate() - 1);
    const isYest = date.toDateString() === yest.toDateString();
    if (sameDay) return `hoy, ${hhmm}`;
    if (isYest) return `ayer, ${hhmm}`;
    const md = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' }).format(date).replace('.', '');
    return `${md}, ${hhmm}`;
};

// ── ORG ─────────────────────────────────────────────────────────────────────
const PLAN_LABEL: Record<string, string> = { free: 'Gratis', starter: 'Starter', basico: 'Básico', pro: 'Profesional', scale: 'Scale', developer: 'Developer', negocio: 'Negocio', business: 'Negocio' };

// orgs no tiene FORCE RLS — el rol dueño bypasea. No necesita withOrgTx.
export async function getOrg() {
    const orgId = await getActiveOrgId();
    const [o] = await sql`select * from orgs where id = ${orgId}`;
    return {
        id: orgId,
        nombre: o.nombre as string,
        inicial: initials(o.nombre),
        rfc: (o.rfc as string) ?? '',
        razonSocial: (o.razon_social as string) ?? '',
        email: (o.email_contacto as string) ?? '',
        telefono: (o.telefono as string) ?? '',
        direccion: (o.direccion as string) ?? '',
        plan: PLAN_LABEL[o.plan] ?? 'Gratis',
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
        interesMoratorioPct: num(o.interes_moratorio_pct),
        plan_raw: (o.plan as string) || 'free',
        vigenciaDefaultDias: num(o.vigencia_default_dias) || 30,
        terminosDefault: (o.terminos_default as string) || 'contado',
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
        zonaHoraria: (o.zona_horaria as string) || 'America/Mexico_City',
        idioma: (o.idioma as string) || 'es-MX',
        colorSecundario: (o.color_secundario as string) || '',
        portalBienvenida: (o.portal_bienvenida as string) ?? '',
        notifPrefs: (o.notif_prefs as Record<string, Record<string, boolean>>) ?? {},
        slackWebhook: (o.slack_webhook_url as string) ?? '',
        integraciones: (o.integraciones as Record<string, boolean>) ?? {},
        aiCobranzaActiva: (o.ai_cobranza_activa as boolean) ?? false,
        csdEstado: (o.csd_estado as string) ?? '',
        csdNombre: (o.csd_nombre as string) ?? '',
        require2fa: (o.require_2fa as boolean) ?? false,
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
        secretMasked: `${String(w.secret).slice(0, 10)}${'•'.repeat(14)}`,
        activo: !!w.activo,
        lastStatus: w.last_status as number | null,
        lastError: (w.last_error as string) ?? null,
        ultimaEntrega: w.last_delivery_at ? fmtRelative(w.last_delivery_at) : null,
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
        })),
        total24: (stats.total as number) ?? 0,
        errores24: (stats.errores as number) ?? 0,
        latProm: (stats.p_lat as number) ?? 0,
    };
}

// ── IMPUESTOS (perfiles de tasa reutilizables — FASE 3) ──────────────────────
export const TIPO_IMPUESTO: Record<string, string> = {
    iva: 'IVA', ieps: 'IEPS', ret_iva: 'Retención IVA', ret_isr: 'Retención ISR', exento: 'Exento',
};
export async function getImpuestos() {
    const orgId = await getActiveOrgId();
    let rows: any[] = [];
    try {
        [rows] = await withOrgTx(orgId, sql`select * from impuestos where org_id = ${orgId} order by es_default desc, tipo, tasa desc`);
    } catch { return []; }
    return rows.map((i) => ({
        id: i.id as string,
        nombre: i.nombre as string,
        tipo: (i.tipo as string) || 'iva',
        tipoLabel: TIPO_IMPUESTO[(i.tipo as string)] || 'IVA',
        tasa: num(i.tasa),
        esDefault: !!i.es_default,
        activo: !!i.activo,
    }));
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
    const [o] = await sql`select coalesce(plan,'free') as plan from orgs where id = ${orgId}`;
    const plan = (o?.plan as string) || 'free';
    const [[{ activas }]] = await withOrgTx(orgId,
        sql`select count(*)::int as activas from cotizaciones
            where org_id = ${orgId} and status not in ('rejected', 'expired')`,
    );
    const limite = plan === 'free' ? 5 : plan === 'starter' ? 50 : null;
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
    const [o] = await sql`select coalesce(plan,'free') as plan, subscription_status, billing_cycle, current_period_end from orgs where id = ${orgId}`;
    const plan = (o?.plan as string) || 'free';
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
        ia: dim(Number(row.ia) || 0, inc.ia),
        cfdi: dim(Number(row.cfdi) || 0, inc.cfdi),
        api: dim(Number(row.api) || 0, inc.api),
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
        precio: num(p.precio_lista),
        costo: num(p.costo),
        activo: p.activo as boolean,
        // Matriz de precios por volumen: [{min, precio}] ordenada asc por min.
        preciosVolumen: normVolumen(p.precios_volumen),
    }));
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

// ── CLIENTES ──────────────────────────────────────────────────────────────────
export async function getClientes() {
    const orgId = await getActiveOrgId();
    const [rows] = await withOrgTx(orgId, sql`select * from clientes where org_id = ${orgId} order by empresa`);
    return rows.map(c => ({
        id: c.id as string,
        empresa: c.empresa as string,
        contacto: (c.contacto as string) ?? '',
        email: (c.email as string) ?? '',
        rfc: (c.rfc as string) ?? '',
        terminos: termLabel(c.terminos_default as string),
        limite: num(c.limite_credito),
        inicial: initials(c.empresa),
        nivel: (c.nivel as string) || 'estandar',
        descuentoPct: num(c.descuento_pct),
        regimenFiscal: (c.regimen_fiscal as string) ?? '',
        usoCfdi: (c.uso_cfdi as string) ?? '',
        cpFiscal: (c.cp_fiscal as string) ?? '',
    }));
}

// ── COTIZACIONES ──────────────────────────────────────────────────────────────
function rowToQuote(c: any, items: any[], eventos: any[], versiones: any[] = []): MockQuote {
    return {
        id: c.id,
        folio: c.folio,
        cliente: c.empresa ?? 'Sin cliente',
        clienteInicial: initials(c.empresa ?? '—'),
        status: c.status as QuoteStatus,
        terminos: termLabel(c.terminos),
        vigencia: fmtDate(c.vigencia),
        creada: fmtDate(c.created_at),
        token: c.public_token,
        notas: c.notas ?? undefined,
        aprobEstado: (c.aprob_estado as string) ?? null,
        aprobMotivo: (c.aprob_motivo as string) ?? null,
        total: num(c.total),
        version: num(c.version) || 1,
        iva_incluido: Boolean(c.iva_incluido),
        items: items.map((it): MockItem => ({
            id: it.id,
            descripcion: it.descripcion,
            cantidad: num(it.cantidad),
            unidad: it.unidad ?? 'pieza',
            precioLista: num(it.precio_unitario),
            precioNegociado: it.precio_negociado === null ? null : num(it.precio_negociado),
            aprobado: it.aprobado !== false,   // default true (sin columna o no decidido = incluida)
            comentarios: it.comentarios ?? [],
        })),
        eventos: eventos.map((e): MockEvent => ({
            tipo: e.tipo,
            detalle: e.detalle ?? '',
            cuando: fmtRelative(e.created_at),
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
    const [rows, items, eventos, versiones] = await withOrgTx(orgId,
        sql`select c.*, cl.empresa, coalesce(c.terminos, cl.terminos_default) as terminos
            from cotizaciones c left join clientes cl on cl.id = c.cliente_id
            where c.id = ${id} and c.org_id = ${orgId}`,
        sql`select * from cotizacion_items where cotizacion_id = ${id} order by orden`,
        sql`select * from eventos where cotizacion_id = ${id} order by created_at desc`,
        sql`select * from cotizacion_versiones where cotizacion_id = ${id} order by version desc`,
    );
    if (!rows.length) return null;
    return rowToQuote(rows[0], items, eventos, versiones);
}

// Documentos fiscales emitidos para una cotización (CFDI / invoice). Plain sql
// con filtro explícito por org (documentos_fiscales no tiene RLS FORCE).
export async function getDocumentosFiscales(cotizacionId: string) {
    const orgId = await getActiveOrgId();
    const rows = await sql`
        select id, country_code, document_type, fiscal_id, status, provider_data, pdf_url, xml_url, created_at
        from documentos_fiscales
        where cotizacion_id = ${cotizacionId} and org_id = ${orgId}
        order by created_at desc`;
    return rows.map((r: any) => ({
        id: r.id as string,
        pais: r.country_code as string,
        tipo: r.document_type as string,
        fiscalId: (r.fiscal_id as string) || null,
        status: r.status as string,
        simulado: !!(r.provider_data && (r.provider_data.simulado === true)),
        pdfUrl: (r.pdf_url as string) || null,
        xmlUrl: (r.xml_url as string) || null,
        creado: fmtDate(r.created_at as string),
    }));
}

// Link público — usa withPublicToken para satisfacer la política RLS de cotizaciones/items.
// Tres queries en un solo batch con el token como contexto de RLS.
export async function getCotizacionByToken(token: string) {
    const [rows, items, conv, comentarios, firmas] = await withPublicToken(token,
        sql`select c.*, cl.empresa, coalesce(c.terminos, cl.terminos_default) as terminos,
               o.nombre as org_nombre, o.rfc as org_rfc, o.color_marca as org_color,
               o.logo_url as org_logo_url,
               o.pdf_mensaje as org_pdf_mensaje, o.iva_pct as org_iva_pct,
               o.embed_domains as org_embed_domains,
               o.email_contacto as org_email, o.telefono as org_tel, o.whatsapp as org_wa,
               o.portal_banner as org_portal_banner, o.portal_bienvenida as org_portal_bienvenida,
               o.portal_mostrar_chat as org_portal_chat, o.portal_powered as org_portal_powered
            from cotizaciones c
            left join clientes cl on cl.id = c.cliente_id
            join orgs o on o.id = c.org_id
            where c.public_token = ${token}`,
        sql`select ci.* from cotizacion_items ci
            join cotizaciones c on c.id = ci.cotizacion_id
            where c.public_token = ${token} order by ci.orden`,
        sql`select e.tipo, e.detalle, e.created_at from eventos e
            join cotizaciones c on c.id = e.cotizacion_id
            where c.public_token = ${token} and e.tipo in ('comment', 'counter', 'reply')
            order by e.created_at asc`,
        sql`select cc.* from cotizacion_comentarios cc
            join cotizaciones c on c.id = cc.cotizacion_id
            where c.public_token = ${token} order by cc.created_at asc`,
        sql`select f.* from cotizacion_firmas f
            join cotizaciones c on c.id = f.cotizacion_id
            where c.public_token = ${token} order by f.firmado_en desc limit 1`
    );
    if (!rows.length) return null;
    
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

    // Días restantes de vigencia (para la cuenta regresiva del link público).
    if (rows[0].vigencia) {
        const venc = new Date(rows[0].vigencia as string);
        const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
        (quote as any).diasVigencia = Math.ceil((venc.getTime() - hoy.getTime()) / 86400000);
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
            portalPowered: (rows[0].org_portal_powered as boolean) ?? true,
        },
    };
}

// Marca 'viewed' la primera vez que el cliente abre el link.
// Fase 1: lee por token (contexto público). Fase 2: escribe por org_id (contexto tenant).
export async function markViewed(token: string) {
    const [[c]] = await withPublicToken(token,
        sql`select id, org_id, status from cotizaciones where public_token = ${token}`,
    );
    if (!c) return;
    await withOrgTx(c.org_id as string,
        sql`insert into eventos (org_id, cotizacion_id, tipo, detalle)
            values (${c.org_id}, ${c.id}, 'viewed', 'El cliente abrió el link')`,
        sql`update cotizaciones set status = 'viewed'
            where id = ${c.id} and status = 'sent'`,
    );
    // Fondo: no bloquear el render del link del cliente con el webhook saliente.
    after(dispatchQuoteEvent(c.org_id as string, c.id as string, 'quote.viewed'));
}

// ── ANALÍTICA (/app/analitica) ────────────────────────────────────────────────
// Seis queries en un solo batch HTTP — mejora significativa de latencia.
export async function getAnalytics() {
    // Cacheado ~30s: agregados de tendencia toleran staleness leve; recorta los
    // escaneos completos a Neon en recargas/navegación y bajo muchos usuarios.
    const orgId = await getActiveOrgId();
    return cached(`analytics:${orgId}`, 30, getAnalyticsUncached);
}
async function getAnalyticsUncached() {
    const orgId = await getActiveOrgId();

    const [kRows, meses, margRows, clientes, productos, plRows] = await withOrgTx(orgId,
        sql`select
                count(*) filter (where status in ('sent','viewed','approved','paid','invoiced')) as enviadas,
                count(*) filter (where status in ('viewed','approved','paid','invoiced')) as vistas,
                count(*) filter (where status in ('approved','paid','invoiced')) as aprobadas,
                count(*) filter (where status in ('paid','invoiced')) as pagadas,
                coalesce(sum(total) filter (where status in ('approved','paid','invoiced')),0) as cerrado_total,
                coalesce(avg(extract(epoch from (approved_at - created_at))/86400)
                         filter (where status in ('approved','paid','invoiced') and approved_at is not null),0) as dias_cierre
            from cotizaciones where org_id = ${orgId}`,
        sql`select to_char(date_trunc('month', created_at),'YYYY-MM') as ym,
                   coalesce(sum(total),0) as cotizado,
                   coalesce(sum(total) filter (where status in ('approved','paid','invoiced')),0) as cerrado
            from cotizaciones
            where org_id = ${orgId} and created_at >= date_trunc('month', now()) - interval '5 months'
            group by 1 order by 1`,
        sql`select coalesce(sum(it.precio_unitario * it.cantidad),0) as lista_total,
                   coalesce(sum(coalesce(it.precio_negociado, it.precio_unitario) * it.cantidad),0) as nego_total
            from cotizacion_items it
            join cotizaciones c on c.id = it.cotizacion_id
            where c.org_id = ${orgId} and c.status <> 'draft'`,
        sql`select cl.empresa,
                   coalesce(sum(c.total) filter (where c.status in ('approved','paid','invoiced')),0) as cerrado,
                   count(*) as cotizaciones,
                   count(*) filter (where c.status in ('approved','paid','invoiced')) as aprobadas
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
            listaTotal, negoTotal,
            cedido: Math.max(0, listaTotal - negoTotal),
            pct: listaTotal > 0 ? ((listaTotal - negoTotal) / listaTotal) * 100 : 0,
        },
        forecast: { sentTotal, viewedTotal, ponderado: sentTotal * 0.3 + viewedTotal * 0.5 },
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

// ── COBRANZA / CUENTAS POR COBRAR (/app/cobranza) ──────────────────────────────
export async function getCobranza() {
    const orgId = await getActiveOrgId();

    // orgs no tiene FORCE RLS.
    const [org] = await sql`select * from orgs where id = ${orgId}`;
    const rate = num(org?.interes_moratorio_pct);

    // Tres queries de datos en un solo batch.
    const [dlRows, rows, promRows] = await withOrgTx(orgId,
        sql`select coalesce(avg(extract(epoch from (e.paid_at - (coalesce(c.approved_at, c.created_at)
                + make_interval(days => case c.terminos when 'net30' then 30 when 'net60' then 60 else 0 end)))) / 86400), 0) as avg_delay
            from cotizaciones c
            join (select cotizacion_id, max(created_at) as paid_at from eventos where org_id = ${orgId} and tipo = 'paid' group by cotizacion_id) e
              on e.cotizacion_id = c.id
            where c.org_id = ${orgId} and c.status = 'paid'`,
        sql`select c.id, c.folio, c.total, c.terminos, c.status, c.public_token,
                   coalesce(c.approved_at, c.created_at) as base_date,
                   cl.empresa, cl.limite_credito, cl.telefono
            from cotizaciones c
            left join clientes cl on cl.id = c.cliente_id
            where c.org_id = ${orgId} and c.status in ('approved','invoiced')
            order by coalesce(c.approved_at, c.created_at) asc`,
        // Promesas de pago vigentes (pendientes) — la más reciente por cotización.
        sql`select cotizacion_id, id, fecha_promesa, monto, nota
            from promesas_pago
            where org_id = ${orgId} and estado = 'pendiente'
            order by created_at desc`,
    );

    // Mapa cotizacion_id → promesa pendiente más reciente.
    const promMap = new Map<string, any>();
    for (const p of promRows) { if (!promMap.has(p.cotizacion_id as string)) promMap.set(p.cotizacion_id as string, p); }

    const avgDelay = Math.round(num(dlRows[0]?.avg_delay));
    const DAYS: Record<string, number> = { contado: 0, net30: 30, net60: 60 };
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const MS = 86400000;

    const items = rows.map((r) => {
        const tot = num(r.total);
        const base = new Date(r.base_date as string);
        const due = new Date(base); due.setDate(due.getDate() + (DAYS[r.terminos as string] ?? 0));
        const diff = Math.floor((today.getTime() - due.getTime()) / MS);
        const overdue = diff > 0;
        const bucket = !overdue ? 'vigente' : diff <= 30 ? 'd30' : diff <= 60 ? 'd60' : 'd60p';
        const interes = overdue && rate > 0 ? tot * (Math.pow(1 + rate / 100, diff / 30) - 1) : 0;
        const expected = new Date(due); expected.setDate(expected.getDate() + avgDelay);
        const expDias = Math.round((expected.getTime() - today.getTime()) / MS);
        const prom = promMap.get(r.id as string);
        const fechaProm = prom ? String(prom.fecha_promesa).slice(0, 10) : '';
        return {
            id: r.id as string, folio: r.folio as string,
            empresa: (r.empresa as string) ?? 'Sin cliente',
            inicial: initials((r.empresa as string) ?? '—'),
            total: tot, terminos: termLabel(r.terminos as string),
            status: r.status as string, token: r.public_token as string,
            telefono: (r.telefono as string) ?? '',
            vence: fmtDate(due), overdue,
            diasVencido: overdue ? diff : 0, diasParaVencer: overdue ? 0 : -diff,
            bucket, interes: Math.round(interes),
            expectedFecha: fmtDate(expected), expectedDias: expDias,
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
    };
}

// ── CFO DASHBOARD (/app/cfo) ───────────────────────────────────────────────────
// Proyección de flujo de caja semanal. Cruza el pipeline abierto (sent/viewed)
// con el historial REAL por cliente: tasa de cierre (aprobadas / enviadas),
// días promedio a cierre (created→approved) y días a cobro (approved→paid).
export async function getCFO() {
    const orgId = await getActiveOrgId();
    return cached(`cfo:${orgId}`, 30, getCFOUncached);
}
async function getCFOUncached() {
    const orgId = await getActiveOrgId();

    const [activos, histRows, pagoRows] = await withOrgTx(orgId,
        // Pipeline abierto.
        sql`select c.id, c.folio, c.total, c.status, c.cliente_id,
                   coalesce(cl.empresa, 'Sin cliente') as empresa,
                   coalesce(c.viewer_last_seen, c.sent_at, c.created_at) as last_act
            from cotizaciones c
            left join clientes cl on cl.id = c.cliente_id
            where c.org_id = ${orgId} and c.status in ('sent','viewed')`,
        // Historial por cliente: tasa de cierre + días a cierre.
        sql`select c.cliente_id,
                   count(*) filter (where c.status in ('sent','viewed','approved','paid','invoiced')) as total_hist,
                   count(*) filter (where c.status in ('approved','paid','invoiced')) as aprob_hist,
                   coalesce(avg(extract(epoch from (c.approved_at - c.created_at))/86400)
                            filter (where c.status in ('approved','paid','invoiced') and c.approved_at is not null), 0) as avg_cierre
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
        const valorEsperado = Math.round(total * tasaPct / 100);
        const diasParaCobro = avgDiasCierre + avgDiasPago;
        const diasSilencio = Math.floor((today.getTime() - new Date(r.last_act as string).getTime()) / MS);
        return {
            id: r.id as string, folio: r.folio as string,
            empresa: r.empresa as string, status, total,
            tasaPct, valorEsperado, diasParaCobro,
            avgDiasCierre, avgDiasPago, diasSilencio,
            aprobHist: h?.aprobHist ?? 0, totalHist: h?.totalHist ?? 0,
        };
    }).sort((a, b) => b.valorEsperado - a.valorEsperado);

    // Proyección de flujo de caja: 5 cubetas semanales por días a cobro.
    const semLabels = ['Esta semana', 'Próxima semana', 'En 2 semanas', 'En 3 semanas', 'En 4+ semanas'];
    const semanas = semLabels.map((label, i) => ({ n: 0, label, valorEsperado: 0 }));
    for (const it of items) {
        const idx = Math.min(4, Math.max(0, Math.floor(it.diasParaCobro / 7)));
        semanas[idx].n += 1;
        semanas[idx].valorEsperado += it.valorEsperado;
    }
    const maxSemana = Math.max(1, ...semanas.map((s) => s.valorEsperado));

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

    const silenciadas = items
        .filter((i) => i.diasSilencio > 7)
        .sort((a, b) => b.diasSilencio - a.diasSilencio)
        .map((i) => ({ id: i.id, folio: i.folio, empresa: i.empresa, dias: i.diasSilencio, total: i.total }));

    return {
        items,
        kpis: { totalPipeline, totalEsperado, dso, concentracion, nSilenciadas: silenciadas.length },
        semanas, maxSemana, rankClientes, silenciadas,
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
    const quotes = await getCotizaciones();
    const porCerrar = quotes.filter(q => ['sent', 'viewed'].includes(q.status)).reduce((s, q) => s + (q.total ?? 0), 0);
    const cerradoMes = quotes.filter(q => ['approved', 'paid', 'invoiced'].includes(q.status)).reduce((s, q) => s + (q.total ?? 0), 0);
    const aprobadas = quotes.filter(q => ['approved', 'paid', 'invoiced'].includes(q.status)).length;
    const cerrables = quotes.filter(q => !['draft'].includes(q.status)).length;
    const tasaCierre = cerrables ? Math.round((aprobadas / cerrables) * 100) : 0;

    const [eventos] = await withOrgTx(orgId, sql`
        select e.tipo, e.detalle, e.created_at, c.folio, c.id as cotizacion_id
        from eventos e join cotizaciones c on c.id = e.cotizacion_id
        where e.org_id = ${orgId}
        order by e.created_at desc limit 7`);

    return {
        quotes, porCerrar, cerradoMes, tasaCierre,
        abiertas: quotes.filter(q => ['sent', 'viewed'].includes(q.status)).length,
        feed: eventos.map(e => ({
            tipo: e.tipo as string, detalle: e.detalle as string,
            cuando: fmtRelative(e.created_at as string),
            folio: e.folio as string, id: e.cotizacion_id as string,
        })),
    };
}

// ── EQUIPO Y ROLES ────────────────────────────────────────────────────────────
// org_members no tiene FORCE RLS — queries directas OK para bootstrap.
const fmtFecha = (d: unknown) => d ? new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(d as string)) : '';

export interface MemberRow {
    id: string;
    clerkUserId: string | null;
    email: string;
    nombre: string;
    rol: string;
    permisos: PermMap;
    estado: string;
    token: string | null;
    inicial: string;
    desde: string;
    esYo: boolean;
}

export async function getMembers(): Promise<MemberRow[]> {
    const orgId = await getActiveOrgId();
    const me = currentUserId();
    const rows = await sql`
        select id, clerk_user_id, email, nombre, rol, permisos, estado, token, created_at, joined_at
        from org_members where org_id = ${orgId} and estado <> 'revocado'
        order by case when rol = 'owner' then 0 else 1 end, created_at asc`;
    return rows.map((m) => {
        const nombre = (m.nombre as string) || (m.email as string) || 'Invitado';
        return {
            id: m.id as string,
            clerkUserId: (m.clerk_user_id as string) ?? null,
            email: (m.email as string) ?? '',
            nombre, rol: m.rol as string,
            permisos: (m.permisos as PermMap) ?? {},
            estado: m.estado as string,
            token: (m.token as string) ?? null,
            inicial: initials(nombre),
            desde: fmtFecha(m.joined_at || m.created_at),
            esYo: !!me && m.clerk_user_id === me,
        };
    });
}

export async function getMyMembership(): Promise<Membership> {
    const userId = currentUserId();
    // FAIL-CLOSED sin sesión Clerk. El único carril legítimo sin userId es M2M
    // (API key), donde currentOrgIdOverride() está seteado y la llave ya es dueña
    // de su org. Para cualquier otro caso (una ruta mal clasificada como pública,
    // un handler alcanzado sin sesión), NO asumir owner: devolver un principal sin
    // permisos para que requirePerm() deniegue en vez de autorizar como dueño.
    if (!userId) {
        if (currentOrgIdOverride()) return { rol: 'owner', permisos: {}, esOwner: true };
        return { rol: 'anon', permisos: {}, esOwner: false };
    }
    const orgId = await getActiveOrgId();
    try {
        const rows = await sql`select rol, permisos from org_members where org_id = ${orgId} and clerk_user_id = ${userId} and estado = 'activo' limit 1`;
        if (!rows.length) return { rol: 'owner', permisos: {}, esOwner: true };
        const m = rows[0];
        return { rol: m.rol as string, permisos: (m.permisos as PermMap) ?? {}, esOwner: m.rol === 'owner' };
    } catch { return { rol: 'owner', permisos: {}, esOwner: true }; }
}

export async function requirePerm(key: PermKey): Promise<Response | null> {
    const m = await getMyMembership();
    if (memberCan(m, key)) return null;
    return new Response(JSON.stringify({ error: 'No tienes permiso para esta acción.' }), {
        status: 403, headers: { 'Content-Type': 'application/json' },
    });
}

// ── GUÍA DE CONFIGURACIÓN ─────────────────────────────────────────────────────
export async function getSetupProgress() {
    const orgId = await getActiveOrgId();
    const [o] = await sql`select logo_url, email_contacto, telefono, rfc, color_marca,
        pdf_mensaje, pdf_condiciones, portal_bienvenida from orgs where id = ${orgId}`;
    // Señales de avance en un solo batch (mismas tablas multi-tenant → seguras bajo RLS).
    const [[{ np }], [{ nc }], [{ nq }], [{ nsent }], [{ ncobro }], [{ nmem }]] = await withOrgTx(orgId,
        sql`select count(*)::int as np from productos where org_id = ${orgId}`,
        sql`select count(*)::int as nc from clientes where org_id = ${orgId}`,
        sql`select count(*)::int as nq from cotizaciones where org_id = ${orgId}`,
        sql`select count(*)::int as nsent from cotizaciones where org_id = ${orgId} and status <> 'draft'`,
        sql`select count(*)::int as ncobro from cotizaciones where org_id = ${orgId} and status in ('paid','invoiced')`,
        sql`select count(*)::int as nmem from org_members where org_id = ${orgId} and estado in ('activo','invitado')`,
    );
    // Flujo de aprendizaje (orden = secuencia recomendada; el widget abre el primer
    // paso pendiente). Más pasos y más específicos para que la gente aprenda a usar
    // Cord de punta a punta: configurar → cotizar → enviar → cobrar → escalar.
    const tasks = [
        { id: 'marca',      label: 'Personaliza tu marca',        desc: 'Sube tu logo, elige tu color y agrega tus datos de contacto — aparecen en cada cotización, PDF y en el link de tu cliente.', href: '/app/ajustes/branding',    done: !!(o?.logo_url || o?.email_contacto || o?.telefono) },
        { id: 'fiscal',     label: 'Completa tus datos fiscales', desc: 'RFC, régimen fiscal y código postal: necesarios para timbrar CFDI 4.0 válidos ante el SAT.', href: '/app/ajustes/fiscal',     done: !!o?.rfc },
        { id: 'productos',  label: 'Crea tu catálogo',            desc: 'Agrega los productos o servicios que vendes. Puedes importarlos en lote por CSV.', href: '/app/productos',          done: Number(np) > 0 },
        { id: 'clientes',   label: 'Agrega tus clientes',         desc: 'A quién le cotizas, con sus términos de pago, nivel de precios y límite de crédito.', href: '/app/clientes',           done: Number(nc) > 0 },
        { id: 'cotizacion', label: 'Crea tu primera cotización',  desc: 'El corazón de Cord — elige un cliente, agrega líneas y guarda. Te toma 2 minutos.', href: '/app/cotizaciones/nueva', done: Number(nq) > 0 },
        { id: 'enviar',     label: 'Envía tu primera cotización', desc: 'Compártela por link, correo o WhatsApp y mira EN VIVO cuándo tu cliente la abre y la aprueba con firma.', href: '/app/cotizaciones',       done: Number(nsent) > 0 },
        { id: 'documento',  label: 'Personaliza tu PDF y portal', desc: 'Elige plantilla de PDF, escribe tu mensaje y condiciones, y ajusta el portal que ve tu cliente. Todo con vista previa.', href: '/app/ajustes/pdf',        done: !!(o?.pdf_mensaje || o?.pdf_condiciones || o?.portal_bienvenida) },
        { id: 'cobro',      label: 'Cobra y factura',             desc: 'Cobra en línea con Stripe o márcala como pagada, factura el CFDI 4.0 y cierra el ciclo de venta en Cobranza.', href: '/app/cobranza',           done: Number(ncobro) > 0 },
        { id: 'equipo',     label: 'Invita a tu equipo',          desc: 'Suma vendedores y define permisos por rol (cotizar, aprobar, cobranza…) para trabajar en conjunto.', href: '/app/ajustes/equipo',     done: Number(nmem) > 1 },
    ];
    const doneN = tasks.filter((t) => t.done).length;
    return { tasks, doneN, total: tasks.length, pct: Math.round((doneN / tasks.length) * 100), complete: doneN === tasks.length };
}

// ── BADGES DE LA SIDEBAR ──────────────────────────────────────────────────────
export async function getSidebarBadges() {
    const zero = { seguimiento: 0, vencidas: 0, porAprobar: 0 };
    try {
        const orgId = await getActiveOrgId();
        const [[r], [a]] = await withOrgTx(orgId,
            sql`select
                    count(*) filter (where status in ('sent','viewed')) as seguimiento,
                    count(*) filter (where status in ('approved','invoiced')
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

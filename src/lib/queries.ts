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
import { venceDia } from './cobros';
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
        aprobMargenMin: num(o.aprob_margen_min),
        interesMoratorioPct: num(o.interes_moratorio_pct),
        plan_raw: (o.plan as string) || 'free',
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
        stripeAccountId: (o.stripe_account_id as string) || null,
        stripeAccountType: (o.stripe_account_type as string) || null,
        stripeChargesEnabled: !!o.stripe_charges_enabled,
        aceptaTarjeta: o.acepta_tarjeta !== false,
        aceptaTransferencia: !!o.acepta_transferencia,
        cobroSpeiAuto: !!o.cobro_spei_auto,
        bancoNombre: (o.banco_nombre as string) || '',
        bancoClabe: (o.banco_clabe as string) || '',
        bancoBeneficiario: (o.banco_beneficiario as string) || '',
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
        version: num(c.version) || 1,
        iva_incluido: Boolean(c.iva_incluido),
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
        sql`select c.*, cl.empresa, coalesce(c.terminos, cl.terminos_default) as terminos
            from cotizaciones c left join clientes cl on cl.id = c.cliente_id
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

// Link público — usa withPublicToken para satisfacer la política RLS de cotizaciones/items.
// Tres queries en un solo batch con el token como contexto de RLS.
export async function getCotizacionByToken(token: string) {
    const [rows, items, conv, comentarios, firmas, cobrosRows, susRows] = await withPublicToken(token,
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
               o.stripe_account_id as org_stripe_account_id,
               o.stripe_charges_enabled as org_stripe_charges_enabled,
               o.acepta_tarjeta as org_acepta_tarjeta,
               o.acepta_transferencia as org_acepta_transferencia,
               o.cobro_spei_auto as org_cobro_spei_auto,
               o.banco_nombre as org_banco_nombre,
               o.banco_clabe as org_banco_clabe,
               o.banco_beneficiario as org_banco_beneficiario
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
            where c.public_token = ${token} order by f.firmado_en desc limit 1`,
        sql`select co.id, co.tipo, co.numero_cuota, co.monto, co.status, co.vence, co.paid_at
            from cotizacion_cobros co
            join cotizaciones c on c.id = co.cotizacion_id
            where c.public_token = ${token}
            order by co.vence asc nulls last, co.created_at asc`,
        sql`select s.estado, s.monto, s.current_period_end
            from cotizacion_suscripciones s
            join cotizaciones c on c.id = s.cotizacion_id
            where c.public_token = ${token} limit 1`,
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
            // Para el sello de confianza del link público (CFDI 4.0 solo aplica a México).
            paisCode: (rows[0].org_country_code as string) || 'MX',
            // Entorno de PRUEBA: la página pública marca la cotización como de
            // prueba (cinta ámbar) — nadie debe confundirla con una real.
            esPrueba: (rows[0].org_es_prueba as boolean) ?? false,
            stripeAccountId: (rows[0].org_stripe_account_id as string) || null,
            stripeChargesEnabled: !!rows[0].org_stripe_charges_enabled,
            aceptaTarjeta: rows[0].org_acepta_tarjeta !== false,
            aceptaTransferencia: !!rows[0].org_acepta_transferencia,
            cobroSpeiAuto: !!rows[0].org_cobro_spei_auto,
            bancoNombre: (rows[0].org_banco_nombre as string) || '',
            bancoClabe: (rows[0].org_banco_clabe as string) || '',
            bancoBeneficiario: (rows[0].org_banco_beneficiario as string) || '',
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
        // Las igualas recurrentes (es_recurrente) se EXCLUYEN: su status se queda
        // en 'approved' para siempre pero se cobran solas cada mes vía Stripe
        // Subscription — no son cartera vencida ni acumulan aging.
        sql`select c.id, c.folio, c.total, c.terminos, c.status, c.public_token,
                   coalesce(c.approved_at, c.created_at) as base_date,
                   cl.empresa, cl.limite_credito, cl.telefono
            from cotizaciones c
            left join clientes cl on cl.id = c.cliente_id
            where c.org_id = ${orgId} and c.status in ('approved','invoiced')
              and c.es_recurrente is not true
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

// ── DASHBOARD DE COBROS (/app/cobros) ──────────────────────────────────────────
export async function getCobros() {
    const orgId = await getActiveOrgId();
    // "Cobrado" = dinero REALMENTE recibido. `paid_at` solo se escribe al cobrar
    // (webhook o pago manual). NO usar status='invoiced' como cobrado: una cotización
    // puede facturarse SIN estar pagada (approved→invoiced). Se incluye status='paid'
    // para cubrir pagos legacy previos a la columna paid_at. (La condición se inlinea
    // en cada query porque el sql de neon-serverless no compone fragmentos.)
    const [c] = await sql`
        select coalesce(sum(total),0) as total_cobrado
        from cotizaciones
        where org_id = ${orgId} and (status = 'paid' or paid_at is not null)
    `;

    const methods = await sql`
        select coalesce(payment_method, 'otro') as method,
               sum(total) as monto, count(*) as txs
        from cotizaciones
        where org_id = ${orgId} and (status = 'paid' or paid_at is not null)
        group by coalesce(payment_method, 'otro')
        order by sum(total) desc
    `;

    const monthly = await sql`
        select to_char(date_trunc('month', coalesce(paid_at, created_at)), 'YYYY-MM') as ym, sum(total) as monto
        from cotizaciones
        where org_id = ${orgId} and (status = 'paid' or paid_at is not null)
        group by 1 order by 1
    `;

    const recent = await sql`
        select c.id, c.folio, c.total, coalesce(c.payment_method, 'otro') as payment_method, coalesce(c.paid_at, c.created_at) as paid_at, cl.empresa
        from cotizaciones c left join clientes cl on cl.id = c.cliente_id
        where c.org_id = ${orgId} and (c.status = 'paid' or c.paid_at is not null)
        order by coalesce(c.paid_at, c.created_at) desc limit 15
    `;

    // Ingreso de IGUALAS recurrentes: cada cobro mensual es una fila 'pagado' en
    // cotizacion_cobros de una cotización es_recurrente (que NUNCA marca
    // cotizaciones.paid_at, así que las queries de arriba no lo cuentan). Se suma
    // aparte y se fusiona — sin doble conteo, porque ambos universos son disjuntos.
    const recRows = await sql`
        select co.id, co.monto, coalesce(co.payment_method, 'tarjeta') as payment_method,
               coalesce(co.paid_at, co.created_at) as paid_at,
               to_char(date_trunc('month', coalesce(co.paid_at, co.created_at)), 'YYYY-MM') as ym,
               c.folio, cl.empresa
        from cotizacion_cobros co
        join cotizaciones c on c.id = co.cotizacion_id
        left join clientes cl on cl.id = c.cliente_id
        where co.org_id = ${orgId} and co.status = 'pagado' and c.es_recurrente is true
    `;

    const recTotal = recRows.reduce((s: number, r: any) => s + Number(r.monto), 0);

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
            id: r.id as string, folio: r.folio as string,
            empresa: (r.empresa as string) || 'Sin cliente',
            total: Number(r.total), method: r.payment_method as string, paidAtRaw: r.paid_at,
        })),
        ...recRows.map((r: any) => ({
            id: r.id as string, folio: `${r.folio} · iguala`,
            empresa: (r.empresa as string) || 'Sin cliente',
            total: Number(r.monto), method: r.payment_method as string, paidAtRaw: r.paid_at,
        })),
    ].sort((a, b) => new Date(b.paidAtRaw as any).getTime() - new Date(a.paidAtRaw as any).getTime()).slice(0, 15);

    return {
        totalCobrado: Number(c?.total_cobrado || 0) + recTotal,
        methods: [...methodMap.entries()]
            .map(([method, v]) => ({ method, monto: v.monto, txs: v.txs }))
            .sort((a, b) => b.monto - a.monto),
        monthly: [...monthlyMap.entries()]
            .map(([ym, monto]) => ({ ym, monto }))
            .sort((a, b) => a.ym.localeCompare(b.ym)),
        recent: recentMerged.map((r) => ({
            id: r.id, folio: r.folio, empresa: r.empresa,
            total: r.total, method: r.method, paidAt: fmtDate(r.paidAtRaw),
        })),
    };
}

// ── DESEMPEÑO DEL EQUIPO (/app/desempeno) ──────────────────────────────────────
export interface VendedorDesempeno {
    clerkUserId: string;
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
        sql`select clerk_user_id, coalesce(nombre, email, 'Sin nombre') as nombre, rol
            from org_members where org_id = ${orgId} and estado = 'activo' and clerk_user_id is not null
            order by case when rol = 'owner' then 0 else 1 end`,
        // Creadas / enviadas / cerradas + tiempo a cierre, por vendedor.
        sql`select creado_por,
                count(*) filter (where status <> 'draft') as creadas,
                count(*) filter (where status in ('sent','viewed','approved','paid','invoiced')) as enviadas,
                count(*) filter (where status in ('approved','paid','invoiced')) as cerradas,
                coalesce(sum(total) filter (where status in ('approved','paid','invoiced')),0) as cerrado_total,
                coalesce(avg(extract(epoch from (approved_at - created_at))/86400)
                         filter (where status in ('approved','paid','invoiced') and approved_at is not null),0) as dias_cierre
            from cotizaciones
            where org_id = ${orgId} and creado_por is not null
            group by creado_por`,
        // Cobrado directo (pago único/anticipo/saldo/cuotas) — misma semántica que getCobros().
        sql`select creado_por, coalesce(sum(total),0) as cobrado
            from cotizaciones
            where org_id = ${orgId} and creado_por is not null and (status = 'paid' or paid_at is not null)
            group by creado_por`,
        // Cobrado de igualas recurrentes — nunca marca la cotización 'paid' (ver
        // getCobros()), así que se suma aparte desde cotizacion_cobros.
        sql`select c.creado_por, coalesce(sum(co.monto),0) as cobrado
            from cotizacion_cobros co
            join cotizaciones c on c.id = co.cotizacion_id
            where co.org_id = ${orgId} and co.status = 'pagado' and c.es_recurrente is true and c.creado_por is not null
            group by c.creado_por`,
        // Cerrado sin vendedor asignado (creado antes de este campo, o vía API key).
        sql`select coalesce(sum(total) filter (where status in ('approved','paid','invoiced')),0) as sin_creador
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
        const id = m.clerk_user_id as string;
        seen.add(id);
        const a = aggMap.get(id) ?? { creadas: 0, enviadas: 0, cerradas: 0, cerradoTotal: 0, diasCierre: 0, cobradoTotal: 0 };
        const nombre = m.nombre as string;
        return {
            clerkUserId: id, nombre, inicial: initials(nombre), rol: m.rol as string, esYo: !!me && id === me,
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

// ── GUÍA DE CONFIGURACIÓN ─────────────────────────────────────────────────────
export async function getSetupProgress() {
    const orgId = await getActiveOrgId();
    const [o] = await sql`select logo_url, email_contacto, telefono, rfc, color_marca,
        pdf_mensaje, pdf_condiciones, portal_bienvenida, stripe_charges_enabled from orgs where id = ${orgId}`;
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
        { group: 'dinero',   id: 'cobro',         label: 'Cobra y factura',             desc: 'Cobra en línea con Stripe o márcala como pagada, factura el CFDI 4.0 y cierra el ciclo de venta en Cobranza.', href: '/app/cobranza',           done: Number(ncobro) > 0 },
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

// ── CÉDULAS PRESUPUESTALES (planeación financiera) ──────────────────────────────
// Tablas multi-tenant con FORCE RLS: cedulas / cedula_filas / cedula_valores.
// Toda query pasa por withOrgTx(orgId, ...) — jamás sql directo (fail-closed).
// Las tres hijas denormalizan org_id, así que las políticas RLS filtran sin JOIN.

export interface CedulaListItem {
    id: string;
    tipo: string;
    nombre: string;
    periodos: number;
    updatedAt: string;
}

export interface CedulaFilaRow {
    id: string;
    concepto: string;
    tipo: 'input' | 'formula';
    formula: unknown | null;
    orden: number;
}

export interface CedulaFull {
    id: string;
    tipo: string;
    nombre: string;
    periodos: string[];
    filas: CedulaFilaRow[];
    // valores[fila_id][periodo_idx] = valor (solo filas 'input').
    valores: Record<string, Record<number, number>>;
    createdAt: string;
    updatedAt: string;
}

// Lista todas las cédulas de la org (para el índice).
export async function getCedulas(orgId: string): Promise<CedulaListItem[]> {
    const [rows] = await withOrgTx(orgId, sql`
        select id, tipo, nombre, jsonb_array_length(periodos) as periodos, updated_at
        from cedulas where org_id = ${orgId}
        order by updated_at desc`);
    return rows.map((r) => ({
        id: r.id as string,
        tipo: r.tipo as string,
        nombre: r.nombre as string,
        periodos: Number(r.periodos ?? 0),
        updatedAt: r.updated_at as string,
    }));
}

// Una cédula completa: cabecera + filas (ordenadas) + valores agrupados
// fila_id → periodo_idx → valor. Devuelve null si no existe (o no es de la org).
export async function getCedula(orgId: string, cedulaId: string): Promise<CedulaFull | null> {
    const [ced, filas, valores] = await withOrgTx(orgId,
        sql`select id, tipo, nombre, periodos, created_at, updated_at
            from cedulas where id = ${cedulaId} and org_id = ${orgId} limit 1`,
        sql`select id, concepto, tipo, formula, orden
            from cedula_filas where cedula_id = ${cedulaId} and org_id = ${orgId}
            order by orden asc, created_at asc`,
        sql`select fila_id, periodo_idx, valor
            from cedula_valores where cedula_id = ${cedulaId} and org_id = ${orgId}`,
    );
    const c = ced[0];
    if (!c) return null;

    const valMap: Record<string, Record<number, number>> = {};
    for (const v of valores) {
        const fid = v.fila_id as string;
        (valMap[fid] ??= {})[Number(v.periodo_idx)] = Number(v.valor);
    }

    return {
        id: c.id as string,
        tipo: c.tipo as string,
        nombre: c.nombre as string,
        periodos: (c.periodos as string[]) ?? [],
        filas: filas.map((f) => ({
            id: f.id as string,
            concepto: f.concepto as string,
            tipo: f.tipo as 'input' | 'formula',
            formula: (f.formula as unknown) ?? null,
            orden: Number(f.orden ?? 0),
        })),
        valores: valMap,
        createdAt: c.created_at as string,
        updatedAt: c.updated_at as string,
    };
}

// Crea una cédula VACÍA (sin filas — la capa de API agrega filas o siembra una
// plantilla aparte). Devuelve el id nuevo.
export async function createCedula(
    orgId: string,
    data: { tipo: string; nombre: string; periodos: string[] },
): Promise<string> {
    const [[row]] = await withOrgTx(orgId, sql`
        insert into cedulas (org_id, tipo, nombre, periodos)
        values (${orgId}, ${data.tipo}, ${data.nombre}, ${JSON.stringify(data.periodos ?? [])}::jsonb)
        returning id`);
    return row.id as string;
}

// Agrega una fila a una cédula. `formula` = null para filas 'input'. Devuelve el
// id de la fila. Valida (vía la cláusula where del select de guarda) que la
// cédula pertenezca a la org antes de insertar — RLS también lo garantiza.
export async function addCedulaFila(
    orgId: string,
    cedulaId: string,
    data: { concepto: string; tipo: 'input' | 'formula'; formula?: unknown | null; orden?: number },
): Promise<string> {
    const [[row]] = await withOrgTx(orgId,
        sql`insert into cedula_filas (cedula_id, org_id, concepto, tipo, formula, orden)
            select ${cedulaId}, ${orgId}, ${data.concepto}, ${data.tipo},
                   ${data.formula == null ? null : JSON.stringify(data.formula)}::jsonb,
                   ${data.orden ?? 0}
            where exists (select 1 from cedulas where id = ${cedulaId} and org_id = ${orgId})
            returning id`,
        sql`update cedulas set updated_at = now() where id = ${cedulaId} and org_id = ${orgId}`,
    );
    if (!row) throw new Error('Cédula no encontrada');
    return row.id as string;
}

// Inserta o actualiza una celda (solo para filas 'input'). Upsert por el unique
// (fila_id, periodo_idx). El org_id denormalizado se escribe en el insert.
export async function upsertCedulaValor(
    orgId: string,
    filaId: string,
    cedulaId: string,
    periodoIdx: number,
    valor: number,
): Promise<void> {
    await withOrgTx(orgId,
        sql`insert into cedula_valores (cedula_id, fila_id, org_id, periodo_idx, valor)
            values (${cedulaId}, ${filaId}, ${orgId}, ${periodoIdx}, ${valor})
            on conflict (fila_id, periodo_idx)
            do update set valor = excluded.valor, updated_at = now()`,
        sql`update cedulas set updated_at = now() where id = ${cedulaId} and org_id = ${orgId}`,
    );
}

// Borra la cédula completa (cascade limpia filas y valores). RLS + el where por
// org_id garantizan que no se borre una cédula ajena.
export async function deleteCedula(orgId: string, cedulaId: string): Promise<void> {
    await withOrgTx(orgId, sql`
        delete from cedulas where id = ${cedulaId} and org_id = ${orgId}`);
}

// Renombra una cédula.
export async function renameCedula(orgId: string, cedulaId: string, nombre: string): Promise<void> {
    await withOrgTx(orgId, sql`
        update cedulas set nombre = ${nombre}, updated_at = now()
        where id = ${cedulaId} and org_id = ${orgId}`);
}

// Borra una fila (cascade limpia sus valores). Cualquier fórmula de otra fila
// que la referencie simplemente resolverá a 0 (defensivo, no falla).
export async function deleteCedulaFila(orgId: string, cedulaId: string, filaId: string): Promise<void> {
    await withOrgTx(orgId,
        sql`delete from cedula_filas where id = ${filaId} and cedula_id = ${cedulaId} and org_id = ${orgId}`,
        sql`update cedulas set updated_at = now() where id = ${cedulaId} and org_id = ${orgId}`,
    );
}

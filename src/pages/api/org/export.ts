// Export de datos comerciales. El manifiesto declara alcance y exclusiones:
// no es una copia de seguridad restaurable ni un volcado de credenciales.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId, withOrgTx } from '../../../lib/db';
import { requirePerm } from '../../../lib/queries';
import { currentLocale } from '../../../lib/context';
import { log } from '../../../lib/log';

const PRIVATE_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store' };

export const GET: APIRoute = async () => {
    const denied = await requirePerm('ajustes');
    if (denied) return denied;

    try {
        const orgId = await getActiveOrgId();
        // Todas las lecturas viajan en el mismo carril. Un fallo aborta el
        // archivo entero: [] significa "sin registros", nunca "falló la BD".
        const [orgRows, productos, clientes, quotes, items, eventos, tareas, auditRows, apiKeys,
            documentos, pagos, cobros, versiones, comentarios, firmas] = await withOrgTx(orgId,
            // Allowlist: filtrar sólo *_enc dejaba salir webhooks portadores y
            // credenciales antiguas en texto plano de la fila completa.
            sql`select id, nombre, logo_url, rfc, razon_social, regimen_fiscal, cp_fiscal,
                country_code, fiscal_metadata, quote_prefix, moneda, iva_pct, plan,
                email_contacto, telefono, direccion, idioma, zona_horaria, created_at
                from orgs where id = ${orgId}`,
            sql`select * from productos where org_id = ${orgId} order by nombre, id`,
            sql`select * from clientes where org_id = ${orgId} order by empresa, id`,
            sql`select to_jsonb(c) - 'public_token' as data from cotizaciones c where org_id = ${orgId} order by created_at desc, id`,
            sql`select i.* from cotizacion_items i join cotizaciones c on c.id = i.cotizacion_id where c.org_id = ${orgId} order by i.cotizacion_id, i.orden, i.id`,
            sql`select * from eventos where org_id = ${orgId} order by created_at, id`,
            sql`select * from tareas where org_id = ${orgId} order by id`,
            sql`select * from audit_log where org_id = ${orgId} order by created_at desc, id desc limit 1001`,
            sql`select id, nombre, prefix, last4, scope, created_at, last_used_at, revoked_at from api_keys where org_id = ${orgId} order by id`,
            sql`select id, org_id, cotizacion_id, country_code, document_type, fiscal_id, status,
                invoice_number, currency, ledger_currency, fx_rate, ledger_total, subtotal, tax_total,
                total, retencion_total, retenciones_snapshot, issuer_snapshot, recipient_snapshot,
                line_items_snapshot, issued_at, created_at, updated_at
                from documentos_fiscales where org_id = ${orgId} order by created_at, id`,
            sql`select id, org_id, documento_id, cobro_id, monto, currency, metodo, referencia, nota,
                registrado_por, aplicado_at, created_at from documento_pagos where org_id = ${orgId} order by aplicado_at, id`,
            sql`select cc.id, cc.org_id, cc.cotizacion_id, cc.tipo, cc.numero_cuota, cc.monto,
                c.base_currency as currency, cc.status, cc.payment_method, cc.paid_at, cc.vence, cc.created_at
                from cotizacion_cobros cc join cotizaciones c on c.id = cc.cotizacion_id and c.org_id = cc.org_id
                where cc.org_id = ${orgId} order by cc.created_at, cc.id`,
            sql`select * from cotizacion_versiones where org_id = ${orgId} order by cotizacion_id, version`,
            sql`select * from cotizacion_comentarios where org_id = ${orgId} order by created_at, id`,
            sql`select * from cotizacion_firmas where org_id = ${orgId} order by firmado_en, id`,
        );
        const org = orgRows[0];
        if (!org) return new Response(JSON.stringify({ error: currentLocale() === 'en' ? 'Organization not found.' : 'Organización no encontrada.' }), { status: 404, headers: PRIVATE_HEADERS });

        const datasets = {
            productos, clientes, cotizaciones: quotes.map((row) => row.data), cotizacion_items: items,
            eventos, tareas, api_keys: apiKeys, auditoria: auditRows.slice(0, 1000),
            documentos_fiscales: documentos, documento_pagos: pagos, cotizacion_cobros: cobros,
            cotizacion_versiones: versiones, cotizacion_comentarios: comentarios, cotizacion_firmas: firmas,
        };
        const payload = {
            version: 2,
            exportado_en: new Date().toISOString(),
            manifiesto: {
                alcance: 'datos_comerciales',
                registros: Object.fromEntries(Object.entries(datasets).map(([key, rows]) => [key, rows.length])),
                auditoria: { limite: 1000, truncada: auditRows.length > 1000 },
                exclusiones: [
                    'credenciales, tokens portadores, sesiones y secretos de integraciones',
                    'archivos binarios, PDF/XML fiscales y respuestas crudas de proveedores',
                    'KYC, evidencias de aceptación de Cord y respaldos externos',
                    'configuración avanzada, equipo, workflows, integraciones y telemetría',
                    'planes, conversaciones y promesas de cobranza; disputas y suscripciones',
                ],
            },
            org, ...datasets,
        };
        const nombre = String(org.nombre ?? 'cord').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'cord';
        return new Response(JSON.stringify(payload, null, 2), {
            status: 200,
            headers: { ...PRIVATE_HEADERS, 'Content-Disposition': `attachment; filename="${nombre}-export.json"` },
        });
    } catch {
        // No registrar el error SQL crudo: puede incluir parámetros personales.
        log.error('no se pudo completar el export de datos', { route: 'org/export' });
        return new Response(JSON.stringify({ error: currentLocale() === 'en'
            ? 'Could not complete the export. No partial file was generated. Try again.'
            : 'No se pudo completar la exportación. No se generó un archivo parcial. Intenta de nuevo.' }), {
            status: 503, headers: PRIVATE_HEADERS,
        });
    }
};

// Plan de configuración asistida: la forma única que proponen el onboarding, el
// CLI y los agentes por MCP. La IA solo produce un borrador; este módulo lo pasa
// por las mismas reglas que Ajustes (listas cerradas, formatos, topes) y reporta
// cada campo que descarta. Lo que sale de aquí es lo único que se muestra y se
// aplica. Puro y sin DB: lo prueban los tests sin red.
import { z } from 'zod';
import { validRfc, validSpainTaxId, validEin } from '../tax-id';
import { TERM_CODES } from '../payment-terms';

export const TERMINOS = TERM_CODES;
export const PDF_TEMPLATES = ['clasico', 'minimal', 'detallado'] as const;
export const TAX_KINDS = ['consumo', 'retencion', 'exento'] as const;
export const CANALES = ['whatsapp', 'email', 'nota'] as const;

export const MAX_PRODUCTOS = 500;
export const MAX_IMPUESTOS = 6;
export const MAX_PLANTILLAS = 4;

const texto = (max: number) => z.string().max(max * 4).optional();

/** Lo que la IA puede proponer. Es también el input_schema de su herramienta. */
export const draftSchema = z.object({
    resumen: z.string().max(600).describe('Una o dos frases sobre el negocio tal como lo entendiste, en el idioma de la cuenta.'),
    perfil: z.object({
        nombre: texto(120).describe('Nombre comercial, solo si aparece en el sitio o la descripción.'),
        razon_social: texto(200).describe('Razón social o nombre legal, solo si aparece literal. No la inventes.'),
        identificacion_fiscal: texto(20).describe('RFC, NIF/CIF o EIN, solo si aparece literal en la fuente. Nunca lo deduzcas.'),
        email_contacto: texto(160).describe('Correo de contacto visible en la fuente.'),
        telefono: texto(40).describe('Teléfono visible en la fuente.'),
        direccion: texto(300).describe('Dirección visible en la fuente.'),
    }).partial().optional(),
    marca: z.object({
        color_marca: z.string().max(7).optional().describe('Color principal de la marca en hexadecimal #RRGGBB, tomado de los colores del sitio.'),
        usar_logo_del_sitio: z.boolean().optional().describe('true si el sitio tiene un logo utilizable.'),
        pdf_template: z.enum(PDF_TEMPLATES).optional().describe('clasico, minimal o detallado según el estilo del negocio.'),
    }).partial().optional(),
    cotizaciones: z.object({
        terminos_default: z.enum(TERMINOS).optional().describe('contado o net<N> (net7, net15, net30, net45, net60, net90): el plazo de crédito en días, solo si la fuente habla de crédito o plazos.'),
        vigencia_default_dias: z.number().int().optional().describe('Días de vigencia de una cotización, entre 1 y 365.'),
        quote_prefix: z.string().max(12).optional().describe('Prefijo del folio, hasta 6 letras o números, por ejemplo las iniciales del negocio.'),
        precios_incluyen_impuesto: z.boolean().optional().describe('true si la fuente dice que los precios ya incluyen el impuesto.'),
        condiciones: texto(1200).describe('Condiciones comerciales para el PDF, en frases cortas, solo con lo que la fuente dice.'),
        mensaje: texto(400).describe('Mensaje breve de agradecimiento para el PDF.'),
    }).partial().optional(),
    impuestos: z.array(z.object({
        nombre: z.string().max(60),
        kind: z.enum(TAX_KINDS),
        tasa: z.number().describe('Porcentaje, por ejemplo 16 para 16%.'),
        motivo: z.string().max(200).describe('Qué parte de la fuente lo pide.'),
    })).max(MAX_IMPUESTOS * 2).optional().describe('Solo impuestos o retenciones que la fuente pide y que no están en el catálogo actual.'),
    productos: z.array(z.object({
        sku: z.string().max(40).optional(),
        nombre: z.string().max(200),
        unidad: z.string().max(30).optional(),
        precio: z.number(),
    })).max(MAX_PRODUCTOS).optional().describe('Productos o servicios con su precio, tomados de la lista de precios o del sitio.'),
    plantillas: z.array(z.object({
        nombre: z.string().max(80),
        canal: z.enum(CANALES),
        cuerpo: z.string().max(2000).describe('Puede usar {cliente}, {folio}, {total}, {link}, {vigencia} y {empresa}.'),
    })).max(MAX_PLANTILLAS * 2).optional().describe('Mensajes para enviar cotizaciones, en el tono del negocio.'),
    notas: z.array(z.string().max(240)).max(6).optional().describe('Cosas que viste y que el usuario debe configurar a mano, como conectar Slack o subir su certificado fiscal.'),
});

export type SetupDraft = z.infer<typeof draftSchema>;

export interface SetupProposal {
    resumen: string;
    perfil: Partial<Record<'nombre' | 'razon_social' | 'rfc' | 'email_contacto' | 'telefono' | 'direccion', string>>;
    marca: { color_marca?: string; logo_url?: string; pdf_template?: (typeof PDF_TEMPLATES)[number] };
    cotizaciones: {
        terminos_default?: (typeof TERMINOS)[number];
        vigencia_default_dias?: number;
        quote_prefix?: string;
        iva_incluido_defecto?: boolean;
        pdf_condiciones?: string;
        pdf_mensaje?: string;
    };
    impuestos: Array<{ nombre: string; kind: (typeof TAX_KINDS)[number]; tasa: number; motivo: string }>;
    productos: Array<{ sku: string | null; nombre: string; unidad: string; precio: number }>;
    plantillas: Array<{ nombre: string; canal: (typeof CANALES)[number]; cuerpo: string }>;
    notas: string[];
}

export interface Descartado { campo: string; motivo: string }

export interface SanitizeContext {
    country: string;
    /** Catálogo actual: lo que ya existe no se vuelve a proponer. */
    impuestosActuales: Array<{ kind: string; tasa: number }>;
    /** Logo ya descargado y validado por sources.ts; la IA solo decide si se usa. */
    logoDataUrl?: string | null;
}

const EMAIL = /^[a-zA-Z0-9.!#$&'*+\-/=?^_\x60{|}~]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const HEX = /^#[0-9a-fA-F]{6}$/;

/** Texto plano de una sola línea: sin etiquetas, sin caracteres de control, recortado. */
function plano(v: unknown, max: number): string {
    return String(v ?? '')
        .replace(/<[^>]*>/g, '')
        .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, max);
}

/** Texto plano que conserva saltos de línea (condiciones, cuerpos de mensaje). */
function parrafo(v: unknown, max: number): string {
    return String(v ?? '')
        .replace(/<[^>]*>/g, '')
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
        .slice(0, max);
}

function validTaxId(country: string, value: string): boolean {
    const v = value.toUpperCase().replace(/[\s.-]/g, '');
    if (country === 'MX') return validRfc(v);
    if (country === 'ES') return validSpainTaxId(v);
    if (country === 'US') return validEin(value);
    // Sin validador para el país: no se propone, se pide capturarlo a mano.
    return false;
}

export function emptyProposal(resumen = ''): SetupProposal {
    return { resumen, perfil: {}, marca: {}, cotizaciones: {}, impuestos: [], productos: [], plantillas: [], notas: [] };
}

export function sanitizeDraft(raw: unknown, ctx: SanitizeContext): { propuesta: SetupProposal; descartado: Descartado[] } {
    const descartado: Descartado[] = [];
    const drop = (campo: string, motivo: string) => descartado.push({ campo, motivo });
    const parsed = draftSchema.safeParse(raw);
    if (!parsed.success) {
        drop('propuesta', 'La propuesta no tenía la forma esperada.');
        return { propuesta: emptyProposal(), descartado };
    }
    const d = parsed.data;
    const out = emptyProposal(plano(d.resumen, 600));

    const p = d.perfil ?? {};
    if (p.nombre) { const v = plano(p.nombre, 120); if (v) out.perfil.nombre = v; }
    if (p.razon_social) { const v = plano(p.razon_social, 200); if (v) out.perfil.razon_social = v; }
    if (p.identificacion_fiscal) {
        const v = plano(p.identificacion_fiscal, 20).toUpperCase();
        if (validTaxId(ctx.country, v)) out.perfil.rfc = v.replace(/[\s.-]/g, '');
        else drop('perfil.identificacion_fiscal', 'No pasa la validación del país; captúrala a mano en Ajustes.');
    }
    if (p.email_contacto) {
        const v = plano(p.email_contacto, 160).toLowerCase();
        if (EMAIL.test(v)) out.perfil.email_contacto = v; else drop('perfil.email_contacto', 'No es un correo válido.');
    }
    if (p.telefono) {
        const v = plano(p.telefono, 40);
        if (/^\+?[\d\s().-]{8,20}$/.test(v)) out.perfil.telefono = v; else drop('perfil.telefono', 'No es un teléfono válido.');
    }
    if (p.direccion) { const v = plano(p.direccion, 300); if (v) out.perfil.direccion = v; }

    const m = d.marca ?? {};
    if (m.color_marca) {
        if (HEX.test(m.color_marca)) out.marca.color_marca = m.color_marca.toLowerCase();
        else drop('marca.color_marca', 'El color no está en formato #RRGGBB.');
    }
    if (m.usar_logo_del_sitio && ctx.logoDataUrl) out.marca.logo_url = ctx.logoDataUrl;
    if (m.pdf_template) out.marca.pdf_template = m.pdf_template;

    const c = d.cotizaciones ?? {};
    if (c.terminos_default) out.cotizaciones.terminos_default = c.terminos_default;
    if (c.vigencia_default_dias !== undefined) {
        if (c.vigencia_default_dias >= 1 && c.vigencia_default_dias <= 365) out.cotizaciones.vigencia_default_dias = c.vigencia_default_dias;
        else drop('cotizaciones.vigencia_default_dias', 'La vigencia debe estar entre 1 y 365 días.');
    }
    if (c.quote_prefix) {
        const v = c.quote_prefix.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
        if (v) out.cotizaciones.quote_prefix = v; else drop('cotizaciones.quote_prefix', 'El prefijo solo admite letras y números.');
    }
    if (c.precios_incluyen_impuesto !== undefined) out.cotizaciones.iva_incluido_defecto = c.precios_incluyen_impuesto;
    if (c.condiciones) { const v = parrafo(c.condiciones, 1200); if (v) out.cotizaciones.pdf_condiciones = v; }
    if (c.mensaje) { const v = parrafo(c.mensaje, 400); if (v) out.cotizaciones.pdf_mensaje = v; }

    const yaExiste = (kind: string, tasa: number) => [...ctx.impuestosActuales, ...out.impuestos]
        .some((t) => t.kind === kind && Math.abs(Number(t.tasa) - tasa) < 0.0001);
    for (const [i, t] of (d.impuestos ?? []).entries()) {
        const nombre = plano(t.nombre, 60);
        const tasa = Math.round(Number(t.tasa) * 10000) / 10000;
        if (!nombre) { drop(`impuestos.${i}`, 'Sin nombre.'); continue; }
        if (!(tasa >= 0 && tasa <= 100)) { drop(`impuestos.${i}`, `"${nombre}": la tasa debe estar entre 0 y 100.`); continue; }
        if (t.kind === 'exento' && tasa !== 0) { drop(`impuestos.${i}`, `"${nombre}": un impuesto exento no lleva tasa.`); continue; }
        if (yaExiste(t.kind, tasa)) continue;
        if (out.impuestos.length >= MAX_IMPUESTOS) { drop(`impuestos.${i}`, `Máximo ${MAX_IMPUESTOS} impuestos por propuesta.`); continue; }
        out.impuestos.push({ nombre, kind: t.kind, tasa, motivo: plano(t.motivo, 200) });
    }

    const vistos = new Set<string>();
    for (const [i, pr] of (d.productos ?? []).entries()) {
        const nombre = plano(pr.nombre, 200);
        const precio = Math.round(Number(pr.precio) * 100) / 100;
        if (!nombre) { drop(`productos.${i}`, 'Sin nombre.'); continue; }
        if (!(precio >= 0 && precio < 1e10)) { drop(`productos.${i}`, `"${nombre}": precio inválido.`); continue; }
        const sku = pr.sku ? plano(pr.sku, 40).toUpperCase() || null : null;
        const llave = sku ?? nombre.toLowerCase();
        if (vistos.has(llave)) continue;
        vistos.add(llave);
        out.productos.push({ sku, nombre, unidad: plano(pr.unidad, 30) || 'pieza', precio });
    }

    for (const [i, pl] of (d.plantillas ?? []).entries()) {
        const nombre = plano(pl.nombre, 80);
        const cuerpo = parrafo(pl.cuerpo, 2000);
        if (!nombre || !cuerpo) { drop(`plantillas.${i}`, 'Sin nombre o sin cuerpo.'); continue; }
        if (out.plantillas.length >= MAX_PLANTILLAS) break;
        out.plantillas.push({ nombre, canal: pl.canal, cuerpo });
    }

    out.notas = (d.notas ?? []).map((n) => plano(n, 240)).filter(Boolean).slice(0, 6);
    return { propuesta: out, descartado };
}

/**
 * La revisión del usuario vuelve como una propuesta editada: se re-sanea con las
 * mismas reglas porque el navegador no es de confianza. El logo solo puede
 * conservarse o quitarse: es el que Cord descargó, nunca uno que mande el cliente.
 */
export function sanitizeReviewed(editada: unknown, ctx: SanitizeContext): { propuesta: SetupProposal; descartado: Descartado[] } {
    const e = (editada && typeof editada === 'object' ? editada : {}) as Partial<SetupProposal>;
    const asDraft = {
        resumen: typeof e.resumen === 'string' ? e.resumen : '',
        perfil: {
            nombre: e.perfil?.nombre, razon_social: e.perfil?.razon_social, identificacion_fiscal: e.perfil?.rfc,
            email_contacto: e.perfil?.email_contacto, telefono: e.perfil?.telefono, direccion: e.perfil?.direccion,
        },
        marca: { color_marca: e.marca?.color_marca, pdf_template: e.marca?.pdf_template, usar_logo_del_sitio: !!e.marca?.logo_url },
        cotizaciones: {
            terminos_default: e.cotizaciones?.terminos_default, vigencia_default_dias: e.cotizaciones?.vigencia_default_dias,
            quote_prefix: e.cotizaciones?.quote_prefix, precios_incluyen_impuesto: e.cotizaciones?.iva_incluido_defecto,
            condiciones: e.cotizaciones?.pdf_condiciones, mensaje: e.cotizaciones?.pdf_mensaje,
        },
        impuestos: Array.isArray(e.impuestos) ? e.impuestos : [],
        productos: Array.isArray(e.productos) ? e.productos.map((p) => ({ ...p, sku: p.sku ?? undefined })) : [],
        plantillas: Array.isArray(e.plantillas) ? e.plantillas : [],
        notas: Array.isArray(e.notas) ? e.notas : [],
    };
    const strip = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ''));
    asDraft.perfil = strip(asDraft.perfil) as any;
    asDraft.marca = strip(asDraft.marca) as any;
    asDraft.cotizaciones = strip(asDraft.cotizaciones) as any;
    return sanitizeDraft(asDraft, ctx);
}

/** Cuántos cambios trae la propuesta, por sección, para el resumen de la revisión. */
export function proposalCounts(p: SetupProposal) {
    return {
        perfil: Object.keys(p.perfil).length,
        marca: Object.keys(p.marca).length,
        cotizaciones: Object.keys(p.cotizaciones).length,
        impuestos: p.impuestos.length,
        productos: p.productos.length,
        plantillas: p.plantillas.length,
    };
}

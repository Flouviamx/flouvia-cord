export const prerender = false;

import type { APIRoute } from 'astro';
import { resolvePublicInvoice } from '../../../../../lib/db';
import { downloadInvoiceDocument } from '../../../../../lib/fiscal/invoice-download';

const privacyHeaders = {
    'Cache-Control': 'private, no-store',
    'Referrer-Policy': 'no-referrer',
    'X-Robots-Tag': 'noindex, nofollow',
    'X-Content-Type-Options': 'nosniff',
};

export const GET: APIRoute = async ({ params }) => {
    const token = params.token ?? '';
    const format = params.format ?? '';
    if (!['pdf', 'xml'].includes(format)) {
        return new Response('Documento no encontrado', { status: 404, headers: privacyHeaders });
    }
    try {
        // Un link autoriza únicamente su documento, nunca la organización activa
        // del navegador ni un id suministrado como parámetro de descarga.
        const identity = await resolvePublicInvoice(token);
        if (!identity) return new Response('Documento no encontrado', { status: 404, headers: privacyHeaders });
        const response = await downloadInvoiceDocument(identity.orgId, identity.id, format, token);
        const safe = new Response(response.body, response);
        for (const [name, value] of Object.entries(privacyHeaders)) safe.headers.set(name, value);
        return safe;
    } catch {
        return new Response('No pudimos obtener el documento. Intenta de nuevo.', { status: 503, headers: privacyHeaders });
    }
};

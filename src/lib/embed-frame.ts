// Política de enmarcado de los embeds (/embed/[token] y /embed/i/[token]): quién
// puede enmarcar, a qué origen van los postMessage y si el embed es interactivo.
// Una sola implementación para la cotización y la factura.
import { sanitizeAppearance, appearanceToCss, MAX_APPEARANCE_BYTES } from '../../packages/elements/src/appearance';
import { embedAppearanceCss } from './embed-appearance';

export interface EmbedFramePolicy {
    /** Valor del header CSP `frame-ancestors` (el middleware completa el resto de la política). */
    frameAncestors: string;
    /** Origen exacto para postMessage cuando el anfitrión está en la allowlist; si no, '*'. */
    targetOrigin: string;
    /**
     * Sin allowlist cualquier sitio puede enmarcar: el embed no ofrece acciones y
     * sus eventos viajan sin datos. Con allowlist, frame-ancestors ya restringe a
     * todos los ancestros, así que no depende del parentOrigin (falsificable).
     */
    soloLectura: boolean;
}

export function parseEmbedDomains(raw: string | null | undefined): string[] {
    return (raw || '').split(/[\s,]+/).map((d) => d.trim()).filter(Boolean);
}

export function embedFramePolicy(embedDomains: string | null | undefined, parentOrigin: string | null | undefined): EmbedFramePolicy {
    const dominios = parseEmbedDomains(embedDomains);
    let targetOrigin = '*';
    if (dominios.length > 0 && parentOrigin) {
        try {
            const host = new URL(parentOrigin).hostname;
            if (dominios.some((d) => d === host || host.endsWith('.' + d.replace(/^\*\./, '')))) targetOrigin = parentOrigin;
        } catch { /* parentOrigin inválido: se queda en '*' */ }
    }
    return {
        frameAncestors: dominios.length ? `frame-ancestors 'self' ${dominios.join(' ')}` : 'frame-ancestors *',
        targetOrigin,
        soloLectura: dominios.length === 0,
    };
}

/** CSS del Appearance API a partir del parámetro `appearance`; '' si falta, pesa de más o no es válido. */
export function embedAppearanceFromParam(param: string | null): string {
    if (!param || param.length > MAX_APPEARANCE_BYTES) return '';
    try {
        const appearance = sanitizeAppearance(JSON.parse(param));
        return appearanceToCss(appearance) + embedAppearanceCss(appearance);
    } catch {
        return '';
    }
}

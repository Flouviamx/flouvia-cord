// Estado vacío rico inyectado en runtime — usado por src/lib/chart.ts para las
// 9 gráficas SVG a mano. Espejo de src/components/app/WidgetEmpty.astro: mismo
// markup (.wx-empty), mismos iconos (glass-icons.ts), mismo CSS en
// src/styles/widgets.css. Un widget de lista y un widget de gráfica sin datos
// deben verse idénticos.
import { GLASS_ICON_PATHS, type GlassIcon } from './glass-icons';

export interface EmptyOpts {
    icon?: GlassIcon;
    title: string;
    desc?: string;
    ctaLabel?: string;
    ctaHref?: string;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

export function renderEmpty(host: HTMLElement, opts: EmptyOpts): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'wx-empty';

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'wx-empty-ico');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.5');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = GLASS_ICON_PATHS[opts.icon ?? 'chart'];
    wrap.appendChild(svg);

    const title = document.createElement('strong');
    title.className = 'wx-empty-title';
    title.textContent = opts.title;
    wrap.appendChild(title);

    if (opts.desc) {
        const desc = document.createElement('p');
        desc.className = 'wx-empty-desc';
        desc.textContent = opts.desc;
        wrap.appendChild(desc);
    }

    if (opts.ctaLabel && opts.ctaHref) {
        const cta = document.createElement('a');
        cta.className = 'wx-empty-cta';
        cta.href = opts.ctaHref;
        cta.textContent = opts.ctaLabel;
        wrap.appendChild(cta);
    }

    host.appendChild(wrap);
    return wrap;
}

/** Lee data-empty-* de un contenedor de gráfica; cae al genérico global si no hay nada específico. */
export function readEmptyOpts(el: HTMLElement, fallbackMessage?: string): EmptyOpts {
    const runtime = (window as any).CORD_I18N || {};
    const icon = (el.dataset.emptyIcon as GlassIcon) || 'chart';
    const title = el.dataset.emptyTitle || fallbackMessage || runtime.emptyDefaultTitle || 'Sin datos';
    const desc = el.dataset.emptyDesc || (el.dataset.emptyTitle ? undefined : undefined);
    const ctaLabel = el.dataset.emptyCta;
    const ctaHref = el.dataset.emptyCtaHref;
    return { icon, title, desc, ctaLabel, ctaHref };
}

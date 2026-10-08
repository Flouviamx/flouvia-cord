// Lado navegador de <TermPicker>: la única forma de leer o cambiar el plazo
// elegido. Los editores antes buscaban `#termChips .chip.active` cada uno a su
// manera; con un chip que es un <select> eso deja de ser cierto, y un lector
// que se queda con la forma vieja manda "contado" en silencio.
import { normalizeTerm, termLabel, type TermCode } from './payment-terms';

export interface TermPickerHandle {
    get(): TermCode;
    /** Cambia el plazo sin disparar `onChange` (para precargar). */
    set(code: unknown): void;
}

export function wireTermPicker(root: HTMLElement | null, onChange?: (code: TermCode) => void): TermPickerHandle {
    const locale: 'es' | 'en' = document.documentElement.lang === 'en' ? 'en' : 'es';
    let value: TermCode = normalizeTerm(root?.dataset.value);
    const chips = root ? Array.from(root.querySelectorAll<HTMLButtonElement>('button.chip[data-term]')) : [];
    const more = root?.querySelector<HTMLSelectElement>('select[data-term-more]') ?? null;
    const moreChip = more?.closest<HTMLElement>('.tp-more') ?? null;
    const moreLabel = root?.querySelector<HTMLElement>('[data-more-label]') ?? null;

    const paint = () => {
        let hit = false;
        for (const c of chips) {
            const on = c.dataset.term === value;
            hit ||= on;
            c.classList.toggle('active', on);
            c.setAttribute('aria-pressed', String(on));
        }
        if (more) more.value = hit ? '' : value;
        moreChip?.classList.toggle('active', !hit);
        if (moreLabel) moreLabel.textContent = hit ? (moreLabel.dataset.default || '') : termLabel(value, locale);
        if (root) root.dataset.value = value;
    };
    const set = (code: unknown) => { value = normalizeTerm(code); paint(); };

    for (const c of chips) {
        c.addEventListener('click', () => { set(c.dataset.term); onChange?.(value); });
    }
    more?.addEventListener('change', () => {
        // "Otro plazo" vacío = no eligió nada: se queda el plazo que había.
        if (!more.value) { paint(); return; }
        set(more.value);
        onChange?.(value);
    });
    paint();
    return { get: () => value, set };
}

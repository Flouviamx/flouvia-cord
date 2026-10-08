// Biblioteca de widgets: tarjeta flotante (escritorio) / hoja inferior (móvil).
//
// El panel se renderiza en WidgetGrid.astro y se MUEVE a <body> al montar: el grid
// vive bajo un ancestro con `transform` (app-fadein) y zonas con overflow:hidden,
// que anclarían o recortarían cualquier `position: fixed` dentro de él. Por la
// misma razón su CSS (widgets.css) no depende de ningún ancestro del grid.
//
// Es un popover NO modal: mientras está abierto se puede seguir ordenando el
// tablero. Escape o un clic fuera lo cierran y el foco vuelve al botón.
import { buildWidgetPreview } from './widget-preview';
import { iconSvg } from './icons';

export type LibraryHandle = {
    open(): void;
    close(restoreFocus?: boolean): void;
    toggle(): void;
    isOpen(): boolean;
    refresh(): void;
};

type Options = {
    panel: HTMLElement;
    scrim: HTMLElement | null;
    button: HTMLElement | null;
    /** Widgets que la biblioteca puede ofrecer (no bloqueados), en orden de página. */
    candidates: () => HTMLElement[];
    onAdd: (widget: HTMLElement) => void;
    reduceMotion: boolean;
};

const fill = (template: string, values: Record<string, string | number>) =>
    template.replace(/\{(\w+)\}/g, (_, k) => String(values[k] ?? ''));

export function createWidgetLibrary(opts: Options): LibraryHandle {
    const { panel, scrim, button, reduceMotion } = opts;
    const d = panel.dataset;
    const list = panel.querySelector<HTMLElement>('[data-wlib-list]')!;
    const cats = panel.querySelector<HTMLElement>('[data-wlib-cats]')!;
    const search = panel.querySelector<HTMLInputElement>('[data-wlib-search]');
    const sub = panel.querySelector<HTMLElement>('[data-wlib-sub]');
    const mobile = matchMedia('(max-width: 880px)');
    document.body.appendChild(panel);
    if (scrim) document.body.appendChild(scrim);

    let open = false;
    let category = 'all';
    let query = '';

    const groupOf = (w: HTMLElement) => w.dataset.group || d.otherGroup || '';

    function syncBadge() {
        const addable = opts.candidates().filter((w) => w.hidden).length;
        if (!button) return;
        if (addable > 0) button.dataset.count = String(addable);
        else delete button.dataset.count;
    }

    function renderCats(all: HTMLElement[]) {
        cats.innerHTML = '';
        const groups = Array.from(new Set(all.map(groupOf))).filter(Boolean);
        const entries: [string, string, number][] = [
            ['all', d.labelAll || '', all.length],
            ['available', d.labelAvailable || '', all.filter((w) => w.hidden).length],
            ...(groups.length > 1 ? groups.map((g) => [`g:${g}`, g, all.filter((w) => groupOf(w) === g).length] as [string, string, number]) : []),
        ];
        if (!entries.some(([key]) => key === category)) category = 'all';
        for (const [key, label, count] of entries) {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'wlib-cat';
            b.setAttribute('aria-pressed', String(key === category));
            const l = document.createElement('span'); l.textContent = label;
            const c = document.createElement('span'); c.className = 'wlib-cat-n'; c.textContent = String(count);
            b.append(l, c);
            b.addEventListener('click', () => { category = key; render(); });
            cats.appendChild(b);
        }
    }

    function card(w: HTMLElement) {
        const title = w.dataset.title || w.dataset.widget || '';
        const onScreen = !w.hidden;
        const item = document.createElement('div');
        item.className = 'wlib-card';
        item.setAttribute('role', 'listitem');
        item.dataset.state = onScreen ? 'on' : 'off';

        // Se dibuja en cada render: así refleja el rango y los datos que la tarjeta trae hoy.
        const frame = document.createElement('div'); frame.className = 'wlib-frame';
        frame.appendChild(buildWidgetPreview(w));

        const meta = document.createElement('div'); meta.className = 'wlib-meta';
        const strong = document.createElement('strong'); strong.textContent = title;
        meta.appendChild(strong);
        const desc = w.dataset.desc || (category.startsWith('g:') ? '' : groupOf(w));
        if (desc) { const small = document.createElement('small'); small.textContent = desc; meta.appendChild(small); }

        const add = document.createElement('button');
        add.type = 'button';
        add.className = 'wlib-add';
        add.disabled = onScreen;
        add.innerHTML = iconSvg(onScreen ? 'check' : 'plus', '', 1.8, 16);
        add.setAttribute('aria-label', fill(onScreen ? d.onscreenTemplate || '' : d.addTemplate || '', { titulo: title }));
        add.title = onScreen ? d.labelOnscreen || '' : d.labelAdd || '';
        add.addEventListener('click', () => {
            if (!w.hidden) return;
            opts.onAdd(w);
            item.dataset.state = 'on';
            item.classList.add('is-added');
            add.disabled = true;
            add.innerHTML = iconSvg('check', '', 1.8, 16);
            add.setAttribute('aria-label', fill(d.onscreenTemplate || '', { titulo: title }));
            syncBadge();
            updateSub();
            renderCats(opts.candidates());
            // En móvil la hoja tapa el tablero: se cierra para que se vea dónde llegó.
            if (mobile.matches) close(false);
            arrive(w);
        });
        item.append(frame, meta, add);
        return item;
    }

    function arrive(w: HTMLElement) {
        requestAnimationFrame(() => {
            w.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
            if (reduceMotion) return;
            w.classList.remove('wlib-arrived');
            void w.offsetWidth;
            w.classList.add('wlib-arrived');
            w.addEventListener('animationend', () => w.classList.remove('wlib-arrived'), { once: true });
        });
    }

    function updateSub() {
        const all = opts.candidates();
        if (sub) sub.textContent = fill(d.subTemplate || '', { n: all.filter((w) => w.hidden).length, m: all.filter((w) => !w.hidden).length });
    }

    function render() {
        const all = opts.candidates();
        renderCats(all);
        updateSub();
        list.innerHTML = '';
        const q = query.trim().toLocaleLowerCase();
        const shown = all.filter((w) => {
            if (category === 'available' && !w.hidden) return false;
            if (category.startsWith('g:') && groupOf(w) !== category.slice(2)) return false;
            if (!q) return true;
            return `${w.dataset.title || ''} ${w.dataset.desc || ''} ${groupOf(w)}`.toLocaleLowerCase().includes(q);
        });
        // Lo que se puede agregar va primero: es a lo que se vino.
        shown.sort((a, b) => Number(!a.hidden) - Number(!b.hidden));
        shown.forEach((w) => list.appendChild(card(w)));
        if (!shown.length) {
            const empty = document.createElement('p');
            empty.className = 'wlib-empty';
            empty.textContent = d.labelEmpty || '';
            list.appendChild(empty);
        }
    }

    function place() {
        if (!open) return;
        if (mobile.matches || !button) {
            panel.style.left = ''; panel.style.top = ''; panel.style.maxHeight = '';
            return;
        }
        const r = button.getBoundingClientRect();
        const width = panel.offsetWidth;
        const left = Math.max(16, Math.min(innerWidth - width - 16, r.right - width));
        const top = r.bottom + 10;
        panel.style.left = `${left}px`;
        panel.style.top = `${top}px`;
        panel.style.maxHeight = `${Math.max(320, innerHeight - top - 16)}px`;
        panel.style.setProperty('--wlib-origin-x', `${Math.max(0, r.left + r.width / 2 - left)}px`);
    }

    function onPointerDown(event: PointerEvent) {
        if (!open) return;
        const path = event.composedPath();
        if (path.includes(panel) || (button && path.includes(button))) return;
        close(false);
    }

    function show() {
        if (open) return;
        open = true;
        query = ''; if (search) search.value = '';
        render();
        panel.hidden = false;
        if (scrim) scrim.hidden = !mobile.matches;
        place();
        button?.setAttribute('aria-expanded', 'true');
        panel.dataset.state = 'opening';
        requestAnimationFrame(() => { panel.dataset.state = 'open'; });
        // En móvil no se enfoca el buscador: abriría el teclado y taparía la hoja.
        if (!mobile.matches) search?.focus({ preventScroll: true });
        else panel.focus({ preventScroll: true });
        document.addEventListener('pointerdown', onPointerDown, true);
    }

    function close(restoreFocus = true) {
        if (!open) return;
        open = false;
        button?.setAttribute('aria-expanded', 'false');
        document.removeEventListener('pointerdown', onPointerDown, true);
        const finish = () => { if (!open) { panel.hidden = true; if (scrim) scrim.hidden = true; } };
        panel.dataset.state = 'closing';
        if (reduceMotion) finish(); else setTimeout(finish, 180);
        if (restoreFocus) button?.focus();
    }

    search?.addEventListener('input', () => { query = search.value; render(); search.focus(); });
    panel.querySelector('[data-wlib-close]')?.addEventListener('click', () => close());
    scrim?.addEventListener('click', () => close());
    panel.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') { event.stopPropagation(); close(); }
    });
    addEventListener('resize', place, { passive: true });
    addEventListener('scroll', place, { passive: true, capture: true });
    syncBadge();

    return {
        open: show,
        close,
        toggle: () => (open ? close() : show()),
        isOpen: () => open,
        refresh: () => { syncBadge(); if (open) render(); },
    };
}

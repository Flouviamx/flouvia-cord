// Bus de cross-filter entre widgets del MISMO grid — deliberadamente angosto:
// filtra listas/tablas existentes (alternando `hidden`, nunca reconsultando el
// servidor) y atenúa gráficas (`is-dim`/`is-focus`, ya soportado por chart.ts).
// Cross-filter "real" (que un widget refiltre los DATOS de otro) exigiría un eje
// nuevo en cada query — fuera de alcance; para eso existe drill-down (navega).
//
// Contrato: un elemento con `data-filter-key` (ya lo estampan mountDonut/
// mountSegBar en chart.ts) emite `cord:filter` en su `[data-widget-grid]` más
// cercano al hacer clic. Cualquier widget del mismo grid puede suscribirse con
// registerFilterSink(). Se limpia con clearFilter() o clicando la misma opción
// de nuevo (toggle).
export interface FilterDetail {
    dim: string;
    value: string | null;
    label: string;
    source: string;
}

function grid(el: Element): HTMLElement | null {
    return el.closest<HTMLElement>('[data-widget-grid]');
}

export function emitFilter(source: HTMLElement, dim: string, value: string | null, label: string) {
    const host = grid(source);
    if (!host) return;
    host.dispatchEvent(new CustomEvent<FilterDetail>('cord:filter', { bubbles: true, detail: { dim, value, label, source: source.closest('[data-widget]')?.getAttribute('data-widget') || '' } }));
}

export function registerFilterSink(host: HTMLElement, dim: string, apply: (value: string | null, label: string) => void) {
    host.addEventListener('cord:filter', (event) => {
        const detail = (event as CustomEvent<FilterDetail>).detail;
        if (detail.dim === dim) apply(detail.value, detail.label);
    });
}

export interface FilterSourceHandle {
    /** Limpia la selección visual Y emite value:null — úsalo desde un chip
     *  externo ("Limpiar") para que no se desincronice del estado interno. */
    clear(): void;
    destroy(): void;
}

/** Cablea un contenedor de gráfica (donut/segbar ya estampan data-filter-key en
 *  sus segmentos y su leyenda) para que un clic alterne selección y emita el
 *  filtro. Toggle: clicar la misma opción otra vez limpia. */
export function wireFilterSource(container: HTMLElement, dim: string): FilterSourceHandle {
    let selected: string | null = null;
    const markSelection = () => {
        container.querySelectorAll<HTMLElement>('[data-filter-key]').forEach((el) => {
            const isSelected = selected !== null && el.dataset.filterKey === selected;
            const isOther = selected !== null && !isSelected;
            el.classList.toggle('is-focus', isSelected);
            el.classList.toggle('is-dim', isOther);
        });
    };
    const select = (key: string | null, label: string) => {
        selected = key;
        markSelection();
        emitFilter(container, dim, selected, selected ? label : '');
    };
    const onClick = (event: Event) => {
        const target = (event.target as HTMLElement).closest<HTMLElement>('[data-filter-key]');
        if (!target || !container.contains(target)) return;
        const key = target.dataset.filterKey || null;
        const label = target.dataset.filterLabel || target.textContent?.trim() || '';
        select(selected === key ? null : key, label);
    };
    container.addEventListener('click', onClick);
    return {
        clear: () => select(null, ''),
        destroy: () => container.removeEventListener('click', onClick),
    };
}

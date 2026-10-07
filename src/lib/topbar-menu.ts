// Menús desplegables de la topbar (Crear, Notificaciones, Apps).
//
// Un solo contrato para los tres, en vez de tres copias que no se conocían:
// - Uno abierto a la vez. Cada botón cortaba la propagación del clic, así que
//   abrir la campana con Crear abierto dejaba Crear debajo. Ahora al abrir se
//   avisa por un evento y los demás se cierran (y actualizan su aria-expanded).
// - Teclado de menú real para los `role="menu"`: abrir con Enter/Espacio o con
//   flecha abajo lleva el foco al primer ítem; flechas, Home y End recorren;
//   Escape cierra y devuelve el foco al botón; Tab cierra.
//
// Módulo (no `window.*`): lo importan el script de AppLayout y el de
// TopbarApps, que corren en orden indefinido (regla 13).

const OPEN_EVENT = 'cord:topbar-menu-open';

interface Options {
    /** Identificador único del menú, para cerrar a los demás al abrirse. */
    id: string;
    /** false = panel no-menú (p. ej. la lista de notificaciones): sin flechas. */
    menu?: boolean;
    onOpen?: () => void;
}

export function wireTopbarMenu(btn: HTMLElement, panel: HTMLElement, { id, menu = true, onOpen }: Options) {
    const items = () => [...panel.querySelectorAll<HTMLElement>('[role="menuitem"]')]
        .filter((el) => !el.hidden && el.getClientRects().length > 0);
    const isOpen = () => !panel.hidden;

    const close = (restoreFocus = false) => {
        if (!isOpen()) return;
        panel.hidden = true;
        btn.setAttribute('aria-expanded', 'false');
        if (restoreFocus) btn.focus();
    };
    const open = (focusFirst = false) => {
        document.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: id }));
        panel.hidden = false;
        btn.setAttribute('aria-expanded', 'true');
        onOpen?.();
        if (focusFirst && menu) items()[0]?.focus();
    };

    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        // detail === 0: activado con teclado (Enter/Espacio) → el foco entra al menú.
        if (isOpen()) close(); else open(e.detail === 0);
    });
    if (menu) {
        btn.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); open(true); }
        });
        panel.addEventListener('keydown', (e) => {
            const list = items();
            if (!list.length) return;
            const i = list.indexOf(document.activeElement as HTMLElement);
            if (e.key === 'ArrowDown') { e.preventDefault(); list[(i + 1) % list.length].focus(); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); list[(i - 1 + list.length) % list.length].focus(); }
            else if (e.key === 'Home') { e.preventDefault(); list[0].focus(); }
            else if (e.key === 'End') { e.preventDefault(); list[list.length - 1].focus(); }
            else if (e.key === 'Tab') close();
        });
    }

    document.addEventListener(OPEN_EVENT, (e) => { if ((e as CustomEvent).detail !== id) close(); });
    document.addEventListener('click', (e) => {
        if (isOpen() && !panel.contains(e.target as Node) && !btn.contains(e.target as Node)) close();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isOpen()) close(panel.contains(document.activeElement));
    });

    return { open, close, isOpen };
}

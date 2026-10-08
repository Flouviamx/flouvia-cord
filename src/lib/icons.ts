// Cord Glass: grid 24, trazo 1.5 redondeado, relleno duotono 0.12 en la forma principal,
// detalle secundario al 50 % y un nodo sólido de firma. La gramática la impone iconSvg(), no cada icono.

export interface IconDef {
    shape?: string;
    line?: string;
    soft?: string;
    dot?: [number, number][];
}

const DOC_SHAPE = '<path d="M7.5 3h6.8L19 7.7V18a3 3 0 01-3 3H7.5a3 3 0 01-3-3V6a3 3 0 013-3z"/>';
const DOC_FOLD = '<path d="M14.3 3v3.5a1.2 1.2 0 001.2 1.2H19"/>';
const CAL_SHAPE = '<path d="M6.5 5h11A2.5 2.5 0 0120 7.5v10a2.5 2.5 0 01-2.5 2.5h-11A2.5 2.5 0 014 17.5v-10A2.5 2.5 0 016.5 5z"/>';
const CAL_HEAD = '<path d="M4 10h16M8.5 3v4M15.5 3v4"/>';
const CHAT_SHAPE = '<path d="M6.5 4.5h11a3 3 0 013 3v6a3 3 0 01-3 3H11l-4 3.5V16.5h-.5a3 3 0 01-3-3v-6a3 3 0 013-3z"/>';
const TILE = (x: number, y: number) => `<rect x="${x}" y="${y}" width="7" height="7" rx="2.5"/>`;

export const ICONS = {
    // Utilidades
    'chevron-down': { line: '<path d="M7 9.5l5 5 5-5"/>' },
    'chevron-up': { line: '<path d="M7 14.5l5-5 5 5"/>' },
    'chevron-left': { line: '<path d="M14.5 7l-5 5 5 5"/>' },
    'chevron-right': { line: '<path d="M9.5 7l5 5-5 5"/>' },
    'arrow-right': { line: '<path d="M5 12h14M13.5 6.5L19 12l-5.5 5.5"/>' },
    'arrow-left': { line: '<path d="M19 12H5M10.5 6.5L5 12l5.5 5.5"/>' },
    'arrow-up': { line: '<path d="M12 19V5M6.5 10.5L12 5l5.5 5.5"/>' },
    'arrow-down': { line: '<path d="M12 5v14M6.5 13.5L12 19l5.5-5.5"/>' },
    'external': { line: '<path d="M13 5h6v6M19 5l-8 8M18 14v3a2 2 0 01-2 2H7a2 2 0 01-2-2V8a2 2 0 012-2h3"/>' },
    check: { line: '<path d="M5.5 12.5l4.2 4.2L18.5 7.5"/>' },
    x: { line: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>' },
    plus: { line: '<path d="M12 5.5v13M5.5 12h13"/>' },
    minus: { line: '<path d="M5.5 12h13"/>' },
    more: { dot: [[5.5, 12], [12, 12], [18.5, 12]] },
    menu: { line: '<path d="M4.5 7h15M4.5 12h15M4.5 17h15"/>' },
    search: { shape: '<circle cx="10.5" cy="10.5" r="6"/>', line: '<path d="M15.2 15.2l4.3 4.3"/>' },
    filter: { shape: '<path d="M4.5 5.5h15l-5.8 7v5.8l-3.4 1.7v-7.5z"/>' },
    refresh: { line: '<path d="M19.5 12a7.5 7.5 0 01-13 5.1M4.5 12a7.5 7.5 0 0113-5.1M17.5 3.5V7h-3.5M6.5 20.5V17H10"/>' },
    copy: { shape: '<rect x="9" y="9" width="11" height="11" rx="3"/>', line: '<path d="M15 9V7.5A2.5 2.5 0 0012.5 5h-5A2.5 2.5 0 005 7.5v5A2.5 2.5 0 007.5 15H9"/>' },
    download: { line: '<path d="M12 4.5v10M7.5 10.5l4.5 4.5 4.5-4.5M5 19.5h14"/>' },
    upload: { line: '<path d="M12 15V5M7.5 9L12 4.5 16.5 9M5 19.5h14"/>' },
    trash: {
        shape: '<path d="M6.5 8l.8 10.2a2 2 0 002 1.8h5.4a2 2 0 002-1.8L17.5 8z"/>',
        line: '<path d="M4.5 8h15M9.5 8V5.5a1 1 0 011-1h3a1 1 0 011 1V8"/>',
        soft: '<path d="M10.5 11.5v5M13.5 11.5v5"/>',
    },
    edit: { shape: '<path d="M4.5 19.5l.9-4L16 5a2.1 2.1 0 013 3L8.5 18.6z"/>', soft: '<path d="M14 7l3 3"/>' },
    eye: { shape: '<path d="M2.8 12S6 5.5 12 5.5 21.2 12 21.2 12 18 18.5 12 18.5 2.8 12 2.8 12z"/>', line: '<circle cx="12" cy="12" r="2.8"/>' },
    'sidebar': {
        shape: '<path d="M6.5 4.5h11a3 3 0 013 3v9a3 3 0 01-3 3h-11a3 3 0 01-3-3v-9a3 3 0 013-3z" transform="translate(0 .5)"/>',
        soft: '<path d="M9.5 5v14"/>',
    },
    logout: { line: '<path d="M9.5 20H6.5a2 2 0 01-2-2V6a2 2 0 012-2h3M15.5 7.5L20 12l-4.5 4.5M20 12H9.5"/>' },

    // Estados
    info: { shape: '<circle cx="12" cy="12" r="8.5"/>', line: '<path d="M12 11.5v4.5"/>', dot: [[12, 8.2]] },
    help: { shape: '<circle cx="12" cy="12" r="8.5"/>', line: '<path d="M9.7 9.7a2.4 2.4 0 014.6.9c0 1.6-2.3 2-2.3 3.4"/>', dot: [[12, 16.6]] },
    alert: { shape: '<path d="M12 3.8l8.7 15.2a1 1 0 01-.9 1.5H4.2a1 1 0 01-.9-1.5z"/>', line: '<path d="M12 10v4"/>', dot: [[12, 17.2]] },
    'check-circle': { shape: '<circle cx="12" cy="12" r="8.5"/>', line: '<path d="M8.3 12.3l2.5 2.5 5-5.3"/>' },
    'x-circle': { shape: '<circle cx="12" cy="12" r="8.5"/>', line: '<path d="M9 9l6 6M15 9l-6 6"/>' },
    clock: { shape: '<circle cx="12" cy="12" r="8.5"/>', line: '<path d="M12 7.5V12l3 2"/>' },
    lock: {
        shape: '<path d="M8 11h8a3 3 0 013 3v3.5a3 3 0 01-3 3H8a3 3 0 01-3-3V14a3 3 0 013-3z"/>',
        line: '<path d="M8.5 11V8a3.5 3.5 0 017 0v3"/>',
        dot: [[12, 15.8]],
    },
    shield: {
        shape: '<path d="M12 3l7.5 2.8v5.6c0 4.4-3.1 8-7.5 9.6-4.4-1.6-7.5-5.2-7.5-9.6V5.8z"/>',
        soft: '<path d="M8.8 12l2.2 2.2 4.2-4.4"/>',
    },
    bell: {
        shape: '<path d="M6 16.5V11a6 6 0 0112 0v5.5l1.5 2h-15z"/>',
        line: '<path d="M10 21h4"/>',
    },

    // Producto
    overview: {
        shape: '<rect x="3.5" y="3.5" width="7.5" height="9.5" rx="2.5"/><rect x="14" y="11.5" width="6.5" height="9" rx="2.5"/>',
        line: '<rect x="14" y="3.5" width="6.5" height="5.5" rx="2.5"/><rect x="3.5" y="16" width="7.5" height="4.5" rx="2.5"/>',
    },
    quote: {
        shape: '<path d="M7.5 3h6.8L19 7.7V18a3 3 0 01-3 3H7.5a3 3 0 01-3-3V6a3 3 0 013-3z"/>',
        line: '<path d="M14.3 3v3.5a1.2 1.2 0 001.2 1.2H19"/>',
        soft: '<path d="M8 12.5h6M8 16h3.5"/>',
        dot: [[15.3, 16]],
    },
    invoice: {
        shape: '<path d="M6.5 3h11a1.5 1.5 0 011.5 1.5V21l-2.4-1.7L14.2 21 12 19.3 9.8 21l-2.4-1.7L5 21V4.5A1.5 1.5 0 016.5 3z"/>',
        soft: '<path d="M8.5 8h7M8.5 11.5h7"/>',
        dot: [[9.3, 15]],
    },
    clients: {
        shape: '<circle cx="9" cy="8.5" r="3.5"/>',
        line: '<path d="M3 19.5c.5-3.2 3-5 6-5s5.5 1.8 6 5"/>',
        soft: '<path d="M15.5 5.3a3.3 3.3 0 010 6.4M17.5 14.8c1.9.5 3.1 2 3.5 4.7"/>',
    },
    user: {
        shape: '<circle cx="12" cy="8" r="3.8"/>',
        line: '<path d="M4.5 20c.6-3.7 3.5-5.6 7.5-5.6s6.9 1.9 7.5 5.6"/>',
    },
    products: {
        shape: '<path d="M12 3.2l7.8 4.3v9L12 20.8l-7.8-4.3v-9z"/>',
        soft: '<path d="M4.2 7.5L12 12l7.8-4.5M12 12v8.8"/>',
    },
    coin: {
        shape: '<circle cx="12" cy="12" r="8.5"/>',
        soft: '<circle cx="12" cy="12" r="4.8"/>',
        dot: [[12, 12]],
    },
    card: {
        shape: '<path d="M5.5 5.5h13a3 3 0 013 3v7a3 3 0 01-3 3h-13a3 3 0 01-3-3v-7a3 3 0 013-3z"/>',
        line: '<path d="M2.5 10h19"/>',
        soft: '<path d="M6 15h3.5"/>',
    },
    wallet: {
        shape: '<path d="M3.5 8.5A2.5 2.5 0 016 6h11.5a2 2 0 012 2v10a2 2 0 01-2 2H6a2.5 2.5 0 01-2.5-2.5z"/>',
        line: '<path d="M19.5 10.5H16a2.2 2.2 0 000 4.4h3.5"/>',
        dot: [[16.2, 12.7]],
    },
    bank: {
        shape: '<path d="M3.5 9.5L12 4l8.5 5.5z"/>',
        line: '<path d="M5.5 13v5M10 13v5M14 13v5M18.5 13v5M3.5 20.5h17"/>',
    },
    tray: {
        shape: '<path d="M3.5 13l2.2-6.6A2 2 0 017.6 5h8.8a2 2 0 011.9 1.4L20.5 13v4.5a2 2 0 01-2 2h-13a2 2 0 01-2-2z"/>',
        line: '<path d="M3.5 13h4.8l1.2 2.2h5l1.2-2.2h4.8"/>',
        soft: '<path d="M12 8.2v3.6M10.3 10.2l1.7 1.7 1.7-1.7"/>',
    },
    cpu: {
        shape: '<rect x="6.5" y="6.5" width="11" height="11" rx="3"/>',
        soft: '<path d="M9.5 3.5v3M14.5 3.5v3M9.5 17.5v3M14.5 17.5v3M3.5 9.5h3M3.5 14.5h3M17.5 9.5h3M17.5 14.5h3"/>',
        dot: [[12, 12]],
    },
    chart: {
        shape: '<rect x="4.5" y="12" width="3.6" height="7.5" rx="1.2"/><rect x="14.9" y="8" width="3.6" height="11.5" rx="1.2"/>',
        line: '<rect x="9.7" y="4.5" width="3.6" height="15" rx="1.2"/>',
    },
    pulse: {
        shape: '<path d="M3.5 12.5h3.5l2.5-7 4.5 13 2.5-6h4"/>',
        dot: [[20, 12.5]],
    },
    workflow: {
        shape: '<rect x="8.5" y="3.5" width="7" height="5.5" rx="2"/>',
        line: '<rect x="3.5" y="15" width="7" height="5.5" rx="2"/><rect x="13.5" y="15" width="7" height="5.5" rx="2"/><path d="M12 9v2.5M7 15v-1.5a1.5 1.5 0 011.5-1.5h7a1.5 1.5 0 011.5 1.5V15"/>',
    },
    plug: {
        shape: '<path d="M6 7.5h12v3a6 6 0 01-12 0z"/>',
        line: '<path d="M9 3.5v4M15 3.5v4M12 16.5V21"/>',
    },
    link: {
        line: '<path d="M10 14a3.5 3.5 0 005 0l3-3a3.5 3.5 0 00-5-5l-1 1M14 10a3.5 3.5 0 00-5 0l-3 3a3.5 3.5 0 005 5l1-1"/>',
    },
    document: {
        shape: '<path d="M7.5 3h6.8L19 7.7V18a3 3 0 01-3 3H7.5a3 3 0 01-3-3V6a3 3 0 013-3z"/>',
        line: '<path d="M14.3 3v3.5a1.2 1.2 0 001.2 1.2H19"/>',
        soft: '<path d="M8 12.5h8M8 16h5"/>',
    },
    template: {
        shape: '<path d="M6.5 3.5h11a3 3 0 013 3v11a3 3 0 01-3 3h-11a3 3 0 01-3-3v-11a3 3 0 013-3z"/>',
        line: '<path d="M3.5 9.5h17"/>',
        soft: '<path d="M9.5 9.5v11"/>',
    },
    send: {
        shape: '<path d="M20.5 3.5l-17 7 6.5 3 3 6.5z"/>',
        soft: '<path d="M10 13.5L14.5 9"/>',
    },
    mail: {
        shape: '<path d="M5.5 5.5h13A2.5 2.5 0 0121 8v8a2.5 2.5 0 01-2.5 2.5h-13A2.5 2.5 0 013 16V8a2.5 2.5 0 012.5-2.5z"/>',
        soft: '<path d="M3.5 8.5l8.5 6 8.5-6"/>',
    },
    calendar: {
        shape: '<path d="M6.5 5h11A2.5 2.5 0 0120 7.5v10a2.5 2.5 0 01-2.5 2.5h-11A2.5 2.5 0 014 17.5v-10A2.5 2.5 0 016.5 5z"/>',
        line: '<path d="M4 10h16M8.5 3v4M15.5 3v4"/>',
        dot: [[8.8, 14.5]],
    },
    chat: {
        shape: '<path d="M6.5 4.5h11a3 3 0 013 3v6a3 3 0 01-3 3H11l-4 3.5V16.5h-.5a3 3 0 01-3-3v-6a3 3 0 013-3z"/>',
        soft: '<path d="M8 9.2h8M8 12.5h4.5"/>',
    },
    building: {
        shape: '<path d="M5.5 20.5v-15a2 2 0 012-2h6a2 2 0 012 2v15"/>',
        line: '<path d="M3.5 20.5h17M15.5 10h2.5a2 2 0 012 2v8.5"/>',
        soft: '<path d="M9 8h3M9 11.5h3M9 15h3"/>',
    },
    store: {
        shape: '<path d="M5 10v9a1.5 1.5 0 001.5 1.5h11A1.5 1.5 0 0019 19v-9"/>',
        line: '<path d="M3.5 10l1.6-5.2a1.5 1.5 0 011.4-1.1h11a1.5 1.5 0 011.4 1.1L20.5 10a3 3 0 01-6 0 3 3 0 01-5 0 3 3 0 01-6 0z"/>',
        soft: '<path d="M10 20.5v-5h4v5"/>',
    },
    globe: {
        shape: '<circle cx="12" cy="12" r="8.5"/>',
        soft: '<path d="M3.5 12h17M12 3.5c2.4 2.5 3.4 5.3 3.4 8.5s-1 6-3.4 8.5c-2.4-2.5-3.4-5.3-3.4-8.5s1-6 3.4-8.5z"/>',
    },
    drop: {
        shape: '<path d="M12 3.5s6 6.2 6 10.5a6 6 0 01-12 0C6 9.7 12 3.5 12 3.5z"/>',
        soft: '<path d="M9.2 14.2a2.9 2.9 0 002.3 2.5"/>',
    },
    key: {
        shape: '<circle cx="7.5" cy="12" r="3.8"/>',
        line: '<path d="M11.3 12h9.2M17 12v3M20.5 12v2.5"/>',
        dot: [[7.5, 12]],
    },
    bolt: { shape: '<path d="M13.5 3L5.5 13.5h6L10.5 21l8-10.5h-6z"/>' },
    code: { line: '<path d="M8.5 7.5L4 12l4.5 4.5M15.5 7.5L20 12l-4.5 4.5M13.5 5.5l-3 13"/>' },
    tag: {
        shape: '<path d="M3.5 12.2V5.5a2 2 0 012-2h6.7a2 2 0 011.4.6l7 7a2 2 0 010 2.8l-6.7 6.7a2 2 0 01-2.8 0l-7-7a2 2 0 01-.6-1.4z"/>',
        dot: [[8, 8]],
    },
    percent: {
        shape: '<circle cx="7.5" cy="7.5" r="2.3"/><circle cx="16.5" cy="16.5" r="2.3"/>',
        line: '<path d="M18.5 5.5l-13 13"/>',
    },
    list: {
        line: '<path d="M9.5 6.5h11M9.5 12h11M9.5 17.5h11"/>',
        dot: [[4.8, 6.5], [4.8, 12], [4.8, 17.5]],
    },
    qr: {
        shape: '<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/>',
        soft: '<path d="M14 14h2.5v2.5M20.5 14v.01M14 20.5h2.5M20.5 17.5v3"/>',
    },
    camera: {
        shape: '<path d="M6 7.5h1.6l1.3-2h6.2l1.3 2H18a2.5 2.5 0 012.5 2.5v7a2.5 2.5 0 01-2.5 2.5H6A2.5 2.5 0 013.5 17v-7A2.5 2.5 0 016 7.5z"/>',
        line: '<circle cx="12" cy="13.2" r="3.2"/>',
    },
    id: {
        shape: '<path d="M5.5 5h13a3 3 0 013 3v8a3 3 0 01-3 3h-13a3 3 0 01-3-3V8a3 3 0 013-3z"/>',
        line: '<path d="M14 10h4.5M14 14h3"/>',
        soft: '<circle cx="8.8" cy="10.2" r="2"/><path d="M5.3 16c.5-1.5 1.8-2.3 3.5-2.3s3 .8 3.5 2.3"/>',
    },
    gear: {
        shape: '<path d="M10.28 5.11L10.56 2.91H13.44L13.72 5.11L15.66 5.91L17.41 4.56L19.44 6.59L18.09 8.34L18.89 10.28L21.09 10.56V13.44L18.89 13.72L18.09 15.66L19.44 17.41L17.41 19.44L15.66 18.09L13.72 18.89L13.44 21.09H10.56L10.28 18.89L8.34 18.09L6.59 19.44L4.56 17.41L5.91 15.66L5.11 13.72L2.91 13.44V10.56L5.11 10.28L5.91 8.34L4.56 6.59L6.59 4.56L8.34 5.91z"/>',
        line: '<circle cx="12" cy="12" r="2.8"/>',
    },
    sliders: {
        line: '<path d="M4.5 7h8M17.5 7h2M4.5 17h2M11.5 17h8"/><circle cx="15" cy="7" r="2.3"/><circle cx="9" cy="17" r="2.3"/>',
    },
    archive: {
        shape: '<path d="M5 9h14v9a2.5 2.5 0 01-2.5 2.5h-9A2.5 2.5 0 015 18z"/>',
        line: '<path d="M4.5 4h15a1 1 0 011 1v3a1 1 0 01-1 1h-15a1 1 0 01-1-1V5a1 1 0 011-1z"/>',
        soft: '<path d="M9.5 13h5"/>',
    },

    // Ampliación
    'chevrons-updown': { line: '<path d="M8 9.5l4-4 4 4M8 14.5l4 4 4-4"/>' },
    'arrow-up-right': { line: '<path d="M7 17L17 7M8.5 7H17v8.5"/>' },
    paperclip: { line: '<path d="M19.5 11.5l-7.8 7.8a4.7 4.7 0 01-6.7-6.6l8.3-8.3a3.1 3.1 0 014.4 4.4l-8.2 8.2a1.6 1.6 0 01-2.2-2.2l7.5-7.5"/>' },
    'eye-off': {
        shape: '<path d="M2.8 12S6 5.5 12 5.5 21.2 12 21.2 12 18 18.5 12 18.5 2.8 12 2.8 12z"/>',
        line: '<circle cx="12" cy="12" r="2.8"/><path d="M4 4l16 16"/>',
    },
    expand: { line: '<path d="M4.5 9V5.5a1 1 0 011-1H9M15 4.5h3.5a1 1 0 011 1V9M19.5 15v3.5a1 1 0 01-1 1H15M9 19.5H5.5a1 1 0 01-1-1V15"/>' },
    shrink: { line: '<path d="M9 4.5V8a1 1 0 01-1 1H4.5M19.5 9H16a1 1 0 01-1-1V4.5M15 19.5V16a1 1 0 011-1h3.5M4.5 15H8a1 1 0 011 1v3.5"/>' },
    grid: { shape: TILE(3.5, 3.5) + TILE(13.5, 13.5), line: TILE(13.5, 3.5) + TILE(3.5, 13.5) },
    'grid-plus': { shape: TILE(3.5, 3.5), line: TILE(3.5, 13.5) + TILE(13.5, 13.5) + '<path d="M17 3.5v7M13.5 7h7"/>' },
    'calendar-check': { shape: CAL_SHAPE, line: CAL_HEAD, soft: '<path d="M9 15l2 2 4-4.2"/>' },
    'calendar-clock': { shape: CAL_SHAPE, line: CAL_HEAD, soft: '<path d="M12 12.5V15l1.8 1.1"/>' },
    rocket: {
        shape: '<path d="M12 2.8c2.8 2 4.5 5.1 4.5 8.7v3.3h-9v-3.3c0-3.6 1.7-6.7 4.5-8.7z"/>',
        line: '<path d="M7.5 12.2L5 15.2v2.3l3-1.4M16.5 12.2l2.5 3v2.3l-3-1.4M10.5 18.2L12 21l1.5-2.8"/>',
        dot: [[12, 9.2]],
    },
    'pen-nib': {
        shape: '<path d="M12 3.2l6 6.6-2.4 6.2H8.4L6 9.8z"/>',
        line: '<path d="M12 16v4.5M9 20.5h6"/>',
        dot: [[12, 10.4]],
    },
    cloud: { shape: '<path d="M7 18.5a4 4 0 01-.6-7.95 5.5 5.5 0 0110.7 1.2A3.4 3.4 0 0117 18.5z"/>' },
    book: {
        shape: '<path d="M12 6.5c-1.5-1.5-3.8-2-7-2v13c3.2 0 5.5.5 7 2 1.5-1.5 3.8-2 7-2v-13c-3.2 0-5.5.5-7 2z"/>',
        soft: '<path d="M12 6.5v13"/>',
    },
    terminal: {
        shape: '<path d="M5.5 4.5h13a3 3 0 013 3v9a3 3 0 01-3 3h-13a3 3 0 01-3-3v-9a3 3 0 013-3z"/>',
        line: '<path d="M7 9.5l3 2.5-3 2.5M12.5 15h4.5"/>',
    },
    map: {
        shape: '<path d="M3.5 6.5l5.5-2.5 6 2.5 5.5-2.5v13l-5.5 2.5-6-2.5-5.5 2.5z"/>',
        soft: '<path d="M9 4v13M15 6.5v13"/>',
    },
    play: { shape: '<circle cx="12" cy="12" r="8.5"/>', line: '<path d="M10.3 8.9v6.2l5-3.1z"/>' },
    smartphone: {
        shape: '<path d="M8.5 3h7a2 2 0 012 2v14a2 2 0 01-2 2h-7a2 2 0 01-2-2V5a2 2 0 012-2z"/>',
        dot: [[12, 18]],
    },
    phone: {
        shape: '<path d="M6.5 3.5h2.8l1.5 4-2 1.3a10 10 0 005.4 5.4l1.3-2 4 1.5v2.8a2 2 0 01-2.2 2A15.5 15.5 0 014.5 5.7a2 2 0 012-2.2z"/>',
    },
    home: {
        shape: '<path d="M4.5 10.5L12 4l7.5 6.5V19a1.5 1.5 0 01-1.5 1.5H6A1.5 1.5 0 014.5 19z"/>',
        soft: '<path d="M10 20.5v-5h4v5"/>',
    },
    'trending-up': { line: '<path d="M3.5 16.5l6-6 4 4 7-7M15.5 7.5h5v5"/>' },
    'thumbs-up': {
        shape: '<path d="M7.5 11l3.2-6.2a1.7 1.7 0 013.1 1.4L13 10h5.2a2 2 0 012 2.4l-1.2 6a2 2 0 01-2 1.6H7.5z"/>',
        line: '<path d="M4.5 10.5h3v9h-3z"/>',
    },
    'thumbs-down': {
        shape: '<path transform="rotate(180 12 12)" d="M7.5 11l3.2-6.2a1.7 1.7 0 013.1 1.4L13 10h5.2a2 2 0 012 2.4l-1.2 6a2 2 0 01-2 1.6H7.5z"/>',
        line: '<path transform="rotate(180 12 12)" d="M4.5 10.5h3v9h-3z"/>',
    },
    'file-up': { shape: DOC_SHAPE, line: DOC_FOLD, soft: '<path d="M12 17.5v-5.5M9.6 14.2L12 11.8l2.4 2.4"/>' },
    'file-down': { shape: DOC_SHAPE, line: DOC_FOLD, soft: '<path d="M12 11.5V17M9.6 14.8L12 17.2l2.4-2.4"/>' },
    'file-check': { shape: DOC_SHAPE, line: DOC_FOLD, soft: '<path d="M9.3 14.5l2 2 3.8-4"/>' },
    'file-plus': { shape: DOC_SHAPE, line: DOC_FOLD, soft: '<path d="M12 11.5v5M9.5 14h5"/>' },
    'file-minus': { shape: DOC_SHAPE, line: DOC_FOLD, soft: '<path d="M9.5 14h5"/>' },
    'file-code': { shape: DOC_SHAPE, line: DOC_FOLD, soft: '<path d="M10.2 12l-2 2 2 2M13.8 12l2 2-2 2"/>' },
    'invoice-x': {
        shape: '<path d="M6.5 3h11a1.5 1.5 0 011.5 1.5V21l-2.4-1.7L14.2 21 12 19.3 9.8 21l-2.4-1.7L5 21V4.5A1.5 1.5 0 016.5 3z"/>',
        soft: '<path d="M9.7 8.5l4.6 4.6M14.3 8.5l-4.6 4.6"/>',
    },
    cookie: {
        shape: '<path d="M12 3.5a8.5 8.5 0 108.5 8.5 3.5 3.5 0 01-4.2-4.3A3.5 3.5 0 0112 3.5z"/>',
        dot: [[9, 10], [10, 15.2], [15.2, 15]],
    },
    flask: {
        shape: '<path d="M10 3.5v5.2L5.3 17a2.2 2.2 0 001.9 3.3h9.6a2.2 2.2 0 001.9-3.3L14 8.7V3.5z"/>',
        line: '<path d="M8.5 3.5h7"/>',
        soft: '<path d="M7.6 14.5h8.8"/>',
    },
    login: { line: '<path d="M4.5 12h10M10.5 7.5l4.5 4.5-4.5 4.5M14.5 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3"/>' },
    spinner: { line: '<path d="M12 3.5a8.5 8.5 0 108.5 8.5"/>' },
    sun: {
        shape: '<circle cx="12" cy="12" r="3.8"/>',
        soft: '<path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/>',
    },
    moon: { shape: '<path d="M20 14.5A8.5 8.5 0 119.5 4 6.7 6.7 0 0020 14.5z"/>' },
    contrast: { shape: '<path d="M12 3.5a8.5 8.5 0 010 17z"/>', line: '<circle cx="12" cy="12" r="8.5"/>' },
    undo: { line: '<path d="M4.5 12a7.5 7.5 0 107.5-7.5c-2.3 0-4.4 1-5.8 2.7L4.5 9M4.5 4.5V9H9"/>' },
    grip: { dot: [[9, 6], [15, 6], [9, 12], [15, 12], [9, 18], [15, 18]] },
    share: {
        shape: '<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="5.8" r="2.5"/><circle cx="18" cy="18.2" r="2.5"/>',
        line: '<path d="M8.2 10.8l7.6-3.9M8.2 13.2l7.6 3.9"/>',
    },
    route: {
        shape: '<rect x="4" y="3.5" width="6" height="6" rx="2"/>',
        line: '<rect x="14" y="14.5" width="6" height="6" rx="2"/><path d="M7 9.5v3.5a2 2 0 002 2h5"/>',
    },
    decision: {
        shape: '<path d="M12 3.5l3.5 3.5-3.5 3.5L8.5 7z"/>',
        line: '<path d="M12 10.5V20M6 20v-2.5a2 2 0 012-2h8a2 2 0 012 2V20"/>',
    },
    compass: {
        shape: '<circle cx="12" cy="12" r="8.5"/>',
        line: '<path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
    },
    cart: {
        shape: '<path d="M6.2 8h13.6l-1.4 6.4a1.6 1.6 0 01-1.6 1.2H9.2a1.6 1.6 0 01-1.6-1.2z"/>',
        line: '<path d="M3.5 4.5h2.2l1.9 9.9"/>',
        dot: [[9.5, 19.5], [17, 19.5]],
    },
    'x-octagon': {
        shape: '<path d="M8.5 3.5h7l5 5v7l-5 5h-7l-5-5v-7z"/>',
        line: '<path d="M9.5 9.5l5 5M14.5 9.5l-5 5"/>',
    },
    pin: {
        shape: '<path d="M9.2 4.5h5.6l-.7 5 3 3.5H6.9l3-3.5z"/>',
        line: '<path d="M12 13v7.5"/>',
    },
    'chat-help': {
        shape: '<path d="M12 3.5c4.7 0 8.5 3.4 8.5 7.6s-3.8 7.6-8.5 7.6c-1 0-2-.15-2.9-.45L5 20l.9-3.6C4.3 15 3.5 13.1 3.5 11.1c0-4.2 3.8-7.6 8.5-7.6z"/>',
        line: '<path d="M9.75 9.2a2.3 2.3 0 014.5.6c0 1.5-2.25 1.8-2.25 3.1"/>',
        dot: [[12, 15.4]],
    },
    command: {
        line: '<path d="M9 9h6v6H9zM9 9V6.5A2.5 2.5 0 106.5 9H9zM15 9h2.5A2.5 2.5 0 1015 6.5V9zM9 15H6.5A2.5 2.5 0 109 17.5V15zM15 15h2.5a2.5 2.5 0 11-2.5 2.5V15z"/>',
    },
    'user-plus': {
        shape: '<circle cx="9.5" cy="8" r="3.5"/>',
        line: '<path d="M3 19.5c.6-3.3 3.2-5 6.5-5s5.9 1.7 6.5 5M18.5 8v6M15.5 11h6"/>',
    },
    'user-check': {
        shape: '<circle cx="9.5" cy="8" r="3.5"/>',
        line: '<path d="M3 19.5c.6-3.3 3.2-5 6.5-5s5.9 1.7 6.5 5M16 11.5l1.8 1.8 3.4-3.6"/>',
    },
    'package-plus': {
        shape: '<path d="M10.1 3.1l6.2 3.4v7.2l-6.2 3.3-6.2-3.3V6.5z"/>',
        soft: '<path d="M3.9 6.5l6.2 3.5 6.2-3.5M10.1 10v7"/>',
        line: '<path d="M17.5 14.8v6.4M14.3 18h6.4"/>',
    },
    checklist: {
        line: '<path d="M10.5 6.5h10M10.5 12h10M10.5 17.5h10M3.8 6.3l1.2 1.2 2.3-2.5M3.8 11.8l1.2 1.2 2.3-2.5M3.8 17.3l1.2 1.2 2.3-2.5"/>',
    },
    server: {
        shape: '<path d="M5.5 4h13a2 2 0 012 2v2.5a2 2 0 01-2 2h-13a2 2 0 01-2-2V6a2 2 0 012-2zM5.5 13.5h13a2 2 0 012 2V18a2 2 0 01-2 2h-13a2 2 0 01-2-2v-2.5a2 2 0 012-2z"/>',
        dot: [[7.5, 7.2], [7.5, 16.8]],
    },
    database: {
        shape: '<path d="M4.5 6c0-1.7 3.4-3 7.5-3s7.5 1.3 7.5 3-3.4 3-7.5 3-7.5-1.3-7.5-3z"/>',
        line: '<path d="M4.5 6v12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V6M4.5 12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3"/>',
    },
    'mail-forward': {
        shape: '<path d="M5.5 5h10A2.5 2.5 0 0118 7.5v7a2.5 2.5 0 01-2.5 2.5h-10A2.5 2.5 0 013 14.5v-7A2.5 2.5 0 015.5 5z"/>',
        soft: '<path d="M3.5 8l6.5 4.5L16.5 8"/>',
        line: '<path d="M15 20h6.5M19 17.5l2.5 2.5-2.5 2.5"/>',
    },
    kanban: {
        shape: '<rect x="4" y="4" width="4.5" height="16" rx="1.6"/>',
        line: '<rect x="9.75" y="4" width="4.5" height="10.5" rx="1.6"/><rect x="15.5" y="4" width="4.5" height="6.5" rx="1.6"/>',
    },
    'search-insight': {
        shape: '<circle cx="10.5" cy="10.5" r="6"/>',
        line: '<path d="M15.2 15.2l4.3 4.3"/>',
        soft: '<path d="M8.3 12.5v-1.8M10.5 12.5V8.5M12.7 12.5v-2.8"/>',
    },
    history: { line: '<path d="M3.5 12a8.5 8.5 0 108.5-8.5c-2.4 0-4.5.9-6.2 2.5L3.5 8.5M3.5 4v4.5H8M12 7.5V12l3 2"/>' },
    swap: { line: '<path d="M16.5 4.5l3 3-3 3M19.5 7.5h-12M7.5 13.5l-3 3 3 3M4.5 16.5h12"/>' },
    'chart-line': {
        shape: '<path d="M6.5 3.5h11a3 3 0 013 3v11a3 3 0 01-3 3h-11a3 3 0 01-3-3v-11a3 3 0 013-3z"/>',
        line: '<path d="M7 15.5l3.5-3.5 2.5 2.5 4-4.5"/>',
    },
    video: {
        shape: '<path d="M5.5 6.5h8a2 2 0 012 2v7a2 2 0 01-2 2h-8a2 2 0 01-2-2v-7a2 2 0 012-2z"/>',
        line: '<path d="M15.5 10.5l5-2.5v8l-5-2.5"/>',
    },
    monitor: {
        shape: '<path d="M5.5 4.5h13a2 2 0 012 2V15a2 2 0 01-2 2h-13a2 2 0 01-2-2V6.5a2 2 0 012-2z"/>',
        line: '<path d="M9 20.5h6M12 17v3.5"/>',
    },
    lifebuoy: {
        shape: '<circle cx="12" cy="12" r="8.5"/>',
        line: '<circle cx="12" cy="12" r="3.5"/>',
        soft: '<path d="M6 6l3.5 3.5M18 6l-3.5 3.5M6 18l3.5-3.5M18 18l-3.5-3.5"/>',
    },
    'minus-circle': { shape: '<circle cx="12" cy="12" r="8.5"/>', line: '<path d="M8.5 12h7"/>' },
    'check-square': {
        shape: '<path d="M6.5 3.5h11a3 3 0 013 3v11a3 3 0 01-3 3h-11a3 3 0 01-3-3v-11a3 3 0 013-3z"/>',
        line: '<path d="M8.3 12.3l2.5 2.5 5-5.3"/>',
    },
    'alert-circle': { shape: '<circle cx="12" cy="12" r="8.5"/>', line: '<path d="M12 7.8v4.7"/>', dot: [[12, 16]] },
    image: {
        shape: '<path d="M6.5 4h11a3 3 0 013 3v10a3 3 0 01-3 3h-11a3 3 0 01-3-3V7a3 3 0 013-3z"/>',
        line: '<path d="M3.5 16l5-5 4 4 3-3 5 5"/>',
        dot: [[8.5, 8.5]],
    },
    palette: {
        shape: '<path d="M12 3.5a8.5 8.5 0 100 17c1.4 0 2-.9 2-1.8 0-1.4-1.2-1.7-1.2-2.8 0-1 .8-1.6 1.8-1.6H17a3.5 3.5 0 003.5-3.5C20.5 6.7 16.7 3.5 12 3.5z"/>',
        dot: [[7.5, 11], [10, 7.5], [14.5, 7.5]],
    },
    type: { line: '<path d="M5 6.5V5h14v1.5M12 5v14.5M9 19.5h6"/>' },
} as const satisfies Record<string, IconDef>;

export type IconName = keyof typeof ICONS;

export function iconInner(name: IconName): string {
    const d: IconDef = ICONS[name];
    const parts: string[] = [];
    if (d.shape) parts.push(`<g fill="currentColor" fill-opacity=".12">${d.shape}</g>`);
    if (d.line) parts.push(d.line);
    if (d.soft) parts.push(`<g opacity=".5">${d.soft}</g>`);
    if (d.dot) parts.push(d.dot.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.3" fill="currentColor" stroke="none"/>`).join(''));
    return parts.join('');
}

export function iconSvg(name: IconName, cls = '', stroke = 1.5, size?: number): string {
    const c = cls ? ` class="${cls}"` : '';
    const z = size ? ` width="${size}" height="${size}"` : '';
    return `<svg${c}${z} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconInner(name)}</svg>`;
}

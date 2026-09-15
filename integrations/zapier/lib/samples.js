'use strict';

const QUOTE = {
    object_id: '3f1c9a52-7b8e-4d21-9c0a-5e6f7a8b9c0d',
    folio: 'COT-00104',
    status: 'approved',
    moneda: 'MXN',
    total: 58000,
    cliente: 'Stark Industries',
    cliente_id: '8a2d4e6f-1b3c-4d5e-8f9a-0b1c2d3e4f5a',
    link_publico: 'https://cordhq.app/q/3xYz9KpQ',
};

const INVOICE = {
    object_id: '6b7c8d9e-0f1a-4b2c-9d3e-4f5a6b7c8d9e',
    object: 'invoice',
    numero: 'F-00021',
    folio_fiscal: null,
    estado: 'paid',
    estado_fiscal: 'valid',
    pais: 'MX',
    tipo: 'invoice',
    moneda: 'MXN',
    total: 58000,
    pagado: 58000,
    saldo: 0,
    vence: '2026-10-15',
    cliente: 'Stark Industries',
    cotizacion_id: '3f1c9a52-7b8e-4d21-9c0a-5e6f7a8b9c0d',
    link_publico: 'https://cordhq.app/i/7hQw2LmN',
};

const CLIENT = {
    object_id: '8a2d4e6f-1b3c-4d5e-8f9a-0b1c2d3e4f5a',
    object: 'client',
    empresa: 'Stark Industries',
    contacto: 'Pepper Potts',
    email: 'compras@stark.com',
    telefono: '+52 55 1234 5678',
    rfc: 'STA120412XYZ',
    terminos: 'net30',
    country_code: 'MX',
};

const PRODUCT = {
    object_id: '2c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e6f',
    object: 'product',
    sku: 'SRV-001',
    nombre: 'Implementation',
    unidad: 'service',
    precio_lista: 12000,
    activo: true,
};

const TASK = {
    object_id: '9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a',
    object: 'task',
    titulo: 'Call Stark Industries about COT-00104',
    due_date: '2026-09-20',
    done: false,
    cotizacion_id: '3f1c9a52-7b8e-4d21-9c0a-5e6f7a8b9c0d',
};

const PROMISE = {
    object_id: '4e5f6a7b-8c9d-4e0f-9a1b-2c3d4e5f6a7b',
    object: 'promise',
    cotizacion_id: '3f1c9a52-7b8e-4d21-9c0a-5e6f7a8b9c0d',
    fecha_promesa: '2026-09-30',
    monto: 20000,
    estado: 'pendiente',
};

const BY_PREFIX = {
    'quote.': QUOTE,
    'payment.': { ...QUOTE, monto: 20000, saldo_pendiente: 38000, tipo: 'anticipo' },
    'invoice.issued': QUOTE,
    'invoice.stamped': QUOTE,
    'invoice.': INVOICE,
    'client.': CLIENT,
    'product.': PRODUCT,
    'task.': TASK,
    'promise.': PROMISE,
};

function sampleFor(eventKey) {
    const match = Object.keys(BY_PREFIX).find((p) => eventKey === p || eventKey.startsWith(p));
    const data = match ? BY_PREFIX[match] : QUOTE;
    return { id: 'evt_7d3f1a9b2c4e6f80', event: eventKey, created_at: '2026-09-14T18:30:00.000Z', ...data };
}

module.exports = { sampleFor, QUOTE, INVOICE, CLIENT, TASK };

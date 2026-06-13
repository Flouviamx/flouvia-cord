// src/lib/onboarding.ts
// Packs de arranque por industria: al registrarse, el usuario elige su giro y
// precargamos un catálogo + clientes de ejemplo para llegar a su primera
// cotización en minutos. Los consume /api/onboarding/seed.

export interface SeedProducto { sku: string; nombre: string; precio: number; unidad: string; }
export interface SeedCliente { empresa: string; contacto: string; email: string; terminos: string; limite: number | null; }
export interface IndustriaPack {
    slug: string;
    nombre: string;
    emoji: string;
    descripcion: string;
    productos: SeedProducto[];
    clientes: SeedCliente[];
}

export const PACKS: IndustriaPack[] = [
    {
        slug: 'construccion',
        nombre: 'Construcción y materiales',
        emoji: '🏗️',
        descripcion: 'Cemento, varilla, agregados y más, con unidades reales.',
        productos: [
            { sku: 'CEM-50', nombre: 'Cemento gris 50kg', precio: 198, unidad: 'saco' },
            { sku: 'VAR-38', nombre: 'Varilla 3/8" × 12m', precio: 189, unidad: 'pieza' },
            { sku: 'BLK-152', nombre: 'Block hueco 15×20×40', precio: 16.5, unidad: 'pieza' },
            { sku: 'MAL-66', nombre: 'Malla electrosoldada 6×6', precio: 332, unidad: 'rollo' },
            { sku: 'ARE-M3', nombre: 'Arena de río', precio: 410, unidad: 'm³' },
            { sku: 'GRA-M3', nombre: 'Grava 3/4"', precio: 465, unidad: 'm³' },
        ],
        clientes: [
            { empresa: 'Constructora GAMA', contacto: 'Lucía Ferreira', email: 'compras@gama.mx', terminos: 'net60', limite: 850000 },
            { empresa: 'Obras del Norte SA', contacto: 'Daniela Quintero', email: 'dquintero@odn.mx', terminos: 'net30', limite: 320000 },
        ],
    },
    {
        slug: 'distribuidoras',
        nombre: 'Distribuidoras y mayoristas',
        emoji: '📦',
        descripcion: 'Catálogo amplio con precio por cliente y crédito.',
        productos: [
            { sku: 'TOR-14', nombre: 'Tornillo hexagonal 1/4" (caja 100)', precio: 240, unidad: 'caja' },
            { sku: 'TUB-PVC', nombre: 'Tubo PVC 4" × 6m', precio: 320, unidad: 'tramo' },
            { sku: 'CAB-12', nombre: 'Cable THW cal. 12 (rollo 100m)', precio: 1180, unidad: 'rollo' },
            { sku: 'PIN-19', nombre: 'Pintura vinílica 19L', precio: 980, unidad: 'cubeta' },
            { sku: 'HER-MAR', nombre: 'Martillo de uña 16oz', precio: 145, unidad: 'pieza' },
            { sku: 'SIL-280', nombre: 'Silicón transparente 280ml', precio: 48, unidad: 'pieza' },
        ],
        clientes: [
            { empresa: 'Ferretería El Tornillo', contacto: 'Raúl Mendoza', email: 'compras@eltornillo.mx', terminos: 'net30', limite: 250000 },
            { empresa: 'Grupo Ferrex', contacto: 'Marco Ruiz', email: 'mruiz@ferrex.mx', terminos: 'contado', limite: null },
        ],
    },
    {
        slug: 'manufactura',
        nombre: 'Manufactura',
        emoji: '⚙️',
        descripcion: 'Materia prima y procesos cotizados por lote.',
        productos: [
            { sku: 'ACE-A36', nombre: 'Placa de acero A36 6mm', precio: 1240, unidad: 'pieza' },
            { sku: 'CNC-4F22', nombre: 'Maquinado CNC pieza 4F-22', precio: 86.5, unidad: 'pieza' },
            { sku: 'ALU-606', nombre: 'Perfil de aluminio 6061', precio: 410, unidad: 'tramo' },
            { sku: 'SOL-E70', nombre: 'Soldadura E7018 (kg)', precio: 92, unidad: 'kg' },
            { sku: 'PIN-ELE', nombre: 'Pintura electrostática (m²)', precio: 120, unidad: 'm²' },
        ],
        clientes: [
            { empresa: 'Ensambles del Norte', contacto: 'Karla Ibáñez', email: 'compras@ensambles.mx', terminos: 'net30', limite: 400000 },
            { empresa: 'Metálica Industrial SA', contacto: 'Jorge Lara', email: 'jlara@metalica.mx', terminos: 'net60', limite: 600000 },
        ],
    },
    {
        slug: 'servicios',
        nombre: 'Servicios profesionales',
        emoji: '💼',
        descripcion: 'Honorarios y paquetes de servicio por hora o proyecto.',
        productos: [
            { sku: 'CONS-HR', nombre: 'Consultoría (hora)', precio: 850, unidad: 'hora' },
            { sku: 'DIS-PROY', nombre: 'Diseño de proyecto', precio: 18000, unidad: 'proyecto' },
            { sku: 'IMP-MES', nombre: 'Implementación (mensual)', precio: 25000, unidad: 'mes' },
            { sku: 'SOP-MES', nombre: 'Soporte y mantenimiento (mensual)', precio: 6500, unidad: 'mes' },
            { sku: 'CAP-SES', nombre: 'Capacitación (sesión)', precio: 4200, unidad: 'sesión' },
        ],
        clientes: [
            { empresa: 'Despacho Vértice', contacto: 'Ana Solís', email: 'ana@vertice.mx', terminos: 'net30', limite: null },
            { empresa: 'Corporativo Lumen', contacto: 'Diego Paredes', email: 'dparedes@lumen.mx', terminos: 'net30', limite: 200000 },
        ],
    },
];

export const findPack = (slug: string) => PACKS.find((p) => p.slug === slug);

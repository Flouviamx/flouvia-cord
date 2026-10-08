// Unidades sugeridas al dar de alta un producto, por tipo de venta e idioma.
// Son sugerencias de un <datalist>: la unidad sigue siendo texto libre, porque
// ningún catálogo cubre todos los giros. Cada una tiene su clave de unidad del
// SAT en src/lib/fiscal/sat-claves.ts (lo verifica test/sat-claves.test.ts),
// así que un producto mexicano que usa una sugerencia timbra con la unidad
// correcta sin capturar nada más.

export type ProductKind = 'bien' | 'servicio' | 'suscripcion';

export const PRODUCT_UNITS: Record<'es' | 'en', Record<ProductKind, string[]>> = {
    en: {
        bien: ['unit', 'box', 'pack', 'set', 'pair', 'dozen', 'kg', 'g', 'lb', 'ton', 'L', 'mL', 'gal', 'm', 'ft', 'm²', 'm³', 'roll', 'bag', 'pallet'],
        servicio: ['service', 'hour', 'day', 'week', 'project', 'visit', 'session', 'trip', 'km'],
        suscripcion: ['month', 'year', 'license', 'user', 'seat'],
    },
    es: {
        bien: ['pieza', 'caja', 'paquete', 'juego', 'par', 'docena', 'kg', 'g', 'lb', 'tonelada', 'L', 'mL', 'galón', 'm', 'pie', 'm²', 'm³', 'rollo', 'saco', 'tarima'],
        servicio: ['servicio', 'hora', 'día', 'semana', 'proyecto', 'visita', 'sesión', 'viaje', 'km'],
        suscripcion: ['mes', 'año', 'licencia', 'usuario', 'asiento'],
    },
};

// Catálogos del SAT (subconjunto usado en cotizaciones B2B). Alimentan los
// selects de Datos fiscales y, a futuro, el timbrado CFDI 4.0.

// c_RegimenFiscal — los más comunes para negocios.
export const REGIMENES_FISCALES: { codigo: string; nombre: string }[] = [
    { codigo: '601', nombre: '601 — General de Ley Personas Morales' },
    { codigo: '603', nombre: '603 — Personas Morales con Fines no Lucrativos' },
    { codigo: '605', nombre: '605 — Sueldos y Salarios e Ingresos Asimilados a Salarios' },
    { codigo: '606', nombre: '606 — Arrendamiento' },
    { codigo: '612', nombre: '612 — Personas Físicas con Actividades Empresariales y Profesionales' },
    { codigo: '620', nombre: '620 — Sociedades Cooperativas de Producción' },
    { codigo: '621', nombre: '621 — Incorporación Fiscal' },
    { codigo: '626', nombre: '626 — Régimen Simplificado de Confianza (RESICO)' },
];

// c_UsoCFDI — usos frecuentes en compras B2B.
export const USOS_CFDI: { codigo: string; nombre: string }[] = [
    { codigo: 'G01', nombre: 'G01 — Adquisición de mercancías' },
    { codigo: 'G03', nombre: 'G03 — Gastos en general' },
    { codigo: 'I01', nombre: 'I01 — Construcciones' },
    { codigo: 'I02', nombre: 'I02 — Mobiliario y equipo de oficina' },
    { codigo: 'I04', nombre: 'I04 — Equipo de cómputo y accesorios' },
    { codigo: 'I08', nombre: 'I08 — Otra maquinaria y equipo' },
    { codigo: 'S01', nombre: 'S01 — Sin efectos fiscales' },
    { codigo: 'CP01', nombre: 'CP01 — Pagos' },
];

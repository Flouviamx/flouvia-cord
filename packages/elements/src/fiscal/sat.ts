// Catálogos del SAT (subconjunto usado en cotizaciones B2B) con la persona a la
// que aplica cada clave. El CFDI 4.0 rechaza un régimen que no corresponde al
// tipo de RFC; filtrar aquí evita que el error aparezca hasta el timbrado.

export type PersonaFiscal = 'fisica' | 'moral';

export interface SatClave {
    codigo: string;
    nombre: string;
    personas: readonly PersonaFiscal[];
}

const AMBAS: readonly PersonaFiscal[] = ['fisica', 'moral'];

// c_RegimenFiscal
export const REGIMENES_FISCALES: SatClave[] = [
    { codigo: '601', nombre: '601 — General de Ley Personas Morales', personas: ['moral'] },
    { codigo: '603', nombre: '603 — Personas Morales con Fines no Lucrativos', personas: ['moral'] },
    { codigo: '605', nombre: '605 — Sueldos y Salarios e Ingresos Asimilados a Salarios', personas: ['fisica'] },
    { codigo: '606', nombre: '606 — Arrendamiento', personas: ['fisica'] },
    { codigo: '612', nombre: '612 — Personas Físicas con Actividades Empresariales y Profesionales', personas: ['fisica'] },
    { codigo: '616', nombre: '616 — Sin obligaciones fiscales', personas: ['fisica'] },
    { codigo: '620', nombre: '620 — Sociedades Cooperativas de Producción', personas: ['moral'] },
    { codigo: '621', nombre: '621 — Incorporación Fiscal', personas: ['fisica'] },
    { codigo: '626', nombre: '626 — Régimen Simplificado de Confianza (RESICO)', personas: AMBAS },
];

// c_UsoCFDI
export const USOS_CFDI: SatClave[] = [
    { codigo: 'G01', nombre: 'G01 — Adquisición de mercancías', personas: AMBAS },
    { codigo: 'G03', nombre: 'G03 — Gastos en general', personas: AMBAS },
    { codigo: 'I01', nombre: 'I01 — Construcciones', personas: AMBAS },
    { codigo: 'I02', nombre: 'I02 — Mobiliario y equipo de oficina', personas: AMBAS },
    { codigo: 'I04', nombre: 'I04 — Equipo de cómputo y accesorios', personas: AMBAS },
    { codigo: 'I08', nombre: 'I08 — Otra maquinaria y equipo', personas: AMBAS },
    { codigo: 'S01', nombre: 'S01 — Sin efectos fiscales', personas: AMBAS },
    { codigo: 'CP01', nombre: 'CP01 — Pagos', personas: AMBAS },
];

export function regimenesPara(persona: PersonaFiscal | null): SatClave[] {
    return persona ? REGIMENES_FISCALES.filter((r) => r.personas.includes(persona)) : REGIMENES_FISCALES;
}

export function usosCfdiPara(persona: PersonaFiscal | null): SatClave[] {
    return persona ? USOS_CFDI.filter((u) => u.personas.includes(persona)) : USOS_CFDI;
}

// Francia: periodos y plazos del e-reporting según el régimen de TVA del
// negocio. Fuente primaria: DGFiP, Dossier général des spécifications externes
// v3.2 (30/04/2026), §3.7.7 y Tableau 13 "Les périodes de transmission par
// régime de TVA". El plazo que importa aquí es el de la columna "Date limite de
// transmission des données de la période à la plateforme agréée": hasta ese
// día el negocio (Cord en su nombre) debe haber entregado los datos a su
// plataforma; la plataforma los lleva al PPF después.
//
//   Régimen                     Transacciones                      Pagos
//   réel normal mensuel         por décadas: 1-10 → día 20,        mes → día 10 del
//                               11-20 → último día del mes,        mes siguiente
//                               21-fin → día 10 del mes siguiente
//   réel normal trimestriel     mes → día 10 del mes siguiente     ídem
//   simplifié (RSI)             mes → último día del mes siguiente ídem
//   franchise en base           bimestre civil (ene-feb, mar-abr…) → último
//                               día del mes siguiente al bimestre  ídem
//
// La plataforma agrupa por su cuenta lo que recibe en el expediente del
// periodo (Iopole lo hace con el régimen declarado al darse de alta), así que
// Cord manda cada día cerrado en cuanto termina; el plazo sirve para decir a
// tiempo que algo está por vencer o ya venció.
//
// Puro: sin base de datos ni red.

/** Régimen de TVA en Francia. `franchise` sale de la franquicia del perfil fiscal (vat_regime). */
export type RegimenTva = 'reel_mensuel' | 'reel_trimestriel' | 'simplifie' | 'franchise';

/** Los que el negocio elige en Ajustes; la franquicia ya tiene su propio interruptor. */
export const REGIMENES_TVA_ELEGIBLES = ['reel_mensuel', 'reel_trimestriel', 'simplifie'] as const;

export const ETIQUETA_REGIMEN: Record<RegimenTva, { es: string; en: string; fr: string }> = {
    reel_mensuel: { es: 'Régimen real normal, declaración mensual', en: 'Standard regime, monthly returns', fr: 'Réel normal mensuel' },
    reel_trimestriel: { es: 'Régimen real normal, declaración trimestral', en: 'Standard regime, quarterly returns', fr: 'Réel normal trimestriel' },
    simplifie: { es: 'Régimen simplificado (declaración anual)', en: 'Simplified regime (annual return)', fr: 'Régime simplifié d’imposition' },
    franchise: { es: 'Franquicia en base de TVA', en: 'VAT franchise', fr: 'Franchise en base de TVA' },
};

/** El régimen del negocio desde su perfil fiscal, o null si no lo declaró. */
export function regimenDe(fm: Record<string, unknown> | null | undefined): RegimenTva | null {
    if (fm?.vat_regime === 'small_business') return 'franchise';
    const v = String(fm?.fr_regime_tva ?? '');
    return (REGIMENES_TVA_ELEGIBLES as readonly string[]).includes(v) ? v as RegimenTva : null;
}

export type TipoDato = 'transaccion' | 'pago';

export interface Periodo {
    /** Etiqueta estable: '2026-10' (mes), '2026-10-D1' (década), '2026-B5' (bimestre). */
    clave: string;
    inicio: string;
    fin: string;
    /** Último día para entregar los datos a la plataforma. */
    limite: string;
}

const pad = (n: number) => String(n).padStart(2, '0');
const ultimoDia = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const dia = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const siguiente = (y: number, m: number): [number, number] => (m === 12 ? [y + 1, 1] : [y, m + 1]);

function partes(fecha: string): [number, number, number] {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(fecha).slice(0, 10));
    if (!m) throw new RangeError(`fecha inválida: ${fecha}`);
    return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function mes(y: number, m: number, limite: (y: number, m: number) => string): Periodo {
    return { clave: `${y}-${pad(m)}`, inicio: dia(y, m, 1), fin: dia(y, m, ultimoDia(y, m)), limite: limite(y, m) };
}

const dia10Siguiente = (y: number, m: number) => { const [sy, sm] = siguiente(y, m); return dia(sy, sm, 10); };
const finSiguiente = (y: number, m: number) => { const [sy, sm] = siguiente(y, m); return dia(sy, sm, ultimoDia(sy, sm)); };

/** El periodo de e-reporting al que pertenece una fecha (aaaa-mm-dd) y su plazo. */
export function periodoDe(regimen: RegimenTva, tipo: TipoDato, fecha: string): Periodo {
    const [y, m, d] = partes(fecha);
    switch (regimen) {
        case 'reel_mensuel': {
            if (tipo === 'pago') return mes(y, m, dia10Siguiente);
            if (d <= 10) return { clave: `${y}-${pad(m)}-D1`, inicio: dia(y, m, 1), fin: dia(y, m, 10), limite: dia(y, m, 20) };
            if (d <= 20) return { clave: `${y}-${pad(m)}-D2`, inicio: dia(y, m, 11), fin: dia(y, m, 20), limite: dia(y, m, ultimoDia(y, m)) };
            return { clave: `${y}-${pad(m)}-D3`, inicio: dia(y, m, 21), fin: dia(y, m, ultimoDia(y, m)), limite: dia10Siguiente(y, m) };
        }
        case 'reel_trimestriel':
            return mes(y, m, dia10Siguiente);
        case 'simplifie':
            return mes(y, m, finSiguiente);
        case 'franchise': {
            // Bimestres civiles: empiezan el 1 de enero, marzo, mayo, julio,
            // septiembre y noviembre (nota 126 del Dossier général).
            const b = Math.ceil(m / 2);
            const m1 = b * 2 - 1;
            const m2 = m1 + 1;
            return { clave: `${y}-B${b}`, inicio: dia(y, m1, 1), fin: dia(y, m2, ultimoDia(y, m2)), limite: finSiguiente(y, m2) };
        }
    }
}

/** Días que faltan para el plazo (negativo: vencido). Fechas aaaa-mm-dd. */
export function diasHasta(limite: string, hoy: string): number {
    const [ly, lm, ld] = partes(limite);
    const [hy, hm, hd] = partes(hoy);
    return Math.round((Date.UTC(ly, lm - 1, ld) - Date.UTC(hy, hm - 1, hd)) / 86_400_000);
}

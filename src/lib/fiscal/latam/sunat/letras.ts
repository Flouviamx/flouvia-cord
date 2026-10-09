// Importe en letras para la leyenda 1000 "Monto en Letras" del catálogo 52
// (Anexo N.° 8): "CIENTO DIECIOCHO CON 00/100 SOLES". El formato
// "<entero en letras> CON <centavos>/100 <moneda>" es el de los ejemplos de
// las guías de elaboración UBL 2.1 de SUNAT.
//
// Puro: lo cargan los scripts de contrato con Node plano.

const UNIDADES = ['', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE',
    'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE',
    'VEINTE', 'VEINTIUNO', 'VEINTIDÓS', 'VEINTITRÉS', 'VEINTICUATRO', 'VEINTICINCO', 'VEINTISÉIS', 'VEINTISIETE',
    'VEINTIOCHO', 'VEINTINUEVE'];
const DECENAS = ['', '', '', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
const CENTENAS = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS',
    'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

/** 0..999, con "UN" en lugar de "UNO" cuando precede a MIL/MILLÓN. */
function hastaMil(n: number, apocope: boolean): string {
    if (n === 0) return '';
    if (n === 100) return 'CIEN';
    const c = Math.floor(n / 100);
    const resto = n % 100;
    let r = '';
    if (resto < 30) {
        r = UNIDADES[resto];
        if (apocope) {
            if (resto === 1) r = 'UN';
            else if (resto === 21) r = 'VEINTIÚN';
        }
    } else {
        const d = Math.floor(resto / 10);
        const u = resto % 10;
        r = DECENAS[d] + (u ? ` Y ${u === 1 && apocope ? 'UN' : UNIDADES[u]}` : '');
    }
    return [CENTENAS[c], r].filter(Boolean).join(' ');
}

/** Entero no negativo en letras (hasta 999 999 999 999). */
export function enteroEnLetras(n: number): string {
    if (!Number.isInteger(n) || n < 0 || n > 999_999_999_999) throw new Error('importe fuera de rango para expresarlo en letras');
    if (n === 0) return 'CERO';
    const millones = Math.floor(n / 1_000_000);
    const miles = Math.floor((n % 1_000_000) / 1000);
    const resto = n % 1000;
    const partes: string[] = [];
    if (millones) {
        partes.push(millones === 1 ? 'UN MILLÓN' : `${millonesEnLetras(millones)} MILLONES`);
    }
    if (miles) partes.push(miles === 1 ? 'MIL' : `${hastaMil(miles, true)} MIL`);
    if (resto) partes.push(hastaMil(resto, false));
    return partes.join(' ');
}

function millonesEnLetras(n: number): string {
    // n < 1 000 000: puede llevar miles ("DOS MIL MILLONES").
    const miles = Math.floor(n / 1000);
    const resto = n % 1000;
    return [miles ? (miles === 1 ? 'MIL' : `${hastaMil(miles, true)} MIL`) : '', resto ? hastaMil(resto, true) : '']
        .filter(Boolean).join(' ');
}

/** Nombre de la moneda en la leyenda. Para las que no tienen nombre propio aquí se usa su código ISO 4217. */
const MONEDAS: Record<string, string> = {
    PEN: 'SOLES',
    USD: 'DÓLARES AMERICANOS',
    EUR: 'EUROS',
};

/**
 * "CIENTO DIECIOCHO CON 00/100 SOLES". `importe` es el texto decimal que va en
 * el XML (dos decimales), para que la leyenda diga exactamente lo mismo.
 */
export function montoEnLetras(importe: string, moneda: string): string {
    const m = /^(\d+)\.(\d{2})$/.exec(String(importe));
    if (!m) throw new Error('importe con formato inesperado');
    const nombre = MONEDAS[moneda.toUpperCase()] ?? moneda.toUpperCase();
    return `${enteroEnLetras(Number(m[1]))} CON ${m[2]}/100 ${nombre}`;
}

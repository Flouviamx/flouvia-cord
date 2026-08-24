// Validación del identificador fiscal por país.
//
// La única validación que existía en todo el repo era el RFC mexicano — para
// el resto (España incluida) el único filtro era "al menos 5 caracteres". Un
// NIF, NIE o CIF con un dígito de control mal tecleado se guardaba igual, y el
// primer aviso real llegaba cuando el SAT... salvo que España no tiene SAT: el
// aviso llegaba cuando el propio cliente o el banco rechazaban el documento.
//
// Mismo patrón que payout-fields.ts: el checksum se verifica AQUÍ, con un
// mensaje accionable, no dejando que el problema aparezca río abajo sin
// explicación (regla 14).

/** RFC mexicano: 3–4 letras + 6 dígitos (AAMMDD) + 3 caracteres alfanuméricos. */
const RFC_RE = /^[A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3}$/i;

export function validRfc(value: string): boolean {
    return RFC_RE.test(String(value || '').trim());
}

// Letra de control española: resto de dividir el número entre 23, indexado en
// esta tabla. Es la MISMA fórmula para NIF y para NIE (el NIE solo antepone
// X/Y/Z como si fueran 0/1/2). Verificado a mano: 12345678 % 23 = 14 → 'Z'
// ("12345678Z" es el NIF de ejemplo que cita la propia documentación de la
// Agencia Tributaria); "X1234567L" es el NIE de ejemplo equivalente.
const NIF_LETTERS = 'TRWAGMYFPDXBNJZSQVHLCKE';

export function validNif(value: string): boolean {
    const clean = String(value || '').trim().toUpperCase().replace(/[\s-]/g, '');
    const m = /^(\d{8})([A-Z])$/.exec(clean);
    if (!m) return false;
    return NIF_LETTERS[Number(m[1]) % 23] === m[2];
}

export function validNie(value: string): boolean {
    const clean = String(value || '').trim().toUpperCase().replace(/[\s-]/g, '');
    const m = /^([XYZ])(\d{7})([A-Z])$/.exec(clean);
    if (!m) return false;
    const prefix = { X: '0', Y: '1', Z: '2' }[m[1]] as string;
    const num = Number(prefix + m[2]);
    return NIF_LETTERS[num % 23] === m[3];
}

// Letra de control del CIF: para las siglas que declaran su tipo de control
// explícitamente en la norma, se exige esa forma exacta; para el resto
// (histórico y ambiguo entre fuentes) se aceptan las dos formas — un CIF real
// rechazado por una regla demasiado estricta es peor que uno inválido que se
// cuela, porque bloquea a un negocio real sin que haya nada que corregir.
const CIF_DIGIT_ONLY = new Set(['A', 'B', 'E', 'H']);
const CIF_LETTER_ONLY = new Set(['N', 'P', 'Q', 'R', 'S', 'W']);
const CIF_CONTROL_LETTERS = 'JABCDEFGHI';

export function validCif(value: string): boolean {
    const clean = String(value || '').trim().toUpperCase().replace(/[\s-]/g, '');
    const m = /^([A-HJ-NP-SUVW])(\d{7})([0-9A-J])$/.exec(clean);
    if (!m) return false;
    const [, letter, digits, control] = m;

    let sumEven = 0;
    let sumOdd = 0;
    for (let i = 0; i < 7; i++) {
        const d = Number(digits[i]);
        if (i % 2 === 1) {
            // Posiciones pares (2ª, 4ª, 6ª cifra: índices 1,3,5): se suman tal cual.
            sumEven += d;
        } else {
            // Posiciones impares: se duplican; si el resultado es ≥10, se
            // suman sus dígitos (equivale a restar 9 para un solo dígito×2).
            const doubled = d * 2;
            sumOdd += doubled >= 10 ? doubled - 9 : doubled;
        }
    }
    const controlDigit = (10 - ((sumEven + sumOdd) % 10)) % 10;
    const controlLetter = CIF_CONTROL_LETTERS[controlDigit];

    if (CIF_DIGIT_ONLY.has(letter)) return control === String(controlDigit);
    if (CIF_LETTER_ONLY.has(letter)) return control === controlLetter;
    return control === String(controlDigit) || control === controlLetter;
}

/** NIF, NIE o CIF español — el que corresponda según el primer carácter. */
export function validSpainTaxId(value: string): boolean {
    const clean = String(value || '').trim().toUpperCase();
    if (/^[XYZ]/.test(clean)) return validNie(clean);
    if (/^\d/.test(clean)) return validNif(clean);
    return validCif(clean);
}

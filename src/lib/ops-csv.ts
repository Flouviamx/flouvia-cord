// CSV de Cord Ops. Dos defensas que una hoja de cálculo necesita:
//  · Inyección de fórmulas: una celda que empieza con = + - @ (o tab/CR) la
//    ejecuta Excel o Sheets al abrir. El nombre de una organización lo escribe
//    su dueño, así que se antepone una comilla simple.
//  · BOM UTF-8 para que Excel lea acentos sin preguntar la codificación.
const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: unknown): string {
    if (value === null || value === undefined) return '';
    let text = value instanceof Date ? value.toISOString() : String(value);
    if (FORMULA_START.test(text)) text = `'${text}`;
    return /[",\n\r;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
    const lines = [headers.map(csvCell).join(','), ...rows.map((row) => row.map(csvCell).join(','))];
    return `﻿${lines.join('\r\n')}\r\n`;
}

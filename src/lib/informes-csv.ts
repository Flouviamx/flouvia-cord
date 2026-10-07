// Etiquetas y exportación CSV de los informes tabla (src/lib/informes-tabla.ts).
// La capa de datos devuelve claves de i18n; aquí se resuelven en el idioma de la
// cuenta. El CSV sigue el contrato de las hojas (Sheets/Excel): importes como
// NÚMERO, con su divisa en una columna propia — nunca "$1,234" como texto.
import { t } from '../i18n/app';
import type { TablaReport } from './informes-tabla';

type L = 'es' | 'en';

/** Resuelve una etiqueta de informe: clave de i18n, "Mes N" o método de pago. */
export function tablaLabel(locale: L, key: string): string {
    if (key.startsWith('inf.t.mes_n:')) return t(locale, 'inf.t.mes_n').replace('{n}', key.slice('inf.t.mes_n:'.length));
    if (key.startsWith('metodo:')) {
        const metodo = key.slice('metodo:'.length);
        const metodoKey = 'inf.metodo.' + metodo;
        const translated = t(locale, metodoKey as any);
        // Un método que Cord todavía no nombra se muestra tal cual, no como clave cruda.
        return translated === metodoKey ? metodo : translated;
    }
    return t(locale, key as any);
}

function cell(value: unknown): string {
    if (value === null || value === undefined) return '';
    let text = typeof value === 'number' ? (Number.isInteger(value) ? String(value) : value.toFixed(2)) : String(value);
    // Inyección de fórmulas: un cliente llamado "=HYPERLINK(...)" se ejecutaría al abrir
    // el archivo en Excel o Sheets. Solo aplica a TEXTO; los importes viajan como número.
    if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return /[",\n\r;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function tablaToCsv(report: TablaReport, locale: L): string {
    const hasMoney = report.columns.some((c) => c.format === 'money');
    const header = [...report.columns.map((c) => tablaLabel(locale, c.label)), ...(hasMoney ? [t(locale, 'inf.t.divisa')] : [])];
    const lines = [header.map(cell).join(',')];
    for (const row of report.rows) {
        const values = report.columns.map((c) => {
            const v = row[c.key];
            return c.key === 'metodo' && typeof v === 'string' ? tablaLabel(locale, `metodo:${v}`) : v;
        });
        lines.push([...values, ...(hasMoney ? [report.moneda.moneda] : [])].map(cell).join(','));
    }
    // BOM: Excel abre el UTF-8 con acentos solo si lo trae.
    return '﻿' + lines.join('\r\n') + '\r\n';
}

import { describe, expect, it } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { sanitizeDraft, sanitizeReviewed, proposalCounts } from '../src/lib/setup/plan';
import { parseCsv, parseXlsx, productsFromRows, visibleText, brandColors, normalizeSiteUrl, readPriceFile } from '../src/lib/setup/sources';

const MX = { country: 'MX', impuestosActuales: [{ kind: 'consumo', tasa: 16 }, { kind: 'exento', tasa: 0 }] };

describe('sanitizeDraft', () => {
    it('conserva un RFC válido y descarta uno inventado', () => {
        const ok = sanitizeDraft({ resumen: 'x', perfil: { identificacion_fiscal: 'EKU900317 3C9' } }, MX);
        expect(ok.propuesta.perfil.rfc).toBe('EKU9003173C9');
        const bad = sanitizeDraft({ resumen: 'x', perfil: { identificacion_fiscal: 'ABC123456XY1' } }, MX);
        expect(bad.propuesta.perfil.rfc).toBeUndefined();
        expect(bad.descartado.map((d) => d.campo)).toContain('perfil.identificacion_fiscal');
    });

    it('sin validador para el país, la identificación fiscal no se propone', () => {
        const r = sanitizeDraft({ resumen: 'x', perfil: { identificacion_fiscal: '900123456-1' } }, { country: 'CO', impuestosActuales: [] });
        expect(r.propuesta.perfil.rfc).toBeUndefined();
    });

    it('quita etiquetas y caracteres de control, y valida correo, teléfono y color', () => {
        const r = sanitizeDraft({
            resumen: '<script>alert(1)</script>Distribuidora',
            perfil: { nombre: '<b>Materiales</b> del Valle', email_contacto: 'no-es-correo', telefono: '+52 (442) 123 4567' },
            marca: { color_marca: 'red', usar_logo_del_sitio: true },
        }, MX);
        expect(r.propuesta.resumen).toBe('alert(1)Distribuidora');
        expect(r.propuesta.perfil.nombre).toBe('Materiales del Valle');
        expect(r.propuesta.perfil.telefono).toBe('+52 (442) 123 4567');
        expect(r.propuesta.perfil.email_contacto).toBeUndefined();
        expect(r.propuesta.marca.color_marca).toBeUndefined();
        expect(r.propuesta.marca.logo_url).toBeUndefined();
    });

    it('impuestos: no repite el catálogo, rechaza tasas absurdas y exentos con tasa', () => {
        const r = sanitizeDraft({
            resumen: 'x',
            impuestos: [
                { nombre: 'IVA 16%', kind: 'consumo', tasa: 16, motivo: 'ya existe' },
                { nombre: 'Retención fletes', kind: 'retencion', tasa: 4, motivo: 'la descripción lo pide' },
                { nombre: 'Raro', kind: 'consumo', tasa: 160, motivo: 'x' },
                { nombre: 'Exento con tasa', kind: 'exento', tasa: 5, motivo: 'x' },
            ],
        }, MX);
        expect(r.propuesta.impuestos).toEqual([{ nombre: 'Retención fletes', kind: 'retencion', tasa: 4, motivo: 'la descripción lo pide' }]);
        expect(r.descartado.length).toBe(2);
    });

    it('productos: deduplica por SKU o nombre y descarta precios inválidos', () => {
        const r = sanitizeDraft({
            resumen: 'x',
            productos: [
                { sku: 'cem-50', nombre: 'Cemento', precio: 182.004 },
                { sku: 'CEM-50', nombre: 'Cemento repetido', precio: 1 },
                { nombre: 'Varilla', precio: -3 },
                { nombre: 'Block', precio: 14.2, unidad: 'pieza' },
            ],
        }, MX);
        expect(r.propuesta.productos).toEqual([
            { sku: 'CEM-50', nombre: 'Cemento', unidad: 'pieza', precio: 182 },
            { sku: null, nombre: 'Block', unidad: 'pieza', precio: 14.2 },
        ]);
        expect(proposalCounts(r.propuesta).productos).toBe(2);
    });

    it('una propuesta con forma inválida no se aplica a medias', () => {
        const r = sanitizeDraft({ resumen: 5, productos: 'todo' }, MX);
        expect(r.propuesta.productos).toEqual([]);
        expect(r.descartado[0].campo).toBe('propuesta');
    });
});

describe('sanitizeReviewed', () => {
    it('el navegador no puede colar un logo propio: solo se conserva o se quita el descargado', () => {
        const ctx = { ...MX, logoDataUrl: 'data:image/png;base64,AAAA' };
        const kept = sanitizeReviewed({ marca: { logo_url: 'https://evil.example/x.png' } }, ctx);
        expect(kept.propuesta.marca.logo_url).toBe('data:image/png;base64,AAAA');
        const removed = sanitizeReviewed({ marca: {} }, ctx);
        expect(removed.propuesta.marca.logo_url).toBeUndefined();
        const sinLogo = sanitizeReviewed({ marca: { logo_url: 'https://evil.example/x.png' } }, MX);
        expect(sinLogo.propuesta.marca.logo_url).toBeUndefined();
    });

    it('vuelve a validar lo editado', () => {
        const r = sanitizeReviewed({ cotizaciones: { vigencia_default_dias: 9000, quote_prefix: 'md-v!' }, perfil: { rfc: 'FALSO' } }, MX);
        expect(r.propuesta.cotizaciones.vigencia_default_dias).toBeUndefined();
        expect(r.propuesta.cotizaciones.quote_prefix).toBe('MDV');
        expect(r.propuesta.perfil.rfc).toBeUndefined();
    });
});

describe('fuentes', () => {
    it('CSV con separador ; y comillas', () => {
        expect(parseCsv('Nombre;Precio\n"Cemento ""gris""";"1.234,56"\n\nBlock;14')).toEqual([
            ['Nombre', 'Precio'], ['Cemento "gris"', '1.234,56'], ['Block', '14'],
        ]);
    });

    it('lee productos por encabezado, con formato de número es y en', () => {
        const filas = [['Lista de precios 2026'], ['Código', 'Descripción', 'Unidad', 'Precio unitario'], ['CEM-50', 'Cemento 50 kg', 'bulto', '$1.234,56'], ['VAR-38', 'Varilla', 'pieza', '198.50'], ['', 'Sin precio', '', '']];
        expect(productsFromRows(filas)).toEqual([
            { nombre: 'Cemento 50 kg', precio: 1234.56, sku: 'CEM-50', unidad: 'bulto' },
            { nombre: 'Varilla', precio: 198.5, sku: 'VAR-38', unidad: 'pieza' },
        ]);
        expect(productsFromRows([['a', 'b'], ['1', '2']])).toBeNull();
    });

    it('lee la primera hoja de un .xlsx con cadenas compartidas', () => {
        const xlsx = zipSync({
            'xl/workbook.xml': strToU8('<workbook/>'),
            'xl/sharedStrings.xml': strToU8('<sst><si><t>Producto</t></si><si><t>Precio</t></si><si><t>Cemento &amp; cal</t></si></sst>'),
            'xl/worksheets/sheet1.xml': strToU8('<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="C2"><v>182.5</v></c></row></sheetData></worksheet>'),
        });
        expect(parseXlsx(xlsx)).toEqual([['Producto', 'Precio'], ['Cemento & cal', '', '182.5']]);
    });

    it('el texto del sitio no trae scripts y los colores ignoran grises', () => {
        const html = '<html><head><meta name="theme-color" content="#0F766E"><style>.a{color:#ffffff}.b{color:#1d4ed8}.c{color:#1d4ed8}</style><script>ignora("todo")</script></head><body><h1>Hola</h1><p>Vende &amp; cobra</p></body></html>';
        expect(visibleText(html)).toBe('Hola\nVende & cobra');
        expect(brandColors(html)).toEqual(['#0f766e', '#1d4ed8']);
    });

    it('normaliza la URL y rechaza credenciales o hosts sin dominio', () => {
        expect(normalizeSiteUrl('materialesdelvalle.mx/#inicio')).toBe('https://materialesdelvalle.mx/');
        expect(normalizeSiteUrl('https://user:pw@sitio.mx')).toBeNull();
        expect(normalizeSiteUrl('localhost:3000')).toBeNull();
        expect(normalizeSiteUrl('ftp://sitio.mx')).toBeNull();
    });

    it('identifica el archivo por su contenido, no por su nombre', async () => {
        const pdf = await readPriceFile(new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31])], 'lista.csv'));
        expect(pdf.ok && pdf.file.kind === 'document' && pdf.file.mime).toBe('application/pdf');
        const bin = await readPriceFile(new File([new Uint8Array([1, 0, 2, 3])], 'lista.csv'));
        expect(bin.ok).toBe(false);
        const csv = await readPriceFile(new File(['﻿Nombre,Precio\nBlock,14'], 'lista.xlsx'));
        expect(csv.ok && csv.file.kind === 'rows' && csv.file.filas).toEqual([['Nombre', 'Precio'], ['Block', '14']]);
    });
});

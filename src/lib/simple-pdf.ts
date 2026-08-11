// Generador PDF mínimo para evidencia textual. Evita una dependencia pesada en
// runtime y produce documentos autocontenidos con la fuente estándar Helvetica.
// El contenido se normaliza a ASCII porque los lectores PDF interpretan la fuente
// base con codificación WinAnsi; los datos originales permanecen en la base.

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const LINES_PER_PAGE = 45;

function ascii(value: unknown): string {
    return String(value ?? '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\x20-\x7e]/g, '?');
}

function escapePdf(value: string): string {
    return ascii(value).replace(/([\\()])/g, '\\$1');
}

function wrap(value: unknown, width = 88): string[] {
    const source = ascii(value).trim();
    if (!source) return [''];
    const lines: string[] = [];
    for (const paragraph of source.split(/\r?\n/)) {
        const words = paragraph.split(/\s+/).filter(Boolean);
        let line = '';
        for (const word of words) {
            const candidate = line ? `${line} ${word}` : word;
            if (candidate.length <= width) {
                line = candidate;
                continue;
            }
            if (line) lines.push(line);
            if (word.length <= width) line = word;
            else {
                for (let offset = 0; offset < word.length; offset += width) {
                    const chunk = word.slice(offset, offset + width);
                    if (chunk.length === width) lines.push(chunk);
                    else line = chunk;
                }
            }
        }
        if (line) lines.push(line);
        if (!words.length) lines.push('');
    }
    return lines;
}

export function createTextPdf(title: string, values: unknown[]): Buffer {
    const lines = values.flatMap((value) => wrap(value));
    const pages: string[][] = [];
    for (let offset = 0; offset < Math.max(lines.length, 1); offset += LINES_PER_PAGE) {
        pages.push(lines.slice(offset, offset + LINES_PER_PAGE));
    }

    const objects: Buffer[] = [];
    const pageRefs = pages.map((_, index) => `${4 + index * 2} 0 R`).join(' ');
    objects[1] = Buffer.from('<< /Type /Catalog /Pages 2 0 R >>');
    objects[2] = Buffer.from(`<< /Type /Pages /Kids [${pageRefs}] /Count ${pages.length} >>`);
    objects[3] = Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');

    pages.forEach((pageLines, index) => {
        const pageObject = 4 + index * 2;
        const contentObject = pageObject + 1;
        const commands = [
            'BT',
            '/F1 16 Tf',
            '54 742 Td',
            `(${escapePdf(title)}) Tj`,
            '0 -28 Td',
            '/F1 10 Tf',
            ...pageLines.flatMap((line) => [`(${escapePdf(line)}) Tj`, '0 -14 Td']),
            'ET',
        ].join('\n');
        const stream = Buffer.from(commands, 'ascii');
        objects[pageObject] = Buffer.from(
            `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
            `/Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObject} 0 R >>`,
        );
        objects[contentObject] = Buffer.concat([
            Buffer.from(`<< /Length ${stream.length} >>\nstream\n`),
            stream,
            Buffer.from('\nendstream'),
        ]);
    });

    const chunks: Buffer[] = [Buffer.from('%PDF-1.4\n')];
    const offsets: number[] = [0];
    let cursor = chunks[0].length;
    for (let id = 1; id < objects.length; id++) {
        offsets[id] = cursor;
        const object = Buffer.concat([
            Buffer.from(`${id} 0 obj\n`),
            objects[id],
            Buffer.from('\nendobj\n'),
        ]);
        chunks.push(object);
        cursor += object.length;
    }
    const xrefOffset = cursor;
    const xref = [
        `xref\n0 ${objects.length}\n`,
        '0000000000 65535 f \n',
        ...offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`),
        `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
    ].join('');
    chunks.push(Buffer.from(xref, 'ascii'));
    return Buffer.concat(chunks);
}

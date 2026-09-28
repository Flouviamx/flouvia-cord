// El correo en formato RFC 5322, que es lo que recibe la API de Gmail. Todo lo
// que viene de datos del negocio (nombres, asunto, destinatario) pasa por
// `linea()`: un salto de línea ahí dentro inyectaría encabezados nuevos.

export interface AdjuntoMime {
    filename: string;
    content: Uint8Array;
    contentType?: string;
}

export interface CorreoMime {
    from: string;
    fromName?: string | null;
    to: string;
    replyTo?: string | null;
    subject: string;
    html: string;
    attachments?: AdjuntoMime[];
}

const linea = (v: string) => String(v ?? '').replace(/[\r\n]+/g, ' ').trim();

/** Encabezado con texto no ASCII (acentos, "—"): RFC 2047 en base64. */
export function encabezadoUtf8(v: string): string {
    const limpio = linea(v);
    return /^[\x20-\x7e]*$/.test(limpio) ? limpio : `=?UTF-8?B?${Buffer.from(limpio, 'utf8').toString('base64')}?=`;
}

const base64Lineas = (buf: Buffer) => buf.toString('base64').replace(/.{1,76}/g, '$&\r\n').trimEnd();

const nombreArchivo = (v: string) => linea(v).replace(/["\\]/g, '').slice(0, 120) || 'adjunto';

export function construirMime(m: CorreoMime, boundary = `cord_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`): string {
    const from = m.fromName ? `${encabezadoUtf8(m.fromName.replace(/[<>"]/g, ''))} <${linea(m.from)}>` : linea(m.from);
    const cabeza = [
        `From: ${from}`,
        `To: ${linea(m.to)}`,
        ...(m.replyTo ? [`Reply-To: ${linea(m.replyTo)}`] : []),
        `Subject: ${encabezadoUtf8(m.subject)}`,
        'MIME-Version: 1.0',
        `Content-Type: multipart/mixed; boundary="${boundary}"`,
    ];
    const partes = [
        [
            `--${boundary}`,
            'Content-Type: text/html; charset="UTF-8"',
            'Content-Transfer-Encoding: base64',
            '',
            base64Lineas(Buffer.from(m.html, 'utf8')),
        ].join('\r\n'),
        ...(m.attachments ?? []).map((a) => {
            const nombre = nombreArchivo(a.filename);
            return [
                `--${boundary}`,
                `Content-Type: ${a.contentType || 'application/octet-stream'}; name="${nombre}"`,
                `Content-Disposition: attachment; filename="${nombre}"`,
                'Content-Transfer-Encoding: base64',
                '',
                base64Lineas(Buffer.from(a.content)),
            ].join('\r\n');
        }),
    ];
    return `${cabeza.join('\r\n')}\r\n\r\n${partes.join('\r\n')}\r\n--${boundary}--\r\n`;
}

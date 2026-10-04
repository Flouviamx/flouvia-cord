import sharp from 'sharp';

/** Embedded uploads only: never fetch arbitrary URLs while generating a document. */
export async function brandImagePng(source: unknown): Promise<Buffer | null> {
    if (typeof source !== 'string' || source.length > 1_500_000) return null;
    const match = /^data:image\/(?:png|jpe?g|webp|svg\+xml);base64,([a-z\d+/=\s]+)$/i.exec(source);
    if (!match) return null;
    try {
        return await sharp(Buffer.from(match[1], 'base64'), {limitInputPixels:16_000_000})
            .rotate().resize({width:480,height:180,fit:'inside',withoutEnlargement:true}).png().toBuffer();
    } catch { return null; }
}

export async function inlineBrandLogo(html: string) {
    const match = /<img data-cord-brand-logo src="(data:image\/[^\"]+)"[^>]*>/.exec(html);
    if (!match) return {html,attachments:[]};
    const content = await brandImagePng(match[1]);
    // The business name is always visible, including unsupported or invalid images.
    if (!content) return {html:html.replace(match[0],''),attachments:[]};
    const metadata = await sharp(content).metadata();
    const ratio = (metadata.width || 1) / (metadata.height || 1);
    const requestedHeight = Number(/height="(\d+)"/.exec(match[0])?.[1]) || 42;
    const height = Math.max(1,Math.round(Math.min(requestedHeight,200/ratio)));
    const width = Math.min(200,Math.max(1,Math.round(height*ratio)));
    const image = match[0].replace(match[1],'cid:cord-brand-logo').replace(/height="\d+"/,`height="${height}" width="${width}"`).replace(/height:\d+px/,`height:${height}px;width:${width}px`);
    return {html:html.replace(match[0],image),attachments:[{
        filename:'brand-logo.png',content:new Uint8Array(content),contentType:'image/png',contentId:'cord-brand-logo',
    }]};
}

import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { inflateSync } from 'node:zlib';
import { brandEmailShell, emailButtonStyle } from '../src/lib/brand-email';
import { renderQuoteEmail } from '../src/lib/brand-quote-email';
import { brandImagePng, inlineBrandLogo } from '../src/lib/brand-image';
import { construirMime } from '../src/lib/integraciones/gmail/mime';
import { createInvoicePdf, type InvoicePdfInput } from '../src/lib/fiscal/invoice-pdf';
import { measureText, truncateText, wrapText } from '../src/lib/pdf/writer';

const svg = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="40"><rect width="200" height="40" fill="#123456"/></svg>').toString('base64');
const row = {org_nombre:'Marca <segura>',empresa:'Cliente & hijos',folio:'COT-001',total:1234,base_currency:'JPY',moneda:'MXN',email_intro:'Introducción {cliente}: {total}',email_firma:'Firma privada',portal_powered:false};
const options = {locale:'es' as const,link:'https://example.test/q/token?a=1&b=2',canCustomizeEmail:true,canRemoveBranding:true};

describe('identidad compartida en documentos y correo', () => {
    it('escapa datos de marca y elige tinta legible sobre colores claros', () => {
        const html=brandEmailShell({name:'<script>alert(1)</script>',primary:'#ffffff',profile:{header:'contrast'},logo:'javascript:alert(1)'},'<p>Contenido</p>');
        expect(html).not.toContain('<script>'); expect(html).toContain('&lt;script&gt;');
        expect(html).not.toContain('<img'); expect(emailButtonStyle({name:'Marca',primary:'#ffffff'})).toContain('color:#000000');
    });
    it('usa la variante sobre color sin perder el nombre y respeta tipografía/densidad', () => {
        const html=brandEmailShell({name:'Marca',logo:'https://example.test/main.png',profile:{header:'contrast',logoDark:svg,font:'editorial',density:'compact',logoSize:'large'}},'Contenido');
        expect(html).toContain(svg); expect(html).not.toContain('main.png');
        expect(html).toContain('Georgia'); expect(html).toContain('height="60"'); expect(html).toContain('padding:24px');
    });
    it('respeta el entitlement de textos propios y marca Cord; usa la moneda del documento', () => {
        const custom=renderQuoteEmail(row,options);
        expect(custom).toContain('Introducción Cliente &amp; hijos:'); expect(custom).toContain('1,234');
        expect(custom).not.toContain('1,234.00'); expect(custom).not.toContain('enviado con Cord');
        expect(custom).toContain('a=1&amp;b=2'); expect(custom).toContain('Marca &lt;segura&gt;');
        const free=renderQuoteEmail(row,{...options,canCustomizeEmail:false,canRemoveBranding:false});
        expect(free).not.toContain('Introducción'); expect(free).not.toContain('Firma privada'); expect(free).toContain('Cord');
    });
    it('convierte SVG y WebP subidos a PNG con proporciones y tamaño acotado', async () => {
        const png=await brandImagePng(svg); expect(png).not.toBeNull();
        expect(await sharp(png!).metadata()).toMatchObject({format:'png',width:200,height:40});
        const webp=await sharp({create:{width:1200,height:600,channels:4,background:'#123456'}}).webp().toBuffer();
        const result=await brandImagePng('data:image/webp;base64,'+webp.toString('base64'));
        expect(await sharp(result!).metadata()).toMatchObject({format:'png',width:360,height:180});
        expect(await brandImagePng('https://example.test/logo.png')).toBeNull();
        expect(await brandImagePng('data:image/png;base64,aW52YWxpZA==')).toBeNull();
    });
    it('incrusta el logo en CID sin modificar correos internos o perder PDFs adjuntos', async () => {
        const rendered=await inlineBrandLogo(brandEmailShell({name:'Marca',logo:svg},'<p>Hola</p>'));
        expect(rendered.html).toContain('src="cid:cord-brand-logo"');
        const mime=construirMime({from:'a@example.test',to:'b@example.test',subject:'Prueba',html:rendered.html,attachments:[...rendered.attachments,{filename:'Factura.pdf',content:Buffer.from('%PDF-1.4'),contentType:'application/pdf'}]},'test-boundary');
        expect(mime).toContain('multipart/related'); expect(mime).toContain('Content-ID: <cord-brand-logo>');
        expect(mime).toContain('Content-Disposition: attachment; filename="Factura.pdf"');
        expect(mime.indexOf('--test-boundary_related--')).toBeLessThan(mime.indexOf('filename="Factura.pdf"'));
        const internal='<img src="https://cordhq.app/logo.png"><p>Cord</p>';
        expect(await inlineBrandLogo(internal)).toEqual({html:internal,attachments:[]});
        const broken=await inlineBrandLogo(brandEmailShell({name:'Marca',logo:'data:image/png;base64,aW52YWxpZA=='},'Contenido'));
        expect(broken.html).not.toContain('<img'); expect(broken.html).toContain('Marca');
    });
    it('mide y ajusta textos editoriales con las métricas de la fuente que se imprime', () => {
        expect(measureText('Hello',12,'regular','serif')).toBeCloseTo(26.664);
        for(const font of ['regular','bold','italic'] as const){
            const text='Distribuidora Peñafiel y Asociados — documento con texto largo';
            expect(measureText(truncateText(text,100,12,font,'serif'),12,font,'serif')).toBeLessThanOrEqual(100);
            for(const line of wrapText(text,100,12,font,'serif')) expect(measureText(line,12,font,'serif')).toBeLessThanOrEqual(100);
        }
    });
    it('conserva importes y partidas en PDF multipágina al cambiar identidad', () => {
        const lines=Array.from({length:60},(_,i)=>({description:`Service ${i+1} with a detailed description`,quantity:1,unitPrice:100,subtotal:100,taxAmount:0,total:100}));
        const input={invoiceNumber:'INV-BRAND-060',countryCode:'US',currency:'USD',issuedAt:new Date('2026-10-04T12:00:00Z'),issuer:{legalName:'Sample Studio'},recipient:{legalName:'Sample Buyer'},lines,subtotal:6000,taxTotal:0,total:6000} as InvoicePdfInput;
        for(const font of ['system','editorial']) {
            const pdf=createInvoicePdf({...input,brandColor:'#ffffff',brandProfile:{font,header:'contrast',density:'compact'}}).toString('latin1');
            expect(pdf).toContain(font==='editorial'?'/Times-Roman':'/Helvetica');
            const streams=[...pdf.matchAll(/stream\n([\s\S]*?)\nendstream/g)].map(m=>inflateSync(Buffer.from(m[1],'latin1')).toString('latin1')).join('\n');
            expect(streams).toContain('Service 60'); expect(streams).toContain('6,000.00');
            expect(pdf.match(/\/Type \/Page\b/g)!.length).toBeGreaterThan(1);
        }
    });
});

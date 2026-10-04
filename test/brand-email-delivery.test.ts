import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(()=>({gmail:vi.fn(),usage:vi.fn()}));
vi.mock('../src/lib/integraciones/gmail/envio',()=>({enviarPorGmail:mocks.gmail,OPERACIONES_GMAIL:new Set(['quote_sent'])}));
vi.mock('../src/lib/db',()=>({sql:vi.fn(),withOrgTx:vi.fn()}));
vi.mock('../src/lib/external-usage',()=>({trackExternalUsage:mocks.usage}));
import { brandEmailShell } from '../src/lib/brand-email';
const logo='data:image/svg+xml;base64,'+Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40"><rect width="80" height="40"/></svg>').toString('base64');
beforeEach(()=>{vi.resetModules();vi.clearAllMocks();vi.stubEnv('RESEND_API_KEY','test-key-no-network');});
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});

describe('entrega de identidad sin correos reales',()=>{
    it('Gmail recibe la imagen referenciada por CID y conserva el PDF',async()=>{
        mocks.gmail.mockResolvedValue({ok:true,id:'gmail-test'});
        const {sendEmail}=await import('../src/lib/email');
        const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
        expect((await sendEmail({orgId:'org-fixture',operation:'quote_sent',to:'fixture@example.test',subject:'Test',html:brandEmailShell({name:'Studio',logo},'<p>Test</p>'),attachments:[{filename:'quote.pdf',content:Buffer.from('%PDF-1.4')}]})).sent).toBe(true);
        const payload=mocks.gmail.mock.calls[0][1];
        expect(payload.html).toContain('src="cid:cord-brand-logo"');
        expect(payload.attachments).toEqual(expect.arrayContaining([expect.objectContaining({filename:'quote.pdf',contentType:'application/pdf'}),expect.objectContaining({contentId:'cord-brand-logo',contentType:'image/png'})]));
        expect(fetch).not.toHaveBeenCalled();
    });
    it('el fallback a Resend conserva la asociación CID y los adjuntos',async()=>{
        mocks.gmail.mockResolvedValue({ok:false});
        const fetch=vi.fn().mockResolvedValue(new Response(JSON.stringify({id:'resend-test'}),{status:200}));vi.stubGlobal('fetch',fetch);
        const {sendEmail}=await import('../src/lib/email');
        expect((await sendEmail({orgId:'org-fixture',operation:'quote_sent',to:'fixture@example.test',subject:'Test',html:brandEmailShell({name:'Studio',logo},'Test')})).sent).toBe(true);
        const body=JSON.parse(fetch.mock.calls[0][1].body);
        expect(body.html).toContain('src="cid:cord-brand-logo"');
        expect(body.attachments[0]).toMatchObject({content_id:'cord-brand-logo',content_type:'image/png'});
        expect(Buffer.from(body.attachments[0].content,'base64').subarray(1,4).toString()).toBe('PNG');
    });
});

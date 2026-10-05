import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSettingsRevision } from '../src/lib/settings-history';
type Query={text:string;values:unknown[]};
const m=vi.hoisted(()=>({perm:vi.fn(),entitlement:vi.fn(),tx:vi.fn(),audit:vi.fn(),invalidate:vi.fn(),fresh:vi.fn()}));
vi.mock('../src/lib/db',()=>({sql:(s:TemplateStringsArray,...values:unknown[])=>({text:s.join('?'),values}),withOrgTx:m.tx,getActiveOrgId:async()=> 'org-a',logAudit:m.audit,reqIp:()=> '127.0.0.1'}));
vi.mock('../src/lib/queries',()=>({requirePerm:m.perm,invalidateMoneyCaches:m.invalidate}));
vi.mock('../src/lib/org-entitlements',()=>({requireEntitlement:m.entitlement}));
vi.mock('../src/lib/context',()=>({currentLocale:()=> 'es',currentUserId:()=> 'user-a'}));
vi.mock('../src/lib/auth',()=>({reauthenticate:vi.fn(),revokeAllSessions:vi.fn()}));
vi.mock('../src/lib/org-delete',()=>({deleteOrgCascade:vi.fn()}));
vi.mock('../src/lib/ratelimit',()=>({rateLimit:vi.fn(),tooMany:vi.fn()}));
vi.mock('../src/lib/crypto-secret',()=>({decryptSecret:()=>null,encryptRequiredSecret:(v:string)=>'encrypted:'+v}));
vi.mock('../src/lib/step-up',()=>({requireFreshAuth:m.fresh}));
const {PATCH}=await import('../src/pages/api/org');
const request=(body:unknown)=>PATCH({request:new Request('https://cord.test/api/org',{method:'PATCH',body:JSON.stringify(body)})} as any) as Promise<Response>;
const id='a0000000-0000-0000-0000-000000000001';
const current={id:'org-a',nombre:'Business',country_code:'MX',moneda:'MXN',zona_horaria:'America/Mexico_City',idioma:'es-MX',_revision:'101',pdf_mensaje:'new',require_sso:false,brand_profile:{},fiscal_metadata:{}};
let revision:ReturnType<typeof createSettingsRevision>;
let queries:Query[];
beforeEach(()=>{
 vi.clearAllMocks();queries=[];
 revision=createSettingsRevision({pdf_mensaje:'old'},{pdf_mensaje:'new'},['pdf_mensaje']);
 m.perm.mockResolvedValue(null);m.entitlement.mockResolvedValue(null);m.fresh.mockResolvedValue(null);
 m.tx.mockImplementation(async(org:string,...qs:Query[])=>{
  expect(org).toBe('org-a');queries.push(...qs);
  return qs.map(q=>q.text.includes('select detalle from audit_log')?[{detalle:JSON.stringify(revision)}]:q.text.includes('with updated as')?[{id:'audit-id'}]:[{...current}]);
 });
});
describe('settings saves and history restoration',()=>{
 it('requires settings permission before accessing a revision',async()=>{
  m.perm.mockResolvedValue(new Response('{}',{status:403}));
  expect((await request({restore_revision:id})).status).toBe(403);expect(m.tx).not.toHaveBeenCalled();
 });
 it('retains audit entitlement before reading history',async()=>{
  m.entitlement.mockResolvedValue(new Response('{}',{status:402}));
  expect((await request({restore_revision:id})).status).toBe(402);expect(m.tx).not.toHaveBeenCalled();
 });
 it.each([null,[],{restore_revision:'------------------------------------'},{restore_revision:id,nombre:'other'}])('rejects malformed requests before database access (%j)',async body=>{
  expect((await request(body)).status).toBe(400);expect(m.tx).not.toHaveBeenCalled();
 });
 it('scopes revision reads to the active tenant and atomically logs the restored value',async()=>{
  expect((await request({restore_revision:id})).status).toBe(200);
  const read=queries.find(q=>q.text.includes('select detalle from audit_log'))!;
  expect(read.text).toContain('where org_id=? and id=?::uuid');expect(read.values).toEqual(['org-a',id]);
  const write=queries.find(q=>q.text.includes('with updated as'))!;
  expect(write.text).toMatch(/where id = \? and xmin::text = \?/);
  expect(write.text).toMatch(/insert into audit_log[\s\S]*from updated/);
  const entry=write.values.find(v=>typeof v==='string'&&v.startsWith('{"version":1')) as string;
  expect(JSON.parse(entry).changes.pdf_mensaje).toEqual({before:'new',after:'old'});
  expect(write.values).toContain('user-a');expect(write.values).toContain('101');
 });
 it('refuses missing or cross-tenant revisions',async()=>{
  m.tx.mockResolvedValueOnce([[],[current]]);
  expect((await request({restore_revision:id})).status).toBe(409);expect(m.tx).toHaveBeenCalledTimes(1);
 });
 it('rechecks values after permission checks, before writing',async()=>{
  m.tx.mockResolvedValueOnce([[{detalle:JSON.stringify(revision)}],[current]]).mockResolvedValueOnce([[{...current,pdf_mensaje:'newer'}]]);
  expect((await request({restore_revision:id})).status).toBe(409);expect(m.tx).toHaveBeenCalledTimes(2);
 });
 it('preserves a logo edited between the revision lookup and the final read',async()=>{
  revision=createSettingsRevision({brand_profile:{font:'system'}},{brand_profile:{font:'editorial'}},['brand_profile']);
  m.tx.mockResolvedValueOnce([[{detalle:JSON.stringify(revision)}],[{...current,brand_profile:{font:'editorial',logoDark:'https://old.example/logo.png'}}]])
      .mockResolvedValueOnce([[{...current,brand_profile:{font:'editorial',logoDark:'https://latest.example/logo.png'}}]]);
  expect((await request({restore_revision:id})).status).toBe(200);
  const write=queries.find(q=>q.text.includes('with updated as'))!;
  expect(write.values).toContain(JSON.stringify({header:'classic',font:'system',corners:'round',density:'comfortable',logoSize:'medium',logoDark:'https://latest.example/logo.png'}));
 });
 it('returns a conflict if a save wins the race, without success side effects',async()=>{
  m.tx.mockResolvedValueOnce([[current]]).mockResolvedValueOnce([[]]);
  expect((await request({pdf_mensaje:'new copy'})).status).toBe(409);
  expect(m.invalidate).not.toHaveBeenCalled();expect(m.audit).not.toHaveBeenCalled();
 });
 it('still enforces email entitlement when restoring email content',async()=>{
  revision=createSettingsRevision({email_firma:'old'},{email_firma:null},['email_firma']);
  m.entitlement.mockImplementation(async(_org:string,feature:string)=>feature==='custom_email'?new Response('{}',{status:402}):null);
  expect((await request({restore_revision:id})).status).toBe(402);
  expect(queries.some(q=>q.text.includes('with updated as'))).toBe(false);
 });
 it('reports the field when a required business name is empty',async()=>{
  const res=await request({nombre:''});expect(res.status).toBe(400);expect(await res.json()).toMatchObject({field:'nombre'});
 });
});

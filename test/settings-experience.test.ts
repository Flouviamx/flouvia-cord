import { describe,it,expect } from 'vitest';
import { createSettingsRevision,parseSettingsRevision,restoreSettingsRevision } from '../src/lib/settings-history';
import { settingsSearchIndex,searchSettings } from '../src/lib/settings-search';
describe('settings history',()=>{
 it('retains public appearance/copy, never bank/auth/tax values',()=>{
  const revision=createSettingsRevision({color_marca:'#000000',banco_clabe:'secret',require_2fa:true},{color_marca:'#ffffff',banco_clabe:'other-secret',require_2fa:false},['color_marca','banco_clabe','require_2fa']);
  expect(revision.changes).toEqual({color_marca:{before:'#000000',after:'#ffffff'}});
  expect(JSON.stringify(revision)).not.toContain('secret');
 });
 it('does not persist image data inside the profile snapshot',()=>{
  const r=createSettingsRevision({brand_profile:{font:'system',logoDark:'https://old.example/logo.png'}},{brand_profile:{font:'editorial',logoDark:'https://new.example/logo.png'}},['brand_profile']);
  expect(JSON.stringify(r)).not.toContain('logoDark');
  expect(restoreSettingsRevision(r,{brand_profile:{font:'editorial',logoDark:'https://current.example/logo.png'}})?.brand_profile).toMatchObject({font:'system',logoDark:'https://current.example/logo.png'});
 });
 it('refuses to overwrite subsequent edits',()=>{
  const r=createSettingsRevision({pdf_mensaje:'old'},{pdf_mensaje:'new'},['pdf_mensaje']);
  expect(restoreSettingsRevision(r,{pdf_mensaje:'newer'})).toBeNull();
  expect(restoreSettingsRevision(r,{pdf_mensaje:'new'})).toEqual({pdf_mensaje:'old'});
 });
 it('can restore an empty value and records only actual changes',()=>{
  const r=createSettingsRevision({pdf_mensaje:null,color_marca:'#123456'},{pdf_mensaje:'hello',color_marca:'#123456'},['pdf_mensaje','color_marca']);
  expect(Object.keys(r.changes)).toEqual(['pdf_mensaje']);
  expect(restoreSettingsRevision(r,{pdf_mensaje:'hello'})).toEqual({pdf_mensaje:null});
 });
 it('rejects legacy text and strips non-restorable replay fields',()=>{
  expect(parseSettingsRevision('Campos: nombre')).toBeNull();
  const r=parseSettingsRevision(JSON.stringify({version:1,fields:['require_2fa'],changes:{require_2fa:{before:false,after:true}}}));
  expect(r?.changes).toEqual({});
  expect(restoreSettingsRevision(r!,{require_2fa:true})).toBeNull();
 });
});
describe('field-level settings search',()=>{
 it('links directly to the real WhatsApp field',()=>expect(searchSettings(settingsSearchIndex('es'),'whatsapp')[0].href).toBe('/app/ajustes/general#whatsapp'));
 it('normalizes accents and supports English terms',()=>{
  expect(searchSettings(settingsSearchIndex('es'),'telefono')[0].href).toContain('#telefono');
  expect(searchSettings(settingsSearchIndex('en'),'signature')[0].href).toContain('#emailSignature');
 });
 it('returns no results for an empty or unknown query',()=>{expect(searchSettings(settingsSearchIndex('es'),'')).toEqual([]);expect(searchSettings(settingsSearchIndex('es'),'nomatchxyz')).toEqual([]);});
});

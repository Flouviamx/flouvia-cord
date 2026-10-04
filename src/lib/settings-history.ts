import { resolveBrandProfile } from './brand-profile';
/** Only appearance and public-facing copy can be replayed. Never bank, auth or tax settings. */
export const RESTORABLE_SETTINGS = ['color_marca','color_secundario','pdf_template','pdf_mensaje','pdf_condiciones','pdf_mostrar_lista','portal_bienvenida','portal_banner','email_intro','email_firma','brand_profile'] as const;
const profileKeys=['header','font','corners','density','logoSize'] as const;
export type SettingsRevision = {version:1;fields:string[];changes:Record<string,{before:unknown;after:unknown}>};
export function revisionValue(key:string,value:unknown):unknown {
 if(key==='brand_profile'){const p=resolveBrandProfile(value);return Object.fromEntries(profileKeys.map(k=>[k,p[k]]));}
 return value??null;
}
export function createSettingsRevision(before:Record<string,unknown>,after:Record<string,unknown>,fields:string[]):SettingsRevision {
 const changes:SettingsRevision['changes']={};
 for(const key of RESTORABLE_SETTINGS){if(!fields.includes(key))continue;const a=revisionValue(key,before[key]),b=revisionValue(key,after[key]);if(JSON.stringify(a)!==JSON.stringify(b))changes[key]={before:a,after:b};}
 return {version:1,fields:fields.filter(k=>/^[a-z][a-z0-9_]{0,79}$/.test(k)),changes};
}
export function parseSettingsRevision(text:string):SettingsRevision|null {
 try {const r=JSON.parse(text);if(r.version!==1||!Array.isArray(r.fields)||!r.changes||typeof r.changes!=='object')return null;
 const changes:SettingsRevision['changes']={};for(const key of RESTORABLE_SETTINGS){const c=r.changes[key];if(c&&typeof c==='object'&&'before'in c&&'after'in c)changes[key]=c;}
 return {version:1,fields:r.fields.filter((f:unknown)=>typeof f==='string'&&/^[a-z][a-z0-9_]{0,79}$/.test(f)),changes};}catch{return null;}
}
export function restoreSettingsRevision(revision:SettingsRevision,current:Record<string,unknown>):Record<string,unknown>|null {
 const patch:Record<string,unknown>={};
 for(const key of RESTORABLE_SETTINGS){const c=revision.changes[key];if(!c)continue;
 // Do not silently overwrite a newer edit. Revert recent changes first.
 if(JSON.stringify(revisionValue(key,current[key]))!==JSON.stringify(c.after))return null;
 patch[key]=key==='brand_profile'?{...resolveBrandProfile(current[key]),...(c.before as object)}:c.before;
 }
 return Object.keys(patch).length?patch:null;
}
export function settingsFieldLabel(key:string,en=false):string {
 const names:Record<string,[string,string]>={color_marca:['Color principal','Primary color'],color_secundario:['Color secundario','Secondary color'],brand_profile:['Composición y tipografía','Layout and typography'],pdf_template:['Plantilla PDF','PDF template'],pdf_mensaje:['Mensaje PDF','PDF message'],pdf_condiciones:['Condiciones PDF','PDF terms'],pdf_mostrar_lista:['Precio de lista','List prices'],portal_bienvenida:['Bienvenida','Welcome message'],portal_banner:['Aviso del portal','Portal announcement'],email_intro:['Introducción del correo','Email introduction'],email_firma:['Firma del correo','Email signature']};
 return names[key]?.[en?1:0]??key.replaceAll('_',' ');
}

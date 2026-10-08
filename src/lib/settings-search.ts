import { localizeCategories } from './settings';
export interface SettingResult { label:string; category:string; href:string; keywords:string; developer?:boolean; }
// Anchors are field names or DOM ids; the shared form opens advanced sections and reveals them.
const fields = [
 ['general','nombre','Nombre del negocio','Business name','empresa company'],
 ['general','email_contacto','Correo de contacto','Contact email','email'],
 ['general','telefono','Teléfono','Phone','contacto'],
 ['general','whatsapp','WhatsApp','WhatsApp','wa contacto'],
 ['general','sitio_web','Sitio web','Website','url pagina'],
 ['general','moneda','Moneda base','Base currency','divisa currency'],
 ['general','idioma','Idioma','Language','ingles español english'],
 ['general','zona_horaria','Zona horaria','Time zone','timezone hora'],
 ['branding','brandLogoSize','Logotipo','Logo','imagen tamaño logo'],
 ['branding','brandPrimary','Color principal','Primary color','marca paleta color'],
 ['branding','brandSecondary','Color secundario','Secondary color','marca paleta'],
 ['portal','brandCorners','Bordes','Corners','composicion apariencia'],
 ['portal','brandDensity','Espaciado','Spacing','densidad compacto'],
 ['portal','portal_bienvenida','Mensaje de bienvenida','Welcome message','portal texto'],
 ['portal','portal_banner','Aviso superior','Top announcement','banner portal'],
 ['cotizaciones','quote_prefix','Prefijo de cotización','Quote prefix','folio consecutivo'],
 ['cotizaciones','iva_pct','Impuesto predeterminado','Default tax','iva vat impuesto'],
 ['cotizaciones','vigencia_default_dias','Vigencia','Validity','dias expiration'],
 ['cotizaciones','terminos_default','Términos de pago','Payment terms','contado credito net7 net15 net30 net45 net60 net90 plazo dias'],
 ['cotizaciones','texto_legal','Texto legal','Legal text','condiciones'],
 ['pdf','pdfConditions','Condiciones del PDF','PDF terms','documento condiciones'],
 ['pdf','pdfMessage','Mensaje del PDF','PDF message','documento mensaje'],
 ['correo','emailName','Nombre del remitente','Sender name','correo email'],
 ['correo','emailReply','Dirección de respuesta','Reply address','reply email'],
 ['correo','emailSignature','Firma del correo','Email signature','firma email'],
 ['seguridad','session_timeout_min','Duración de sesión','Session timeout','seguridad tiempo'],
 ['seguridad','invite_domains','Dominios permitidos','Allowed domains','invitaciones seguridad'],
 ['seguridad','require_2fa','Autenticación en dos pasos','Two-factor authentication','2fa mfa seguridad'],
] as const;
export const normalizeSetting = (s:string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export function settingsSearchIndex(locale:'es'|'en', country='MX'):SettingResult[]{
 const categories=localizeCategories(locale,country);
 const tabs=categories.flatMap(c=>c.tabs.map(t=>({label:t.label,category:c.label,href:t.href,keywords:t.keywords??'',developer:['mcp','agentes','elements'].includes(c.id)})));
 return [...fields.map(([tab,anchor,es,en,keywords])=>{const parent=categories.find(c=>c.tabs.some(t=>t.id===tab))!;return {label:locale==='en'?en:es,category:parent.label,href:`/app/ajustes/${tab}#${anchor}`,keywords};}),...tabs];
}
export function searchSettings(index:SettingResult[],query:string){
 const terms=normalizeSetting(query).trim().split(/\s+/).filter(Boolean);if(!terms.length)return [];
 return index.filter(r=>terms.every(t=>normalizeSetting(`${r.label} ${r.category} ${r.keywords}`).includes(t))).slice(0,12);
}

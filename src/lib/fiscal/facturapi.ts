// src/lib/fiscal/facturapi.ts
// Gestión MULTI-TENANT de Facturapi: una "organización" de Facturapi por cada org
// de Cord, con su PROPIO CSD, para timbrar CFDI bajo el RFC de cada cliente.
//
// Usa la llave de CUENTA (FACTURAPI_USER_KEY — en el panel de Facturapi: tu
// "Secret key" de usuario, NO la de una organización), que es la única que puede
// administrar organizaciones. La llave LIVE por-organización se obtiene de aquí y
// se guarda en orgs.facturapi_live_key para timbrar.
//
// Sin FACTURAPI_USER_KEY, la subida de CSD no opera (lo decimos claro en la UI) y
// el timbrado cae al modo de una sola cuenta (FACTURAPI_API_KEY global) o simulado.

const USER_KEY = process.env.FACTURAPI_USER_KEY || process.env.FACTURAPI_SECRET_KEY || '';
const BASE = (process.env.FACTURAPI_URL || 'https://www.facturapi.io/v2').replace(/\/$/, '');

export function facturapiConfigured(): boolean {
  return !!USER_KEY;
}

function userAuth(): string {
  return 'Basic ' + Buffer.from(`${USER_KEY}:`).toString('base64');
}

export interface FacturapiResult<T = any> {
  ok: boolean;
  data?: T;
  error?: string;
}

async function call(method: string, path: string, body?: any, isForm = false): Promise<FacturapiResult> {
  if (!USER_KEY) return { ok: false, error: 'Falta FACTURAPI_USER_KEY (llave de cuenta de Facturapi).' };
  try {
    const headers: Record<string, string> = { Authorization: userAuth() };
    let payload: any;
    if (isForm) {
      payload = body; // FormData → fetch agrega el Content-Type con boundary.
    } else if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const res = await fetch(`${BASE}${path}`, { method, headers, body: payload, signal: AbortSignal.timeout(30000) });
    const text = await res.text();
    let data: any = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
    if (!res.ok) return { ok: false, error: data?.message || `Facturapi ${res.status}`, data };
    return { ok: true, data };
  } catch (e: any) {
    return { ok: false, error: e?.name === 'TimeoutError' ? 'timeout con Facturapi' : (e?.message || 'fallo de red con Facturapi') };
  }
}

/** Crea una organización en Facturapi (nombre comercial). Devuelve su id. */
export async function createOrganization(name: string): Promise<FacturapiResult<{ id: string }>> {
  return call('POST', '/organizations', { name: name.slice(0, 250) });
}

/** Datos legales/fiscales del EMISOR del CFDI dentro de la organización. */
export async function updateLegal(orgId: string, legal: {
  legal_name: string; tax_system: string; zip: string; name?: string; phone?: string; website?: string;
}): Promise<FacturapiResult> {
  return call('PUT', `/organizations/${orgId}/legal`, {
    name: legal.name || legal.legal_name,
    legal_name: legal.legal_name,
    tax_system: legal.tax_system,
    address: { zip: legal.zip },
    ...(legal.phone ? { phone: legal.phone } : {}),
    ...(legal.website ? { website: legal.website } : {}),
  });
}

/** Sube el CSD (cer + key + contraseña) a la organización. */
export async function uploadCertificate(
  orgId: string,
  cer: { name: string; bytes: ArrayBuffer },
  key: { name: string; bytes: ArrayBuffer },
  password: string,
): Promise<FacturapiResult> {
  const fd = new FormData();
  fd.append('cer', new Blob([cer.bytes], { type: 'application/octet-stream' }), cer.name || 'cer.cer');
  fd.append('key', new Blob([key.bytes], { type: 'application/octet-stream' }), key.name || 'key.key');
  fd.append('password', password);
  return call('PUT', `/organizations/${orgId}/certificate`, fd, true);
}

/**
 * RENUEVA la llave LIVE de la organización y la devuelve (string plano). Ojo: el
 * GET de /apikeys/live sólo LISTA llaves enmascaradas — el secreto sólo se obtiene
 * al renovar (PUT). Por eso sólo lo llamamos al cargar el CSD y GUARDAMOS el
 * resultado; cada renovación invalida la llave anterior.
 */
export async function getLiveKey(orgId: string): Promise<FacturapiResult<string>> {
  if (!USER_KEY) return { ok: false, error: 'Falta FACTURAPI_USER_KEY.' };
  try {
    const res = await fetch(`${BASE}/organizations/${orgId}/apikeys/live`, {
      method: 'PUT', headers: { Authorization: userAuth() }, signal: AbortSignal.timeout(30000),
    });
    const text = (await res.text()).trim();
    if (!res.ok) {
      let msg = `Facturapi ${res.status}`;
      try { msg = JSON.parse(text)?.message || msg; } catch { /* texto plano */ }
      return { ok: false, error: msg };
    }
    // Puede venir como "sk_live_…" plano o como string JSON con comillas.
    return { ok: true, data: text.replace(/^"|"$/g, '') };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'fallo de red con Facturapi' };
  }
}

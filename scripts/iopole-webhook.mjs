#!/usr/bin/env node
// Registra en Iopole el webhook de Cord (Francia, emisión por plataforma
// autorizada): estados de las facturas EMITIDAS, etapas del alta de cada
// negocio y eventos del e-reporting, firmados con HMAC. Se corre UNA vez por
// entorno, a mano, por quien administra la cuenta de operador de Flouvia.
//
//   npm run iopole:webhook -- --dry-run     muestra lo que mandaría, sin red
//   npm run iopole:webhook                  lo registra en IOPOLE_ENTORNO
//
// Lee IOPOLE_ENTORNO, IOPOLE_CLIENT_ID, IOPOLE_CLIENT_SECRET, IOPOLE_CUSTOMER_ID
// e IOPOLE_WEBHOOK_SECRET (.env o el entorno) y SITE (la URL pública de Cord
// en ese entorno). Iopole valida la URL antes de aceptarla: HTTPS, DNS público
// y que responda a un GET (lo hace /api/fiscal/iopole/webhook). Si ya existe
// un webhook con la misma dirección responde 409: se edita en su consola.
//
// El cuerpo sale de cuerpoWebhook() (src/lib/fiscal/transmision/iopole/
// cuerpos.ts), el mismo que `npm run security:fr-pa` valida contra la OpenAPI.

import { cuerpoWebhook, ruta } from '../src/lib/fiscal/transmision/iopole/cuerpos.ts';
import { HOSTS_IOPOLE } from '../src/lib/fiscal/transmision/config.ts';

const env = (k) => String(process.env[k] ?? '').trim();
const dryRun = process.argv.includes('--dry-run');
const entorno = env('IOPOLE_ENTORNO') || 'preproduccion';
if (!HOSTS_IOPOLE[entorno]) {
    console.error(`IOPOLE_ENTORNO inválido: "${entorno}" (preproduccion o produccion).`);
    process.exit(1);
}
const site = env('SITE') || env('PUBLIC_SITE_URL');
const secreto = env('IOPOLE_WEBHOOK_SECRET');
if (!/^https:\/\//.test(site)) {
    console.error('Falta SITE con la URL pública (https://…) de Cord en este entorno.');
    process.exit(1);
}
if (secreto.length < 32) {
    console.error('Falta IOPOLE_WEBHOOK_SECRET (al menos 32 caracteres; por ejemplo `openssl rand -hex 32`).');
    process.exit(1);
}
const body = cuerpoWebhook(site, secreto);
const hosts = HOSTS_IOPOLE[entorno];
const url = new URL(ruta('crearWebhook'), hosts.api).toString();

if (dryRun) {
    const visible = JSON.parse(JSON.stringify(body));
    visible.interopData.endpoints.authentication.hmac.secretKey = '(IOPOLE_WEBHOOK_SECRET)';
    console.log(`POST ${url}\n${JSON.stringify(visible, null, 2)}`);
    process.exit(0);
}

const clientId = env('IOPOLE_CLIENT_ID');
const clientSecret = env('IOPOLE_CLIENT_SECRET');
if (!clientId || !clientSecret) {
    console.error('Faltan IOPOLE_CLIENT_ID e IOPOLE_CLIENT_SECRET.');
    process.exit(1);
}
const tokenRes = await fetch(hosts.token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }).toString(),
});
const token = await tokenRes.json().catch(() => null);
if (!tokenRes.ok || !token?.access_token) {
    console.error(`Iopole rechazó las credenciales (HTTP ${tokenRes.status}).`);
    process.exit(1);
}
const headers = { Authorization: `Bearer ${token.access_token}`, 'Content-Type': 'application/json', Accept: 'application/json' };
if (env('IOPOLE_CUSTOMER_ID')) headers['customer-id'] = env('IOPOLE_CUSTOMER_ID');
const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
const out = await res.text();
if (!res.ok) {
    console.error(`Iopole respondió HTTP ${res.status}: ${out.slice(0, 500)}`);
    process.exit(1);
}
console.log(`Webhook registrado en ${entorno}: ${out}`);

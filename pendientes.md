Lo que falta en integraciones y cobros (21 sep 2026)

El detalle completo, app por app, está en docs/estado/pendientes-integraciones.md.
La guía paso a paso es la de la página "Integraciones por activar". En corto:

Te toca a ti:
1. Hecho: el pago de prueba de $10 MXN salió perfecto y el Access Token ya se renovó.
2. Mercado Pago: renovar también el Client Secret (sigue siendo el que se pegó en el
   chat). Pégalo en integrations/mercadopago/.env, no en el chat, y avísame para
   subirlo a Vercel.
3. Mercado Pago: probar la conexión con el vendedor de prueba de Colombia que ya está
   creado (TESTUSER1518459834063318184) desde un espacio de Cord con país Colombia.
4. Make: probar la conexión con una cuenta de Make de otra zona (us1, eu1 o eu2).
5. WhatsApp: probar con el número de prueba de Meta desde un workflow.

Esperando a alguien más:
- n8n: la verificación de n8n (enviada el 21 sep) para que aparezca en n8n Cloud.
- WhatsApp con un botón: la verificación de negocio de Flouvia en Meta.
- HubSpot: 3 instalaciones de cuentas ajenas para publicar la ficha del marketplace.

En pausa por decisión tuya:
- Teams "Conectar con Microsoft": el código está listo y apagado. Se activa cuando
  quieras pagar Microsoft 365 (unos 6 USD por usuario al mes) o un cliente con Teams
  te preste su cuenta para la prueba.

Decisión pendiente:
- Mercado Pago aparece en Ajustes › Cobros también en Brasil, Colombia, Argentina,
  Chile y Perú, pero solo está confirmado en México. ¿Lo ocultamos fuera de México
  hasta confirmarlo?

Código que falta (lo hago yo cuando digas):
- Mercado Pago en el link de las facturas, no solo en cotizaciones.
- Que Cord lea los reembolsos hechos en Mercado Pago.
- El link de pago en la cobranza con IA cuando el único riel es Mercado Pago.

Opcional, cuando haya clientes usándolas: directorios públicos de Zapier, Make y Slack.

# Cord para Gmail

Complemento de Google Workspace que abre una cotización desde el correo del
cliente, sin salir de Gmail.

## Qué hace

Sobre un correo abierto muestra si ese remitente ya es cliente de Cord y deja
crear su cotización de un clic. Si no existe, lo da de alta con el nombre y el
correo del remitente y crea la cotización en borrador, con el asunto como primera
línea. El vendedor la termina en Cord, que es donde viven los productos, los
precios y los impuestos.

## Por qué está hecho así

- **Lee solo el correo abierto.** Usa `gmail.addons.current.message.readonly`,
  el permiso más estrecho que Google ofrece a un complemento. Leer la bandeja
  entera (`gmail.readonly`) es un permiso RESTRINGIDO: obliga a una auditoría de
  seguridad anual de un tercero certificado, del orden de miles de dólares. Este
  complemento está diseñado para no necesitarla nunca.
- **El texto del correo solo viaja a Cord cuando se pide.** Del mensaje salen el
  remitente, el asunto y el folio de una cotización si lo trae (para mostrar su
  estado). El texto se manda únicamente al pulsar "Cotizar con IA", sin lo
  citado de correos anteriores, y la tarjeta de la propuesta lo dice.
- **Responder con la cotización** crea el borrador de respuesta en el mismo
  hilo, desde el Gmail de quien vende (`createDraftReply` con el permiso de
  redacción del complemento, sin `gmail.send`).
- **Se conecta con el OAuth de Cord**, el mismo de Zapier y Make: botón
  "Conectar con Cord", autorización en la pantalla de Cord, y listo. Nadie copia
  llaves. El cliente OAuth es `gmail` (registrado con `scripts/oauth-client.mjs`)
  y su URL de regreso es `https://cordhq.app/oauth/listo`, no la `usercallback`
  de Apps Script: Google ejecuta esa con la primera cuenta del navegador y
  fallaba con "se requiere autorización". Cord guarda el código y el complemento
  lo recoge en `/api/oauth/entrega` con el `state`, su secreto y PKCE.
- **Al redactar** aparece en la barra de redacción: inserta el link de una
  cotización del destinatario. Lee solo los destinatarios del borrador.
- **Los tokens viven en las propiedades del USUARIO**: cada persona conecta su
  espacio y nadie ve los de nadie. El refresh token se guarda nuevo en cada
  renovación porque Cord lo rota y detecta el reuso.
- **Las credenciales del cliente viven en las propiedades del SCRIPT**
  (`CORD_CLIENT_ID`, `CORD_CLIENT_SECRET`), que solo ve quien publica: nunca en
  el código ni en git. El secreto está en `integrations/gmail/.env`, ignorado.
- **Desconectar revoca en Cord**, no solo borra localmente: un token olvidado
  aquí seguiría vivo allá hasta caducar.
- **Los errores quedan en el registro de ejecuciones del script.** La primera
  versión se tragaba las excepciones y mostraba "no se pudo hablar con Cord" sin
  rastro, que es imposible de diagnosticar.

## Publicarlo

Requiere un proyecto de Google Cloud y [clasp](https://github.com/google/clasp).

```bash
npm install --global @google/clasp
clasp login
cd integrations/gmail
clasp create --type standalone --title "Cord para Gmail"   # genera .clasp.json (ignorado)
git checkout -- appsscript.json                              # ver abajo
clasp push
```

**`clasp create` sobrescribe `appsscript.json`** con el manifiesto vacío por
defecto, sin avisar: se pierden los permisos, la configuración del complemento y
la zona horaria. Subirlo así deja un script que Gmail no reconoce como
complemento. Por eso el `git checkout` va ANTES del `clasp push`. Solo pasa al
crear el proyecto; los `clasp push` posteriores no lo tocan.

En **Configuración del proyecto › Proyecto de Google Cloud** se pega el NÚMERO
del proyecto, no su nombre. El número es el prefijo del ID de cliente OAuth
(`<número>-<hash>.apps.googleusercontent.com`) y también aparece en la portada
de Google Cloud.

Después, en el proyecto de Google Cloud asociado:

1. Habilita **Google Workspace Marketplace SDK**.
2. En **App Configuration**, elige "Google Workspace Add-on" y apunta al
   despliegue del script.
3. En **Store Listing**, llena la ficha. Para uso interno basta con publicar en
   modo privado para el dominio.
4. La pantalla de consentimiento necesita verificación si se publica público:
   los permisos de este complemento son sensibles, no restringidos, así que no
   hay auditoría de seguridad de por medio.

`.clasp.json` lleva el id del script y está ignorado por git, como el `.env` de
las demás integraciones.

## Configurarlo (una vez)

En Apps Script: **Configuración del proyecto › Propiedades de la secuencia de
comandos**, agrega `CORD_CLIENT_ID` y `CORD_CLIENT_SECRET` con los valores de
`integrations/gmail/.env`.

El cliente se registra una vez y no depende del ID del script:
`node scripts/oauth-client.mjs --slug gmail --nombre "Cord para Gmail" --dominio mail.google.com --redirect https://cordhq.app/oauth/listo --env integrations/gmail/.env`

## Probarlo

`clasp push`, recarga Gmail, abre un correo y pulsa **Conectar con Cord**.

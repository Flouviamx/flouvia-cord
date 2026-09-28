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
- **No manda el cuerpo del correo a Cord.** Del mensaje salen el remitente y el
  asunto. El contenido de un correo es del negocio.
- **La llave vive en las propiedades del USUARIO**
  (`PropertiesService.getUserProperties()`), no del script: cada persona conecta
  su cuenta y nadie ve la llave de nadie.
- **La llave se prueba antes de darla por buena.** Al guardarla se llama a
  `/api/v1/me`; si Cord no la reconoce, no se guarda. Una llave mal pegada que
  "se guarda bien" falla después, a media venta.
- **Autentica con llave de API, no con OAuth.** Es el mismo camino del nodo de
  n8n. Cord ya es proveedor OAuth (Zapier, Make) y migrar a OAuth es una mejora
  posterior; con llave se puede probar hoy sin registrar un cliente más.

## Publicarlo

Requiere un proyecto de Google Cloud y [clasp](https://github.com/google/clasp).

```bash
npm install --global @google/clasp
clasp login
cd integrations/gmail
clasp create --type standalone --title "Cord para Gmail"   # genera .clasp.json (ignorado)
clasp push
```

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

## Probarlo

`clasp push` y luego, en Gmail, **Extensiones › Cord**. Pega una llave de API con
permiso de escritura (Ajustes › API en Cord) y abre cualquier correo.

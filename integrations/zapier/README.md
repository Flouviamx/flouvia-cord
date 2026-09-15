# Cord para Zapier

App de Zapier construida sobre la API pública v1 de Cord. No tiene servidor propio: todo pasa por `https://cordhq.app/api/v1`.

## Qué incluye

- **Conexión**: llave secreta de Cord (`sk_live_` o `sk_test_`). Las llaves publicables se rechazan. Se valida con `GET /v1/me`.
- **Disparadores instantáneos**: New Event (cualquiera de los 34 eventos), Quote Approved, Quote Paid, Quote Sent, Quote Opened by Client, Quote Created, Quote Rejected, Partial Payment Received, Invoice Paid y New Client. Cada Zap activo crea un webhook con `POST /v1/webhooks` y lo borra al apagarse. Cada evento entrante se verifica con la firma `X-Cord-Signature-V1` y el secreto de ese webhook; si no cuadra, se ignora.
- **Acciones**: Create Client, Update Client, Create Quote, Send Quote, Mark Quote as Paid y Create Task.
- **Búsquedas**: Find Client (correo exacto o nombre), Find Quote (folio) y Find or Create Client.

Las suscripciones que crea Zapier tienen un cupo propio de 100 por organización y no ocupan los endpoints del equipo.

## Desarrollo

```bash
npm install
npm test
```

`CORD_BASE_URL` apunta la app a otro entorno, por ejemplo un preview.

## Publicar

Requiere una cuenta de desarrollador de Zapier.

```bash
npm install -g zapier-platform-cli
zapier login
zapier register "Cord"
zapier push
```

`zapier push` sube una versión privada. Para probarla, invita cuentas desde el panel de Zapier; para listarla en el directorio público, sigue la revisión de Zapier desde ese mismo panel.

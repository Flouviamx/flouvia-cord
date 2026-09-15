---
title: "Conectar HubSpot"
description: "Sincroniza tus clientes y cotizaciones de Cord con Empresas, Contactos y Deals de HubSpot."
category: "Cuenta y Equipo"
order: 20
---

Al conectar HubSpot, Cord mantiene tu CRM al día sin que captures dos veces.

### Qué se sincroniza

- **Clientes → Empresas y Contactos.** Cada cliente de Cord se crea en HubSpot como una Empresa y, si tiene contacto o correo, como un Contacto asociado. Si ya existe un Contacto con ese correo en HubSpot, Cord lo reutiliza en vez de duplicarlo.
- **Correcciones desde HubSpot.** Si cambias el nombre de la Empresa, o el nombre, correo o teléfono del Contacto en HubSpot, el cambio llega al cliente en Cord. Un campo que dejas vacío en HubSpot no borra el dato en Cord.
- **Cotizaciones → Deals.** Cuando envías una cotización se crea un Deal con su folio, cliente, monto y divisa. Cord mueve la etapa del Deal cuando el cliente la abre, la aprueba, la rechaza, vence o la paga. Los borradores no se envían.
- **Una sola dirección para los Deals.** Mover un Deal en HubSpot no cambia la cotización en Cord: su estado lo deciden la aprobación y el pago del cliente.

Cord nunca borra nada en HubSpot. Si eliminas un cliente o un borrador en Cord, solo se deja de sincronizar.

### Conectar

1. Abre **Ajustes › Integraciones** y pulsa **Conectar HubSpot**. Necesitas permiso de Ajustes.
2. HubSpot te pide elegir la cuenta y aceptar los permisos. Al volver, la tarjeta dice **Conectado**.
3. Elige el **pipeline** y la **etapa de HubSpot** que corresponde a cada estado de la cotización, y guarda. Si usas el pipeline predeterminado de HubSpot, Cord ya propone etapas.
4. Si quieres mandar también lo que ya tenías, pulsa **Enviar datos existentes**. Envía hasta 500 clientes y 500 cotizaciones enviadas.

Una cuenta de HubSpot solo puede estar conectada a una organización de Cord a la vez.

### Divisas

Cada Deal lleva la divisa de la cotización. Si esa divisa no está activada en tu cuenta de HubSpot, el Deal no se crea y la tarjeta muestra el error. Actívala en la configuración de divisas de HubSpot y vuelve a enviar los datos existentes.

### Errores y reconexión

La tarjeta muestra cuántos cambios hay en cola, los errores de los últimos 7 días y el último error. Si HubSpot retira el acceso de Cord (por ejemplo, porque desinstalaste la app), la tarjeta dice **Requiere reconectar**: pulsa **Volver a conectar** y los cambios pendientes se envían solos.

### Desconectar

Pulsa **Desconectar**. Cord retira su acceso a tu cuenta de HubSpot y deja de sincronizar. Lo que ya está en HubSpot se queda como está.

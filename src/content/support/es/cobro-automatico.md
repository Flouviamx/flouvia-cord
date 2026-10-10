---
title: "Cobro automático y qué pasa cuando un cobro falla"
description: "Tu cliente guarda un método en su portal y cada factura se le cobra en su vencimiento: qué se cobra, cuándo, cómo autoriza y la política de reintentos por tipo de rechazo."
category: "Pagos y Depósitos"
order: 7
---

Con el **cobro automático**, tu cliente guarda una tarjeta o una cuenta bancaria en su [portal](/soporte/portal-del-cliente) y cada factura se le cobra sola en su fecha de vencimiento. Lo **activa tu cliente**, con su autorización; tu negocio decide si lo ofrece y puede apagarlo en cualquier momento.

**En resumen:**

- **Ofrecerlo:** enciende **Cobro automático** en **Ajustes › Cobros**. Necesitas Cord Payments activo.
- **Activarlo:** tu cliente pulsa **Activar cobro automático** en su portal y acepta la autorización, o marca **Guardar este método para el cobro automático** al pagar.
- **Qué se cobra:** cada factura abierta que **vence hoy o antes**, que vence **a partir del día en que tu cliente lo autorizó** y que se emitió al menos un día antes. Todas las de una misma divisa van en **un solo cargo**.
- **Cuándo:** una vez al día. El correo de cada factura le avisa a tu cliente la fecha y el método del cargo.
- **Si falla:** Cord reintenta solo cuando tiene sentido, según el motivo del rechazo, hasta 4 intentos con tarjeta y 3 con cargo bancario. Tu cliente recibe un correo con su portal y tú una tarea cuando el cobro se detiene.
- **Apagarlo:** por cliente desde su ficha (**Desactivar cobro automático**) o para todos desde **Ajustes › Cobros**.

## Cómo autoriza tu cliente

En su portal, la sección **Cobro automático** dice "Guarda un método y cada factura se cobra sola en su fecha de vencimiento". Al pulsar **Activar cobro automático**, tu cliente acepta: "Autorizo a tu negocio a cobrar a este método, en su fecha de vencimiento, cada factura que me emita a partir de hoy. Puedo desactivarlo en cualquier momento desde este portal". Después guarda su método con **Guardar método**.

- Cord registra la autorización con fecha, IP y navegador, y la activa **solo cuando el banco confirma ese método**.
- Con una cuenta bancaria, el portal dice "Estamos verificando tu cuenta bancaria" hasta que se confirma.
- Un método de cargo bancario solo cubre su divisa: SEPA cubre EUR y ACH cubre USD. Una factura en otra divisa no se cobra con él.
- Tu cliente puede **Cambiar método** o **Desactivar** cuando quiera; sus facturas siguen en el portal para pagarlas a mano.

## Qué se cobra y cuándo

Una factura entra en el cobro del día si, a la vez:

- está **emitida y abierta**, con saldo, sin un cargo bancario en proceso ni una cancelación en trámite, y no es de prueba;
- **vence hoy o antes** (sin vencimiento, se emitió hoy o antes) y se emitió **al menos un día antes**, para que tu cliente la reciba antes del cargo;
- **vence a partir del día en que tu cliente autorizó** el cobro automático: lo que ya debía antes no se le carga por sorpresa, lo paga desde el portal;
- el método cubre su divisa y tu negocio sigue aceptando ese método.

Todas las facturas de la misma divisa van en **un solo cargo**: un solo movimiento en el estado de cuenta de tu cliente. Cada factura recibe su parte como un pago propio en su historial.

## Política de reintentos

Cord no reintenta a ciegas: decide por el motivo del rechazo. Un rechazo cuenta una sola vez aunque el aviso llegue dos veces.

| Motivo del rechazo | Ejemplos | Qué hace Cord |
|---|---|---|
| **Bloqueado** | Tarjeta robada, extraviada o marcada como fraude | No reintenta nunca. Da de baja el método y apaga el cobro automático hasta que tu cliente registre otro. |
| **Autorización retirada** | Tu cliente retiró el mandato de cargo a su cuenta | No reintenta. Da de baja el método; tu cliente lo vuelve a activar si quiere. |
| **Método que ya no sirve** | Tarjeta vencida, datos incorrectos, cuenta cerrada | No reintenta. Pide otro método. |
| **Autenticación requerida** | El banco pide confirmar el pago | No reintenta: tu cliente paga esa factura desde su portal. El cobro automático **sigue activo**. |
| **Fondos insuficientes** (tarjeta) | Saldo insuficiente | Reintenta el siguiente día 1 o 16 del mes si cae dentro de una semana (y al menos 2 días después); si no, a los 3 días. |
| **Falla técnica del banco** (tarjeta) | Emisor no disponible | Reintenta al día siguiente. |
| **Otro rechazo** (tarjeta) | Rechazo genérico | Reintenta a los 2, 4 y 7 días. |

**Topes:**

- **Tarjeta:** como máximo **4 intentos** (el primero y tres reintentos). Después se detiene.
- **Cargo bancario (SEPA o ACH):** solo se reintenta por **fondos insuficientes**, como máximo **2 veces**, el siguiente día 1 o 16 dentro de una semana (al menos 3 días después; si no, a los 4 días), y siempre dentro de **30 días** (SEPA) o **40 días** (ACH) desde el primer intento. Cualquier otro rechazo de un débito lo resuelve tu cliente con su banco.

## Qué ven tú y tu cliente

- **Tu cliente** recibe un correo con el botón **Abrir mi portal**: "No pudimos cobrar … Lo intentaremos de nuevo el …", o que su método ya no se puede usar, que su banco pide confirmar el pago o que no se pudo cobrar después de varios intentos. Su portal dice lo mismo encima de sus facturas.
- **Tú** ves en la ficha del cliente, en **Portal del cliente › Cobro automático**, el estado: "Intento N rechazado en USD. Siguiente intento: …", "Detenido en EUR: …" o "Se desactivó solo: …". Cuando el cobro se detiene, Cord te crea una **tarea** ("Cobro automático detenido: …").

## Si no hubo respuesta del banco

Si el cargo se envió y no hubo respuesta, Cord no abre otro: la siguiente corrida reintenta **con la misma operación**, así que no hay doble cargo. Si en 20 horas no hay rastro del cargo, se cancela. Cord también concilia cada día los cobros que no recibieron aviso y los débitos que llevan más de 3 días en proceso.

## Requisitos y límites

- **Cord Payments activo** en **Ajustes › Cobros**. En Colombia, Argentina, Chile y Perú, donde el cobro en línea es con Mercado Pago, el cobro automático no está disponible: Mercado Pago cobra cuando tu cliente abre el link.
- **En pesos mexicanos**, el cobro automático es con tarjeta.
- Tu negocio **no puede activarlo** por tu cliente: solo puede ofrecerlo o apagarlo.

## Relacionados

- [Portal del cliente y pago de varias facturas](/soporte/portal-del-cliente)
- [Domiciliación SEPA y cargo ACH](/soporte/domiciliacion-sepa-ach)
- [Razones de pagos rechazados](/soporte/pagos-rechazados)
- [Métodos de cobro en la documentación](https://docs.cordhq.app/docs/pagos/metodos)

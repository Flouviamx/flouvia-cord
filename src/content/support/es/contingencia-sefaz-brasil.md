---
title: "Contingencia de la SEFAZ (Brasil)"
description: "Qué hace Cord con tus NF-e cuando la SEFAZ de tu estado no responde: emisión en la SEFAZ Virtual de contingencia, cómo se ve, cómo vuelve sola y qué pasa con las cancelaciones y las cartas de corrección."
category: "Facturación por país"
order: 14
---

Esto aplica a negocios en **Brasil** con la **NF-e** (venta de mercancías), que **está en activación** en Cord: si necesitas emitir NF-e desde Cord, escríbenos para habilitarlo. Ver [Cómo facturar en Brasil con Cord](/soporte/facturar-en-brasil).

Cada estado tiene una **SEFAZ Virtual de contingencia (SVC)**, la SVC-AN o la SVC-RS, que autoriza las NF-e cuando la SEFAZ normal no está disponible. Cord entra y sale de la contingencia por sí solo.

**En resumen:**

- **Cuándo entra:** si la SEFAZ de tu estado **no recibió** el pedido (no hubo conexión o respondió que está fuera de servicio) y la SVC de tu estado está en operación.
- **Qué hace:** emite la NF-e en la SVC, como nota en contingencia, con la fecha y la justificación de la contingencia.
- **Cómo lo ves:** **Ajustes › Facturación › Perfil fiscal › NF-e** muestra el aviso mientras dura, y cada NF-e emitida así dice "Emitida en contingencia".
- **Cuándo sale:** sola, en cuanto la SEFAZ normal vuelve a responder. Cord lo comprueba cada 5 minutos al emitir.
- **Lo que no hace:** una NF-e que se envió a la SEFAZ normal y quedó **sin respuesta** no pasa a la SVC: Cord la **consulta**, para no autorizar la misma venta dos veces.

## Cómo funciona

1. Emites una factura de productos como siempre.
2. Cord envía la NF-e a la SEFAZ autorizadora de tu estado.
3. Si no hay conexión, o la SEFAZ dice que está paralizada, Cord pregunta a la SVC de tu estado si está en operación.
4. Si la SVC responde, Cord **abre la contingencia** para tu negocio y emite la NF-e en la SVC.
5. Las siguientes NF-e van a la SVC mientras dure la contingencia, y cada 5 minutos Cord vuelve a probar la SEFAZ normal.
6. Cuando la SEFAZ normal responde, Cord **cierra la contingencia** y vuelve a emitir ahí.

## Cómo se ve

- **En Ajustes**, la sección **NF-e** dice: "La SEFAZ de tu estado no está disponible: desde el … Cord autoriza tus NF-e en la SVC (contingencia). Vuelve sola a la SEFAZ de tu estado cuando se restablezca."
- **En la factura**, el panel **NF-e** dice "Emitida en contingencia en la SVC-AN" (o SVC-RS), con su número, chave y protocolo como cualquier otra.
- **En el XML**, la NF-e lleva el tipo de emisión de contingencia, su fecha y su justificación, como pide la SEFAZ.

Una NF-e emitida en contingencia tiene la misma validez: no necesitas volver a emitirla.

## Cancelar o corregir una NF-e de contingencia

- **Cancelar:** **Más acciones › Anular**, dentro de las 24 horas de su autorización. La cancelación de una nota emitida en la SVC se envía a la SVC.
- **Carta de Correção (CC-e):** siempre va a la SEFAZ normal de tu estado. Si sigue fuera de servicio, espera a que se restablezca.

## Por qué una nota sin respuesta no pasa a la SVC

Si Cord envió la NF-e a la SEFAZ normal y no llegó una respuesta legible, la SEFAZ pudo haberla autorizado. Emitirla de nuevo en la SVC podría dejar **dos notas autorizadas por la misma venta**. Por eso Cord la deja como "esperando confirmación" y la **consulta** por su chave: si la SEFAZ la autorizó, es esa; si no la registró, ese intento se descarta y la factura puede emitirse de nuevo sin dejar números sin usar. Lo que quede sin resolver lo consulta una tarea automática cada hora.

## Problemas comunes

- **El aviso de contingencia no se quita.** La SEFAZ normal sigue sin responder; Cord la vuelve a probar en la siguiente emisión, cada 5 minutos como mínimo.
- **Una NF-e quedó "esperando confirmación".** Es lo esperado cuando la respuesta se perdió: Cord la consulta y la resuelve sola.
- **La CC-e no sale.** La Carta de Correção no usa la SVC; espera a que la SEFAZ de tu estado se restablezca.

## Relacionados

- [Cómo facturar en Brasil con Cord](/soporte/facturar-en-brasil)

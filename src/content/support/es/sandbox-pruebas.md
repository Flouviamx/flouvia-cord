---
title: "Probar Cord sin afectar tu producción"
description: "Cómo experimentar con pagos y timbrado sin gastar dinero ni timbrar de a de veras."
category: "Desarrolladores"
---

Antes de operar en serio querrás probar el flujo (enviar una cotización, cobrar, timbrar) sin riesgo. Cord no tiene todavía un **sandbox aislado** con datos separados; en su lugar, usa estas piezas para probar con seguridad.

### Llaves de API en modo Test

Crea una llave `sk_test_...` en **Ajustes > Developers > API**. Las llaves test **no consumen tu medidor de uso ni cuentan para tu facturación**, así que puedes iterar tu integración sin costo. Ten en cuenta que operan sobre los **mismos datos** de tu organización (no hay un entorno paralelo); etiqueta o borra los registros de prueba que crees.

### Probar el cobro con tarjeta

El cobro pasa por **tu cuenta de Stripe**. Pon tu cuenta de Stripe en **modo de prueba** y usa las [tarjetas de prueba de Stripe](/soporte/tarjetas-prueba) (ej. la Visa `4242 4242 4242 4242`) en el checkout del link público. Ningún cargo es real mientras Stripe esté en test.

### Probar el timbrado (CFDI)

El timbrado depende de tu configuración de Facturapi:
- **Sin CSD / sin llave de Facturapi:** Cord devuelve un timbre **simulado** (marcado como tal), sin enviar nada al SAT. Ideal para probar el flujo sin afectar a tu contador.
- **Con llave de prueba de Facturapi:** se valida la sintaxis sin emitir un CFDI con validez fiscal.
- **Con CSD y llave live:** se timbra de verdad ante el SAT.

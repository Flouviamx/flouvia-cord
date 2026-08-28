---
title: "Probar Cord sin afectar tu producción"
description: "Cómo experimentar con pagos y timbrado sin gastar dinero ni timbrar de a de veras."
category: "Desarrolladores"
---

Antes de operar en serio querrás probar el flujo (enviar una cotización, cobrar, timbrar) sin riesgo. Cord tiene un **Entorno de prueba** real: una organización espejo (`orgs.sandbox_of`), aislada por completo de tus datos productivos.

### Activar el Entorno de prueba

Abre el selector de organización (arriba a la izquierda) y enciende **Entorno de prueba**. La app navega a un espacio 1:1 con el mismo aspecto de tu cuenta (marca, prefijo de folio, plan) pero con sus propias cotizaciones, clientes, productos y facturas — nada de lo que hagas ahí toca tus datos reales. Un banner permanente lo recuerda mientras estás dentro.

- **Vaciar datos de prueba:** desde el mismo banner, el botón "Vaciar datos de prueba" borra por completo la organización espejo (en cascada); la próxima vez que entres al entorno de prueba se recrea limpia.
- **Llaves de API en modo Test:** una llave `sk_test_...` (pestaña **API** del dock de Desarrolladores, actívalo en Ajustes) resuelve automáticamente contra esta misma organización espejo — no consume tu medidor de uso ni cuenta para tu facturación. Ver [Autenticación y Claves API](/soporte/claves-api).
- **Timbrado CFDI:** dentro del entorno de prueba, el timbrado sigue las mismas reglas que en producción según si tienes tu CSD conectado (ver abajo) — el aislamiento lo da la organización, no una simulación forzada.

### Lo que el Entorno de prueba NO cubre: cobro con tarjeta

Cord Payments (el alta de cuenta de cobros) está deliberadamente bloqueada dentro de la organización espejo: no puedes conectar una cuenta de cobros de prueba desde ahí. El link público de una organización productiva procesa operaciones reales y **no debe probarse con números de tarjeta de laboratorio**. Para simular el cobro con tarjeta (aprobación, 3D Secure, rechazos), solicita a soporte un entorno aislado dedicado. Nunca uses una tarjeta real para simular errores.

### Probar el timbrado (CFDI)

El timbrado depende de si tienes tu CSD conectado:
- **Sin CSD conectado:** Cord devuelve un timbre **simulado** (marcado como tal), sin enviar nada al SAT. Ideal para probar el flujo sin afectar a tu contador.
- **Con CSD de prueba:** se valida la sintaxis sin emitir un CFDI con validez fiscal.
- **Con CSD real conectado:** se timbra de verdad ante el SAT.

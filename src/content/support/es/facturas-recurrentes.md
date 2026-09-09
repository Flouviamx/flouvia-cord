---
title: "Evitar repetir una factura recurrente"
description: "Qué revisar cuando falla una emisión o su correo."
category: "Facturación"
---

# Evitar repetir una factura recurrente


## Protección del periodo programado

Cord comprueba que la recurrencia siga activa y conserve la fecha y configuración
leídas antes de reservar el periodo. Esto evita que dos ejecuciones tomen la misma
emisión o que una edición o pausa concurrente pase inadvertida. La siguiente fecha
se calcula desde el periodo programado y respeta la fecha final. Una fecha inválida
o un fin anterior al inicio no se acepta.

No hay cobro automático nuevo por crear una recurrencia. Si la emisión falla, revisa
**Último error** y el documento antes de repetirla; no existe una recuperación
automática completa de todos los periodos fallidos.

Si solo falló el correo, reenvía la factura existente. Consulta [la guía de recurrencias](/docs/pagos/facturas-recurrentes).

> La disponibilidad de las mejoras de septiembre está en verificación. Consulta [alcance y publicación](https://docs.cordhq.app/pagos/mejoras-confiabilidad); contacta a soporte si una acción descrita todavía no aparece en tu cuenta.

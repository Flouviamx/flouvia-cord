---
title: "Configurar vigencia de cotización"
description: "Añade una fecha de expiración automática a tus propuestas."
category: "Cotizaciones"
---

Las condiciones de mercado y los precios de proveeduría cambian constantemente. Nunca envíes una propuesta comercial de vigencia indeterminada.

### Configurar la vigencia

Al redactar una cotización en Cord:
1. En el panel de la derecha, ubica el campo **Vigencia**.
2. Elige cuántos días es válida la oferta a partir de hoy — las opciones son 15, 30, 60 días o el default que configuraste para tu organización. No es un selector de fecha en calendario: la vigencia siempre se define en días, y la fecha exacta de vencimiento se calcula sola.

**Cierre automático:**
Cuando la fecha de vigencia queda atrás sin que el cliente haya decidido:
- El link público muestra "Vigencia expirada" en el encabezado de la cotización.
- Un proceso diario marca la cotización como **vencida** cuando su estatus seguía en "enviada" o "vista" sin respuesta. A partir de ese momento, aceptar, rechazar o mandar una contraoferta desde el link público se rechaza en el servidor con un aviso de que la cotización ya no admite cambios — no hace falta que revises manualmente cada folio. Como este proceso corre una vez al día, puede haber una ventana de hasta 24 horas después de la fecha límite en la que la cotización técnicamente sigue abierta.
- Esta vigencia solo aplica a la **decisión** del cliente (aceptar/rechazar). Si la cotización ya fue aprobada con términos a crédito (Net 30/60), el cobro se rige por la fecha de vencimiento de esos términos, no por la vigencia — ver [Añadir términos de crédito](/soporte/terminos-de-credito).

Si el cliente te contacta para revivir un trato ya vencido, edita la cotización: al guardar los cambios se genera una nueva versión con vigencia fresca a partir de ese momento.

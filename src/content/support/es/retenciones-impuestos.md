---
title: "Configurar retenciones (ISR/IVA)"
description: "Aplica retenciones automáticamente según el régimen."
category: "Facturación y CFDI"
---

Facturar servicios profesionales u honorarios a Personas Morales requiere aplicar retenciones de impuestos específicos (ISR e IVA retenido) sobre el subtotal.

### Automatización de Retenciones

Cord calcula las retenciones obligatorias de acuerdo al Régimen Fiscal que hayas configurado tanto para ti (emisor) como para tu cliente.

Por ejemplo, si eres RESICO (Régimen Simplificado de Confianza) y le cotizas un servicio a una Persona Moral:
1. Añade el servicio a tu cotización por $10,000 MXN.
2. Al crear la cotización, Cord detectará automáticamente tu régimen y **aplicará una retención de ISR del 1.25%** ($125 MXN) de forma transparente.
3. El cliente verá el desglose perfecto en la propuesta y pagará el monto correcto ($11,475 = 10,000 + 1,600 IVA - 125 ISR).

Al convertir la cotización a CFDI, el XML incluirá los nodos de `Retenciones` exigidos por el SAT. Puedes ajustar manualmente o anular estas retenciones en la configuración de la cotización si estás vendiendo un bien que no lo amerite (ej. venta de hardware puro).

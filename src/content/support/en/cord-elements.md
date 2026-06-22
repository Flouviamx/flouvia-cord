---
title: "[EN] Cord Elements (Componentes UI embebibles)"
description: "Incrusta botones de pago y formularios interactivos directamente en tu propia aplicación web."
category: "Developers"
order: 3
---

Cord Elements es una librería de componentes UI *drop-in* (listos para usar) que te permite embeber el poder de Cord directamente dentro del sitio web de tu aplicación, sin que el cliente sepa que existimos.

### Beneficios

- **Menos abandono:** El cliente nunca sale de tu dominio (ej. `app.tuempresa.com/checkout`) para pagar o aceptar una cotización.
- **Cumplimiento PCI:** Los componentes inyectan iframes seguros que recolectan los datos de la tarjeta. La información sensible jamás toca tus servidores, eximiéndote de auditorías PCI pesadas.

### Elementos Disponibles

1. **Payment Element:** Una caja de pago que soporta tarjetas, transferencias y meses sin intereses dinámicamente.
2. **Quote Element:** Muestra una cotización B2B interactiva dentro de tu portal de clientes.
3. **Customer Portal Element:** Permite a tus usuarios descargar sus propias facturas XML/PDF y actualizar sus datos fiscales directamente en tu sitio.

Para instalar Elements, simplemente añade la etiqueta de script en tu `<head>` y monta los componentes usando nuestro [SDK de frontend](/soporte/react-sdk).

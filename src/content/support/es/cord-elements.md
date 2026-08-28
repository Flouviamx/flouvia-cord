---
title: "Cord Elements (Componentes UI embebibles)"
description: "Incrusta el cotizador de Cord directamente en tu propia aplicación web, con tu marca."
category: "Desarrolladores"
order: 3
---

Cord Elements (`@flouviahq/elements`) es la librería de componentes que te permite embeber el cotizador de Cord directamente dentro de tu sitio o app, sin sacar al cliente a otro dominio.

### Beneficios

- **Menos abandono:** el cliente nunca sale de tu dominio (ej. `app.tuempresa.com/portal`) para ver, aprobar o pagar una cotización.
- **Cumplimiento PCI:** el cobro con tarjeta ocurre dentro del iframe seguro del link público de la cotización — los datos sensibles de la tarjeta nunca tocan tus servidores.

### Los dos componentes reales

1. **`CordCotizador`** — un iframe con auto-altura que muestra una cotización **ya creada** para que el cliente la vea, la apruebe (firma) o la pague. Es el mismo cotizador que corre en `/q/{token}`, con tu marca vía la API de `appearance` (colores, tipografía, tema claro/oscuro).
2. **`CordBuilder`** (o el hook headless `useQuoteBuilder`) — arma y crea una cotización **nueva** desde tu propia interfaz: cliente, líneas, impuestos y totales calculados con el mismo motor que usa el servidor.

No existen componentes separados de "solo pago" ni un portal de autoservicio de facturas embebible: descargar el PDF/XML de una factura o actualizar datos fiscales se hace hoy desde el link público de la factura o dentro de la app de Cord, no como un componente aparte de Elements.

### Seguridad: publishable key o tu propio proxy

Crear cotizaciones o leer el catálogo desde el navegador requiere decidir cómo tu app habla con la API: con una **publishable key** (`pk_live_.../pk_test_...`, expuesta en el cliente pero con alcance acotado — nunca puede leer tu directorio de clientes ni tocar facturación) o con **tu propio proxy** (tu backend llama a Cord con una `sk_`). El visor `CordCotizador` no requiere ninguna de las dos: solo necesita el `token` público de la cotización.

### Instalación

```bash
npm install @flouviahq/elements
```

Ver [Cord Elements para React](/soporte/react-sdk) para el wrapper de React, o la página de [Cord Elements](/elements) para el Web Component `<cord-cotizador>` (funciona en cualquier sitio) y los wrappers de Vue y Framer.

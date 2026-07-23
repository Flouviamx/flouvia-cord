---
title: "Facturación Global (CFDI 4.0)"
description: "Descubre cómo Cord emite facturas internacionales y CFDI 4.0 nominativas en México usando su Abstracción Fiscal Global."
---

<header class="content-header">
  <h1 class="page-title">Facturación y Abstracción Fiscal</h1>
  <p class="page-subtitle">Automatización de comprobantes fiscales, desde Commercial Invoices globales hasta CFDI 4.0 Nominativo en México.</p>
</header>

## Abstracción Fiscal Global

El sistema de pagos de Cord está diseñado para escalar internacionalmente gracias al patrón de diseño **FiscalFactory**. 

Dependiendo del país del cliente y de tu empresa, el motor fiscal decide qué proveedor de timbrado utilizar y qué tipo de comprobante generar (por ejemplo, *US Commercial Invoices* para transacciones en Estados Unidos).

## Emisión en México: CFDI 4.0 Nominativo

Para los usuarios en México, Cord utiliza de fondo la API de **Facturapi** (`MexicoSatProvider`) para lograr un cumplimiento al 100% con los requerimientos del SAT, de forma completamente invisible y automatizada.

### Extracción de datos del Catálogo

A diferencia de otros sistemas que emiten facturas genéricas al "Público en General" y luego obligan al cliente a entrar a un portal de autofacturación, Cord es proactivo. 

Cord extrae automáticamente la información del perfil individual del cliente (CRM):

- **Régimen Fiscal:** Extraído directamente del Catálogo SAT asignado a ese cliente.
- **Uso de CFDI:** Determinado según el tipo de servicio o producto, o definido explícitamente en el perfil del cliente.
- **Código Postal (C.P.):** Validado contra la constancia de situación fiscal registrada en su ficha.

### Timbrado Automático y Transparente

1. En cuanto se confirma el cobro a través de Stripe (Tarjeta o SPEI Dinámico), el webhook notifica al servidor de Cord.
2. El sistema ensambla el *payload* con los conceptos de la cotización y los datos fiscales exactos del cliente (Régimen, CP, Uso CFDI).
3. Se invoca a la `FiscalFactory` que timbra el documento ante el SAT (CFDI 4.0 nominativo).
4. El archivo XML y PDF final se envían directamente al correo del cliente junto con su recibo de pago, cerrando el ciclo comercial sin intervención manual de tu equipo.

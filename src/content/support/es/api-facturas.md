---
title: "Facturación (CFDI) y la API"
description: "Cómo se emiten los CFDI 4.0 en Cord y qué expone la API pública."
category: "Desarrolladores"
---

A diferencia de otros recursos, **el timbrado de CFDI 4.0 no se expone como un endpoint público de la API v1 todavía**. La facturación ocurre dentro del flujo de la cotización, no como una llamada directa "crear factura".

### Cómo se factura en Cord

1. Creas o recibes una cotización (puedes hacerlo por la API: ver [API: Crear cotizaciones](/soporte/api-cotizaciones)).
2. El cliente la aprueba (o tú la marcas como aprobada).
3. Marcas la cotización como **facturada** desde la app. En ese momento Cord arma el CFDI 4.0 con los datos de la cotización (productos, cantidades, precios, RFC y datos fiscales del cliente) y lo timbra ante el SAT a través de nuestro PAC, **Facturapi**.
4. El XML y el PDF quedan ligados a la cotización y disponibles para ti y para tu cliente.

Para que el CFDI salga a nombre de un RFC específico, captura el **régimen fiscal, código postal y uso de CFDI** del cliente en su ficha. Sin esos datos, el comprobante se emite como "público en general".

### Qué SÍ puedes hacer por la API

- **Crear y consultar cotizaciones** (`/api/v1/cotizaciones`), que son el origen de cada factura.
- **Consultar tu cartera** (`/api/v1/cobranza`) para saber qué está pagado o vencido.
- **Recibir webhooks** del evento `quote.invoiced` cuando una cotización se factura, para reaccionar desde tu sistema.

> Un endpoint de timbrado directo (sin pasar por una cotización) está en nuestro roadmap. Mientras tanto, el origen siempre es una cotización.

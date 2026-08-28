---
title: "Cobro en múltiples divisas"
description: "Cómo cotizar y cobrar en una divisa distinta a la de tu contabilidad."
category: "Pagos y Depósitos"
---

Cord distingue tres divisas que nunca se mezclan: la **de venta** (en la que cotizas y le cobras al cliente), la **contable** (en la que tu negocio lleva sus libros) y la **de la plataforma** (en la que Cord te cobra tu suscripción, siempre MXN o USD según tu país). Este artículo es sobre la primera.

El selector de moneda ofrece hoy las divisas de los 12 países donde Cord opera (MXN, USD, CAD, BRL, EUR, GBP, COP, ARS, CLP, PEN) más cuatro de comercio internacional (JPY, CNY, CHF, AUD). No es un catálogo abierto: una divisa que ninguna fuente de tipo de cambio publica y que ningún banco puede liquidar no se ofrece para capturar, para que no descubras el problema hasta el momento de cobrar.

### Crear una cotización en otra divisa

Al redactar la cotización, en la sección de **Configuración Global** (panel derecho) verás el selector de Moneda.
1. Cambia la divisa de venta a la que corresponda (por ejemplo, de MXN a USD).
2. Los precios de tus conceptos se leen bajo esa nueva divisa.

### Cobro en línea

El cliente paga en la moneda indicada por el link cuando esa combinación de moneda, país y método está habilitada para tu cuenta. Si la moneda de liquidación de tu banco es distinta, la red de pagos puede aplicar conversión y cargos transfronterizos. Revisa el neto estimado en **Cobros** antes de conciliar. La transferencia SPEI solo existe para cobros en pesos mexicanos; en cualquier otra divisa el cobro en línea es con tarjeta.

### Facturación y tipo de cambio

Cuando la divisa de venta es distinta de la divisa contable de tu negocio, la factura declara el tipo de cambio del día — nunca se reescriben los importes ya cotizados. Ese tipo de cambio sale de una fuente real y fechada (nunca se inventa un número); si ninguna fuente lo publica ese día, la operación falla con un mensaje claro en vez de arriesgar un tipo de cambio equivocado.

En **México**, la factura es un CFDI 4.0 y declara `Moneda` y `TipoCambio` conforme al formato que exige el SAT. En el resto de los países soportados, la factura es un documento comercial (o Verifactu en España) que declara igualmente la divisa de venta, la divisa contable y el tipo de cambio aplicado, sin usar vocabulario del SAT que no aplica fuera de México.

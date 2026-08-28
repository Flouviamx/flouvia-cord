---
title: "Cotizaciones multimoneda"
description: "Envía propuestas en USD, EUR o MXN."
category: "Cotizaciones"
---

Cord soporta la emisión de propuestas comerciales en 14 divisas: las de los 12 países donde opera la plataforma (MXN, USD, CAD, BRL, EUR, GBP, COP, ARS, CLP, PEN) más cuatro divisas de comercio internacional (JPY, CNY, CHF, AUD). No es un catálogo abierto de las ~180 divisas ISO — es un set cerrado que crece solo cuando Cord habilita el riel de cobro y el formato de cuenta de depósito correspondientes.

### ¿Cómo crear una cotización en otra moneda?

Al momento de redactar la cotización, en el panel de totales verás un selector de **Moneda**.
1. Cambia de la divisa por defecto de tu cuenta (la que configuraste en **Ajustes > General**) a cualquiera de las divisas ofrecidas.
2. Todos los precios de las partidas de esa cotización se capturan y se muestran en la divisa elegida — es la divisa de venta, y es la que ve tu cliente en el link público.

### Impacto en la Facturación y Pagos

- **Para tu cliente:** Recibirá el documento y la liga de pago en la divisa que elegiste (ej. $10,000 USD). Si paga con tarjeta, su banco le hará el cargo en esa divisa o en la suya local, según su propio contrato bancario.
- **Para ti (documento fiscal):** si la divisa de venta de la cotización es distinta de la divisa contable de tu organización, el documento fiscal declara el tipo de cambio congelado al momento de cotizar — obtenido de una fuente de tipo de cambio real y fechada (nunca inventado; si ninguna fuente publica el par, la operación falla en vez de usar un número estimado). En México, el CFDI declara este mismo tipo de cambio como `TipoCambio` ante el SAT cuando la moneda del comprobante no es MXN; en el resto de los países el documento fiscal declara el tipo de cambio sin ese nodo específico del SAT, que es exclusivo de México.
- **Para ti (dinero):** la liquidación de los cobros la procesa tu cuenta de Cord Payments y llega a tu cuenta de depósito en la divisa que esa cuenta usa según tu país (por ejemplo, pesos en México, dólares en Estados Unidos, euros en España), aplicando su propia tasa de conversión si la divisa de venta fue distinta.

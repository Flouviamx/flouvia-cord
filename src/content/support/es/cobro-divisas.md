---
title: "Cobro en múltiples divisas"
description: "Cómo cotizar y cobrar en una divisa distinta a la de tu contabilidad, con qué métodos se cobra cada divisa y cómo declara la factura el tipo de cambio."
category: "Pagos y Depósitos"
---

Cord distingue tres divisas que nunca se mezclan: la **de venta** (en la que cotizas y le cobras al cliente), la **contable** (en la que tu negocio lleva sus libros) y la **de la plataforma** (en la que Cord te cobra tu suscripción: MXN en México, EUR en España, Alemania y Francia, y USD en los demás países). Este artículo es sobre la primera.

El selector ofrece las divisas de los 12 países donde Cord opera (MXN, USD, CAD, BRL, EUR, GBP, COP, ARS, CLP, PEN) más cuatro de comercio internacional (JPY, CNY, CHF, AUD). No es un catálogo abierto: una divisa que ninguna fuente de tipo de cambio publica y que ningún banco puede liquidar no se ofrece, para que no descubras el problema al momento de cobrar.

## Crear una cotización en otra divisa

1. En el editor de la cotización, en **¿En qué moneda le cotizas?**, elige la divisa de venta (por ejemplo, USD).
2. Los precios de tus conceptos se capturan en esa divisa.
3. Si tus libros van en otra divisa, el editor muestra el **Tipo de cambio hoy** y **Tu tasa protegida**: eliges en **¿Qué tan cauto quieres ser?** un colchón de +1 %, +2 % o +5 %.
4. Al guardar, la tasa queda **congelada 30 días**.

El tipo de cambio sale de fuentes reales y fechadas, empezando por la referencia del Banco Central Europeo. Si ninguna fuente publica el par, la cotización no se guarda y te lo dice: Cord nunca inventa una tasa.

## Cobro en línea por divisa

| Método | Divisas |
|---|---|
| Tarjeta (Cord Payments) | La divisa de venta, si tu cuenta de cobros la admite. |
| SPEI (México) | Solo MXN. En otra divisa, tu cliente paga con tarjeta aunque tengas SPEI activado. |
| Domiciliación SEPA | Solo EUR, en la factura y el portal. |
| Cargo a cuenta bancaria (ACH) | Solo USD, en la factura y el portal. |
| Mercado Pago | Las que Mercado Pago admita en tu cuenta. |

Si la moneda de liquidación de tu banco es distinta, la red de pagos puede aplicar conversión y cargos transfronterizos. Revisa el neto en **Cobros** antes de conciliar.

## Facturación y tipo de cambio

Cuando la divisa de venta es distinta de tu divisa contable, la factura **declara el tipo de cambio que se congeló al cotizar** y el total convertido; nunca se reescriben los importes cotizados. Facturar una cotización multidivisa sin una tasa utilizable no procede: Cord te pide recalcularla.

- **México:** el CFDI declara la moneda y el tipo de cambio. Un complemento de pago de un cobro en otra divisa no es automático: necesita el tipo de cambio oficial del día del pago.
- **Unión Europea:** si facturas en otra divisa, el PDF imprime también la cuota en euros.
- **Rieles de LatAm (en activación):** ARCA usa la tasa congelada si tu divisa contable es ARS (si no, la oficial de ARCA); la DIAN exige la tasa a COP; SUNAT la exige para la retención en soles; el SII y la NF-e solo emiten en su moneda nacional.

## Relacionados

- [Recibir pagos internacionales](/soporte/pagos-internacionales)
- [Facturar a clientes en el extranjero](/soporte/facturas-extranjero)
- [Tesorería y tipo de cambio en la documentación](https://docs.cordhq.app/docs/pagos/tesoreria-fx)

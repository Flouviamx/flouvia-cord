---
title: "[EN] Facturar a clientes en el extranjero"
description: "Uso del RFC genérico extranjero y Tax ID."
category: "Billing & CFDI"
---

Vender servicios o licencias de software a clientes fuera de México requiere la emisión de un CFDI de exportación de servicios.

### El RFC Extranjero

El SAT dispone de un RFC genérico internacional que debes usar siempre que tu cliente radique en otro país: **XEXX010101000**.

### Configurar la Factura en Cord

1. Añade a tu cliente extranjero a la base de datos de Cord. En el campo de RFC, introduce `XEXX010101000`.
2. El sistema detectará que es un RFC foráneo y te permitirá ingresar su Número de Identificación Tributaria (Tax ID / EIN) de su país de origen (opcional pero recomendado).
3. Al crear la cotización o factura, selecciona el **Uso de CFDI: S01 (Sin efectos fiscales)**, ya que el receptor extranjero no deduce impuestos ante el fisco mexicano.
4. Configura la **Moneda** de la factura a USD (o la que corresponda) y selecciona la **Tasa de IVA 0%** (por ley, la exportación de servicios de TI gravados en México y aprovechados en el extranjero tiene tasa cero).

Cord timbrará el XML con el nodo de `ResidenciaFiscal` y `NumRegIdTrib` requeridos por la autoridad.

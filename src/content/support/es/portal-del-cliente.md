---
title: "Portal del cliente y pago de varias facturas"
description: "Un link por cliente con todas sus facturas, su saldo por divisa y el pago de varias a la vez: cómo crearlo, enviarlo, rotarlo y qué ve tu cliente."
category: "Pagos y Depósitos"
order: 6
---

> **Función nueva, en habilitación.** Puede no estar disponible todavía en tu cuenta. Si no la ves, escríbenos y te decimos cuándo se activa.

El **portal del cliente** es un link personal por cliente donde ve **todas sus facturas emitidas**, su **saldo pendiente por divisa**, descarga cada factura y **paga varias a la vez** en un solo cobro. Desde ahí también activa el [cobro automático](/soporte/cobro-automatico).

**En resumen:**

- **Dónde se crea:** en la ficha del cliente (**Clientes**, abre el cliente), sección **Portal del cliente**, con **Crear link del portal**. Necesitas el permiso **Clientes**.
- **Qué ve tu cliente:** **Tus facturas**, el **Saldo pendiente** de cada divisa, las facturas **Por pagar** (con las vencidas marcadas) y las **Pagadas**, cada una con su PDF.
- **Pagar varias:** tu cliente marca las facturas de una misma divisa y pulsa **Pagar seleccionadas**. Cord reparte el pago con el saldo real de cada factura.
- **Requisito para pagar en línea:** Cord Payments activo. Sin él, el portal muestra las facturas y le pide a tu cliente que se ponga en contacto contigo para pagar.
- **El link es la credencial:** no necesita cuenta ni contraseña. Puedes generar otro (el anterior deja de abrir) o desactivarlo.
- **Sin costo extra** y en todos los planes.

## Crear y compartir el link

1. Abre **Clientes**, entra al cliente y ve a **Portal del cliente**.
2. Pulsa **Crear link del portal**.
3. Compártelo con **Copiar**, ábrelo con **Abrir** o pulsa **Enviar por correo**: tu cliente recibe "Tus facturas con" tu negocio, con el botón **Abrir mi portal**.

Cada acción queda en la auditoría de tu negocio. El portal siempre vive en `cordhq.app`, aunque tengas dominio propio para tus cotizaciones.

## Rotar o desactivar

- **Generar link nuevo:** el link actual deja de abrir y tienes que compartir el nuevo. Úsalo si el link llegó a quien no debía.
- **Desactivar link:** tu cliente no puede abrir su portal hasta que generes otro. El cobro automático no cambia.

## Qué ve tu cliente

- **Saldo pendiente** por divisa, sin sumar divisas distintas, y cuántas facturas tiene por pagar y cuánto está vencido.
- **Por pagar:** número, vencimiento, saldo (y el total, si ya abonó una parte), y las etiquetas **Vencida** y **Pago en proceso**. Cada factura tiene **Ver** (su link) y **PDF**.
- **Pagadas**, en una sección plegable.
- El aviso de que el link es personal y da acceso a sus facturas y pagos, y tu correo de contacto para dudas.

Solo aparecen facturas **emitidas** y asignadas a ese cliente. Una factura sustituida no aparece (la reemplaza su sustituta) y la factura global de México tampoco.

## Pagar varias facturas a la vez

1. Tu cliente marca las facturas que quiere pagar. El portal muestra cuántas son y el total ("2 facturas · USD 1,250.00").
2. Pulsa **Pagar seleccionadas**, elige el método y confirma con el botón **Pagar** y el monto.
3. Si marca **Guardar este método para el cobro automático**, además queda activo el cobro automático.

Reglas que aplica Cord:

- **Una divisa a la vez.** Las facturas en distintas divisas se pagan por separado.
- **El reparto lo decide el servidor** con el saldo real de cada factura al crear el cobro; el navegador solo elige cuáles. Cada factura recibe su parte como un pago propio en su historial, y una factura de México emitida PPD recibe su complemento de pago.
- **Métodos:** tarjeta y, si los activaste y la divisa coincide, domiciliación SEPA (EUR) o cargo a cuenta bancaria ACH (USD). En pesos mexicanos el portal cobra con tarjeta; SPEI se ofrece en el link de cada cotización.
- **Un cargo bancario tarda días:** mientras un débito está en proceso, esa factura muestra **Pago en proceso**, no se puede volver a cobrar ni anular, y el portal le dice a tu cliente que no pague otra vez.

## Reembolsar un pago de varias facturas

Si reembolsas parte de un cobro que pagó varias facturas, Cord asigna la devolución de la última factura aplicada a la primera, cada una completa antes de pasar a la siguiente.

## Problemas comunes

- **Mi cliente no puede pagar desde el portal.** Tu cuenta de Cord Payments no está activa o tu país cobra en línea con Mercado Pago: en ese caso tu cliente paga cada factura desde su propio link.
- **No aparece una factura.** Revisa que esté emitida (no en borrador) y asignada a ese cliente.
- **El link ya no abre.** Lo desactivaste o generaste uno nuevo. Comparte el vigente desde la ficha del cliente.
- **Mi cliente ve un aviso de "Portal de prueba".** Es una cuenta de prueba: el pago en línea está desactivado.

## Relacionados

- [Cobro automático y reintentos](/soporte/cobro-automatico)
- [Domiciliación SEPA y cargo ACH](/soporte/domiciliacion-sepa-ach)
- [Enlace público de la factura](/soporte/enlace-publico-factura)
- [Métodos de cobro en la documentación](https://docs.cordhq.app/docs/pagos/metodos)

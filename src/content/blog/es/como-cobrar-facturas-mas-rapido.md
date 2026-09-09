---
title: "Cómo cobrar facturas más rápido: proceso, mensajes y métricas"
excerpt: "Una guía operativa para reducir fricción de pago, priorizar cuentas por cobrar y dar seguimiento sin perder el contexto del cliente."
category: "Cobranza"
date: "28 Ago 2026"
publishedAt: "2026-08-28"
lastUpdated: "2026-08-28"
readTime: "10 MIN"
img: "/og-cord.jpg"
authorName: "Equipo Cord"
authorRole: "Producto y operaciones financieras"
reviewedBy: "Producto de Cord"
reviewedByRole: "Verificación funcional"
keywords: ["cómo cobrar facturas", "cobrar más rápido", "cuentas por cobrar", "seguimiento de pagos", "recordatorios de pago"]
faq:
  - question: "¿Qué información debe tener un recordatorio de pago?"
    answer: "Cliente, número de factura, importe pendiente, moneda, fecha de vencimiento, instrucciones o enlace de pago, un contacto para aclaraciones y una petición concreta de fecha de pago."
  - question: "¿Cuándo conviene enviar el primer recordatorio?"
    answer: "La cadencia depende de la relación y las condiciones acordadas. Una práctica útil es confirmar recepción antes del vencimiento y contactar de nuevo al vencer, sin afirmar mora cuando existe una aclaración abierta."
  - question: "¿Marcar una factura como pagada mueve dinero?"
    answer: "No. Registrar pago actualiza el control interno de la cuenta por cobrar. Debe hacerse solo después de comprobar el depósito o la confirmación del proveedor de pagos."
  - question: "¿Cord cobra automáticamente una factura recurrente?"
    answer: "No. La recurrencia emite la siguiente factura según la programación; no carga por sí sola una tarjeta guardada del cliente. El comprador paga con los métodos habilitados."
sources:
  - name: "Cord Docs — cartera y seguimiento"
    url: "https://docs.cordhq.app/docs/pagos/cartera-cobranza"
  - name: "Cord Docs — métodos de pago por mercado"
    url: "https://docs.cordhq.app/docs/pagos/metodos"
  - name: "Cord Docs — facturas recurrentes"
    url: "https://docs.cordhq.app/docs/pagos/facturas-recurrentes"
---

Cobrar más rápido no empieza con un mensaje más agresivo. Empieza cuando la factura
es correcta, llegó a la persona adecuada y contiene una forma de pago que realmente
funciona para ese cliente.

El proceso puede resumirse así:

1. acordar condiciones antes de vender;
2. emitir sin errores y entregar de inmediato;
3. confirmar recepción y requisitos del comprador;
4. priorizar por vencimiento, importe y contexto;
5. facilitar pago o instrucciones bancarias;
6. registrar promesas, aclaraciones y pagos con evidencia;
7. medir dónde se atasca la cartera.

## 1. Define el cobro antes de cerrar la venta

Una factura difícil de cobrar suele heredar una condición ambigua. Antes de aprobar la
cotización deja por escrito:

- anticipo y saldo;
- pago inmediato o días de crédito;
- moneda;
- fecha o regla de vencimiento;
- método de pago aceptado;
- datos fiscales que entregará el comprador;
- orden de compra, portal de proveedor u otro requisito interno;
- consecuencia operativa de un atraso, si fue acordada.

Evita frases como “pago a convenir”. Si todavía no existe acuerdo, la cotización no está
lista para aprobarse.

## 2. Emite una factura que el cliente pueda procesar

Revisa razón social, identificador fiscal, dirección cuando aplique, folio, partidas,
impuestos, moneda, fecha de emisión y vencimiento. Incluye el contacto que puede resolver
una aclaración y el método de pago.

En México, Cord emite CFDI 4.0 cuando el perfil fiscal y el CSD están configurados. En
los demás mercados ofrecidos genera una factura comercial; no la reporta automáticamente
a la autoridad local. [La guía de facturación](https://docs.cordhq.app/docs/pagos/facturacion)
explica esa frontera.

## 3. Quita fricción del pago

El enlace debe llevar al saldo correcto y mostrar solo los métodos disponibles para la
cuenta. Cord Payments permite tarjeta mediante Stripe Connect en México, Estados Unidos,
Canadá, Brasil, España, Reino Unido, Alemania y Francia. En Colombia, Argentina, Chile
y Perú la operación puede cotizar, facturar y registrar pagos, pero el cobro en línea
de Cord no está disponible actualmente.

SPEI automático solo aplica en México. La transferencia manual puede mostrar datos
bancarios, pero la conciliación depende de que tu equipo confirme el depósito y registre
el pago.

## 4. Segmenta la cartera antes de enviar recordatorios

No todos los pendientes necesitan el mismo mensaje. Crea una vista operativa con:

| Segmento | Acción útil |
|---|---|
| Aún no vence | confirmar recepción y requisitos |
| Vence hoy | reenviar factura e instrucciones |
| Vencida sin respuesta | pedir fecha concreta y responsable |
| Promesa vigente | esperar hasta la fecha comprometida |
| Aclaración abierta | resolver antes de escalar el tono |
| Pago recibido sin conciliar | verificar referencia e importe |
| Disputa | separar el importe disputado del no disputado |

La [cartera de Cord](https://docs.cordhq.app/docs/pagos/cartera-cobranza) reúne facturas
pendientes y permite filtrar, registrar promesas, copiar mensajes y abrir el detalle.

## 5. Escribe mensajes que permitan responder

Un recordatorio útil cabe en una pantalla y contiene:

- nombre del cliente;
- factura y fecha de vencimiento;
- saldo pendiente y moneda;
- enlace o instrucciones de pago;
- una sola pregunta: **¿qué fecha de pago podemos registrar?**;
- contacto para aclaraciones.

Ejemplo:

> Hola, Ana. La factura FAC-1042 por MXN 18,560 vence hoy. Puedes consultar el
> documento y las opciones de pago en este enlace: [enlace]. Si ya programaron la
> transferencia, ¿qué fecha podemos registrar? Responde a este correo si falta algún
> requisito de su portal de proveedores.

No afirmes que el cliente “incumplió” si existe una disputa o no tienes evidencia de
que recibió el documento.

## 6. Registra promesas y pagos con disciplina

Una promesa debe tener fecha, nota y responsable. Al vencer, vuelve a la cola de trabajo.
No la uses para ocultar una cuenta vencida.

**Marcar como pagada no mueve dinero.** Actualiza el control interno. Hazlo solo después
de validar depósito, referencia, moneda e importe o de recibir la confirmación del
proveedor de pagos. Si el pago es parcial, registra el importe real y conserva el saldo.

## 7. Automatiza con límites explícitos

Cord permite seguimiento manual desde Pro. En Scale y Developer, el agente de cobranza
puede preparar o enviar comunicaciones según el modo configurado. La IA no debe decidir
por sí sola descuentos, quitas o acuerdos que tu política no autoriza.

Las facturas recurrentes, disponibles en Pro o superior, emiten nuevos documentos de
acuerdo con una programación mensual, trimestral o anual. **No cargan automáticamente
una tarjeta guardada.** El cliente paga cada documento mediante los métodos habilitados.

## Métricas que sí ayudan a operar

- cartera total pendiente;
- saldo vencido;
- días de venta pendientes de cobro (DSO), con una definición estable;
- porcentaje de facturas pagadas dentro del plazo acordado;
- tiempo entre emisión, entrega y primera vista;
- promesas vencidas;
- disputas y aclaraciones abiertas;
- importe cobrado por periodo;
- pagos sin conciliar.

Una definición simple de DSO para un periodo es:

`cuentas por cobrar al cierre ÷ ventas a crédito del periodo × días del periodo`

Documenta qué incluyes y usa la misma fórmula cada mes; mezclar ventas totales con ventas
a crédito vuelve inútil la comparación.

## Checklist de implementación

- [ ] Las condiciones de pago aparecen desde la cotización.
- [ ] La factura contiene los datos y requisitos del comprador.
- [ ] El enlace o instrucciones fueron probados.
- [ ] Existe una persona responsable por cuenta.
- [ ] Promesas, disputas y pagos parciales tienen estado propio.
- [ ] Nadie marca pagado sin evidencia.
- [ ] La cadencia cambia según el contexto del cliente.
- [ ] El equipo revisa semanalmente vencidos, promesas rotas y causas de atraso.


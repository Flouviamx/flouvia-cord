---
title: "Cómo facturar en Brasil con Cord"
description: "Factura comercial hoy; NFS-e de servicios y NF-e de mercancías en activación: certificado ICP-Brasil, municipio y SEFAZ, configuración, cancelación, Carta de Correção y lo que no cubre."
category: "Facturación por país"
order: 4
---

En Brasil la factura con validez fiscal es la **NFS-e** para servicios (la genera el Sistema Nacional NFS-e) y la **NF-e modelo 55** para la venta de mercancías (la autoriza la SEFAZ de tu estado). Cord ya tiene construidos los dos rieles, directos con la autoridad y sin intermediario, pero **están en activación**: hoy tus facturas se emiten como **factura comercial sin validez fiscal**. Si necesitas emitir NFS-e o NF-e desde Cord, escríbenos para habilitarlo en tu cuenta.

**En resumen:**

- **Hoy:** factura comercial y nota de crédito comercial, en todos los planes (10 al mes en Gratis, ilimitadas desde Starter). No se presentan ante ninguna autoridad.
- **En activación:** NFS-e (servicios) y NF-e (mercancías). En **Ajustes › Facturación › Datos fiscales** las secciones **NFS-e** y **NF-e** dicen **Próximamente** mientras no estén activas.
- **Qué vas a necesitar:** plan Starter o superior, tu CNPJ, un certificado digital **ICP-Brasil A1** (e-CNPJ), estar en un municipio adherido al emisor nacional de NFS-e y, para la NF-e, estar habilitado como emisor en la SEFAZ de tu estado con tu Inscrição Estadual.
- **Una factura no puede mezclar productos y servicios:** son dos documentos distintos (NFS-e municipal y NF-e estatal). Divídela en dos.
- **Anular:** la NFS-e se cancela dentro del plazo que fija tu municipio; la NF-e, dentro de las 24 horas de su autorización. Ninguna de las dos tiene nota de crédito en Cord.
- **Cobrar:** tarjeta con Cord Payments en BRL y, como alternativa, Mercado Pago.

## Qué documento emite Cord

| Situación | Documento |
|---|---|
| Hoy, cualquier plan | Factura comercial (sin validez fiscal). |
| Con la NFS-e activa (Starter o superior) | NFS-e de Padrão Nacional, un servicio por nota. |
| Con la NF-e activa (Starter o superior) | NF-e modelo 55 con su DANFE. |
| Con la NFS-e o la NF-e activa, en Gratis o eligiendo **Factura comercial** | Proforma con serie `PRO`: sirve para cobrar, pero no es una nota fiscal. |
| Factura que mezcla productos y servicios | No se emite: hay que dividirla. |

Cord decide qué nota corresponde por los conceptos: si todos son productos con sus datos de NF-e va a la NF-e; si ninguno lo es, a la NFS-e.

## Qué vas a necesitar

- **Certificado digital ICP-Brasil A1** a nombre de tu CNPJ (e-CNPJ), en archivo `.pfx`/`.p12` o como certificado más llave privada. Lo emite una autoridad certificadora de la ICP-Brasil y su costo lo fija esa autoridad. Un e-CNPJ de la matriz firma también por sus filiales (mismo CNPJ raíz), y el mismo certificado sirve para la NFS-e y la NF-e.
- **Para la NFS-e:** que tu municipio esté adherido al emisor público nacional y tenga convenio activo, tu situación ante el Simples Nacional y el código de tu servicio en la lista nacional (LC 116/2003). Si tu municipio la exige, tu inscripción municipal.
- **Para la NF-e:** estar habilitado (credenciado) como emisor de NF-e en la SEFAZ de tu estado y tu Inscrição Estadual. Los estados de AM, MS, PE, PR, SC y TO exigen además un responsable técnico del sistema que Cord todavía no tiene: en esos estados la NF-e no está disponible por ahora, y Ajustes lo dice.

## Configura tu cuenta (cuando se active)

1. En **Ajustes › Facturación › Datos fiscales › Identidad de facturación**, captura tu razón social y tu **CNPJ / CPF**.
2. En la sección **NFS-e**: **Municipio de tu establecimiento (código IBGE)**, **Inscripción municipal** si aplica, **Situación ante el Simples Nacional** (y, si eres ME/EPP, la **Apuración** y los **Tributos aproximados del Simples Nacional (%)**), **Servicio (lista nacional, LC 116/2003)**, **Serie de la DPS** exclusiva de Cord y, si continúas una numeración, el **Primer número de DPS**. Pulsa **Guardar ajustes de la NFS-e**.
3. En **Certificado digital ICP-Brasil (A1)**, sube tu archivo y su contraseña con **Subir certificado**. Cord prueba la conexión con el Sistema Nacional NFS-e sin emitir nada.
4. En la sección **NF-e** (si vendes mercancías): **Régimen tributario (CRT)**, **Inscrição Estadual**, la dirección del establecimiento con su **Municipio (código IBGE)**, la **Serie de la NF-e** exclusiva de Cord, la **Naturaleza de la operación**, **Cómo vendes**, **Flete** y el PIS/COFINS por defecto. Pulsa **Guardar ajustes de la NF-e**. Si el certificado de la NFS-e es del mismo CNPJ, la NF-e lo usa; si no, sube uno propio en esta sección.
5. En cada **producto**: NCM, CEST si aplica, CFOP, origen, unidad, GTIN y el ICMS de tu régimen, IPI e IBS/CBS.
6. En cada **cliente** de una venta de mercancías: número, barrio, municipio (código IBGE), indicador de Inscrição Estadual (contribuyente, exento o no contribuyente), su IE y si compra como consumidor final.

## Impuestos en Cord

Brasil nace **sin una tasa nacional sembrada** en **Ajustes › Cotizaciones › Impuestos**, solo con la opción **Isento**: ICMS estatal, ISS municipal y PIS/COFINS no caben en una sola tasa. En la NFS-e el ISS va **incluido en el precio** y la alícuota la pone el municipio. En la NF-e, ICMS, PIS, COFINS, IBS y CBS van dentro del precio y el único impuesto que se suma es el **IPI**: la tasa de la línea en Cord debe ser exactamente la alícuota de IPI del producto.

## Cómo ves el estado

El detalle de la factura tiene un panel **NFS-e** o **NF-e** con el estado ante la autoridad:

- **NFS-e generada** o **NF-e** autorizada, con el número, la chave de acceso y el protocolo.
- **Esperando la confirmación**: Cord **consulta** a la autoridad, nunca reenvía la misma nota. Lo que quedó sin respuesta lo resuelve una consulta automática cada hora.
- **No generó la NFS-e** o la SEFAZ la rechazó: con el motivo traducido. Un rechazo no consume un número de NF-e: se reutiliza y no deja huecos.
- **La SEFAZ denegó el uso de la NF-e**: el número queda consumido.

El PDF de la NF-e es el **DANFE** con la chave en código de barras, y su XML autorizado (**XML de la NF-e (nfeProc)**) se descarga desde el panel **NF-e** de la factura y desde el link de tu cliente. El PDF de la NFS-e es el documento de Cord con la chave completa y el QR de la consulta pública de la NFS-e. En el ambiente de pruebas, el documento dice que no tiene validez jurídica.

## Anular o corregir

- **Cancelar una NFS-e:** **Más acciones › Anular**. Cord envía el evento de cancelación; si ya pasó el plazo o el valor que permite tu municipio, la cancelación se rechaza con el motivo y la nota sigue vigente.
- **Cancelar una NF-e:** **Más acciones › Anular**, dentro de las **24 horas** siguientes a la autorización. Después la SEFAZ la rechaza y la nota sigue vigente.
- **Carta de Correção (CC-e):** desde el panel **NF-e** del detalle, **Emitir una Carta de Correção (CC-e)**, hasta 20 por nota. Cada carta reemplaza a la anterior y debe repetir todo lo que siga por corregir. No puede cambiar importes, cantidades, alícuotas, bases, emisor, destinatario ni fechas.
- **Sin nota de crédito:** la NFS-e no la tiene, y la devolución de mercancía es otra NF-e que Cord todavía no emite. Para corregir una NFS-e, anúlala y emite otra.
- **Números sin usar (inutilização):** en la sección **NF-e** de Ajustes, **Números sin usar (inutilização)** lista los números que quedaron sin nota; declaras el rango con una justificación y **Declarar a la SEFAZ**.

## Si la SEFAZ de tu estado no responde

Cord emite en contingencia en la SEFAZ Virtual (SVC) de tu estado y vuelve sola a la SEFAZ normal cuando se restablece. Ver [Contingencia de la SEFAZ](/soporte/contingencia-sefaz-brasil).

## Problemas comunes

- **"Divide la factura en dos".** Mezcla productos y servicios. Emite una factura con los productos (NF-e) y otra con los servicios (NFS-e).
- **El municipio no está adherido o no tiene convenio activo.** Lo informa el Sistema Nacional NFS-e y Cord lo traduce. Confírmalo con tu prefeitura.
- **Rechazo por certificado.** Revisa que sea A1, vigente, de tu CNPJ (o del CNPJ raíz de la matriz) y del ambiente correcto.
- **Mi estado exige algo que Cord todavía no tiene.** En AM, MS, PE, PR, SC y TO falta el responsable técnico; la NF-e no está disponible ahí por ahora.
- **El ISS que aplicó el municipio no es el de mi perfil de retención.** La NFS-e queda generada y la factura muestra la diferencia del valor líquido.

## Qué no cubre todavía

- **NFS-e:** exportación y moneda extranjera, servicios que tributan donde se prestan, obras y eventos, deducciones de base, beneficios municipales, retenciones federales (IRRF, CSLL, PIS/COFINS, INSS) y el grupo IBS/CBS.
- **NF-e:** sustitución tributaria, DIFAL a no contribuyente de otro estado, exportación, combustibles, retenciones, Régimen Normal hacia otro estado, devolución (finNFe 4) y el Simples Nacional desde el 4 de enero de 2027.
- **Retenciones:** en la NFS-e solo el ISS retenido por el cliente.

## Relacionados

- [Contingencia de la SEFAZ](/soporte/contingencia-sefaz-brasil)
- [Cobrar con Mercado Pago](/soporte/cobrar-mercado-pago)
- [Facturación por país en la documentación](https://docs.cordhq.app/docs/pagos/facturacion)

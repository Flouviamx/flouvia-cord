---
title: "Cómo facturar en España con Cord"
description: "Proforma hoy; Verifactu y la factura electrónica entre empresas en activación: certificado electrónico, IRPF, IGIC e IPSI, causas de exención, Facturae, plazos y cómo se corrige un registro."
category: "Facturación por país"
order: 5
---

En España la factura tiene que salir de un **sistema de facturación verificable (Verifactu)**: cada factura genera un registro encadenado al anterior que se envía a la AEAT. Cord tiene Verifactu construido y validado contra los esquemas oficiales, pero el **registro ante la AEAT está en activación**: hoy las cuentas de España emiten **proformas** (serie `PRO`), que no sustituyen una factura. Si necesitas emitir con Verifactu desde Cord, escríbenos para habilitarlo en tu cuenta. Mientras tanto, usa tu sistema de facturación actual para el documento fiscal y Cord para cotizar, cobrar y dar seguimiento.

**En resumen:**

- **Hoy:** proforma con serie `PRO`, en todos los planes (10 al mes en Gratis, ilimitadas desde Starter). No tiene huella, QR ni registro ante la AEAT, y su PDF lo dice.
- **En activación:** Verifactu (registro de cada factura ante la AEAT) y la factura electrónica entre empresas por la solución pública de la AEAT. En **Ajustes › Facturación › Datos fiscales** la sección **Verifactu** dice **Certificado guardado, registro aún no activo** aunque subas tu certificado.
- **Qué vas a necesitar:** plan Starter o superior, tu NIF y un **certificado electrónico** (`.p12` o `.pfx`). La FNMT emite gratis el certificado de persona física; el de representante de una sociedad tiene un costo que fija el prestador.
- **Plazos de la ley:** Verifactu es obligatorio desde el 1 de enero de 2027 para quien tributa en el Impuesto sobre Sociedades y desde el 1 de julio de 2027 para el resto. La factura electrónica entre empresas, desde el 6 de octubre de 2027 si facturas más de 8 millones de euros al año y desde el 6 de octubre de 2028 para el resto.
- **Corregir:** un registro encadenado no se edita. Se corrige con un registro nuevo (subsanación o anulación) o con una factura rectificativa.
- **Cobrar:** tarjeta con Cord Payments en EUR, domiciliación SEPA y cobro automático.

## Qué documento emite Cord

| Situación | Documento |
|---|---|
| Hoy, cualquier plan | Proforma con serie `PRO`. |
| Con Verifactu activo (Starter o superior, certificado válido) | Factura con registro Verifactu: huella encadenada, QR tributario y la leyenda VERI\*FACTU. |
| Cliente sin identificador fiscal (con Verifactu) | Factura simplificada (F2). |
| Corrección (con Verifactu) | Factura rectificativa (R1 por diferencias), con su propio registro. |

Una proforma no tiene versión electrónica: Facturae, Factur-X, XRechnung y Peppol se generan de facturas, así que en España estarán disponibles cuando Verifactu esté activo. Ver [Factura electrónica europea](/soporte/factura-electronica-europea).

## Qué vas a necesitar

- **Plan Starter o superior.** La emisión fiscal integrada empieza en Starter.
- **Tu NIF** en **Identidad de facturación**. Cord valida NIF, NIE y CIF con su dígito de control.
- **Certificado electrónico** de tu negocio en `.p12` o `.pfx`, con su contraseña. Si el certificado es de un representante, Cord lo acepta con un aviso: ese representante necesita poder de tu negocio.
- La AEAT no cobra por recibir los registros de Verifactu, y la solución pública para la factura entre empresas es gratuita.

## Configura tu cuenta

1. En **Ajustes › Facturación › Datos fiscales › Identidad de facturación**, captura **Razón social o nombre legal**, **NIF / CIF**, **Domicilio fiscal**, **Ciudad**, **Estado, provincia o región**, **Código postal** y tu **Prefijo de factura**. España numera por serie **y** ejercicio: el año va pegado al prefijo.
2. En la sección **Verifactu**, elige tu certificado electrónico, escribe la **Contraseña del certificado** y pulsa **Subir certificado**. Cord valida la contraseña y lee la fecha de caducidad. Ahí mismo está la **Declaración responsable del sistema de facturación**.
3. En **Ajustes › Cotizaciones › Impuestos** revisa tu catálogo. Tu cuenta nace con IVA 21 %, 10 % y 4 %, Exento, las causas de exención **Exportación (art. 21)**, **Entrega intracomunitaria (art. 25)**, **Exenta art. 20** e **Inversión del sujeto pasivo**, y las retenciones **Retención IRPF 15%** y **Retención IRPF 7% (nuevo autónomo)**. Si tu negocio está en Canarias, el catálogo siembra IGIC; en Ceuta y Melilla, solo opciones exentas.
4. Si facturas a empresas que procesan facturas de forma automática, completa la sección **Factura electrónica europea** (contacto, dirección electrónica y qué adjuntar al correo).

## Las causas de exención

Una línea al 0 % lleva su causa: la que elegiste en el catálogo (exportación, entrega intracomunitaria, exenta art. 20 o inversión del sujeto pasivo) se congela en la línea y viaja al registro y al PDF, que cita el precepto. Con el **Exento** genérico, Cord deriva la causa del cliente: un cliente empresarial de la UE con NIF-IVA o de fuera de la UE va como no sujeta; un cliente en España, como exenta.

## Cómo ves el estado (con Verifactu activo)

El detalle de la factura tiene un panel **Verifactu**:

- **Pendiente de envío a la AEAT:** el registro ya está encadenado. El envío se hace después de emitir, sin bloquear la factura.
- **Registrada ante la AEAT.**
- **Registrada con errores**, **Rechazada por la AEAT** o **No se pudo enviar a la AEAT:** con el código y el motivo de la AEAT, y el botón **Corregir y reenviar**.

**Ajustes › Facturación › Datos fiscales** lista las **Facturas por corregir**. El PDF lleva al principio de la primera página el QR tributario de cotejo con la AEAT.

## Anular o corregir

- **Anular una proforma:** **Más acciones › Anular**, si no tiene pagos.
- **Con Verifactu:** anular genera un **registro de anulación** que se suma a la cadena; el anterior no se borra ni se edita.
- **Rectificar:** **Más acciones › Nota de crédito** emite una factura rectificativa por diferencias, con su propio registro.
- **Registro rechazado:** **Corregir y reenviar** crea una subsanación; puedes fijar ahí la causa de exención de los conceptos al 0 %. Los importes nunca cambian.

## La factura electrónica entre empresas

La ley obligará a emitir y recibir factura electrónica entre empresas y profesionales, enviada por la **solución pública de la AEAT**. Cord la tiene construida, pero dice **Próximamente** en **Ajustes › Facturación › Datos fiscales › Factura electrónica entre empresas (AEAT)**: la AEAT todavía no publicó la especificación técnica de su servicio. Cuando lo haga, Cord la activará con el mismo certificado de Verifactu y comunicará los cobros de cada factura. Las facturas con IRPF se enviarán cuando la AEAT publique cómo se declaran; mientras tanto, se descargan como Facturae.

## Problemas comunes

- **Subí mi certificado y sigo emitiendo proformas.** Es lo esperado mientras el registro ante la AEAT está en activación. Escríbenos si lo necesitas ya.
- **El certificado no se acepta.** Revisa que sea `.p12` o `.pfx`, que la contraseña sea la del archivo y que no haya caducado.
- **"Desconectar" el certificado no se permite.** Con registros sin enviar o del ejercicio en curso, Cord no deja quitarlo.
- **Factura con IRPF.** Factur-X, XRechnung y Peppol no tienen dónde declarar una retención: esa factura solo se descarga como Facturae.

## Qué no cubre todavía

- **Registro ante la AEAT** (Verifactu) y **factura electrónica entre empresas:** en activación.
- **IGIC, IPSI y recargo de equivalencia** en el registro de Verifactu: se rechazan al emitir.
- **País Vasco y Navarra** (TicketBAI y sistemas forales).
- **Presentar la Facturae en FACe** y los códigos DIR3 de las administraciones públicas.

## Relacionados

- [Factura electrónica europea](/soporte/factura-electronica-europea)
- [Domiciliación SEPA y cargo ACH](/soporte/domiciliacion-sepa-ach)
- [Configurar retenciones de impuestos](/soporte/retenciones-impuestos)
- [Factura electrónica europea en la documentación](https://docs.cordhq.app/docs/pagos/factura-electronica)

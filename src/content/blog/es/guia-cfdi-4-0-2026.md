---
title: "CFDI 4.0 en 2026: datos, emisión y límites de Cord"
excerpt: "Guía operativa para preparar un CFDI 4.0 en Cord, entender los datos mínimos del receptor y saber qué complementos siguen fuera del producto."
category: "Fiscal"
date: "12 Jun 2026"
publishedAt: "2026-06-12"
lastUpdated: "2026-08-28"
readTime: "09 MIN"
img: "/og-cord.jpg"
authorName: "Equipo Cord"
authorRole: "Producto y facturación"
reviewedBy: "Producto de Cord"
reviewedByRole: "Revisión de alcance funcional; no constituye asesoría fiscal"
keywords: ["CFDI 4.0", "facturación electrónica México", "datos receptor CFDI", "CSD", "timbrar factura"]
faq:
  - question: "¿Qué datos mínimos del receptor necesita un CFDI 4.0?"
    answer: "El SAT identifica como mínimos RFC, nombre o razón social, régimen fiscal y código postal del domicilio fiscal; además deben capturarse los demás campos que correspondan a la operación, incluido el uso del CFDI."
  - question: "¿Cord puede timbrar CFDI 4.0?"
    answer: "Sí, para organizaciones mexicanas con perfil fiscal y CSD válidos. Cord envía el comprobante a Facturapi, que actúa como infraestructura de timbrado; el resultado incluye XML y representación PDF cuando el proveedor confirma la emisión."
  - question: "¿Cord emite complementos de recepción de pagos o Carta Porte?"
    answer: "No actualmente. Cord emite CFDI de ingreso dentro del alcance documentado. Los complementos de recepción de pagos, Carta Porte, nómina y otros comprobantes especializados deben resolverse fuera de Cord."
sources:
  - name: "SAT — servicio de facturación CFDI versión 4.0"
    url: "https://wwwmat.sat.gob.mx/aplicacion/75169/servicio-de-facturacion-cfdi-version-4.0-%28vigente-a-partir-del-1-de-enero-de-2022%29"
  - name: "SAT — material de ayuda y guías de llenado"
    url: "https://www.sat.gob.mx/minisitio/Factura/emite_materialdeayudaparafactura.htm"
  - name: "SAT — complemento de recepción de pagos"
    url: "https://wwwmat.sat.gob.mx/consultas/92764/comprobante-de-recepcion-de-pagos"
  - name: "Cord Docs — facturación fiscal"
    url: "https://docs.cordhq.app/docs/pagos/facturacion"
---

Para emitir un CFDI 4.0 no basta con poner un RFC. El SAT identifica como datos mínimos
del receptor su **RFC, nombre o razón social, régimen fiscal y código postal del
domicilio fiscal**. La operación también necesita los conceptos, impuestos, moneda,
forma y método de pago y uso del CFDI que correspondan.

Esta guía explica el flujo de Cord. No sustituye la revisión de tu contador ni las guías
vigentes del SAT para tu tipo específico de operación.

## Qué debes configurar una vez

En **Ajustes > Facturación > Datos fiscales** registra RFC, razón social, régimen,
código postal fiscal, serie y el Certificado de Sello Digital vigente con su llave
privada y contraseña.

Cord valida el formato y envía el material al proveedor fiscal. No expongas el archivo
`.key`, su contraseña ni el certificado en correo, chat o tickets. Si el CSD vence o se
revoca, debes cargar uno vigente antes de volver a emitir.

## Qué debes revisar en cada factura

Antes de timbrar, revisa receptor y RFC; nombre o razón social; régimen y código postal;
uso del CFDI; partidas y unidades; objeto e importe de impuestos; moneda y tipo de
cambio; y forma y método de pago.

No inventes ni normalices por intuición el nombre legal. Cord tampoco escanea
automáticamente la Constancia de Situación Fiscal ni decide el régimen, uso o tratamiento
tributario correcto por ti.

## Qué ocurre al timbrar

Cord crea un snapshot de emisor, receptor, conceptos, impuestos y totales y solicita el
timbrado mediante Facturapi. Cuando el proveedor confirma la emisión, Cord conserva el
identificador fiscal, XML y representación PDF asociados al comprobante.

La emisión fiscal no es un simple cambio visual: las correcciones siguen los mecanismos
fiscales aplicables, como cancelación o documentos relacionados. Revisa antes de confirmar.

## PUE, PPD y recepción de pagos

El SAT distingue el momento en que se liquida la operación. En términos generales, PUE
corresponde a una operación pagada en una sola exhibición bajo las reglas aplicables;
PPD se utiliza cuando el pago queda diferido o en parcialidades y puede generar la
obligación de emitir un CFDI de tipo Pago.

Cord **no emite actualmente el complemento para recepción de pagos**. Registrar un pago
en la cartera actualiza el control operativo dentro de Cord, pero no crea ese complemento
fiscal. Coordina su emisión en tu sistema fiscal o con tu proveedor y asesor.

## Carta Porte y otros complementos

Cord tampoco emite Carta Porte, nómina, comercio exterior ni otros complementos
especializados. Una factura de ingreso emitida en Cord no cubre automáticamente esas
obligaciones. Determina con un especialista qué comprobante necesita tu operación.

## Errores frecuentes

- El nombre del receptor no coincide con sus datos fiscales.
- El código postal pertenece a una sucursal, no al domicilio fiscal requerido.
- Régimen y uso del CFDI son incompatibles.
- El CSD está vencido, revocado o la contraseña es incorrecta.
- Se trata un pago registrado en Cord como si fuera un complemento fiscal.
- Se timbra antes de resolver una diferencia de moneda, impuesto o total.

Consulta la [guía de facturación de Cord](https://docs.cordhq.app/docs/pagos/facturacion)
para ver el flujo exacto de configuración, emisión, descarga y corrección.

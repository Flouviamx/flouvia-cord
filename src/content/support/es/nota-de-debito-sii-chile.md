---
title: "Nota de débito y certificación ante el SII (Chile)"
description: "Cómo emitir una nota de débito (DTE 56) sobre una factura o para anular una nota de crédito, y cómo completar con Cord la certificación del SII: set de pruebas, libros, simulación, intercambio y muestras impresas."
category: "Facturación por país"
order: 13
---

Esto aplica a negocios en **Chile** con la factura electrónica del SII, que **está en activación** en Cord: si necesitas emitir DTE o certificarte con Cord, escríbenos para habilitarlo. Ver [Cómo facturar en Chile con Cord](/soporte/facturar-en-chile).

**En resumen:**

- **Nota de débito (56):** sobre una **factura** aceptada, cobra un monto adicional (intereses, diferencia de precio, un cargo) y corrige montos; sobre una **nota de crédito** aceptada, la anula completa, una sola vez.
- **Dónde:** en el panel **SII** del detalle de un documento aceptado: **Emitir nota de débito** o, en una nota de crédito, **Anular con nota de débito**. Se crea como borrador y la emites como cualquier factura.
- **Folios:** necesita folios de nota de débito (CAF tipo 56), que vencen a los seis meses, igual que los de factura.
- **Certificación:** en **Ajustes › Facturación › Perfil fiscal**, la sección **Certificación ante el SII** arma y envía el set de pruebas, los libros de ventas y de compras, el intercambio y las muestras impresas. Solo existe en el ambiente de certificación.
- **Lo que Cord no arma del set:** guía de despacho (52) y su libro, documentos de exportación (110 a 112) y factura de compra (46) emitida.

## Emitir una nota de débito

1. Abre la factura (o la nota de crédito) aceptada por el SII.
2. En el panel **SII**, despliega **Emitir nota de débito** (o **Anular con nota de débito** si es una nota de crédito).
3. Sobre una factura: escribe el **Concepto** y el **Monto neto (CLP)** de cada cargo y marca **Exento de IVA** si corresponde. Sobre una nota de crédito, la nota de débito copia sus conceptos y su total.
4. Escribe el **Motivo**: se imprime como razón de la referencia.
5. Pulsa **Crear borrador**. Cord te lleva al borrador; revísalo y pulsa **Emitir nota de débito**.

Cómo se declara ante el SII:

- **Sobre una factura**, la nota de débito referencia la factura y "corrige montos".
- **Sobre una nota de crédito**, la "anula" por completo; una nota de crédito solo se puede anular una vez.

La nota de débito es **una cuenta por cobrar propia**: tiene su saldo y su link, no cambia el saldo de la factura original, no lleva forma de pago ni copia cedible y se numera con su serie `ND-`. Fuera de Chile, Cord responde que el documento no admite nota de débito.

## Certificación ante el SII

Para emitir DTE con un sistema de mercado, el SII pide una certificación. Cord la acompaña desde **Ajustes › Facturación › Perfil fiscal › Factura electrónica con el SII › Certificación ante el SII**, mientras tu cuenta está en el **ambiente de certificación**. Antes necesitas tu certificado digital registrado en el SII, tu postulación como emisor electrónico y los folios de certificación cargados.

### 1. Set de pruebas

1. Pega el texto del archivo que te asignó el SII en **Set de pruebas (texto del archivo que te entregó el SII)** o pulsa **Abrir archivo**. Copia el texto tal cual: un carácter ilegible (una tilde perdida) se rechaza, porque la glosa va exacta.
2. Pulsa **Cargar set**. Cord lee cada caso y elige por defecto clientes con RUT distintos para las facturas; puedes cambiarlos.
3. Pulsa **Firmar y enviar al SII**. Cord valida el set completo **antes** de tomar folios, toma un folio de certificación por caso, firma todos los casos y los envía **en un solo envío** al SII.
4. Pulsa **Consultar veredicto del SII**. El veredicto llega por tipo de documento: aceptados, con reparos o rechazados. Con reparos o rechazos, **Nuevo intento (folios nuevos)** vuelve a enviar con folios nuevos (un folio usado nunca vuelve).

Los documentos del set no entran a tu cartera ni a tu numeración.

### 2. Libros de ventas y de compras

Cuando el SII acepta el set, Cord arma los libros que pide tu set:

- **Libro de ventas:** con los documentos del último set aceptado.
- **Libro de compras:** con los documentos que trae el set de libro de compras. Agrega el proveedor de cada uno con su RUT (y la razón social en los documentos en papel). Una observación que Cord no sabe registrar se rechaza al cargar.

Cada libro se envía con **Firmar y enviar al SII** y su estado se revisa con **Consultar estado en el SII**. Un libro enviado no se reenvía: **Nuevo intento** crea uno nuevo, que conserva los proveedores. El XML firmado se descarga con **Libro firmado (XML)**. Fuera de la certificación, el Registro de Compras y Ventas del SII reemplaza a los libros.

### 3. Simulación

Emite documentos representativos de tu negocio desde **Facturas** mientras tu cuenta está en certificación.

### 4. Intercambio

El SII te envía documentos como si fuera un proveedor. En **Documentos recibidos de proveedores (intercambio)** sube el XML recibido y pulsa **Recibir y acusar recibo**. Cord responde el acuse y, para cada documento, eliges **Aceptar**, **Aceptar con discrepancias** o **Rechazar (reclamar)** con su motivo, y pulsas **Firmar y enviar respuesta**. En certificación, las respuestas van a la casilla de intercambio del SII.

### 5. Muestras impresas

Descarga desde Ajustes la **Muestra impresa** y la **Copia cedible** de cada caso del set y súbelas en el sitio del SII.

### 6. Declaración de cumplimiento

La firma tu representante legal en el sitio del SII.

## Lo que el set puede pedir y Cord no arma

Si al postular elegiste estos documentos, Cord te lo dice al cargar el set, con su número de atención:

- **Guía de despacho (52)** y su **libro de guías**.
- **Documentos de exportación** (110, 111 y 112).
- **Factura de compra (46)** como documento emitido (sí aparece como una línea del libro de compras, que solo la registra).

## Problemas comunes

- **"Este documento no admite nota de débito".** La cuenta no es de Chile o el documento no es una factura, nota de débito o nota de crédito aceptada por el SII.
- **No hay folios de nota de débito.** Descarga del SII un CAF del tipo 56 y súbelo en **Folios (CAF)**.
- **El set se rechaza al cargar.** Revisa que el texto esté completo y sin caracteres alterados.
- **No veo la sección de certificación.** Solo aparece mientras tu cuenta está en el ambiente de certificación del SII.

## Relacionados

- [Cómo facturar en Chile con Cord](/soporte/facturar-en-chile)
- [Emitir una nota de crédito](/soporte/nota-de-credito)

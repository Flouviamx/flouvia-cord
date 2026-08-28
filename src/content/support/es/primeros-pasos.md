---
title: "Cord 101: Primeros pasos"
description: "Configura tu cuenta, crea tu primer cliente y envía tu primera cotización en minutos."
category: "Cuenta y Equipo"
order: 1
---

Bienvenido a Cord. Esta guía te deja operando —cotizando, cobrando y facturando— en menos de 20 minutos. Si es tu primera vez, sigue esta ruta lineal.

## Paso 1: Configura tu empresa
El núcleo de Cord es tu perfil fiscal y de marca. Lo que se te pide aquí depende del país de tu cuenta — Cord opera de punta a punta en México, Estados Unidos, Canadá, Brasil, España, Reino Unido, Alemania, Francia, Colombia, Argentina, Chile y Perú, y el vocabulario fiscal cambia con cada uno.

1. Ve a **Ajustes > General** y captura tu razón social, contacto y datos básicos (moneda, idioma y zona horaria se detectan de tu país, y puedes ajustarlos ahí).
2. Ve a **Ajustes > Facturación > Datos fiscales** y captura tu identificador fiscal: es RFC en México, NIF/CIF en España, EIN/Tax ID en Estados Unidos, y el equivalente correspondiente en cada uno de los otros países.
   - **Si tu cuenta es de México:** además sube tu **CSD (Certificado de Sello Digital)** — los archivos `.cer` y `.key` que te da el SAT, con su contraseña. Sin el CSD podrás cotizar, pero no timbrar CFDI.
   - **Si tu cuenta es de España:** sube tu certificado electrónico (`.p12`/`.pfx`) para que las facturas se registren ante la AEAT bajo Verifactu. Sin él, las facturas se siguen emitiendo como documento comercial, pero no quedan registradas ante la autoridad fiscal.
   - **En el resto de los países**, con el identificador fiscal y los datos de tu empresa basta: el comprobante de la venta es el documento fiscal, sin un trámite de certificado adicional.

## Paso 2: (Opcional) Activa Cord Payments
Para cobrar con tarjeta (y, en México, transferencia SPEI automática) desde el link, activa **Cord Payments** en **Ajustes > Cobros**. Ahí verás la tarifa por método, registrarás la cuenta de depósito en el formato de tu país (CLABE, IBAN, routing + account number, sort code, y demás) y completarás la verificación. Si tu país no tiene el riel de cobro en línea habilitado todavía, o prefieres transferencia manual, puedes marcar el pago como recibido a mano igualmente.

## Paso 3: Crea tu primer cliente
1. Ve a **Clientes > Nuevo cliente**.
2. Captura su razón social y su identificador fiscal (el mismo vocabulario que en el Paso 1, según el país del cliente).
3. Asigna términos de crédito (ej. Net 30) y, si aplica, su límite de crédito para que Cord monitoree su exposición.
4. Si tu cuenta es de México y vas a facturar de forma nominativa, agrega también el régimen fiscal, código postal y uso de CFDI del cliente en su sección de datos fiscales — este dato es exclusivo del CFDI mexicano.

## Paso 4: Envía tu primera cotización
1. Ve a **Cotizaciones > Nueva**.
2. Elige el cliente, agrega líneas (de tu catálogo o líneas libres) y revisa el total. Cada línea puede llevar su propia tasa de impuesto.
3. Al enviarla, Cord genera un **link público** y, si configuraste correo, lo manda al cliente. El cliente lo abre, revisa, aprueba y, si activaste Cord Payments, paga en línea.

## Paso 5: (Para devs) Conecta la API
Si vas a usar Cord programáticamente:

- Activa el **Modo desarrollador** con el interruptor al final del índice de **Ajustes**, abre la pestaña **API** en el dock de Desarrolladores y crea una llave (`sk_test_...` o `sk_live_...`).
- Verifica que funciona con la llamada más simple:

```bash
curl https://cordhq.app/api/v1/me -H "Authorization: Bearer sk_test_tu_llave"
```

## ¿Qué sigue?
- [Configurar Webhooks](/soporte/configurar-webhooks)
- [Invitar a tu equipo](/soporte/invitar-miembros-roles)
- [Manejo de disputas](/soporte/manejo-disputas)

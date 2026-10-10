---
title: "Cord 101: Primeros pasos"
description: "Configura tu cuenta, crea tu primer cliente y envía tu primera cotización en minutos."
category: "Cuenta y Equipo"
order: 1
---

Bienvenido a Cord. Esta guía te deja operando —cotizando, cobrando y facturando— en menos de 20 minutos. Si es tu primera vez, sigue esta ruta lineal.

## Paso 1: Configura tu empresa
**Atajo:** al terminar el alta, Cord te ofrece configurar tu cuenta con IA. Le das tu sitio web, a qué se dedica tu negocio y tu lista de precios, y propone perfil, marca, impuestos, catálogo y plantillas para que los revises y apruebes. Si lo saltaste, está en **Ajustes > General > Configurar con IA**. Ver [Configura tu cuenta con IA](/soporte/configurar-con-ia).

El núcleo de Cord es tu perfil fiscal y de marca. Lo que se te pide aquí depende del país de tu cuenta — Cord opera de punta a punta en México, Estados Unidos, Canadá, Brasil, España, Reino Unido, Alemania, Francia, Colombia, Argentina, Chile y Perú, y el vocabulario fiscal cambia con cada uno.

1. Ve a **Ajustes > General** y captura tu razón social, contacto y datos básicos (moneda, idioma y zona horaria se detectan de tu país, y puedes ajustarlos ahí).
2. Ve a **Ajustes > Facturación > Datos fiscales** (**Perfil fiscal** fuera de México) y captura tu identificador fiscal: es RFC en México, NIF/CIF en España, EIN/Tax ID en Estados Unidos, y el equivalente correspondiente en cada uno de los otros países.
   - **Si tu cuenta es de México:** además sube tu **CSD (Certificado de Sello Digital)** — los archivos `.cer` y `.key` que te da el SAT, con su contraseña. Sin el CSD podrás cotizar, pero no timbrar CFDI.
   - **Si tu cuenta es de España:** puedes subir ya tu certificado electrónico (`.p12`/`.pfx`) en la sección **Verifactu**. El registro de las facturas ante la AEAT está en activación: mientras tanto Cord emite proformas, y la sección lo dice ("Certificado guardado, registro aún no activo"). Ver [Cómo facturar en España](/soporte/facturar-en-espana).
   - **En el resto de los países**, con el identificador fiscal y los datos de tu empresa basta para emitir la factura comercial. En Argentina, Brasil, Chile, Colombia, Perú y Francia, el registro ante la autoridad (ARCA, NFS-e y NF-e, SII, DIAN, SUNAT y la plataforma autorizada) está en activación; escríbenos si lo necesitas. La guía de tu país está en [Facturación por país](/soporte/categoria/facturacion-por-pais).

## Paso 2: (Opcional) Activa Cord Payments
Para cobrar con tarjeta (y, en México, transferencia SPEI automática) desde el link, activa **Cord Payments** en **Ajustes > Cobros**. Ahí verás la tarifa por método, registrarás la cuenta de depósito en el formato de tu país (CLABE, IBAN, routing + account number, sort code, y demás) y completarás la verificación. En Colombia, Argentina, Chile y Perú el cobro en línea es con **Mercado Pago**, que conectas en la misma pantalla. Si prefieres transferencia manual, puedes registrar el pago a mano igualmente.

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

- O usa el [CLI de Cord](/soporte/cli-cord): `npx @flouviahq/cli login` conecta tu terminal desde el navegador y `npx @flouviahq/cli init` deja tu proyecto integrado.

## Paso 6: Automatiza y conecta tus apps
- En **Workflows** crea tu primer workflow desde una de las ideas: por ejemplo, avisar al equipo cuando un cliente aprueba. Es uno de los pasos de la lista **Configura Cord**.
- En **Ajustes › Integraciones** conecta las herramientas que ya usas. Slack, Zapier y Make se conectan con un clic, sin copiar llaves ni URLs; las apps conectadas aparecen en la barra superior.

## ¿Qué sigue?
- [Configurar Webhooks](/soporte/configurar-webhooks)
- [Invitar a tu equipo](/soporte/invitar-miembros-roles)
- [Manejo de disputas](/soporte/manejo-disputas)

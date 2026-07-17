---
title: "Cord 101: Primeros pasos"
description: "Configura tu cuenta, crea tu primer cliente y envía tu primera cotización en minutos."
category: "Cuenta y Equipo"
order: 1
---

Bienvenido a Cord. Esta guía te deja operando —cotizando, cobrando y facturando— en menos de 20 minutos. Si es tu primera vez, sigue esta ruta lineal.

## Paso 1: Configura tu empresa
El núcleo de Cord es tu perfil fiscal y de marca.

1. Ve a **Ajustes > General** y captura tu razón social, contacto y datos básicos.
2. En **Ajustes > Facturación y CFDI** ingresa tu RFC y régimen fiscal, y sube tu **CSD (Certificado de Sello Digital)**: los archivos `.cer` y `.key` que te da el SAT, con su contraseña. *Sin el CSD podrás cotizar, pero no timbrar CFDI.*

## Paso 2: (Opcional) Conecta tu Stripe
Para cobrar con tarjeta en línea, Cord usa **tu propia cuenta de Stripe** (no cobramos comisión por transacción). Conéctala en Ajustes para habilitar el botón de pago del link público. Si tus clientes pagan por transferencia (SPEI), no necesitas este paso: ellos transfieren a la CLABE de tu negocio y tú marcas la cotización como pagada.

## Paso 3: Crea tu primer cliente
1. Ve a **Clientes > Nuevo cliente**.
2. Captura su razón social y RFC.
3. Asigna términos de crédito (ej. Net-30) y, si aplica, su límite de crédito para que Cord monitoree su exposición.
4. Para CFDI nominativo, agrega su régimen fiscal, código postal y uso de CFDI en la sección de datos fiscales.

## Paso 4: Envía tu primera cotización
1. Ve a **Cotizaciones > Nueva**.
2. Elige el cliente, agrega líneas (de tu catálogo o líneas libres) y revisa el total.
3. Al enviarla, Cord genera un **link público** y, si configuraste correo, lo manda al cliente. El cliente lo abre, revisa, aprueba y —si conectaste Stripe— paga en línea.

## Paso 5: (Para devs) Conecta la API
Si vas a usar Cord programáticamente:

- Ve a **Ajustes > Developers > API** y crea una llave (`sk_test_...` o `sk_live_...`).
- Verifica que funciona con la llamada más simple:

```bash
curl https://cordhq.app/api/v1/me -H "Authorization: Bearer sk_test_tu_llave"
```

## ¿Qué sigue?
- [Configurar Webhooks](/soporte/configurar-webhooks)
- [Invitar a tu equipo](/soporte/invitar-miembros-roles)
- [Manejo de disputas](/soporte/manejo-disputas)

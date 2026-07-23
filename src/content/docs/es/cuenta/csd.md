---
title: "Agrega la información fiscal (CSD)"
description: "Sube tu Certificado de Sello Digital para habilitar la facturación CFDI 4.0."
---

<header class="content-header">
  <h1 class="page-title">Agrega la información fiscal (CSD)</h1>
  <p class="page-subtitle">Sube tu Certificado de Sello Digital para habilitar el timbrado automático de facturas CFDI 4.0.</p>
</header>

## ¿Qué es el CSD y por qué lo necesitas?

El **Certificado de Sello Digital (CSD)** es un documento electrónico emitido por el SAT que te permite firmar (timbrar) digitalmente tus facturas electrónicas. A diferencia de la FIEL (e.firma), el CSD es exclusivo para la expedición de comprobantes fiscales.

Para que Cord pueda convertir tus cotizaciones aprobadas o pedidos directamente en una factura oficial ante el SAT sin que tengas que recapturar datos en otro portal, **es obligatorio** subir tu CSD.

## Pasos para subir tu CSD en Cord

1. Dirígete a **Ajustes > Facturación / SAT** en el panel de navegación izquierdo.
2. Haz clic en el botón **Subir CSD**.
3. Se te solicitarán tres elementos esenciales:
   - **Archivo `.cer`**: El certificado público.
   - **Archivo `.key`**: Tu llave privada.
   - **Contraseña de la Llave Privada**: La clave que elegiste al tramitar tu CSD en el SAT (Ojo: esta suele ser distinta a la contraseña de tu FIEL).

> **Advertencia:** Cord encripta tus archivos `.key` y contraseñas de extremo a extremo (AES-256) antes de guardarlos. Nunca utilizamos tu FIEL; estrictamente el CSD. Nunca subas tu FIEL (e.firma) para facturar.

## Validaciones y Errores Comunes

Al subir tu CSD, Cord valida automáticamente contra los servidores del SAT:
- **Vigencia:** Si tu CSD está expirado (duran 4 años), el sistema te pedirá renovarlo en la página del SAT.
- **Correspondencia RFC:** El CSD debe pertenecer exactamente al RFC configurado en los datos generales de la empresa.
- **Contraseña incorrecta:** Si la contraseña no logra desencriptar la llave `.key`, recibirás un aviso inmediato.

Una vez validado exitosamente, el indicador de facturación cambiará a "Listo para Timbrar", y cualquier cotización cerrada podrá emitir su CFDI 4.0 con un solo clic.

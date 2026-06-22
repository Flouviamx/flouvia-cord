---
title: "Qué hacer si tu CSD caducó"
description: "Pasos para subir tu nuevo Certificado de Sello Digital."
category: "Facturación y CFDI"
---

Para que Cord (o cualquier PAC) pueda emitir facturas legales en tu nombre, requieres cargar tu **Certificado de Sello Digital (CSD)**. ¡Atención! El CSD no es la FIEL (e.firma).

### ¿Por qué mi CSD aparece vencido o revocado?

Los CSD emitidos por el SAT tienen una vigencia estricta de **4 años**. Si llega a su límite, todas tus facturas y cobranza automática fallarán con un error criptográfico.
Además, el SAT puede **revocar** tu CSD antes de tiempo como medida precautoria si detecta anomalías severas (ej. no presentar declaración anual o no ser localizado en tu domicilio fiscal).

### Cómo actualizar tu CSD en Cord

1. Entra a **Ajustes > Fiscal y SAT**.
2. En la sección *Certificado de Sello Digital*, verás el estado de tu sello actual.
3. Haz clic en **Reemplazar CSD**.
4. Sube tu nuevo archivo `.cer`, tu nuevo archivo `.key` y la contraseña correspondiente.

**Tip de Tiempo:** Después de tramitar un nuevo CSD en el portal del SAT (Certifica), tarda **entre 24 y 72 horas** en propagarse por todos los servidores del SAT a nivel nacional (el famoso LCO). Si lo subes a Cord el mismo día que lo sacaste, el timbrado fallará indicando que "El CSD no se encuentra en la lista de sellos válidos". Debes tener paciencia.

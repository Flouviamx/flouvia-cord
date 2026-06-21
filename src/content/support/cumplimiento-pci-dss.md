---
title: "Cumplimiento PCI-DSS"
description: "Cómo Cord protege la información de tarjetas de crédito."
category: "Seguridad y Privacidad"
order: 1
---

El Estándar de Seguridad de Datos para la Industria de Tarjeta de Pago (PCI DSS) es un conjunto de requerimientos para garantizar que todas las empresas que procesan, almacenan o transmiten información de tarjetas de crédito mantengan un entorno seguro.

### Tu responsabilidad al usar Cord

Debido a que utilizas la infraestructura de Cord o Cord Elements para cobrar:
**Tú NO tocas datos sensibles.** 

Cuando el cliente escribe su número de tarjeta de 16 dígitos, esos datos viajan encriptados directamente desde su navegador hasta los servidores de los bancos adquirentes mediante iframes de seguridad. Tu aplicación solo recibe un "Token" criptográfico asimétrico que representa la tarjeta (ej. `tok_123abc`).

Esto significa que, para efectos legales y de auditoría, tu empresa se beneficia de nuestro cumplimiento Nivel 1. Únicamente necesitas responder un Cuestionario de Autoevaluación (SAQ-A) muy simple que atestigua que has delegado por completo el procesamiento de tarjetas a nosotros.

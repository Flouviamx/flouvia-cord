---
title: "Acuerdos de confidencialidad (NDA)"
description: "Cómo protege Cord la información confidencial de tus operaciones más sensibles."
category: "Seguridad y Privacidad"
order: 4
---

Para cuentas Enterprise o transacciones corporativas sensibles, la confidencialidad en Cord opera en dos niveles: el contrato que ya tienes con nosotros, y la evidencia que se genera cuando tu cliente aprueba una cotización.

### Confidencialidad contractual

La Sección 9 (Confidencialidad) de tus [Términos y Condiciones](/terminos) es, en los hechos, un acuerdo de confidencialidad mutuo entre tu negocio y Flouvia: ambas partes se comprometen a proteger la información técnica, financiera o comercial de la otra con el mismo cuidado que usan para la propia, y la obligación sobrevive a la cancelación de tu suscripción. No necesitas solicitar ni firmar un documento aparte para esto — ya forma parte de tu contrato vigente.

### Evidencia de firma en cada aprobación

Cuando tu cliente aprueba una cotización desde su link público, Cord no registra solo un clic: guarda su nombre, correo, dirección IP y un hash SHA-256 inmutable del contenido exacto que aprobó. Si editas la cotización después de que el cliente ya la abrió, el sistema detecta la discrepancia entre lo que el cliente vio y la versión vigente — la firma queda ligada a la versión exacta que aprobó, nunca a una que cambiaste después.

Esta evidencia respalda que una persona identificada, en una fecha específica, aprobó exactamente esas condiciones: el sustento que necesitas si más adelante hay una disputa sobre lo pactado.

**Validez legal:** el estándar de firma electrónica varía por país. La evidencia que Cord genera (identidad declarada, IP, fecha y hash del documento) está pensada para sostener una firma electrónica simple bajo marcos como la NOM-151 en México, eIDAS en la Unión Europea/Reino Unido, la ESIGN Act/UETA en Estados Unidos, y el marco equivalente en el resto de países donde Cord opera — pero no sustituye el consejo de tu asesor legal sobre qué nivel de firma exige tu transacción.

Cord todavía no ofrece un flujo que oculte los precios de una cotización hasta que el cliente firme un NDA independiente antes de verla. Si tu negocio necesita ese control adicional, escríbenos para evaluarlo.

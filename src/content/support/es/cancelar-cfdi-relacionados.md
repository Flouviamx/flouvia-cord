---
title: "Cancelación con CFDI Relacionado (01)"
description: "Sustituye facturas con errores correctamente."
category: "Facturación y CFDI"
---

El SAT es muy estricto cuando intentas cancelar una factura (Ingreso) que ya tiene documentos relacionados, como Notas de Crédito (Egreso) o Complementos de Pago (REP). El SAT arrojará un error 400 indicando que el CFDI no es cancelable.

### Pasos para desenredar un CFDI relacionado

Para lograr la cancelación, debes "romper" la cadena de atrás hacia adelante:

1. Localiza el Complemento de Pago (REP) o Nota de Crédito que está relacionado a la factura principal.
2. **Cancela primero ese documento secundario.** Utiliza el motivo `02 - Comprobante emitido con errores sin relación`.
3. Espera 5 minutos a que el SAT procese la cancelación del documento hijo y su estatus pase a *Cancelado*.
4. Ahora, ve a la factura principal y solicita su cancelación. Si vas a sustituirla, usa el motivo `01 - Comprobante emitido con errores con relación`. De lo contrario, usa el motivo `02`.

Cord simplifica esto mostrando un árbol de relaciones en la vista de la factura, indicándote exactamente qué documento bloquea a cuál.

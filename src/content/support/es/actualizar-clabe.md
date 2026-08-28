---
title: "Actualizar tu cuenta de depósito"
description: "Cómo cambiar la cuenta bancaria donde recibes tus cobros, con el formato de tu país."
category: "Cuenta y Equipo"
order: 3
---

Cord no retiene tus fondos: el dinero de tus ventas cae directo a la cuenta bancaria que tengas configurada. El formato de esa cuenta depende del **país de tu organización** — la CLABE de 18 dígitos es exclusiva de México. Fuera de México, Cord pide el formato correspondiente: IBAN (España y el resto de la zona SEPA), routing + account number con checksum ABA (Estados Unidos), sort code (Reino Unido), transit + institution number (Canadá), BSB (Australia) o banco + agência (Brasil). El campo de la cuenta se ajusta solo al abrir la pantalla: no hay que "traducir" tu número a un formato mexicano.

### Dos caminos distintos para recibir el dinero

En **Ajustes > Cobros** (`/app/ajustes/cobros`) hay dos secciones independientes:

- **Cord Payments (cobro en línea):** si tu país lo soporta, puedes conectar una cuenta y que tus clientes paguen con tarjeta directo en el link público; en México, además, Cord genera una CLABE única por cotización y concilia la transferencia SPEI automáticamente. El depósito a tu banco lo hace Cord Payments una vez que tu cuenta está verificada.
- **Transferencia bancaria manual:** funciona en cualquier país, esté o no disponible el cobro en línea. Es la sección donde configuras el banco, el número de cuenta (en el formato de tu país) y el beneficiario que se muestran en el link público y el PDF. Como el dinero llega directo a tu cuenta y no pasa por Cord, tú mismo marcas la cotización como pagada cuando lo recibes.

### Actualizar el banco de la transferencia manual

1. Ve a **Ajustes > Cobros**.
2. En la tarjeta **Transferencia bancaria manual**, actualiza el nombre del banco, el número de cuenta (CLABE, IBAN, routing + account, sort code, transit + institution o BSB, según tu país) y el nombre del beneficiario.
3. Guarda. Cord valida el dígito de control del formato de tu país antes de aceptarlo (por ejemplo, el mod-97 del IBAN o el checksum ABA de EE. UU.), así evitas depositar a un número mal tecleado.

A partir de ese momento, todos los enlaces públicos de cotizaciones —incluidas las antiguas que sigan pendientes— muestran la cuenta nueva. Si además tienes Cord Payments conectado, actualizar la cuenta de depósito de los cobros en línea se hace desde el mismo apartado de Cobros, no aquí: esa cuenta la valida Cord Payments como parte de tu verificación de identidad.

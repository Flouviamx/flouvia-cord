---
title: "[EN] Invitar miembros y roles (RBAC)"
description: "Administra el acceso de tu equipo de ventas, contabilidad y administradores."
category: "Account & Team"
order: 2
---

Cord soporta esquemas de control de acceso basados en roles (RBAC) para proteger la información confidencial de tu empresa.

### Invitar a tu Equipo

1. En tu panel principal, ve a **Ajustes > Miembros y Roles**.
2. Haz clic en **Invitar Miembro**.
3. Ingresa su correo electrónico y asígnale un rol.
4. La persona recibirá un email para crear su contraseña e ingresar al entorno de trabajo.

### Roles Disponibles

- **Administrador (Owner):** Tiene acceso sin restricciones. Puede ver balances bancarios, transferir dinero (Payouts), editar las llaves de API, cambiar facturación y borrar la organización.
- **Ventas (Sales):** Solo puede crear, editar y visualizar clientes y cotizaciones. **No** puede ver el saldo total de la cuenta en el dashboard ni exportar reportes de dispersión bancaria.
- **Desarrollador (Developer):** Tiene acceso total a las llaves de API y configuración de webhooks. Puede emitir facturas y leer logs técnicos, pero no puede añadir administradores nuevos ni ver las cuentas bancarias destino.
- **Contador (Read-Only Finance):** Ideal para despachos externos. Solo pueden exportar facturas XML/PDF y ver conciliaciones de pago, pero tienen bloqueada la creación de cobros.

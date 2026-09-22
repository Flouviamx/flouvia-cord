---
title: "Configurar autenticación en dos pasos"
description: "Configura 2FA y entiende cuándo se exige para continuar."
category: "Cuenta y Equipo"
---

# Configurar autenticación en dos pasos


## Verificación en dos pasos y acceso

Activa 2FA desde **Ajustes > Tu cuenta**: escanea el QR con tu app autenticadora,
confirma el código y guarda los diez códigos de respaldo de un solo uso que se
muestran al activarlo.

Cuando la organización exige 2FA y todavía no lo configuraste, debes completarlo
antes de continuar. La protección aplica también a las solicitudes del panel,
no solo a la pantalla visible. Se conservan las acciones necesarias para configurar
2FA, confirmar tu identidad o cerrar sesión.

Si una acción sensible pide verificar tu identidad de nuevo, complétala antes de
reintentar. Los permisos del equipo siguen siendo necesarios; tener 2FA no concede
permiso para reembolsar o administrar el negocio.

> La disponibilidad de las mejoras de septiembre está en verificación. Consulta [alcance y publicación](https://docs.cordhq.app/pagos/mejoras-confiabilidad); contacta a soporte si una acción descrita todavía no aparece en tu cuenta.

## Cierre por inactividad: implementación en validación

El plazo que el negocio configura en **Ajustes › Seguridad** se comprueba al
entrar a la aplicación, a facturación y a las API internas protegidas. Cuando
vence, la operación se detiene y debes iniciar sesión otra vez. También se
comprueba al registrar una passkey.

Visitar una página pública o usar las rutas de recuperación de 2FA no reinicia
ese plazo. La actividad se mide por solicitudes autenticadas a las superficies
protegidas, no por mover el mouse; las consultas automáticas de la app también
pueden contar. El valor cero desactiva el límite de inactividad, pero conserva
la expiración máxima, las revocaciones y la suspensión de cuenta.

La comprobación y renovación ocurren juntas para impedir que solicitudes
simultáneas renueven una sesión ya vencida. Este refuerzo tiene pruebas locales;
falta verificar su publicación y el recorrido integrado de inicio de sesión.

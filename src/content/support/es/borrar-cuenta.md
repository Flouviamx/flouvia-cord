---
title: "Eliminar tu cuenta de Cord"
description: "Cómo eliminar tu organización o tu cuenta personal desde Ajustes, y qué se borra en cada caso."
category: "Cuenta y Equipo"
---

Cord tiene dos eliminaciones distintas, ambas de autoservicio desde Ajustes — no necesitas escribir a soporte.

### Eliminar tu organización (el negocio)

En **Ajustes › Datos y privacidad**, sección "Zona de peligro", el dueño de la organización puede eliminarla por completo. Esto borra de forma permanente e inmediata:

- Todas las cotizaciones, clientes y catálogo de productos.
- Los documentos fiscales (CFDI) timbrados por esa organización.
- Llaves API, webhooks, plantillas, kits y el registro de auditoría.
- El equipo y sus permisos.

> **Descarga tus CFDI antes de eliminar.** Este es un borrado real — Cord no conserva copia de tus comprobantes fiscales después de eliminar la organización. Usa "Exportar todo (JSON)" en la misma página antes de continuar. El modal de confirmación te pide reconocer explícitamente que ya los descargaste.

Para confirmar necesitas: tu contraseña (o un código de tu app de autenticación si entras solo con Google/Apple), y escribir el nombre exacto de la organización.

### Eliminar tu cuenta personal

En **Ajustes › Tu cuenta**, sección "Zona de peligro", puedes eliminar tu usuario. Esto:

- Borra tus sesiones, claves de acceso (passkeys) y cuentas conectadas (Google/Apple).
- Elimina también cualquier organización de la que seas **único** dueño (sin nadie más en el equipo) — con el mismo efecto que el punto anterior.
- Si eres dueño de una organización que **sí** tiene otros miembros activos, Cord bloquea la eliminación de tu cuenta: transfiere la propiedad o da de baja a esos miembros primero desde Ajustes › Equipo.

Para confirmar necesitas tu contraseña (o código de tu app de autenticación) y escribir tu correo exacto.

### Ambas acciones son permanentes

Ninguna se puede deshacer. Exporta tus datos antes desde Ajustes › Datos y privacidad ("Exportar todo" y los CSV de catálogo/clientes).

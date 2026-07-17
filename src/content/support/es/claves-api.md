---
title: "Autenticación y Claves API (API Keys)"
description: "Aprende a generar y autenticar tus peticiones a la API REST de Cord."
category: "Desarrolladores"
order: 1
---

Tus Claves de API son la puerta de entrada a tu cuenta. Trátalas con el mismo cuidado que la contraseña de tu base de datos.

### Dónde se generan

Entra a **Ajustes > Developers > API** (`/app/ajustes/api`). Ahí creas llaves nuevas, eliges su alcance (lectura o escritura) y las revocas. La llave secreta se muestra **una sola vez** al crearla; guárdala en un gestor de secretos, nunca en el código fuente.

### Autenticación

La API es REST sobre HTTPS. Cada petición lleva tu llave en el header `Authorization`:

```bash
curl https://cordhq.app/api/v1/me \
  -H "Authorization: Bearer sk_live_tu_llave"
```

Respuesta:

```json
{ "org": { "id": "...", "nombre": "Tu Negocio", "plan": "pro" }, "scope": "write", "mode": "live" }
```

### Entornos (Live vs Test)

Al crear una llave eliges su modo:
- **Test (`sk_test_...`):** no consume tu medidor de uso de API ni cuenta para tu facturación. Útil para probar integraciones. **Importante:** opera sobre los mismos datos de tu organización — no hay un sandbox aislado todavía. Que el timbrado CFDI sea real o simulado depende de tu configuración de Facturapi (CSD / llave), no del modo de la llave.
- **Live (`sk_live_...`):** úsala en producción. Cada llamada cuenta para el consumo de tu plan.

### Alcances (Scopes)

- **Lectura (`read`):** consulta cotizaciones, clientes, productos y cartera.
- **Escritura (`write`):** además puede crear cotizaciones, clientes y productos.

### Rotación de Llaves

No hay rotación "en sitio" con periodo de gracia. Si una llave se filtró (ej. se subió por error a GitHub):

1. Entra a **Ajustes > Developers > API**.
2. Crea una llave nueva y actualiza tus servidores con ella.
3. **Revoca** la llave comprometida. La revocación es inmediata: cualquier petición con esa llave responderá `401`.

---
title: "Autenticación y Claves API (API Keys)"
description: "Aprende a generar y autenticar tus peticiones a la API REST de Cord."
category: "Desarrolladores"
order: 1
---

# Autenticación y Claves API (API Keys)

Cord provee una API REST poderosa para automatizar cotizaciones, consultar pagos y gestionar facturas.

## Generación de Llaves
1. Entra a **Ajustes > Desarrolladores > Claves API**.
2. Verás dos entornos: `Test` (Pruebas) y `Live` (Producción).
3. Utiliza la clave secreta `sk_test_...` o `sk_live_...` en los headers de tus peticiones HTTP.

```bash
curl https://api.flouvia.com/v1/quotes \
  -H "Authorization: Bearer sk_test_12345..."
```

**Nunca expongas tus llaves secretas** en código frontend o repositorios públicos. Si sospechas que tu llave fue comprometida, haz clic en *Roll Key* inmediatamente.

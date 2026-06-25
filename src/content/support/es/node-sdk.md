---
title: "Usar la API de Cord desde Node.js"
description: "Cómo llamar la API REST de Cord desde tu backend de Node.js o TypeScript."
category: "Desarrolladores"
---

> No hay un SDK oficial de Node todavía. La API de Cord es REST estándar, así que la llamas directamente con `fetch` (incluido en Node 18+) o tu cliente HTTP favorito. Si publicamos un paquete oficial, lo anunciaremos aquí.

### Un wrapper mínimo

Centraliza la URL base, la llave y el manejo de errores en una función:

```typescript
const BASE = 'https://cord.flouvia.com/api/v1';

async function cord(path: string, init: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Authorization': `Bearer ${process.env.CORD_SECRET_KEY}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? `Cord API ${res.status}`);
  return body;
}
```

### Crear una cotización

```typescript
const { data } = await cord('/cotizaciones', {
  method: 'POST',
  body: JSON.stringify({
    cliente_id: 'id-del-cliente',   // opcional
    terminos: 'net30',
    vigencia_dias: 15,
    send: true,                     // envía el link al correo del cliente
    items: [
      { descripcion: 'Horas de desarrollo', cantidad: 10, precio_unitario: 1500 }
    ],
  }),
});

console.log(data.folio, data.link_publico); // ej. COT-0149  /q/abc123
```

**Recuerda:**
- Los montos van en **pesos** (`1500` = $1,500.00), no en centavos.
- `link_publico` es la ruta del link que ve tu cliente (`/q/{token}`); antepón `https://cord.flouvia.com`.
- Crear cotizaciones requiere una llave con alcance de **escritura**.

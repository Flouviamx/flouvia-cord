---
title: "Apariencia de Elements"
description: "Personaliza el aspecto de Cord Elements con variables CSS, Dark Mode y fuentes personalizadas."
---

<header class="content-header">
  <h1 class="page-title">Apariencia</h1>
  <p class="page-subtitle">Haz que el cotizador parezca haber sido desarrollado in-house por tu equipo de producto.</p>
</header>

## La API de Apariencia

Por defecto, Cord Elements se renderiza con nuestra paleta de colores limpia y neutral, pero puedes controlar profundamente su estética mediante un objeto JSON de configuración. 

Debido a que el cotizador vive dentro de un iframe, no puedes inyectar hojas de estilo tradicionales directamente. En su lugar, el script `embed.js` envía tus preferencias estéticas a los servidores de Cord, quienes renderizan el CSS validado de forma segura.

### El parámetro Appearance

El script embebible lee de tu etiqueta HTML o configuración de inicialización el objeto `appearance`.

```html
<script src="https://cordhq.app/embed.js" async></script>
<div 
  data-cord-token="tok_A1B2C3D4E5" 
  data-appearance='{
    "theme": "dark",
    "variables": {
      "colorBackground": "#18181b",
      "colorText": "#f4f4f5",
      "colorPrimary": "#3b82f6",
      "borderRadius": "8px"
    },
    "fonts": [
      {
        "cssSrc": "https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap"
      }
    ]
  }'>
</div>
```

## Opciones Disponibles

### 1. Temas (`theme`)
Puedes instruir al iframe para que renderice usando un tema base. 
- `light` (Por defecto)
- `dark` (Renderiza el diseño con fondos negros e invierte la paleta)
- `auto` (El iframe usa `@media (prefers-color-scheme: dark)` para respetar la preferencia del sistema operativo del visitante).

### 2. Variables CSS (`variables`)
Cord expone una serie de variables CSS internamente que puedes sobreescribir. Escribe las variables en formato `camelCase` dentro del JSON.

- `colorBackground`: Fondo principal de la tarjeta.
- `colorText`: Color de texto general.
- `colorPrimary`: Color principal para botones y acentos.
- `borderRadius`: Redondeo de las esquinas (ej. `0px` para bordes afilados, `12px` para curvas suaves).
- `fontFamily`: Familia tipográfica a aplicar en todos los textos.

### 3. Fuentes Externas (`fonts`)
Cord te permite cargar tu propia familia tipográfica comercial o libre directamente dentro del iframe.

Pasa un arreglo `fonts` con objetos que contengan el `cssSrc`. 
> **Nota:** Por motivos estrictos de seguridad y para prevenir inyecciones de interfaz (UI-redressing), Cord solo ejecutará directivas `@import` provenientes de hosts de tipografía comprobados, como `fonts.googleapis.com` o `fonts.bunny.net`. Cualquier otra URL externa será descartada silenciosamente.

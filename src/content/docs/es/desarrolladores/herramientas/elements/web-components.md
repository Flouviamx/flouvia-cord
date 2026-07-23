---
title: "Elements en Vue y Web Components"
description: "Descubre cómo usar los componentes web nativos de Cord en Vue, HTML puro, PHP o cualquier otro stack."
---

<header class="content-header">
  <h1 class="page-title">Web Components y Vue</h1>
  <p class="page-subtitle">Componentes agnósticos al framework para máxima compatibilidad con cualquier arquitectura.</p>
</header>

## Web Component (Vanilla JS, PHP, Rails)

Si no utilizas React ni Vue, o estás integrando Cord en un sitio renderizado en el servidor (como Laravel, Django, o WordPress), puedes utilizar el Web Component estándar (`<cord-cotizador>`).

Este componente está compilado bajo los estándares de la plataforma web, lo que significa que el navegador lo entiende de forma nativa sin necesidad de un bundler.

```html
<!-- Importar el módulo ES -->
<script type="module" src="https://unpkg.com/@flouviahq/elements/dist/index.mjs"></script>

<!-- Renderizar el componente nativo -->
<div style="height: 800px;">
  <cord-cotizador 
    token="tok_A1B2C3D4E5" 
    base-url="https://cordhq.app" 
    min-height="500">
  </cord-cotizador>
</div>

<script>
  // Escuchar eventos estándar del DOM
  const cotizador = document.querySelector('cord-cotizador');
  
  cotizador.addEventListener('approved', (e) => {
    console.log('¡Cotización aprobada!', e.detail.folio);
  });
</script>
```

> **Nota de Eventos:** Al usar el Web Component nativo, los eventos llegan **sin** el prefijo `cord:`. Es decir, en lugar de escuchar `cord:approved`, escucharás simplemente `approved` como cualquier otro evento de la API del DOM.

## Vue y Nuxt

El SDK de Cord provee un envoltorio nativo (wrapper) para Vue 3 que maneja la reactividad y los eventos utilizando el paradigma de Vue (`@` o `v-on`).

### Instalación

```bash
npm install @flouviahq/elements
```

### Uso

Importa el componente `<CordCotizador>` desde el entrypoint `/vue` y pásalo a tu template.

```vue
<script setup>
import { CordCotizador } from '@flouviahq/elements/vue';
import { ref } from 'vue';

const miToken = ref('tok_A1B2C3D4E5');

function handleApproved(detail) {
  console.log('El cliente firmó:', detail.signed_by);
}

function handlePay(detail) {
  window.location.href = detail.url;
}
</script>

<template>
  <main class="cotizacion-container">
    <CordCotizador
      :token="miToken"
      @approved="handleApproved"
      @pay="handlePay"
    />
  </main>
</template>
```

## Framer

Si estás construyendo tu sitio web en **Framer**, puedes agregar Cord Elements como un *Code Component* arrastrable y soltable.

Crea un nuevo componente de código en Framer y pega lo siguiente:

```tsx
import { FramerCordCotizador } from '@flouviahq/elements/framer';
export default FramerCordCotizador;
```

Esto registrará los controles de propiedades en la interfaz visual de Framer (Property Controls), exponiendo el campo `Token` en el panel derecho para que tus diseñadores puedan modificarlo visualmente sin tocar código.

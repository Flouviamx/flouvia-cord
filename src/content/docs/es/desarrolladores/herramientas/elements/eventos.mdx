---
title: "Eventos de Elements"
description: "Aprende a escuchar las acciones del cliente dentro del iframe para construir experiencias dinámicas."
---

<header class="content-header">
  <h1 class="page-title">Eventos (Relay)</h1>
  <p class="page-subtitle">Reacciona en el navegador cuando tus clientes interactúan con la cotización.</p>
</header>

## El Puente de Mensajes

El iframe de Cord Elements está diseñado para nunca aislar a tu sitio web de lo que ocurre dentro de él. Usando un puente bidireccional mediante `window.postMessage`, Cord hace "relay" (retransmisión) de los eventos de la tarjeta directamente a tu entorno `window` padre.

Esto es increíblemente poderoso para disparar píxeles de analítica (como Meta Pixel o Google Analytics), lanzar animaciones de confeti cuando se aprueba una propuesta, o redirigir al usuario a una página de "Gracias" tras un pago exitoso.

## Escuchar Eventos

Puedes escuchar los eventos de forma nativa atando un `addEventListener` al nodo del DOM del elemento embebido:

```javascript
const contenedor = document.querySelector('[data-cord-token]');

contenedor.addEventListener('cord:approved', (evento) => {
  console.log('¡La cotización fue aprobada!');
  console.log('Aprobada por:', evento.detail.signed_by);
});
```

## Diccionario de Eventos

Todos los eventos tienen el prefijo `cord:` para evitar colisiones de nombres con otras librerías.

### Ciclo de vida del componente
- **`cord:ready`**: Disparado en el momento exacto en que el SDK termina de renderizar el contenido, calcular la altura final y las fuentes tipográficas terminan de cargarse.
- **`cord:resize`**: Se emite continuamente cada que la altura del iframe cambia (útil solo si escribes tu propio contenedor y no usas `embed.js`).
- **`cord:viewed`**: Disparado cuando el iframe se hace visible y Cord registra en la base de datos que el cliente ha visualizado la cotización de forma oficial.

### Interacción comercial
- **`cord:approved`**: Emitido en el instante en que el usuario aprueba los términos de la propuesta comercial. Devuelve en el `detail` datos útiles como el hash de validación y quién firmó (`signed_by`).
- **`cord:signed`**: Disparado secuencialmente al momento de capturar una firma legal vinculante.
- **`cord:pay`**: Emitido cuando el usuario hace clic en el botón para iniciar su flujo de pago (Stripe, transferencia, etc.).
- **`cord:rejected`**: Disparado si el cliente marca explícitamente la propuesta como declinada.
- **`cord:message`**: Se activa cada que el cliente deja un comentario general en el chat de la cotización.
- **`cord:item_comment`**: Se dispara cuando el usuario deja un comentario específico sobre una partida (línea de producto) de la cotización.

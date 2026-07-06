# @flouviahq/elements

SDK Oficial de Cord para integrar cotizaciones interactivas B2B en cualquier aplicación.
Ofrece componentes listos para usar (Web Components, React, Next.js, Vue) y hooks (Headless UI) para que construyas tu propia experiencia a medida.

## Instalación

```bash
npm install @flouviahq/elements
# o
yarn add @flouviahq/elements
# o
pnpm add @flouviahq/elements
```

## Configuración y Seguridad

Para interactuar con la API de Cord desde el frontend de forma segura, necesitas una **Publishable Key** (`pk_live_...` o `pk_test_...`). Puedes generarla en tu Dashboard de Cord > Ajustes > API.

Las llaves públicas:
- Solo pueden leer tu catálogo de productos y crear cotizaciones.
- No tienen acceso a facturación, cobranza ni configuraciones.
- (Opcional) Puedes restringirlas para que solo funcionen desde los dominios que apruebes en tu Dashboard (Protección de Origen).

---

## 1. Headless UI (React / Next.js)

La forma más flexible de usar Cord es mediante sus React Hooks. Esto te permite crear tu propio diseño, manteniendo a Cord solo como el motor de datos y cálculo.

### Paso 1: Configurar el Provider
Envuelve tu aplicación o componente con `CordProvider`:

```tsx
import { CordProvider } from '@flouviahq/elements/react';

function App({ children }) {
  return (
    <CordProvider publishableKey="pk_test_123456789">
      {children}
    </CordProvider>
  );
}
```

### Paso 2: Usar los Hooks

```tsx
import { useState } from 'react';
import { useCordCatalog, useCreateQuote } from '@flouviahq/elements/react';

function MiCotizador() {
  const { products, isLoading: isLoadingCatalog } = useCordCatalog();
  const { createQuote, isLoading: isCreating } = useCreateQuote();
  const [selectedProduct, setSelectedProduct] = useState('');

  const handleCotizar = async () => {
    if (!selectedProduct) return;

    const result = await createQuote({
      items: [
        {
          producto_id: selectedProduct,
          cantidad: 1,
          precio_unitario: 1500 // O puedes leerlo de `products`
        }
      ],
      iva_incluido: false,
      send: true // Enviar por correo automáticamente
    });

    if (result) {
      alert(`¡Cotización ${result.folio} creada!`);
    }
  };

  if (isLoadingCatalog) return <p>Cargando catálogo...</p>;

  return (
    <div>
      <select onChange={(e) => setSelectedProduct(e.target.value)}>
        <option value="">Selecciona un producto...</option>
        {products.map(p => (
          <option key={p.id} value={p.id}>{p.nombre}</option>
        ))}
      </select>
      
      <button onClick={handleCotizar} disabled={isCreating}>
        {isCreating ? 'Cotizando...' : 'Crear Cotización'}
      </button>
    </div>
  );
}
```

---

## 2. Componentes Pre-construidos (Iframe)

Si ya tienes una cotización creada en Cord y quieres mostrarla dentro de tu aplicación (para que el cliente la apruebe o la pague), puedes usar el componente `<CordEmbed />`.

### React / Next.js

```tsx
import { CordProvider, CordEmbed } from '@flouviahq/elements/react';

function Dashboard() {
  return (
    <CordProvider 
      token="cot_123abc" 
      appearance={{ theme: 'dark', variables: { colorPrimary: '#3b82f6' } }}
    >
      <div style={{ width: '100%', height: '800px' }}>
        <CordEmbed 
          onApproved={() => console.log('¡Cotización aprobada!')}
          onPay={() => console.log('El usuario inició el pago')}
        />
      </div>
    </CordProvider>
  );
}
```

### Vanilla JS (Web Components)

Cord exporta un Web Component nativo `<cord-cotizador>` que puedes usar en cualquier stack (HTML, PHP, Laravel, Ruby on Rails).

```html
<!DOCTYPE html>
<html lang="es">
<head>
  <!-- Importar la librería desde un CDN o tu bundle local -->
  <script type="module" src="https://unpkg.com/@flouviahq/elements/dist/index.mjs"></script>
</head>
<body>

  <div style="height: 800px;">
    <!-- El Web Component acepta token y variables de diseño directamente -->
    <cord-cotizador 
      token="cot_123abc" 
      theme="light"
    ></cord-cotizador>
  </div>

  <script>
    const cotizador = document.querySelector('cord-cotizador');
    
    // Escuchar eventos estándar del DOM
    cotizador.addEventListener('cord:approved', (e) => {
      console.log('Cotización aprobada, folio:', e.detail.folio);
    });
  </script>
</body>
</html>
```

## Funcionalidades de Appearance API

El objeto `appearance` (o los atributos en HTML) te permiten personalizar cómo luce el iframe:

```json
{
  "theme": "dark",
  "variables": {
    "colorPrimary": "#ef4444",
    "colorBackground": "#18181b",
    "borderRadius": "12px",
    "fontFamily": "Inter, sans-serif"
  }
}
```

## Motor Matemático (Engine) Compartido

Si estás construyendo tu propia UI (Headless), querrás calcular los subtotales e IVA exactamente igual que como lo hace el backend de Cord. Para ello, el SDK expone el motor matemático puro:

```typescript
import { calculateTotals } from '@flouviahq/elements';

const { subtotal, iva, total } = calculateTotals(
  [{ cantidad: 2, precio_unitario: 100 }], 
  0.16,  // IVA 16%
  false  // ¿IVA incluido?
);
```

// app/layout.tsx — fuente ÚNICA de configuración de Cord para toda la app.
//
// Modo `proxy`: tu backend (app/api/cord/cotizaciones/route.ts) llama a Cord
// con la sk_..., nunca expuesta al navegador. Si prefieres el modo
// `publishable` (crear cotizaciones directo desde el navegador con una
// pk_...), usa `publishableKey` en su lugar — pero NUNCA los dos a la vez:
// CordProviderProps es una unión discriminada, pasar ambos es error de
// compilación (ver CHANGELOG.md § 1.0.0 — el bug real que esto reemplaza).
import { CordProvider } from '@flouviahq/elements/react';
import type { ReactNode } from 'react';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>
        <CordProvider
          proxyUrl="/api/cord/cotizaciones"
          // Config de marca UNA sola vez — CordBuilder Y CordCotizador la heredan.
          appearance={{
            theme: 'light',
            variables: {
              colorPrimary: '#0A2240',
              fontFamily: 'Outfit, system-ui, sans-serif',
              borderRadius: '10px',
            },
          }}
          // Debe coincidir con el % de IVA real de tu org en Cord — si difiere,
          // el total que ve el usuario en el Builder no coincide con el que
          // termina calculando el servidor.
          ivaPct={0.16}
        >
          {children}
        </CordProvider>
      </body>
    </html>
  );
}

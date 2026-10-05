// app/layout.tsx — configuración única de Cord para toda la app. Divisas,
// impuestos por línea y términos vienen de tu organización en Cord.
import { CordProvider } from '@flouviahq/elements/react';
import type { ReactNode } from 'react';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>
        <CordProvider
          proxyUrl="/api/cord"
          appearance={{
            theme: 'light',
            variables: { colorPrimary: '#0A2240', fontFamily: 'Outfit, system-ui, sans-serif', borderRadius: '10px' },
          }}
          debug={process.env.NODE_ENV !== 'production'}
        >
          {children}
        </CordProvider>
      </body>
    </html>
  );
}

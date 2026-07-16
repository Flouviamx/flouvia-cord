// app/cotizaciones/nueva/QuoteBuilderClient.tsx — Client Component. `<CordBuilder>`
// ya trae su propia directiva 'use client' (packages/elements/src/react.tsx),
// pero el callback `onQuoteCreated` usa `useRouter()`, así que ESTE archivo
// también necesita ser client-side.
'use client';

import { CordBuilder } from '@flouviahq/elements/react';
import { useRouter } from 'next/navigation';
import type { CordProduct, CordClient } from '@flouviahq/elements/react';

export function QuoteBuilderClient({ catalog, clients }: { catalog: CordProduct[]; clients: CordClient[] }) {
  const router = useRouter();

  return (
    <CordBuilder
      catalog={catalog}
      clients={clients}
      // Estilizado con clases Tailwind normales vía appearance.elements en el
      // <CordProvider> del layout — el estilo por defecto del SDK vive en
      // @layer cord, así que Tailwind (declarado después) siempre gana. Cero
      // necesidad de reescribir este componente (compárese con
      // AdvancedQuoteItems.tsx en la integración real que motivó este rediseño).
      onQuoteCreated={(q) => router.push(q.link_publico)}
    />
  );
}

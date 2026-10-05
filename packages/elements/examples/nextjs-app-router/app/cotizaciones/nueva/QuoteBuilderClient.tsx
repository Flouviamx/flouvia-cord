// app/cotizaciones/nueva/QuoteBuilderClient.tsx — el Builder con estilos, datos
// fiscales del cliente y llenado con IA desde un pedido, foto o PDF.
'use client';

import { CordBuilder } from '@flouviahq/elements/react';
import { useRouter } from 'next/navigation';
import type { CordProduct, CordClient } from '@flouviahq/elements';

export function QuoteBuilderClient({ catalog, clients }: { catalog: CordProduct[]; clients: CordClient[] }) {
  const router = useRouter();
  return (
    <CordBuilder
      catalog={catalog}
      clients={clients}
      fiscal
      ai
      onQuoteCreated={(q) => router.push(q.link_publico ?? '/cotizaciones')}
    />
  );
}

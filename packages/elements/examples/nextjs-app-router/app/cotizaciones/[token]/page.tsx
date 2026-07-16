// app/cotizaciones/[token]/page.tsx — visor de una cotización existente.
// <CordCotizador> hereda `appearance`/`baseUrl` del <CordProvider> del
// layout raíz — nunca hizo falta un botón de escape "ábrelo en Cord
// directamente" (el que existía en la integración real que motivó este
// rediseño era la confesión de que el embed salía sin marca).
'use client';

import { CordCotizador } from '@flouviahq/elements/react';

export default function CotizacionPage({ params }: { params: { token: string } }) {
  return (
    <main className="mx-auto max-w-4xl p-8">
      <CordCotizador
        token={params.token}
        onApproved={(d) => console.log('Aprobada, firmada por', d.signed_by)}
        onRejected={(d) => console.log('Rechazada:', d.comentario)}
        onPay={(d) => window.location.assign(d.url)}
      />
    </main>
  );
}

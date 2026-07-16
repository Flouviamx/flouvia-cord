// app/cotizaciones/nueva/HeadlessBuilder.tsx — la MISMA pantalla que
// QuoteBuilderClient.tsx, pero con tu propia UI vía useQuoteBuilder(). Este
// es el patrón que una integración real tuvo que reconstruir a mano en 286
// líneas (buscador de productos, stepper de cantidad, toggle de IVA…) porque
// CordBuilder.Items no se podía estilizar. Aquí es de primera clase: no hay
// nada que "reconstruir", solo consumes el estado y pintas lo que quieras.
'use client';

import { useQuoteBuilder } from '@flouviahq/elements/react';
import { useRouter } from 'next/navigation';
import type { CordProduct, CordClient } from '@flouviahq/elements/react';

export function HeadlessBuilder({ catalog, clients }: { catalog: CordProduct[]; clients: CordClient[] }) {
  const router = useRouter();
  const {
    cliente, setCliente, email, setEmail,
    items, updateItem, removeItem, setItems,
    notas, setNotas,
    subtotal, iva, total, moneda,
    isLoading, submitError, handleSubmit,
  } = useQuoteBuilder({
    catalog,
    clients,
    onQuoteCreated: (q) => router.push(q.link_publico),
  });

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label className="block text-sm font-medium">Cliente</label>
        <input
          className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2"
          value={cliente}
          onChange={(e) => setCliente(e.target.value)}
          placeholder="Empresa o nombre — si no existe, se crea al enviar"
        />
        <input
          type="email"
          className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="correo@cliente.com (opcional)"
        />
      </div>

      <ul className="space-y-3">
        {items.map((item, idx) => (
          <li key={idx} className="flex gap-2">
            <input
              className="flex-1 rounded-lg border border-gray-200 px-3 py-2"
              value={item.descripcion}
              onChange={(e) => updateItem(idx, { descripcion: e.target.value })}
              placeholder="Descripción"
            />
            <input
              type="number"
              className="w-20 rounded-lg border border-gray-200 px-3 py-2"
              value={item.cantidad}
              onChange={(e) => updateItem(idx, { cantidad: Number(e.target.value) })}
            />
            <input
              type="number"
              className="w-28 rounded-lg border border-gray-200 px-3 py-2"
              value={item.precio_unitario}
              onChange={(e) => updateItem(idx, { precio_unitario: Number(e.target.value) })}
            />
            <button type="button" onClick={() => removeItem(idx)} disabled={items.length === 1}>
              ✕
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => setItems([...items, { descripcion: '', cantidad: 1, precio_unitario: 0 }])}
        className="text-sm font-medium text-[#0A2240]"
      >
        + Agregar línea
      </button>

      <textarea
        className="w-full rounded-lg border border-gray-200 px-3 py-2"
        value={notas}
        onChange={(e) => setNotas(e.target.value)}
        placeholder="Notas / condiciones"
      />

      <div className="text-right text-sm">
        <p>Subtotal: {subtotal.toLocaleString('es-MX')} {moneda}</p>
        <p>IVA: {iva.toLocaleString('es-MX')} {moneda}</p>
        <p className="text-lg font-semibold">Total: {total.toLocaleString('es-MX')} {moneda}</p>
      </div>

      {submitError && <p className="text-sm text-red-600">{submitError}</p>}

      <button type="submit" disabled={isLoading} className="w-full rounded-lg bg-[#0A2240] py-3 text-white">
        {isLoading ? 'Creando…' : 'Crear cotización'}
      </button>
    </form>
  );
}

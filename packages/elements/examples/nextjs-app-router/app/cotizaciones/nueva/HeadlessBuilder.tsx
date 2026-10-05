// app/cotizaciones/nueva/HeadlessBuilder.tsx — la misma pantalla con tu propia
// UI sobre useQuoteBuilder(): estado, totales del motor de Cord y validación.
'use client';

import { useQuoteBuilder } from '@flouviahq/elements/react';
import { useRouter } from 'next/navigation';
import type { CordProduct, CordClient } from '@flouviahq/elements';

export function HeadlessBuilder({ catalog, clients }: { catalog: CordProduct[]; clients: CordClient[] }) {
  const router = useRouter();
  const { builder, cliente, items, totals, config, status, error, taxLabel, formatMoney, issueFor } = useQuoteBuilder({
    catalog,
    clients,
    onQuoteCreated: (q) => router.push(q.link_publico ?? '/cotizaciones'),
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); void builder.submit(); }} className="space-y-6">
      <label className="block text-sm font-medium">
        Cliente
        <input
          className="mt-1 w-full rounded-lg bg-[#f5f5f7] px-3 py-2"
          value={cliente.empresa}
          onChange={(e) => builder.setCliente({ empresa: e.target.value })}
          aria-invalid={!!issueFor('cliente.empresa')}
        />
      </label>

      <ul className="space-y-3">
        {items.map((item) => (
          <li key={item.key} className="flex flex-wrap gap-2">
            <input className="flex-1 rounded-lg bg-[#f5f5f7] px-3 py-2" value={item.descripcion} onChange={(e) => builder.updateItem(item.key, { descripcion: e.target.value })} placeholder="Descripción" />
            <input type="number" className="w-20 rounded-lg bg-[#f5f5f7] px-3 py-2" value={item.cantidad} onChange={(e) => builder.updateItem(item.key, { cantidad: Number(e.target.value) })} />
            <input type="number" className="w-28 rounded-lg bg-[#f5f5f7] px-3 py-2" value={item.precio_unitario} onChange={(e) => builder.updateItem(item.key, { precio_unitario: Number(e.target.value) })} />
            <select className="rounded-lg bg-[#f5f5f7] px-3 py-2" value={String(item.tax_rate)} onChange={(e) => builder.updateItem(item.key, { tax_rate: Number(e.target.value) })}>
              {config?.impuestos.opciones.map((o) => <option key={o.label} value={String(o.rate)}>{o.label}</option>)}
            </select>
            <button type="button" onClick={() => builder.removeItem(item.key)} disabled={items.length === 1} className="text-sm">Quitar</button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={() => builder.addItem()} className="text-sm font-medium text-[#0A2240]">Agregar partida</button>

      <div className="text-right text-sm">
        <p>Subtotal: {formatMoney(totals.subtotal)}</p>
        {totals.porTasa.filter((t) => t.tasa > 0).map((t) => <p key={t.tasa}>{taxLabel} {t.tasa * 100}%: {formatMoney(t.impuesto)}</p>)}
        <p className="text-lg font-semibold">Total: {formatMoney(totals.total)}</p>
      </div>

      {error && <p className="text-sm text-red-700">{error.message} ({error.requestId})</p>}
      <button type="submit" disabled={status === 'submitting' || status === 'loading'} className="w-full rounded-full bg-[#0A2240] py-3 text-white">
        {status === 'submitting' ? 'Creando…' : 'Crear cotización'}
      </button>
    </form>
  );
}

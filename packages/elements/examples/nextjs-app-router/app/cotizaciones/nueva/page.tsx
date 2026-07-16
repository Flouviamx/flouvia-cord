// app/cotizaciones/nueva/page.tsx — Server Component: trae catálogo/clientes
// de TU backend y los pasa como prop a un Client Component. `<CordBuilder>`
// entonces NO hace ningún fetch propio — antes de la Fase 4 del rediseño,
// esto disparaba 2 fetches desperdiciados (2×404 reales en la integración
// real que motivó este rediseño) en cada mount, aun cuando los datos ya
// estaban disponibles server-side.
import { getProductos, getClientes } from '@/lib/tu-propio-crm'; // ejemplo — reemplaza por tu fuente real
import { QuoteBuilderClient } from './QuoteBuilderClient';

export default async function NuevaCotizacionPage() {
  const [productos, clientes] = await Promise.all([getProductos(), getClientes()]);

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="mb-6 text-xl font-semibold text-[#0A2240]">Nueva cotización</h1>
      <QuoteBuilderClient catalog={productos} clients={clientes} />
    </main>
  );
}

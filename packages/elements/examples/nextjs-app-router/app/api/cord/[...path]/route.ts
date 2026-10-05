// app/api/cord/[...path]/route.ts — el proxy al que apunta <CordProvider proxyUrl="/api/cord">.
// La sk_ vive solo aquí. createElementsProxy atiende únicamente las rutas de
// Elements, solo desde tu propio origen, y sanea la cotización como una pk_.
import { createElementsProxy } from '@flouviahq/node';
import { getSession } from '@/lib/tu-propia-sesion';

const proxy = createElementsProxy({
  secretKey: process.env.CORD_SECRET_KEY!,
  // Sin esto, el CRM nunca se expone por el proxy.
  authorizeClients: async (request) => !!(await getSession(request)),
});

export const GET = proxy;
export const POST = proxy;

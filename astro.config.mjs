// @ts-check
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';
import clerk from '@clerk/astro';
import { esMX } from '@clerk/localizations';

import react from '@astrojs/react';

export default defineConfig({
  site: 'https://cord.flouvia.com',
  output: 'server',

  redirects: {
    '/login': '/sign-in',
    '/registro': '/sign-up',
  },

  integrations: [clerk({ localization: esMX, afterSignOutUrl: '/' }), react()],

  adapter: vercel(),

  vite: {
    // El SDK de MCP (@modelcontextprotocol/sdk) y sus deps (hono, zod compat)
    // mezclan CJS/ESM y rompen el SSR de Vite con "reading 'call'" si se dejan
    // como external. Forzar el bundle (noExternal) hace que Vite resuelva el
    // interop correctamente, tanto en dev como en el build de Vercel.
    ssr: {
      noExternal: ['@modelcontextprotocol/sdk'],
    },
  },
});
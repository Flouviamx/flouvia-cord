// @ts-check
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';
// import clerk from '@clerk/astro';

export default defineConfig({
  site: 'https://trato.flouvia.com',
  output: 'server',

  // TODO (André): cuando crees la app de Clerk para Trato (signup ABIERTO,
  // distinta a la del portal de Flouvia) pon las keys en .env y descomenta:
  // integrations: [clerk({ afterSignOutUrl: 'https://trato.flouvia.com/' })],
  integrations: [],

  adapter: vercel(),
});

// @ts-check
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';
import clerk from '@clerk/astro';
import { esMX } from '@clerk/localizations';

import react from '@astrojs/react';

export default defineConfig({
  site: 'https://cord.flouvia.com',
  output: 'server',

  integrations: [clerk({ localization: esMX, afterSignOutUrl: '/' }), react()],

  adapter: vercel(),
});
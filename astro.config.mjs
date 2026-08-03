// @ts-check
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';
import react from '@astrojs/react';
import mdx from '@astrojs/mdx';

export default defineConfig({
  site: 'https://cordhq.app',
  output: 'server',

  i18n: {
    locales: ['es', 'en'],
    defaultLocale: 'es',
    routing: {
      prefixDefaultLocale: false, // es → /  ·  en → /en/
      redirectToDefaultLocale: false,
    },
  },

  redirects: {
    '/login': '/sign-in',
    '/registro': '/sign-up',
    // Cord Elements se consolidó en /elements (página única y más completa: demo en
    // vivo + npm + tabs por framework + bento + FAQ). La ruta vieja de la plantilla de
    // desarrolladores queda como 301 para conservar el SEO. El dato `elements` sigue en
    // desarrolladores.ts porque /elements reutiliza sus blocks+faqs (fuente única).
    '/desarrolladores/elements': '/elements',
    '/en/desarrolladores/elements': '/en/elements',
  },
  // El sitemap NO usa @astrojs/sitemap (auto-genera /sitemap-index.xml con TODAS las
  // rutas SSR, incluidas las privadas de /app/*) — usamos el curado a mano en
  // src/pages/sitemap.xml.ts, que cubre solo lo público con hreflang ES/EN correcto.
  integrations: [react(), mdx()],
  adapter: vercel(),

  vite: {
    resolve: {
      preserveSymlinks: true,
    },
    // El SDK de MCP (@modelcontextprotocol/sdk) y sus deps (hono, zod compat)
    // mezclan CJS/ESM y rompen el SSR de Vite con "reading 'call'" si se dejan
    // como external. Forzar el bundle (noExternal) hace que Vite resuelva el
    // interop correctamente, tanto en dev como en el build de Vercel.
    //
    // gsap: los componentes del dev-blog (PixelDevs, PixelIcon, etc.) se montan
    // con client:load, así que Astro los renderiza también en SSR e importa gsap
    // en el servidor. gsap se publica como ESM puro (gsap/index.js usa `import`),
    // y el bundle serverless de Vercel lo carga como CommonJS → "Cannot use import
    // statement outside a module" (500 en dev-blog en prod; en dev de Vite no pasa
    // porque maneja ESM nativo). noExternal fuerza a Vite a empaquetarlo bien.
    ssr: {
      noExternal: ['@modelcontextprotocol/sdk', 'gsap'],
    },
  },
});
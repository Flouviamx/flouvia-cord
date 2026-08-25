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
    // Cord Invoicing vivía en /producto/internacional, un slug heredado de
    // cuando la página vendía multi-país y FX (2 de sus 3 bloques hablaban de
    // cobertura cambiaria, pisando /producto/divisas). La página ahora vende
    // facturación y la URL lo dice; el 301 conserva el SEO acumulado.
    '/producto/internacional': '/producto/facturacion',
    '/en/producto/internacional': '/en/producto/facturacion',
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
    build: {
      // Minificador de CSS pineado a esbuild A PROPÓSITO, no por preferencia.
      //
      // Astro 7.2 trae su propio Vite 8, y Vite 8 invirtió el default: ahora
      // `cssMinify: true` cae en lightningcss y sólo el string literal
      // 'esbuild' toma el camino de esbuild (en Vite 7 era al revés).
      //
      // lightningcss BORRA la propiedad estándar cuando el fuente declara
      // también el prefijo a mano — se queda sólo con la última de las dos:
      //   backdrop-filter + -webkit-backdrop-filter  →  SÓLO -webkit-
      // Este repo escribe el -webkit- al final en 54 declaraciones, así que
      // producción perdía `backdrop-filter` en 14 de 16 casos: sin blur en
      // Firefox, y como .topbar/.sidebar tienen fondo al 72% que DEPENDE del
      // blur, el chrome se veía translúcido. En dev no se minifica, por eso
      // sólo pasaba en producción.
      //
      // No basta con configurar targets: con ambas propiedades en el fuente
      // lightningcss colapsa igual. Y quitar los -webkit- a mano rompería
      // Safari, porque sin `cssTarget` lightningcss recibe `targets: {}` y no
      // regenera prefijos. esbuild conserva ambas y no reordena.
      //
      // scripts/css-build-check.mjs vigila que esto no vuelva en silencio.
      cssMinify: 'esbuild',
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
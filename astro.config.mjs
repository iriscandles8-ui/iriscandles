import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';

// Dominio provisional. Cambiar cuando se registre el dominio definitivo.
export default defineConfig({
  site: 'https://iriscandles.com',
  adapter: cloudflare(),
  integrations: [
    sitemap({
      filter: (page) =>
        !page.includes('/admin') && !page.includes('/carrito') && !page.includes('/checkout'),
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
    // El plugin de Cloudflare valida dist/server/entry.mjs durante el build;
    // vaciar dist lo borra antes de tiempo, así que limpiamos manualmente.
    build: {
      emptyOutDir: false,
    },
  },
});

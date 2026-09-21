import { defineConfig } from 'astro/config';

// https://astro.build
export default defineConfig({
  // --- DESPLIEGUE EN GITHUB PAGES ---
  // Si usas un dominio propio (ej. 4pr3nd1z.dev) deja `base` en '/'.
  // Si publicas en https://<usuario>.github.io/<repo>/  ->  base: '/<repo>/'
  // y site: 'https://<usuario>.github.io'
  site: 'https://beserker34.github.io',
  base: '/',
  build: {
    format: 'directory',
  },
});

import { defineConfig } from 'astro/config';

// The WASM build uses pthreads, so pages need cross-origin isolation.
const isolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
  site: 'https://lite4mariadb.shyim.de',
  // repl.html instead of repl/index.html, so Workers serves /repl without a redirect.
  build: { format: 'file' },
  vite: {
    server: { headers: isolation },
    preview: { headers: isolation },
  },
});

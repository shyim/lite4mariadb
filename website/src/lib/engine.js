// Loads the real WASM build when the page is cross-origin isolated (pthreads
// need SharedArrayBuffer), otherwise the mock. Both expose execMulti(sql).
const ENGINE_URL = '/engine/index.mjs';

export async function loadEngine() {
  if (globalThis.crossOriginIsolated) {
    try {
      const mod = await import(/* @vite-ignore */ ENGINE_URL);
      const engine = await mod.Lite4MariaDB.create();
      return { engine, real: true };
    } catch (e) {
      console.warn('lite4mariadb: real engine unavailable, using mock', e);
    }
  }
  const { createEngine } = await import('./repl-engine.js');
  return { engine: createEngine(), real: false };
}

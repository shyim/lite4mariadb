// Copies the published lite4mariadb build into public/engine so the shell can
// load it unbundled: the Emscripten glue spawns pthread workers from its own
// URL and probes Node-only modules, which a bundler would mangle.
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const src = fileURLToPath(new URL('../node_modules/lite4mariadb/dist/', import.meta.url));
const dest = fileURLToPath(new URL('../public/engine/', import.meta.url));

rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });
console.log('copied lite4mariadb dist → public/engine');

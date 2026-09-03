# lite4mariadb website

Landing page plus an in-browser SQL shell that runs the real MariaDB WASM
build. Built with [Astro](https://astro.build); the only client JavaScript is
the shell itself.

```sh
npm install
npm run dev        # http://localhost:4321
npm run build      # static output in dist/
```

## Pages

| Route | What it is |
| --- | --- |
| `/` | Landing: hero, highlights, usage samples per runtime, API table |
| `/repl` | Full-height shell with a collapsible code rail. `?run=example` runs the demo script on load |

## How the shell loads MariaDB

`npm run dev` and `npm run build` first copy `node_modules/lite4mariadb/dist`
into `public/engine/` (gitignored). The shell imports it from there at runtime
instead of bundling it, because the Emscripten glue spawns pthread workers
from its own URL and probes Node-only modules.

pthreads need `SharedArrayBuffer`, so the page must be cross-origin isolated.
The dev and preview servers send the headers; in production the host must:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

`public/_headers` covers Netlify and Cloudflare Pages. When the headers are
missing the shell falls back to the small mock engine in `src/lib/repl-engine.js`
and says so in its banner.

Bump the `lite4mariadb` dependency to change which build the shell runs; the
version badge in the nav reads from the installed package.

## Deploying to Cloudflare

The site ships as a Cloudflare Worker with static assets (`wrangler.jsonc`).
`public/_headers` sets the isolation headers on every response plus cache
policies for `/_astro/*` and `/engine/*`.

```sh
npx wrangler login
npm run deploy         # astro build + wrangler deploy
npm run preview:cf     # serve dist/ locally through wrangler, headers included
```

`.github/workflows/website.yml` deploys on every push to `main` that touches
`website/`, and only builds on pull requests. It needs two repository secrets:

| Secret | Value |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | API token with the *Workers Scripts: Edit* permission |
| `CLOUDFLARE_ACCOUNT_ID` | From the Workers overview page in the dashboard |

The worker is bound to the custom domain `lite4mariadb.shyim.de`
(`routes` in `wrangler.jsonc`). On the first deploy Cloudflare creates the DNS
record and certificate automatically, as long as the `shyim.de` zone is in the
same account the API token belongs to. The `workers.dev` subdomain is disabled.

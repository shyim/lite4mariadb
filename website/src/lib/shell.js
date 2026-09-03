import { EXAMPLE } from './samples.js';
import { formatError, formatResult } from './format.js';
import { loadEngine } from './engine.js';

const HISTORY_MAX = 100;
const PROMPT = 'MariaDB [test]> ';
const CONT = '    -> ';

/** Wires the shell markup inside `root` to an engine. */
export function mountShell(root) {
  const q = (sel) => root.querySelector(sel);
  const logEl = q('[data-log]');
  const linesEl = q('[data-lines]');
  const inputEl = q('[data-input]');
  const storageEl = q('[data-storage]');
  const engineEl = q('[data-engine]');

  const state = { engine: null, history: [], hIdx: -1 };

  function append(lines) {
    const frag = document.createDocumentFragment();
    for (const { kind, text } of lines) {
      const pre = document.createElement('pre');
      pre.dataset.kind = kind;
      pre.textContent = text;
      frag.appendChild(pre);
    }
    linesEl.appendChild(frag);
    logEl.scrollTop = logEl.scrollHeight;
  }

  function setInput(value) {
    inputEl.value = value;
    inputEl.rows = Math.max(1, value.split('\n').length);
  }

  function clear() {
    linesEl.replaceChildren();
  }

  async function run(sql) {
    const src = sql.trim();
    if (!src || !state.engine) return;
    const echo = src.split('\n').map((l, i) => (i === 0 ? PROMPT : CONT) + l).join('\n');
    const add = [{ kind: 'in', text: echo }];
    const t0 = performance.now();
    try {
      const results = await state.engine.execMulti(src);
      const ms = performance.now() - t0;
      for (const r of results) add.push(...formatResult(r, ms / results.length));
    } catch (e) {
      add.push(formatError(e));
    }
    add.push({ kind: 'note', text: '' });
    append(add);
    state.history = [src, ...state.history.filter((h) => h !== src)].slice(0, HISTORY_MAX);
    state.hIdx = -1;
    setInput('');
  }

  inputEl.addEventListener('input', () => {
    state.hIdx = -1;
    inputEl.rows = Math.max(1, inputEl.value.split('\n').length);
  });

  inputEl.addEventListener('keydown', (e) => {
    const v = inputEl.value;
    if (e.key === 'Enter' && !e.shiftKey) {
      if (/;\s*$/.test(v) || e.ctrlKey || e.metaKey) {
        e.preventDefault();
        run(v);
      }
      return;
    }
    if (e.key === 'ArrowUp' && !v.includes('\n')) {
      if (state.hIdx + 1 >= state.history.length) return;
      e.preventDefault();
      state.hIdx += 1;
      setInput(state.history[state.hIdx]);
      return;
    }
    if (e.key === 'ArrowDown' && !v.includes('\n')) {
      if (state.hIdx < 0) return;
      e.preventDefault();
      state.hIdx -= 1;
      setInput(state.hIdx < 0 ? '' : state.history[state.hIdx]);
      return;
    }
    if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault();
      clear();
    }
  });

  logEl.addEventListener('click', () => {
    if (window.getSelection()?.toString()) return;
    inputEl.focus();
  });
  q('[data-run-example]').addEventListener('click', () => run(EXAMPLE));
  q('[data-clear]').addEventListener('click', clear);

  async function boot() {
    const { engine, real } = await loadEngine();
    state.engine = engine;

    let version = '13.1.0-MariaDB';
    if (real) {
      try {
        version = String(engine.query('SELECT VERSION() AS v')[0]?.v ?? version);
      } catch {
        /* keep the default */
      }
    }
    append([
      { kind: 'note', text: 'Welcome to the lite4mariadb shell.' },
      { kind: 'note', text: `Server version: ${version} · WebAssembly` },
      { kind: 'note', text: 'Storage: memory:// — ephemeral. Every statement runs inside this tab.' },
      { kind: 'note', text: real ? 'Type SQL and press Enter. Ctrl+L clears the screen.' : 'Mock engine active — a small SQL subset. Serve with COOP/COEP headers to run the real WASM build.' },
      { kind: 'note', text: '' },
    ]);

    storageEl.textContent = `${engine.fsType ?? 'memory'}://`;
    engineEl.textContent = real ? 'lite4mariadb.wasm' : 'mock engine';
    inputEl.placeholder = 'SELECT VERSION();';
    inputEl.disabled = false;

    if (new URLSearchParams(location.search).get('run') === 'example') await run(EXAMPLE);
    inputEl.focus();
  }

  boot().catch((e) => append([{ kind: 'err', text: `Failed to start the shell: ${e.message}` }]));
}

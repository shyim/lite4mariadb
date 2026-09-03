const pad = (s, n, right) => (right ? String(s).padStart(n) : String(s).padEnd(n));

const cell = (v) => {
  if (v === null || v === undefined) return 'NULL';
  if (v instanceof Uint8Array) return `0x${Array.from(v, (b) => b.toString(16).padStart(2, '0')).join('')}`;
  return String(v);
};

const isNumeric = (v) => typeof v === 'number' || typeof v === 'bigint' || v === null;

/** Render one ExecResult the way the mysql CLI does. */
export function formatResult(res, ms) {
  const t = `(${(ms / 1000).toFixed(3)} sec)`;
  if (!res.fields) {
    const n = res.affected ?? 0;
    return [{ kind: 'ok', text: `Query OK, ${n} row${n === 1 ? '' : 's'} affected ${t}` }];
  }
  if (!res.rows.length) return [{ kind: 'ok', text: `Empty set ${t}` }];
  const cells = res.rows.map((r) => res.fields.map((f) => cell(r[f])));
  const widths = res.fields.map((f, i) => Math.max(f.length, ...cells.map((c) => c[i].length)));
  const numeric = res.fields.map((f) => res.rows.every((r) => isNumeric(r[f])));
  const rule = '+' + widths.map((w) => '-'.repeat(w + 2)).join('+') + '+';
  const line = (c) => '| ' + c.map((v, i) => pad(v, widths[i], numeric[i])).join(' | ') + ' |';
  const out = [rule, line(res.fields), rule, ...cells.map(line), rule].join('\n');
  const n = res.rows.length;
  return [{ kind: 'out', text: out }, { kind: 'ok', text: `${n} row${n === 1 ? '' : 's'} in set ${t}` }];
}

export function formatError(e) {
  return { kind: 'err', text: `ERROR ${e.errno ?? 2013} (${e.sqlstate ?? 'HY000'}): ${e.message}` };
}

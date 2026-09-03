// Mock engine with the same surface as `lite4mariadb`'s instance API
// (execMulti(sql) -> ExecResult[]; errors carry errno + sqlstate).
// To wire the real thing: `const db = await Lite4MariaDB.create()` and pass
// `db` wherever `createEngine()` is used — the REPL only calls execMulti().

const ERR = (errno, sqlstate, message) => Object.assign(new Error(message), { errno, sqlstate });

function splitStatements(sql) {
  const out = []; let cur = ''; let q = null;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    if (q) { cur += c; if (c === q && sql[i - 1] !== '\\') q = null; continue; }
    if (c === "'" || c === '"' || c === '`') { q = c; cur += c; continue; }
    if (c === ';') { if (cur.trim()) out.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function parseValue(tok, row) {
  tok = tok.trim();
  if (/^null$/i.test(tok)) return null;
  if (/^true$/i.test(tok)) return 1;
  if (/^false$/i.test(tok)) return 0;
  if (/^'.*'$/s.test(tok) || /^".*"$/s.test(tok)) return tok.slice(1, -1).replace(/\\'/g, "'").replace(/''/g, "'");
  if (/^-?\d+(\.\d+)?$/.test(tok)) return Number(tok);
  if (row && tok in row) return row[tok];
  if (row && tok.replace(/`/g, '') in row) return row[tok.replace(/`/g, '')];
  throw ERR(1054, '42S22', `Unknown column '${tok}' in 'field list'`);
}

function splitTop(s, sep = ',') {
  const out = []; let cur = ''; let depth = 0; let q = null;
  for (const c of s) {
    if (q) { cur += c; if (c === q) q = null; continue; }
    if (c === "'" || c === '"') { q = c; cur += c; continue; }
    if (c === '(') depth++; if (c === ')') depth--;
    if (c === sep && depth === 0) { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim()) out.push(cur);
  return out.map(x => x.trim());
}

const VERSION = '13.1.0-MariaDB-lite4mariadb';

function evalExpr(expr, row) {
  const e = expr.trim();
  let m;
  if (/^version\(\)$/i.test(e)) return VERSION;
  if (/^now\(\)$/i.test(e) || /^current_timestamp(\(\))?$/i.test(e)) return new Date().toISOString().slice(0, 19).replace('T', ' ');
  if (/^curdate\(\)$/i.test(e)) return new Date().toISOString().slice(0, 10);
  if (/^database\(\)$/i.test(e)) return 'test';
  if (/^user\(\)$/i.test(e)) return 'root@localhost';
  if ((m = e.match(/^upper\((.+)\)$/i))) return String(evalExpr(m[1], row)).toUpperCase();
  if ((m = e.match(/^lower\((.+)\)$/i))) return String(evalExpr(m[1], row)).toLowerCase();
  if ((m = e.match(/^length\((.+)\)$/i))) return String(evalExpr(m[1], row)).length;
  if ((m = e.match(/^concat\((.+)\)$/i))) return splitTop(m[1]).map(p => evalExpr(p, row)).join('');
  if ((m = e.match(/^json_object\((.+)\)$/i))) { const p = splitTop(m[1]); const o = {}; for (let i = 0; i < p.length; i += 2) o[evalExpr(p[i], row)] = evalExpr(p[i + 1], row); return JSON.stringify(o); }
  if (/^[\d\s+\-*/().]+$/.test(e) && /\d/.test(e)) { try { return Function(`"use strict";return (${e})`)(); } catch { /* fallthrough */ } }
  return parseValue(e, row);
}

function cmp(a, b) {
  if (a === null) return b === null ? 0 : -1; if (b === null) return 1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b));
}

function makeWhere(where) {
  if (!where) return () => true;
  const conds = where.split(/\s+and\s+/i).map(c => {
    const m = c.match(/^(.+?)\s*(>=|<=|<>|!=|=|>|<|\slike\s)\s*(.+)$/i);
    if (!m) throw ERR(1064, '42000', `You have an error in your SQL syntax near '${c}'`);
    return { l: m[1].trim(), op: m[2].trim().toLowerCase(), r: m[3].trim() };
  });
  return row => conds.every(({ l, op, r }) => {
    const a = evalExpr(l, row), b = evalExpr(r, row);
    switch (op) {
      case '=': return cmp(a, b) === 0; case '<>': case '!=': return cmp(a, b) !== 0;
      case '>': return cmp(a, b) > 0; case '<': return cmp(a, b) < 0;
      case '>=': return cmp(a, b) >= 0; case '<=': return cmp(a, b) <= 0;
      case 'like': return new RegExp('^' + String(b).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.') + '$', 'i').test(String(a));
    }
    return false;
  });
}

export function createEngine() {
  const tables = new Map();
  const table = (name) => {
    const t = tables.get(name.replace(/`/g, '').toLowerCase());
    if (!t) throw ERR(1146, '42S02', `Table 'test.${name.replace(/`/g, '')}' doesn't exist`);
    return t;
  };

  function run(stmt) {
    const s = stmt.replace(/\s+/g, ' ').trim();
    let m;
    if ((m = s.match(/^create table (?:if not exists )?`?(\w+)`? ?\((.+)\)(?: engine=\w+)?(?: .*)?$/i))) {
      const name = m[1].toLowerCase();
      if (tables.has(name)) { if (/if not exists/i.test(s)) return { ok: true, affected: 0, rows: [] }; throw ERR(1050, '42S01', `Table '${m[1]}' already exists`); }
      const cols = splitTop(m[2]).filter(c => !/^(primary key|unique|key|index|foreign key|constraint)/i.test(c)).map(c => {
        const p = c.match(/^`?(\w+)`?\s+([\w()]+(?:\s+unsigned)?)(.*)$/i);
        return { name: p[1], type: p[2].toUpperCase(), auto: /auto_increment/i.test(p[3] || ''), pk: /primary key/i.test(p[3] || ''), notnull: /not null/i.test(p[3] || '') };
      });
      tables.set(name, { name: m[1], cols, rows: [], seq: 0 });
      return { ok: true, affected: 0, rows: [] };
    }
    if ((m = s.match(/^drop table (?:if exists )?`?(\w+)`?$/i))) {
      const name = m[1].toLowerCase();
      if (!tables.has(name) && !/if exists/i.test(s)) throw ERR(1051, '42S02', `Unknown table 'test.${m[1]}'`);
      tables.delete(name); return { ok: true, affected: 0, rows: [] };
    }
    if ((m = s.match(/^insert into `?(\w+)`?(?: ?\(([^)]+)\))? values (.+)$/i))) {
      const t = table(m[1]);
      const cols = m[2] ? m[2].split(',').map(c => c.trim().replace(/`/g, '')) : t.cols.map(c => c.name);
      const tuples = splitTop(m[3]).map(x => x.replace(/^\((.*)\)$/s, '$1'));
      for (const tup of tuples) {
        const vals = splitTop(tup).map(v => parseValue(v));
        if (vals.length !== cols.length) throw ERR(1136, '21S01', "Column count doesn't match value count at row 1");
        const row = {}; t.cols.forEach(c => { row[c.name] = null; });
        cols.forEach((c, i) => { row[c] = vals[i]; });
        t.cols.forEach(c => { if (c.auto && row[c.name] === null) row[c.name] = ++t.seq; else if (c.auto && typeof row[c.name] === 'number') t.seq = Math.max(t.seq, row[c.name]); });
        const pk = t.cols.find(c => c.pk);
        if (pk && t.rows.some(r => r[pk.name] === row[pk.name])) throw ERR(1062, '23000', `Duplicate entry '${row[pk.name]}' for key 'PRIMARY'`);
        t.rows.push(row);
      }
      return { ok: true, affected: tuples.length, rows: [] };
    }
    if ((m = s.match(/^update `?(\w+)`? set (.+?)(?: where (.+))?$/i))) {
      const t = table(m[1]); const w = makeWhere(m[3]); let n = 0;
      const sets = splitTop(m[2]).map(x => { const p = x.split('='); return { c: p[0].trim().replace(/`/g, ''), e: p.slice(1).join('=') }; });
      t.rows.forEach(r => { if (w(r)) { sets.forEach(({ c, e }) => { r[c] = evalExpr(e, r); }); n++; } });
      return { ok: true, affected: n, rows: [] };
    }
    if ((m = s.match(/^delete from `?(\w+)`?(?: where (.+))?$/i))) {
      const t = table(m[1]); const w = makeWhere(m[2]); const before = t.rows.length;
      t.rows = t.rows.filter(r => !w(r)); return { ok: true, affected: before - t.rows.length, rows: [] };
    }
    if (/^show tables$/i.test(s)) return { ok: true, fields: ['Tables_in_test'], rows: [...tables.values()].map(t => ({ Tables_in_test: t.name })) };
    if (/^show databases$/i.test(s)) return { ok: true, fields: ['Database'], rows: ['information_schema', 'mysql', 'performance_schema', 'test'].map(d => ({ Database: d })) };
    if ((m = s.match(/^(?:describe|desc|explain) `?(\w+)`?$/i))) {
      const t = table(m[1]);
      return { ok: true, fields: ['Field', 'Type', 'Null', 'Key', 'Default', 'Extra'], rows: t.cols.map(c => ({ Field: c.name, Type: c.type.toLowerCase(), Null: c.notnull || c.pk ? 'NO' : 'YES', Key: c.pk ? 'PRI' : '', Default: null, Extra: c.auto ? 'auto_increment' : '' })) };
    }
    if (/^(begin|start transaction|commit|rollback|set |use )/i.test(s)) return { ok: true, affected: 0, rows: [] };
    if ((m = s.match(/^select (.+?)(?: from `?(\w+)`?(?: where (.+?))?(?: order by (\w+)( desc| asc)?)?(?: limit (\d+))?)?$/i))) {
      const exprs = splitTop(m[1]);
      let src = [{}];
      if (m[2]) { src = table(m[2]).rows.filter(makeWhere(m[3])); if (m[4]) { const k = m[4]; const d = /desc/i.test(m[5] || '') ? -1 : 1; src = [...src].sort((a, b) => cmp(a[k], b[k]) * d); } }
      const agg = exprs.find(e => /^count\(\*\)/i.test(e));
      let fields = [], rows;
      if (agg) {
        fields = exprs.map(e => { const a = e.match(/\s+as\s+`?(\w+)`?$/i); return a ? a[1] : e.trim(); });
        rows = [{ [fields[0]]: src.length }];
      } else if (exprs.length === 1 && exprs[0] === '*') {
        if (!m[2]) throw ERR(1096, 'HY000', 'No tables used');
        fields = table(m[2]).cols.map(c => c.name); rows = src.map(r => ({ ...r }));
      } else {
        const specs = exprs.map(e => { const a = e.match(/^(.+?)\s+as\s+`?(\w+)`?$/i); return { expr: a ? a[1] : e, name: a ? a[2] : e.replace(/`/g, '') }; });
        fields = specs.map(x => x.name);
        rows = src.map(r => Object.fromEntries(specs.map(x => [x.name, evalExpr(x.expr, r)])));
      }
      if (m[6]) rows = rows.slice(0, Number(m[6]));
      return { ok: true, fields, rows };
    }
    throw ERR(1064, '42000', `You have an error in your SQL syntax; check the manual that corresponds to your MariaDB server version for the right syntax to use near '${s.slice(0, 40)}' at line 1`);
  }

  return {
    fsType: 'memory',
    version: VERSION,
    execMulti(sql) { return splitStatements(sql).map(run); },
    exec(sql) { return run(sql); },
    query(sql) { return run(sql).rows; },
    async close() { tables.clear(); },
  };
}

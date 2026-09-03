import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Lite4MariaDB } from '../dist/index.mjs';

test('CREATE / INSERT / SELECT round-trip on shipped API', async () => {
  const db = await Lite4MariaDB.create();
  try {
    db.exec('DROP TABLE IF EXISTS roundtrip');
    db.exec(
      "CREATE TABLE roundtrip (id INT PRIMARY KEY, v VARCHAR(64)) ENGINE=InnoDB"
    );
    db.exec("INSERT INTO roundtrip VALUES (1, 'hello-wasm')");
    const rows = db.query('SELECT v FROM roundtrip WHERE id = 1');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].v, 'hello-wasm');
  } finally {
    db.close();
  }
});

test('TEXT values containing NUL bytes survive subquery/JOIN reads', async () => {
  // PHP-serialized objects (Shopware cheapest_price) embed \0 in protected
  // property names; the row export must use mysql_fetch_lengths, not strlen.
  const db = await Lite4MariaDB.create();
  try {
    db.exec('DROP TABLE IF EXISTS nul_rt');
    db.exec(
      'CREATE TABLE nul_rt (id INT PRIMARY KEY, parent_id INT NULL, v LONGTEXT) ENGINE=InnoDB'
    );
    const payload = 'a:2:{s:4:"\0*\0x";s:300:"' + 'y'.repeat(300) + '";}';
    // \0 as SQL escape (raw NUL would terminate the C string at the ccall boundary)
    db.query(
      "INSERT INTO nul_rt VALUES (1, NULL, 'a:2:{s:4:\"\\0*\\0x\";s:300:\"" +
        'y'.repeat(300) +
        "\";}')"
    );
    db.query('INSERT INTO nul_rt VALUES (2, 1, NULL)');
    const direct = db.query('SELECT v FROM nul_rt WHERE id = 1');
    assert.equal(direct[0].v, payload, 'direct read');
    const sub = db.query(
      'SELECT (SELECT p.v FROM nul_rt p WHERE p.id = nul_rt.parent_id) AS inh FROM nul_rt WHERE id = 2'
    );
    assert.equal(sub[0].inh, payload, 'scalar subquery read');
    const join = db.query(
      'SELECT parent.v AS inh FROM nul_rt LEFT JOIN nul_rt parent ON parent.id = nul_rt.parent_id WHERE nul_rt.id = 2'
    );
    assert.equal(join[0].inh, payload, 'JOIN read');
  } finally {
    db.close();
  }
});

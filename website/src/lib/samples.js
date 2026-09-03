export const INSTALL_CMD = 'npm i lite4mariadb';

export const SAMPLES = {
  node: {
    label: 'Node.js',
    code: `import { Lite4MariaDB } from 'lite4mariadb';

const db = await Lite4MariaDB.create({ dataDir: './my-data' });

db.exec('CREATE TABLE users (id INT PRIMARY KEY, name VARCHAR(64)) ENGINE=InnoDB');
db.exec('INSERT INTO users VALUES (?, ?)', [1, "O'Brien"]);

const rows = db.query('SELECT * FROM users WHERE id = ?', [1]);
// => [ { id: 1, name: "O'Brien" } ]

await db.close();`,
    note: 'A datadir that already holds a database is resumed on open — InnoDB recovery runs, and your data is back.',
  },
  browser: {
    label: 'Browser',
    code: `import { Lite4MariaDB } from 'lite4mariadb';

// one IndexedDB database per name
const db = await Lite4MariaDB.create({ dataDir: 'idb://my-app' });

db.exec('CREATE TABLE notes (id INT AUTO_INCREMENT PRIMARY KEY, body TEXT)');
db.exec('INSERT INTO notes (body) VALUES (?)', ['hello from the tab']);

await db.persist();   // hard flush; writes are otherwise debounced
await db.close();`,
    note: 'The build uses pthreads, so serve with Cross-Origin-Opener-Policy: same-origin and Cross-Origin-Embedder-Policy: require-corp.',
  },
  worker: {
    label: 'Worker',
    code: `import { Lite4MariaDBWorker } from 'lite4mariadb/worker';

// same API, every method async, main thread stays free
const db = await Lite4MariaDBWorker.create({ dataDir: 'idb://my-app' });

const rows = await db.query('SELECT * FROM users');
await db.close();`,
    note: 'Works in Node via worker_threads too. Pass your own Worker running dist/worker-entry.mjs as the second argument to customize loading.',
  },
};

export const API = [
  ['create(opts?)', 'memory:// (default), file:// in Node, idb:// in the browser'],
  ['query(sql, params?)', 'Rows as objects, coerced JS types'],
  ['exec(sql, params?)', '{ ok, affected, rows, fields }'],
  ['execMulti(sql)', 'A whole script, one result per statement'],
  ['transaction(cb)', 'BEGIN / COMMIT, ROLLBACK on throw'],
  ['dumpDataDir()', 'Gzipped tar snapshot, restorable via loadDataDir'],
  ['close()', 'Flushes idb:// first'],
];

export const EXAMPLE = `CREATE TABLE users (id INT PRIMARY KEY, name VARCHAR(64)) ENGINE=InnoDB;
INSERT INTO users VALUES (1, 'O''Brien'), (2, 'Widenius');
SELECT * FROM users WHERE id = 1;`;

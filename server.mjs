import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import worker from './worker.mjs';

const sqlite = new DatabaseSync(new URL('./demand.sqlite', import.meta.url));
if (!sqlite.prepare("SELECT 1 FROM sqlite_master WHERE name='visits'").get()) {
  sqlite.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
}
const DB = {
  prepare(sql) {
    return {
      bind(...values) {
        const stmt = sqlite.prepare(sql);
        return { run: () => stmt.run(...values), all: () => ({ results: stmt.all(...values) }), first: () => stmt.get(...values) };
      },
      first: () => sqlite.prepare(sql).get()
    };
  },
  batch(statements) {
    sqlite.exec('BEGIN');
    try {
      statements.forEach(stmt => stmt.run());
      sqlite.exec('COMMIT');
    } catch (error) {
      sqlite.exec('ROLLBACK');
      throw error;
    }
  }
};
const port = Number(process.env.PORT || 4173);
createServer(async (incoming, outgoing) => {
  try {
    const request = new Request(`http://${incoming.headers.host}${incoming.url}`, {
      method: incoming.method,
      headers: incoming.headers,
      ...(incoming.method === 'POST' ? { body: incoming, duplex: 'half' } : {})
    });
    const response = await worker.fetch(request, { DB });
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    outgoing.writeHead(500).end('Ошибка сервера');
  }
}).listen(port, process.env.HOST || '127.0.0.1', () => console.log(`http://127.0.0.1:${port}`));

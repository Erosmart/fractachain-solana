/**
 * Postgres write-through persistence.
 *
 * Each module keeps its in-memory state and JSON-file cache exactly as before,
 * but every save() also upserts the document into the `kv_store` table. On the
 * next deploy, `dist/pg_restore.js` rewrites the files from Postgres before
 * the modules snapshot them — the DB is the source of truth, files are cache.
 */
import { Pool } from 'pg';

let pool: Pool | null | undefined;
let queue: Promise<unknown> = Promise.resolve();

function getPool(): Pool | null {
  if (pool === undefined) {
    pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL }) : null;
  }
  return pool;
}

/** Queued upsert — saves are infrequent, one write per call is fine. */
export function persistToPg(key: string, data: unknown) {
  const p = getPool();
  if (!p) return;
  queue = queue
    .then(() =>
      p.query(
        'INSERT INTO kv_store (key, data, updated_at) VALUES ($1, $2, now()) ' +
          'ON CONFLICT (key) DO UPDATE SET data = $2, updated_at = now()',
        [key, JSON.stringify(data)],
      ),
    )
    .catch((e) => console.error(`[pg] persist ${key}:`, e.message));
}

export async function flushPg() {
  await queue.catch(() => undefined);
}

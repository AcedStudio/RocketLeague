import "server-only";
import { Pool, neonConfig, type PoolClient } from "@neondatabase/serverless";

if (typeof globalThis.WebSocket !== "undefined") neonConfig.webSocketConstructor = globalThis.WebSocket;

export function databaseUrl(): string | null {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || null;
}

export function dbConfigured(): boolean {
  return databaseUrl() !== null;
}

let pool: Pool | null = null;
function getPool(): Pool {
  const url = databaseUrl();
  if (!url) throw new Error("База данных не настроена (DATABASE_URL)");
  if (!pool) pool = new Pool({ connectionString: url, max: 5 });
  return pool;
}

export type Queryable = Pick<PoolClient, "query">;

export async function q<T = Record<string, unknown>>(text: string, params: unknown[] = [], client?: Queryable): Promise<T[]> {
  const res = await (client ?? getPool()).query(text, params as unknown[]);
  return res.rows as T[];
}

export async function one<T = Record<string, unknown>>(text: string, params: unknown[] = [], client?: Queryable): Promise<T | null> {
  const rows = await q<T>(text, params, client);
  return rows[0] ?? null;
}

/** Runs fn inside a transaction. Throwing rolls everything back. */
export async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const out = await fn(client);
    await client.query("commit");
    return out;
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** Serialises concurrent writers on one competition (capacity, numbering, draws). */
export async function lockCompetition(c: Queryable, competitionId: string) {
  await c.query("select pg_advisory_xact_lock(hashtext($1))", [competitionId]);
}

export function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";
}

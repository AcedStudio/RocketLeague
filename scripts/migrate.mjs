// Applies db/schema.sql. Runs before every build; the schema is idempotent.
import { readFileSync } from "node:fs";
import { Pool, neonConfig } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!url) {
  console.warn("[migrate] DATABASE_URL is not set, skipping migration. The site will show a setup notice.");
  process.exit(0);
}

if (typeof globalThis.WebSocket !== "undefined") neonConfig.webSocketConstructor = globalThis.WebSocket;

const sql = readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8");
const pool = new Pool({ connectionString: url });
try {
  await pool.query(sql);
  console.log("[migrate] schema is up to date");
} catch (err) {
  console.error("[migrate] failed:", err);
  process.exitCode = 1;
} finally {
  await pool.end();
}

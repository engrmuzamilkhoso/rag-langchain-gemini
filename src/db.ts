// ─────────────────────────────────────────────────────────────
// ONE DATABASE CONNECTION, shared by the whole app
// ─────────────────────────────────────────────────────────────
import { existsSync, readFileSync } from "node:fs";
import pg from "pg";
import { config } from "./config.js";

// Keep DATE columns as plain text ("2026-09-03"), so no timezone shifts the day
pg.types.setTypeParser(1082, (value) => value);

// Local Docker: no SSL. Anything else (Supabase): always encrypted.
function sslOptions(): pg.PoolConfig["ssl"] {
  const host = new URL(config.databaseUrl).hostname;
  if (host === "localhost" || host === "127.0.0.1") return false;

  // With Supabase's certificate we also check the server is really Supabase
  if (existsSync(config.databaseCaFile)) return { ca: readFileSync(config.databaseCaFile, "utf8") };

  console.warn(
    `⚠️  ${config.databaseCaFile} not found: the connection is encrypted but the server is NOT verified.\n` +
      "   Download it from Supabase → Project Settings → Database → SSL Configuration.",
  );
  return { rejectUnauthorized: false };
}

export const pool = new pg.Pool({ connectionString: config.databaseUrl, ssl: sslOptions() });

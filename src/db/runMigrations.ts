import fs from "node:fs/promises";
import path from "node:path";

import { sql } from "drizzle-orm";

import type { DB } from "./client.js";

export async function runMigrations(db: DB, migrationsDir = path.resolve("src/db/migrations")): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const files = (await fs.readdir(migrationsDir))
    .filter((f) => f.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));

  for (const file of files) {
    const existing = await db.execute(sql`SELECT filename FROM schema_migrations WHERE filename = ${file} LIMIT 1`);
    if (existing.rowCount && existing.rowCount > 0) {
      continue;
    }

    const contents = await fs.readFile(path.join(migrationsDir, file), "utf8");
    await db.execute(sql.raw(contents));
    await db.execute(sql`INSERT INTO schema_migrations(filename) VALUES (${file})`);
  }
}

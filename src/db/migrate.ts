import { loadEnv } from "../config/env.js";
import { createDB, createPool } from "./client.js";
import { runMigrations } from "./runMigrations.js";

async function main(): Promise<void> {
  const config = loadEnv();
  const pool = createPool(config);
  const db = createDB(pool);
  await runMigrations(db);
  console.log("migrations complete");

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

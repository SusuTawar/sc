import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import type { EnvConfig } from "../config/env.js";
import * as schema from "./schema.js";

export function createPool(config: EnvConfig): Pool {
  return new Pool({
    connectionString: config.SC_DB_DSN
  });
}

export function createDB(pool: Pool) {
  return drizzle(pool, { schema });
}

export type DB = ReturnType<typeof createDB>;

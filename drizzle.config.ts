import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.SC_DB_DSN ?? "postgres://postgres:postgres@127.0.0.1:5432/servercommander"
  }
});

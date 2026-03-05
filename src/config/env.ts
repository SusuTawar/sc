import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  SC_HTTP_PORT: z.coerce.number().int().positive().default(8080),
  SC_DB_DSN: z.string().min(1),
  SC_WEBHOOK_SECRET: z.string().min(12),
  SC_API_TOKEN: z.string().min(12),
  SC_WEBHOOK_MAX_BYTES: z.coerce.number().int().positive().default(2 * 1024 * 1024 * 1024),
  SC_WEBHOOK_SKEW_SEC: z.coerce.number().int().positive().default(300),
  SC_UPLOAD_TMP_DIR: z.string().default("/tmp/servercommander"),
  SC_DISCORD_ENABLED: z
    .string()
    .optional()
    .transform((v) => (v ? v === "true" || v === "1" : true)),
  SC_DISCORD_BOT_TOKEN: z.string().optional().default(""),
  SC_DISCORD_GUILD_ID: z.string().optional().default(""),
  SC_DISCORD_OPERATOR_IDS: z.string().optional().default(""),
  SC_DOCKER_EDGE_NETWORK: z.string().default("edge"),
  SC_CADDY_MODE: z.literal("docker-proxy").default("docker-proxy"),
  SC_LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error"]).default("info"),
  SC_AUTO_CREATE_APP: z
    .string()
    .optional()
    .transform((v) => (v ? v === "true" || v === "1" : false)),
  SC_REPLAY_TTL_SEC: z.coerce.number().int().positive().default(600),
  SC_RUN_MIGRATIONS_ON_BOOT: z
    .string()
    .optional()
    .transform((v) => (v ? v === "true" || v === "1" : true))
});

export type EnvConfig = z.infer<typeof envSchema> & {
  operatorIds: Set<string>;
};

export function loadEnv(): EnvConfig {
  const parsed = envSchema.parse(process.env);
  if (parsed.SC_DISCORD_ENABLED) {
    if (!parsed.SC_DISCORD_BOT_TOKEN || !parsed.SC_DISCORD_GUILD_ID || !parsed.SC_DISCORD_OPERATOR_IDS) {
      throw new Error("discord is enabled but bot token/guild/operator IDs are not fully configured");
    }
  }

  const operatorIds = new Set(parsed.SC_DISCORD_OPERATOR_IDS.split(",").map((x) => x.trim()).filter(Boolean));

  return {
    ...parsed,
    operatorIds
  };
}

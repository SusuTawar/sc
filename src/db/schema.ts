import {
  bigint,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
  varchar
} from "drizzle-orm/pg-core";

export const apps = pgTable(
  "apps",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 120 }).notNull().unique(),
    defaultInternalPort: integer("default_internal_port").notNull().default(8080),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    nameIdx: index("apps_name_idx").on(t.name)
  })
);

export const appEnvConfig = pgTable(
  "app_env_config",
  {
    id: serial("id").primaryKey(),
    appId: integer("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    env: varchar("env", { length: 20 }).notNull(),
    domain: text("domain"),
    internalPort: integer("internal_port").notNull().default(8080),
    envJson: jsonb("env_json").notNull().default({}),
    network: varchar("network", { length: 120 }).notNull().default("edge"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    appEnvUnique: unique("app_env_config_app_env_uniq").on(t.appId, t.env),
    appEnvIdx: index("app_env_config_app_env_idx").on(t.appId, t.env)
  })
);

export const artifacts = pgTable(
  "artifacts",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
    appId: integer("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    env: varchar("env", { length: 20 }).notNull(),
    tag: varchar("tag", { length: 128 }).notNull(),
    imageRepo: text("image_repo").notNull(),
    imageRef: text("image_ref").notNull(),
    dockerImageId: text("docker_image_id"),
    source: varchar("source", { length: 80 }).notNull().default("circleci"),
    uploadedBy: text("uploaded_by"),
    status: varchar("status", { length: 20 }).notNull().default("uploaded"),
    sha256: text("sha256"),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    loadedAt: timestamp("loaded_at", { withTimezone: true }),
    prunedAt: timestamp("pruned_at", { withTimezone: true })
  },
  (t) => ({
    appEnvTagUnique: unique("artifacts_app_env_tag_uniq").on(t.appId, t.env, t.tag),
    appEnvCreatedIdx: index("artifacts_app_env_created_idx").on(t.appId, t.env, t.createdAt)
  })
);

export const deployments = pgTable(
  "deployments",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
    appId: integer("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    env: varchar("env", { length: 20 }).notNull(),
    artifactId: bigint("artifact_id", { mode: "number" }).references(() => artifacts.id, {
      onDelete: "set null"
    }),
    imageRef: text("image_ref").notNull(),
    containerName: text("container_name").notNull(),
    status: varchar("status", { length: 20 }).notNull().default("running"),
    domain: text("domain"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    appEnvUpdatedIdx: index("deployments_app_env_updated_idx").on(t.appId, t.env, t.updatedAt)
  })
);

export const deploymentActions = pgTable("deployment_actions", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
  deploymentId: bigint("deployment_id", { mode: "number" }).references(() => deployments.id, {
    onDelete: "set null"
  }),
  action: varchar("action", { length: 20 }).notNull(),
  actor: text("actor").notNull(),
  result: varchar("result", { length: 20 }).notNull(),
  message: text("message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const webhookReplayGuard = pgTable(
  "webhook_replay_guard",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
    signature: text("signature").notNull(),
    timestampSec: bigint("timestamp_sec", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    sigUnique: unique("webhook_replay_guard_sig_ts_uniq").on(t.signature, t.timestampSec),
    createdIdx: index("webhook_replay_guard_created_idx").on(t.createdAt)
  })
);

export type DBApp = typeof apps.$inferSelect;
export type DBArtifact = typeof artifacts.$inferSelect;
export type DBDeployment = typeof deployments.$inferSelect;

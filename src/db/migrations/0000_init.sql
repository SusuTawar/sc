CREATE TABLE IF NOT EXISTS schema_migrations (
  filename TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS apps (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL UNIQUE,
  default_internal_port INTEGER NOT NULL DEFAULT 8080,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS apps_name_idx ON apps(name);

CREATE TABLE IF NOT EXISTS app_env_config (
  id SERIAL PRIMARY KEY,
  app_id INTEGER NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  env VARCHAR(20) NOT NULL,
  domain TEXT,
  internal_port INTEGER NOT NULL DEFAULT 8080,
  env_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  network VARCHAR(120) NOT NULL DEFAULT 'edge',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT app_env_config_app_env_uniq UNIQUE(app_id, env)
);

CREATE INDEX IF NOT EXISTS app_env_config_app_env_idx ON app_env_config(app_id, env);

CREATE TABLE IF NOT EXISTS artifacts (
  id BIGSERIAL PRIMARY KEY,
  app_id INTEGER NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  env VARCHAR(20) NOT NULL,
  tag VARCHAR(128) NOT NULL,
  image_repo TEXT NOT NULL,
  image_ref TEXT NOT NULL,
  docker_image_id TEXT,
  source VARCHAR(80) NOT NULL DEFAULT 'circleci',
  uploaded_by TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'uploaded',
  sha256 TEXT,
  size_bytes BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  loaded_at TIMESTAMPTZ,
  pruned_at TIMESTAMPTZ,
  CONSTRAINT artifacts_app_env_tag_uniq UNIQUE(app_id, env, tag)
);

CREATE INDEX IF NOT EXISTS artifacts_app_env_created_idx ON artifacts(app_id, env, created_at DESC);

CREATE TABLE IF NOT EXISTS deployments (
  id BIGSERIAL PRIMARY KEY,
  app_id INTEGER NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  env VARCHAR(20) NOT NULL,
  artifact_id BIGINT REFERENCES artifacts(id) ON DELETE SET NULL,
  image_ref TEXT NOT NULL,
  container_name TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'running',
  domain TEXT,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS deployments_app_env_updated_idx ON deployments(app_id, env, updated_at DESC);

CREATE TABLE IF NOT EXISTS deployment_actions (
  id BIGSERIAL PRIMARY KEY,
  deployment_id BIGINT REFERENCES deployments(id) ON DELETE SET NULL,
  action VARCHAR(20) NOT NULL,
  actor TEXT NOT NULL,
  result VARCHAR(20) NOT NULL,
  message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS webhook_replay_guard (
  id BIGSERIAL PRIMARY KEY,
  signature TEXT NOT NULL,
  timestamp_sec BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT webhook_replay_guard_sig_ts_uniq UNIQUE(signature, timestamp_sec)
);

CREATE INDEX IF NOT EXISTS webhook_replay_guard_created_idx ON webhook_replay_guard(created_at);

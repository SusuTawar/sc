export type EnvName = "dev" | "staging" | "prod";

export type ArtifactStatus = "uploaded" | "ready" | "failed" | "pruned";

export type DeploymentStatus = "running" | "stopped" | "deleted" | "failed";

export type ActionType = "deploy" | "restart" | "stop" | "delete" | "prune";

export function normalizeEnv(value: string): EnvName {
  const lower = value.trim().toLowerCase();
  if (lower === "main") {
    return "prod";
  }
  if (lower === "dev" || lower === "staging" || lower === "prod") {
    return lower;
  }
  throw new Error(`unsupported env "${value}"`);
}

export function containerName(app: string, env: EnvName): string {
  const slug = app
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `sc-${slug}-${env}`;
}

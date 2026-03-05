import { and, desc, eq } from "drizzle-orm";

import type { EnvConfig } from "../config/env.js";
import type { DB } from "../db/client.js";
import { appEnvConfig, apps, artifacts, deploymentActions, deployments } from "../db/schema.js";
import { DockerClient } from "../docker/client.js";
import { containerName, normalizeEnv, type EnvName } from "../types/domain.js";
import { buildCaddyDockerProxyLabels } from "./caddy.js";

type DeployInput = {
  app: string;
  env: string;
  tag: string;
  actor: string;
  domain?: string;
  internalPort?: number;
};

type DeploymentTarget = {
  appId: number;
  appName: string;
  env: EnvName;
  imageRef: string;
  artifactId: number;
  domain?: string | null;
  internalPort: number;
  envVars: Record<string, string>;
  network: string;
};

export class DeployService {
  constructor(
    private readonly db: DB,
    private readonly docker: DockerClient,
    private readonly config: EnvConfig
  ) {}

  async deployUploaded(input: DeployInput): Promise<{ deploymentId: number; containerName: string }> {
    const target = await this.resolveTarget(input);
    const cName = containerName(target.appName, target.env);

    await this.docker.removeContainer(cName);
    await this.docker.runContainer({
      containerName: cName,
      imageRef: target.imageRef,
      network: target.network,
      envVars: target.envVars,
      labels: buildCaddyDockerProxyLabels({
        enabled: this.config.SC_CADDY_MODE === "docker-proxy",
        domain: target.domain ?? undefined,
        internalPort: target.internalPort
      })
    });

    const status = (await this.docker.getContainerStatus(cName)) ?? "running";

    const inserted = await this.db
      .insert(deployments)
      .values({
        appId: target.appId,
        env: target.env,
        artifactId: target.artifactId,
        imageRef: target.imageRef,
        containerName: cName,
        status: status === "running" ? "running" : "failed",
        domain: target.domain ?? null,
        startedAt: new Date(),
        updatedAt: new Date()
      })
      .returning({ id: deployments.id });

    const deploymentId = inserted[0].id;
    await this.logAction(deploymentId, "deploy", input.actor, "ok", `deployed ${target.imageRef} to ${cName}`);
    return { deploymentId, containerName: cName };
  }

  async restart(app: string, envInput: string, actor: string): Promise<void> {
    const env = normalizeEnv(envInput);
    const appRow = await this.getAppByName(app);
    const name = containerName(appRow.name, env);
    await this.docker.restartContainer(name);
    await this.writeDeploymentStatus(appRow.id, env, "running");
    await this.logLatest(appRow.id, env, "restart", actor, "ok", `restarted ${name}`);
  }

  async stop(app: string, envInput: string, actor: string): Promise<void> {
    const env = normalizeEnv(envInput);
    const appRow = await this.getAppByName(app);
    const name = containerName(appRow.name, env);
    await this.docker.stopContainer(name);
    await this.writeDeploymentStatus(appRow.id, env, "stopped");
    await this.logLatest(appRow.id, env, "stop", actor, "ok", `stopped ${name}`);
  }

  async delete(app: string, envInput: string, actor: string): Promise<void> {
    const env = normalizeEnv(envInput);
    const appRow = await this.getAppByName(app);
    const name = containerName(appRow.name, env);
    await this.docker.removeContainer(name);
    await this.writeDeploymentStatus(appRow.id, env, "deleted");
    await this.logLatest(appRow.id, env, "delete", actor, "ok", `deleted ${name}`);
  }

  async getStatus(app: string, envInput: string) {
    const env = normalizeEnv(envInput);
    const appRow = await this.getAppByName(app);
    const row = await this.db
      .select()
      .from(deployments)
      .where(and(eq(deployments.appId, appRow.id), eq(deployments.env, env)))
      .orderBy(desc(deployments.updatedAt))
      .limit(1);

    if (row.length === 0) {
      return null;
    }

    return row[0];
  }

  async getLogs(app: string, envInput: string, lines = 200): Promise<string> {
    const env = normalizeEnv(envInput);
    const appRow = await this.getAppByName(app);
    const name = containerName(appRow.name, env);
    return this.docker.containerLogs(name, lines);
  }

  private async resolveTarget(input: DeployInput): Promise<DeploymentTarget> {
    const env = normalizeEnv(input.env);
    const appRow = await this.getAppByName(input.app);
    const artifact = await this.db
      .select()
      .from(artifacts)
      .where(
        and(
          eq(artifacts.appId, appRow.id),
          eq(artifacts.env, env),
          eq(artifacts.tag, input.tag),
          eq(artifacts.status, "ready")
        )
      )
      .limit(1);

    if (artifact.length === 0) {
      throw new Error(`artifact not found: ${input.app}/${env}:${input.tag}`);
    }

    const envCfg = await this.upsertEnvConfig(appRow.id, env, input.domain, input.internalPort, appRow.defaultInternalPort);
    const envVars = (envCfg.envJson ?? {}) as Record<string, string>;

    return {
      appId: appRow.id,
      appName: appRow.name,
      env,
      imageRef: artifact[0].imageRef,
      artifactId: artifact[0].id,
      domain: envCfg.domain,
      internalPort: envCfg.internalPort,
      envVars,
      network: envCfg.network
    };
  }

  private async getAppByName(app: string) {
    const row = await this.db.select().from(apps).where(eq(apps.name, app)).limit(1);
    if (row.length === 0) {
      throw new Error(`app "${app}" not found`);
    }
    return row[0];
  }

  private async upsertEnvConfig(
    appId: number,
    env: EnvName,
    domain: string | undefined,
    internalPort: number | undefined,
    fallbackPort: number
  ) {
    const existing = await this.db
      .select()
      .from(appEnvConfig)
      .where(and(eq(appEnvConfig.appId, appId), eq(appEnvConfig.env, env)))
      .limit(1);

    const nextPort = internalPort ?? existing[0]?.internalPort ?? fallbackPort;
    const nextDomain = domain ?? existing[0]?.domain ?? null;

    if (existing.length > 0) {
      const updated = await this.db
        .update(appEnvConfig)
        .set({
          domain: nextDomain,
          internalPort: nextPort,
          network: this.config.SC_DOCKER_EDGE_NETWORK,
          updatedAt: new Date()
        })
        .where(eq(appEnvConfig.id, existing[0].id))
        .returning();
      return updated[0];
    }

    const inserted = await this.db
      .insert(appEnvConfig)
      .values({
        appId,
        env,
        domain: nextDomain,
        internalPort: nextPort,
        envJson: {},
        network: this.config.SC_DOCKER_EDGE_NETWORK
      })
      .returning();
    return inserted[0];
  }

  private async writeDeploymentStatus(appId: number, env: EnvName, status: "running" | "stopped" | "deleted") {
    await this.db
      .update(deployments)
      .set({
        status,
        updatedAt: new Date(),
        endedAt: status === "deleted" ? new Date() : undefined
      })
      .where(and(eq(deployments.appId, appId), eq(deployments.env, env)));
  }

  private async latestDeploymentId(appId: number, env: EnvName): Promise<number | null> {
    const row = await this.db
      .select({ id: deployments.id })
      .from(deployments)
      .where(and(eq(deployments.appId, appId), eq(deployments.env, env)))
      .orderBy(desc(deployments.updatedAt))
      .limit(1);
    return row.length > 0 ? row[0].id : null;
  }

  private async logLatest(
    appId: number,
    env: EnvName,
    action: "restart" | "stop" | "delete",
    actor: string,
    result: "ok" | "error",
    message: string
  ) {
    const depId = await this.latestDeploymentId(appId, env);
    await this.logAction(depId ?? undefined, action, actor, result, message);
  }

  private async logAction(
    deploymentId: number | undefined,
    action: "deploy" | "restart" | "stop" | "delete",
    actor: string,
    result: "ok" | "error",
    message: string
  ) {
    await this.db.insert(deploymentActions).values({
      deploymentId,
      action,
      actor,
      result,
      message
    });
  }
}

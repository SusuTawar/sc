import fs from "node:fs/promises";
import { and, desc, eq, lte } from "drizzle-orm";

import type { EnvConfig } from "../config/env.js";
import type { DB } from "../db/client.js";
import { apps, artifacts, webhookReplayGuard } from "../db/schema.js";
import { DockerClient } from "../docker/client.js";
import { normalizeEnv, type EnvName } from "../types/domain.js";
import { DeployService } from "./deploy.service.js";
import { RetentionService, type RetentionResult } from "./retention.service.js";

type UploadInput = {
  app: string;
  env: string;
  tag: string;
  imageRepo: string;
  source: string;
  artifactPath: string;
  artifactSizeBytes: number;
  artifactSha256: string;
  initDeploy: boolean;
  domain?: string;
  internalPort?: number;
};

export type UploadResult = {
  artifactId: number;
  app: string;
  env: EnvName;
  imageRef: string;
  dockerImageId: string | null;
  retention: RetentionResult;
  deploymentId?: number;
};

export class ArtifactService {
  private readonly retention: RetentionService;

  constructor(
    private readonly db: DB,
    private readonly docker: DockerClient,
    private readonly deployService: DeployService,
    private readonly config: EnvConfig
  ) {
    this.retention = new RetentionService(db, docker);
  }

  async isReplay(signature: string, timestampSec: number): Promise<boolean> {
    const rows = await this.db
      .select({ id: webhookReplayGuard.id })
      .from(webhookReplayGuard)
      .where(and(eq(webhookReplayGuard.signature, signature), eq(webhookReplayGuard.timestampSec, timestampSec)))
      .limit(1);
    return rows.length > 0;
  }

  async recordReplay(signature: string, timestampSec: number): Promise<void> {
    await this.db.insert(webhookReplayGuard).values({
      signature,
      timestampSec
    });
  }

  async cleanupReplayGuard(): Promise<void> {
    const cutoff = new Date(Date.now() - this.config.SC_REPLAY_TTL_SEC * 1000);
    await this.db.delete(webhookReplayGuard).where(lte(webhookReplayGuard.createdAt, cutoff));
  }

  async processUpload(input: UploadInput): Promise<UploadResult> {
    const env = normalizeEnv(input.env);
    const tag = input.tag.trim();
    if (!/^[A-Za-z0-9._-]{1,128}$/.test(tag)) {
      throw new Error("invalid tag format");
    }

    const app = await this.getOrCreateApp(input.app);
    const imageRef = `${input.imageRepo}:${tag}`;

    const insert = await this.db
      .insert(artifacts)
      .values({
        appId: app.id,
        env,
        tag,
        imageRepo: input.imageRepo,
        imageRef,
        source: input.source || "circleci",
        status: "uploaded",
        sha256: input.artifactSha256,
        sizeBytes: input.artifactSizeBytes
      })
      .onConflictDoUpdate({
        target: [artifacts.appId, artifacts.env, artifacts.tag],
        set: {
          imageRepo: input.imageRepo,
          imageRef,
          status: "uploaded",
          sha256: input.artifactSha256,
          sizeBytes: input.artifactSizeBytes,
          createdAt: new Date(),
          loadedAt: null,
          prunedAt: null
        }
      })
      .returning({ id: artifacts.id });

    const artifactId = insert[0].id;

    let loadedImageId: string | null = null;
    try {
      const loaded = await this.docker.loadImage(input.artifactPath);
      loadedImageId = await this.docker.inspectImageId(imageRef);

      if (!loadedImageId) {
        const sourceRef = loaded.loadedRefs.length === 1 ? loaded.loadedRefs[0] : loaded.imageId;
        if (sourceRef) {
          await this.docker.tagImage(sourceRef, imageRef);
          loadedImageId = await this.docker.inspectImageId(imageRef);
        }
      }

      if (!loadedImageId) {
        throw new Error(
          `loaded image ref does not match expected ${imageRef}; loaded refs: ${loaded.loadedRefs.join(", ") || "(none)"}`
        );
      }

      await this.db
        .update(artifacts)
        .set({
          status: "ready",
          dockerImageId: loadedImageId,
          loadedAt: new Date()
        })
        .where(eq(artifacts.id, artifactId));
    } catch (err) {
      await this.db
        .update(artifacts)
        .set({
          status: "failed"
        })
        .where(eq(artifacts.id, artifactId));
      throw err;
    } finally {
      await fs.rm(input.artifactPath, { force: true });
    }

    const retention = await this.retention.enforce(app.id, env);
    let deploymentId: number | undefined;

    if (input.initDeploy) {
      const deployed = await this.deployService.deployUploaded({
        app: app.name,
        env,
        tag,
        actor: "ci:init_deploy",
        domain: input.domain,
        internalPort: input.internalPort
      });
      deploymentId = deployed.deploymentId;
    }

    return {
      artifactId,
      app: app.name,
      env,
      imageRef,
      dockerImageId: loadedImageId,
      retention,
      deploymentId
    };
  }

  async listArtifacts(appName: string, envInput: string, limit = 20) {
    const env = normalizeEnv(envInput);
    const app = await this.findAppByName(appName);
    if (!app) {
      throw new Error(`app "${appName}" not found`);
    }
    return this.db
      .select()
      .from(artifacts)
      .where(and(eq(artifacts.appId, app.id), eq(artifacts.env, env)))
      .orderBy(desc(artifacts.createdAt))
      .limit(Math.max(1, Math.min(limit, 100)));
  }

  private async getOrCreateApp(name: string) {
    const existing = await this.findAppByName(name);
    if (existing) {
      return existing;
    }
    if (!this.config.SC_AUTO_CREATE_APP) {
      throw new Error(`app "${name}" not found and auto-create is disabled`);
    }
    const created = await this.db
      .insert(apps)
      .values({
        name,
        defaultInternalPort: 8080
      })
      .returning();
    return created[0];
  }

  private async findAppByName(name: string) {
    const rows = await this.db.select().from(apps).where(eq(apps.name, name)).limit(1);
    return rows[0] ?? null;
  }
}

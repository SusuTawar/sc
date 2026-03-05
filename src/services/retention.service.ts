import { and, desc, eq } from "drizzle-orm";

import type { DB } from "../db/client.js";
import { artifacts, deploymentActions, deployments } from "../db/schema.js";
import { DockerClient } from "../docker/client.js";
import type { EnvName } from "../types/domain.js";

export type RetentionResult = {
  kept: number;
  pruned: number;
  skippedInUse: number;
};

export function splitRetentionCandidates<T>(items: T[], keep = 5): { kept: T[]; pruneCandidates: T[] } {
  return {
    kept: items.slice(0, keep),
    pruneCandidates: items.slice(keep)
  };
}

export class RetentionService {
  constructor(
    private readonly db: DB,
    private readonly docker: DockerClient
  ) {}

  async enforce(appId: number, env: EnvName): Promise<RetentionResult> {
    const rows = await this.db
      .select()
      .from(artifacts)
      .where(and(eq(artifacts.appId, appId), eq(artifacts.env, env), eq(artifacts.status, "ready")))
      .orderBy(desc(artifacts.createdAt));

    const split = splitRetentionCandidates(rows, 5);
    const keep = split.kept;
    const pruneCandidates = split.pruneCandidates;
    let pruned = 0;
    let skippedInUse = 0;

    for (const candidate of pruneCandidates) {
      const inUse = await this.db
        .select({ id: deployments.id })
        .from(deployments)
        .where(
          and(
            eq(deployments.appId, appId),
            eq(deployments.env, env),
            eq(deployments.artifactId, candidate.id),
            eq(deployments.status, "running")
          )
        )
        .limit(1);

      if (inUse.length > 0) {
        skippedInUse += 1;
        continue;
      }

      try {
        await this.docker.removeImage(candidate.imageRef);
        await this.db
          .update(artifacts)
          .set({
            status: "pruned",
            prunedAt: new Date()
          })
          .where(eq(artifacts.id, candidate.id));

        await this.db.insert(deploymentActions).values({
          action: "prune",
          actor: "system",
          result: "ok",
          message: `pruned image ${candidate.imageRef}`
        });
        pruned += 1;
      } catch (err) {
        await this.db.insert(deploymentActions).values({
          action: "prune",
          actor: "system",
          result: "error",
          message: `failed pruning ${candidate.imageRef}: ${String(err)}`
        });
      }
    }

    return {
      kept: keep.length,
      pruned,
      skippedInUse
    };
  }
}

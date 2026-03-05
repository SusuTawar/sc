import type { FastifyInstance, FastifyRequest } from "fastify";

import {
  appEnvBodySchema,
  artifactsQuerySchema,
  deployBodySchema,
  statusQuerySchema
} from "../schemas/deploy.js";
import { ArtifactService } from "../../services/artifact.service.js";
import { DeployService } from "../../services/deploy.service.js";
import type { EnvConfig } from "../../config/env.js";

function getTokenFromHeaders(req: FastifyRequest): string {
  const authHeader = req.headers.authorization;
  const bearer = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  if (bearer?.startsWith("Bearer ")) {
    return bearer.slice("Bearer ".length).trim();
  }
  const headerToken = req.headers["x-api-token"];
  if (Array.isArray(headerToken)) {
    return headerToken[0] ?? "";
  }
  return headerToken ?? "";
}

export async function registerDeployRoutes(
  app: FastifyInstance,
  artifactService: ArtifactService,
  deployService: DeployService,
  config: EnvConfig
): Promise<void> {
  const requireApiToken = async (req: FastifyRequest) => {
    const token = getTokenFromHeaders(req);
    if (!token || token !== config.SC_API_TOKEN) {
      throw new Error("unauthorized");
    }
  };

  app.get("/v1/artifacts", async (req, reply) => {
    try {
      await requireApiToken(req);
      const query = artifactsQuerySchema.parse(req.query);
      const rows = await artifactService.listArtifacts(query.app, query.env, query.limit);
      return reply.send({
        items: rows.map((r) => ({
          id: r.id,
          env: r.env,
          tag: r.tag,
          image_ref: r.imageRef,
          status: r.status,
          created_at: r.createdAt,
          loaded_at: r.loadedAt,
          pruned_at: r.prunedAt
        }))
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "bad request";
      const code = message === "unauthorized" ? 401 : 400;
      return reply.code(code).send({ error: message });
    }
  });

  app.post("/v1/deployments/deploy", async (req, reply) => {
    try {
      await requireApiToken(req);
      const body = deployBodySchema.parse(req.body);
      const result = await deployService.deployUploaded({
        app: body.app,
        env: body.env,
        tag: body.tag,
        actor: "api",
        domain: body.domain,
        internalPort: body.internal_port
      });
      return reply.code(201).send({
        deployment_id: result.deploymentId,
        container_name: result.containerName
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "deploy failed";
      const code = message === "unauthorized" ? 401 : 400;
      return reply.code(code).send({ error: message });
    }
  });

  app.post("/v1/deployments/restart", async (req, reply) => {
    try {
      await requireApiToken(req);
      const body = appEnvBodySchema.parse(req.body);
      await deployService.restart(body.app, body.env, "api");
      return reply.send({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "restart failed";
      const code = message === "unauthorized" ? 401 : 400;
      return reply.code(code).send({ error: message });
    }
  });

  app.post("/v1/deployments/stop", async (req, reply) => {
    try {
      await requireApiToken(req);
      const body = appEnvBodySchema.parse(req.body);
      await deployService.stop(body.app, body.env, "api");
      return reply.send({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "stop failed";
      const code = message === "unauthorized" ? 401 : 400;
      return reply.code(code).send({ error: message });
    }
  });

  app.post("/v1/deployments/delete", async (req, reply) => {
    try {
      await requireApiToken(req);
      const body = appEnvBodySchema.parse(req.body);
      await deployService.delete(body.app, body.env, "api");
      return reply.send({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "delete failed";
      const code = message === "unauthorized" ? 401 : 400;
      return reply.code(code).send({ error: message });
    }
  });

  app.get("/v1/deployments/status", async (req, reply) => {
    try {
      await requireApiToken(req);
      const query = statusQuerySchema.parse(req.query);
      const status = await deployService.getStatus(query.app, query.env);
      if (!status) {
        return reply.code(404).send({ error: "deployment not found" });
      }
      return reply.send({
        id: status.id,
        env: status.env,
        image_ref: status.imageRef,
        container_name: status.containerName,
        status: status.status,
        domain: status.domain,
        updated_at: status.updatedAt
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "status failed";
      const code = message === "unauthorized" ? 401 : 400;
      return reply.code(code).send({ error: message });
    }
  });
}

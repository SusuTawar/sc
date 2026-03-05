import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { pipeline } from "node:stream/promises";

import Busboy from "busboy";
import type { FastifyInstance, FastifyRequest } from "fastify";

import type { EnvConfig } from "../../config/env.js";
import { computeWebhookSignatureHex, parseSignatureHeader, validateTimestampSkew, verifyDigestHex } from "../../auth/hmac.js";
import { uploadFieldsSchema } from "../schemas/upload.js";
import { ArtifactService } from "../../services/artifact.service.js";

type ParsedMultipart = {
  fields: Record<string, string>;
  artifactPath: string;
  artifactSizeBytes: number;
  artifactSha256: string;
};

function parseTimestampHeader(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) {
    throw new Error("missing timestamp header");
  }
  const ts = Number(raw);
  if (!Number.isFinite(ts)) {
    throw new Error("invalid timestamp header");
  }
  return Math.trunc(ts);
}

async function parseMultipartAndVerify(args: {
  req: FastifyRequest;
  config: EnvConfig;
}): Promise<ParsedMultipart> {
  const { req, config } = args;

  const contentType = req.headers["content-type"] ?? "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    throw new Error("content-type must be multipart/form-data");
  }

  await fsp.mkdir(config.SC_UPLOAD_TMP_DIR, { recursive: true });
  const fields: Record<string, string> = {};
  let artifactPath = "";
  let artifactSizeBytes = 0;
  const artifactHash = createHash("sha256");
  let fileWritePromise: Promise<void> | null = null;
  let uploadedBytes = 0;
  let parseError: Error | null = null;

  const busboy = Busboy({
    headers: req.headers as Record<string, string>,
    limits: {
      files: 1,
      fileSize: config.SC_WEBHOOK_MAX_BYTES
    }
  });

  req.raw.on("data", (chunk: Buffer) => {
    uploadedBytes += chunk.length;
    if (uploadedBytes > config.SC_WEBHOOK_MAX_BYTES && !parseError) {
      parseError = new Error("payload exceeds max size");
      req.raw.destroy(parseError);
    }
  });

  busboy.on("field", (name, value) => {
    fields[name] = value;
  });

  busboy.on("file", (name, file, info) => {
    if (name !== "artifact") {
      file.resume();
      return;
    }

    const ext = info.filename?.endsWith(".tar.gz") || info.filename?.endsWith(".tgz") ? ".tar.gz" : ".tar";
    artifactPath = path.join(config.SC_UPLOAD_TMP_DIR, `${randomUUID()}${ext}`);
    const out = fs.createWriteStream(artifactPath, { flags: "wx" });

    file.on("data", (chunk: Buffer) => {
      artifactSizeBytes += chunk.length;
      artifactHash.update(chunk);
    });

    fileWritePromise = pipeline(file, out);
  });

  await new Promise<void>((resolve, reject) => {
    busboy.on("error", reject);
    busboy.on("finish", resolve);
    req.raw.on("error", reject);
    req.raw.pipe(busboy);
  });

  if (fileWritePromise) {
    await fileWritePromise;
  }

  if (parseError) {
    throw parseError;
  }

  if (!artifactPath) {
    throw new Error("artifact file is required");
  }

  return {
    fields,
    artifactPath,
    artifactSizeBytes,
    artifactSha256: artifactHash.digest("hex")
  };
}

export async function registerCIRoutes(
  app: FastifyInstance,
  service: ArtifactService,
  config: EnvConfig
): Promise<void> {
  app.post("/v1/ci/artifacts/upload", async (req, reply) => {
    try {
      const timestampSec = parseTimestampHeader(req.headers["x-sc-timestamp"]);
      validateTimestampSkew(timestampSec, config.SC_WEBHOOK_SKEW_SEC);
      const sigHex = parseSignatureHeader(
        Array.isArray(req.headers["x-sc-signature"]) ? req.headers["x-sc-signature"][0] : req.headers["x-sc-signature"]
      );

      await service.cleanupReplayGuard();
      if (await service.isReplay(sigHex, timestampSec)) {
        return reply.code(409).send({ error: "replay detected" });
      }

      const parsed = await parseMultipartAndVerify({
        req,
        config
      });
      const fields = uploadFieldsSchema.parse(parsed.fields);

      const sourceHeader = req.headers["x-sc-source"];
      const source = (Array.isArray(sourceHeader) ? sourceHeader[0] : sourceHeader) ?? "circleci";
      const computedSigHex = computeWebhookSignatureHex(config.SC_WEBHOOK_SECRET, {
        timestampSec,
        source,
        app: fields.app,
        env: fields.env,
        tag: fields.tag,
        imageRepo: fields.image_repo,
        artifactSha256: parsed.artifactSha256,
        domain: fields.domain,
        initDeploy: fields.init_deploy,
        internalPort: fields.internal_port
      });

      if (!verifyDigestHex(sigHex, computedSigHex)) {
        await fsp.rm(parsed.artifactPath, { force: true });
        throw new Error("signature mismatch");
      }

      await service.recordReplay(sigHex, timestampSec);
      const initDeploy = ["1", "true", "yes"].includes((fields.init_deploy ?? "").toLowerCase());
      const internalPortRaw = fields.internal_port;
      const internalPort = internalPortRaw ? Number(internalPortRaw) : undefined;

      const result = await service.processUpload({
        app: fields.app,
        env: fields.env,
        tag: fields.tag,
        imageRepo: fields.image_repo,
        source,
        artifactPath: parsed.artifactPath,
        artifactSizeBytes: parsed.artifactSizeBytes,
        artifactSha256: parsed.artifactSha256,
        initDeploy,
        domain: fields.domain,
        internalPort: internalPort && Number.isFinite(internalPort) ? Math.trunc(internalPort) : undefined
      });

      return reply.code(201).send({
        artifact_id: result.artifactId,
        app: result.app,
        env: result.env,
        image_ref: result.imageRef,
        docker_image_id: result.dockerImageId,
        retention: {
          kept: result.retention.kept,
          pruned: result.retention.pruned,
          skipped_in_use: result.retention.skippedInUse
        },
        deployment_id: result.deploymentId
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "upload failed";
      const status =
        msg.includes("signature") || msg.includes("timestamp")
          ? 401
          : msg.includes("replay")
            ? 409
            : msg.includes("required") || msg.includes("invalid") || msg.includes("unsupported")
              ? 400
              : 500;
      app.log.error({ err }, "artifact upload failed");
      return reply.code(status).send({ error: msg });
    }
  });
}

import Fastify from "fastify";

import { loadEnv } from "./config/env.js";
import { registerCIRoutes } from "./api/routes/ci-upload.js";
import { registerDeployRoutes } from "./api/routes/deploy.js";
import { registerHealthRoute } from "./api/routes/health.js";
import { createDB, createPool } from "./db/client.js";
import { runMigrations } from "./db/runMigrations.js";
import { startDiscordBot } from "./discord/bot.js";
import { DockerClient } from "./docker/client.js";
import { ArtifactService } from "./services/artifact.service.js";
import { ConvexService } from "./services/convex.service.js";
import { DeployService } from "./services/deploy.service.js";

async function main(): Promise<void> {
  const config = loadEnv();
  const app = Fastify({
    logger: {
      level: config.SC_LOG_LEVEL
    },
    bodyLimit: config.SC_WEBHOOK_MAX_BYTES
  });

  const pool = createPool(config);
  const db = createDB(pool);

  if (config.SC_RUN_MIGRATIONS_ON_BOOT) {
    await runMigrations(db);
    app.log.info("migrations complete");
  }

  const docker = new DockerClient();
  const deployService = new DeployService(db, docker, config);
  const artifactService = new ArtifactService(db, docker, deployService, config);
  const convexService = new ConvexService(docker, config);

  await registerHealthRoute(app);
  await registerCIRoutes(app, artifactService, config);
  await registerDeployRoutes(app, artifactService, deployService, config);

  let discordClient: { destroy: () => void | Promise<void> } | null = null;
  if (config.SC_DISCORD_ENABLED) {
    discordClient = await startDiscordBot({
      config,
      artifactService,
      convexService,
      deployService
    });
  } else {
    app.log.info("discord bot disabled via SC_DISCORD_ENABLED=false");
  }

  await app.listen({
    host: "0.0.0.0",
    port: config.SC_HTTP_PORT
  });

  app.log.info(`server listening on ${config.SC_HTTP_PORT}`);

  const shutdown = async () => {
    app.log.info("shutting down");
    if (discordClient) {
      await discordClient.destroy();
    }
    await app.close();
    await pool.end();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

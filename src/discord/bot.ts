import { Client, Events, GatewayIntentBits, type ChatInputCommandInteraction } from "discord.js";

import type { EnvConfig } from "../config/env.js";
import { ArtifactService } from "../services/artifact.service.js";
import { ConvexService } from "../services/convex.service.js";
import { DeployService } from "../services/deploy.service.js";
import { commandDefinitions } from "./commands/definitions.js";

type Deps = {
  config: EnvConfig;
  artifactService: ArtifactService;
  convexService: ConvexService;
  deployService: DeployService;
};

export async function startDiscordBot(deps: Deps): Promise<Client> {
  const { config, artifactService, deployService, convexService } = deps;
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  client.once(Events.ClientReady, async () => {
    const guild = await client.guilds.fetch(config.SC_DISCORD_GUILD_ID);
    await guild.commands.set(commandDefinitions);
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) {
      return;
    }

    if (!config.operatorIds.has(interaction.user.id)) {
      await interaction.reply({
        content: "not authorized",
        ephemeral: true
      });
      return;
    }

    try {
      await handleCommand(interaction, artifactService, deployService, convexService);
    } catch (err) {
      const message = err instanceof Error ? err.message : "command failed";
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: message, ephemeral: true });
      } else {
        await interaction.reply({ content: message, ephemeral: true });
      }
    }
  });

  await client.login(config.SC_DISCORD_BOT_TOKEN);
  return client;
}

async function handleCommand(
  interaction: ChatInputCommandInteraction,
  artifactService: ArtifactService,
  deployService: DeployService,
  convexService: ConvexService
) {
  switch (interaction.commandName) {
    case "artifact-list": {
      const app = interaction.options.getString("app", true);
      const env = interaction.options.getString("env", true);
      const limit = interaction.options.getInteger("limit") ?? 10;
      const rows = await artifactService.listArtifacts(app, env, limit);
      if (rows.length === 0) {
        await interaction.reply({ content: "no artifacts found", ephemeral: true });
        return;
      }
      const body = rows
        .slice(0, limit)
        .map((row) => `- ${row.tag} | ${row.status} | ${row.imageRef}`)
        .join("\n");
      await interaction.reply({ content: body, ephemeral: true });
      return;
    }
    case "deploy-uploaded": {
      const app = interaction.options.getString("app", true);
      const env = interaction.options.getString("env", true);
      const tag = interaction.options.getString("tag", true);
      const result = await deployService.deployUploaded({
        app,
        env,
        tag,
        actor: interaction.user.id
      });
      await interaction.reply({
        content: `deployed: ${result.containerName} (#${result.deploymentId})`,
        ephemeral: true
      });
      return;
    }
    case "deploy-init": {
      const app = interaction.options.getString("app", true);
      const env = interaction.options.getString("env", true);
      const tag = interaction.options.getString("tag", true);
      const domain = interaction.options.getString("domain", true);
      const internalPort = interaction.options.getInteger("internal_port", true);
      const result = await deployService.deployUploaded({
        app,
        env,
        tag,
        actor: interaction.user.id,
        domain,
        internalPort
      });
      await interaction.reply({
        content: `deployed with domain ${domain}: ${result.containerName} (#${result.deploymentId})`,
        ephemeral: true
      });
      return;
    }
    case "deploy-restart": {
      const app = interaction.options.getString("app", true);
      const env = interaction.options.getString("env", true);
      await deployService.restart(app, env, interaction.user.id);
      await interaction.reply({ content: "deployment restarted", ephemeral: true });
      return;
    }
    case "deploy-stop": {
      const app = interaction.options.getString("app", true);
      const env = interaction.options.getString("env", true);
      await deployService.stop(app, env, interaction.user.id);
      await interaction.reply({ content: "deployment stopped", ephemeral: true });
      return;
    }
    case "deploy-delete": {
      const app = interaction.options.getString("app", true);
      const env = interaction.options.getString("env", true);
      await deployService.delete(app, env, interaction.user.id);
      await interaction.reply({ content: "deployment deleted", ephemeral: true });
      return;
    }
    case "deployment-status": {
      const app = interaction.options.getString("app", true);
      const env = interaction.options.getString("env", true);
      const status = await deployService.getStatus(app, env);
      if (!status) {
        await interaction.reply({ content: "not deployed", ephemeral: true });
        return;
      }
      await interaction.reply({
        content: `status=${status.status}\nimage=${status.imageRef}\ncontainer=${status.containerName}\ndomain=${status.domain ?? "-"}`,
        ephemeral: true
      });
      return;
    }
    case "deployment-logs": {
      const app = interaction.options.getString("app", true);
      const env = interaction.options.getString("env", true);
      const lines = interaction.options.getInteger("lines") ?? 100;
      const logs = await deployService.getLogs(app, env, lines);
      const clipped = logs.length > 1800 ? `${logs.slice(logs.length - 1800)}` : logs;
      await interaction.reply({
        content: `\`\`\`\n${clipped}\n\`\`\``,
        ephemeral: true
      });
      return;
    }
    case "convex": {
      const sub = interaction.options.getSubcommand();
      if (sub === "init") {
        const appname = interaction.options.getString("appname", true);
        const result = await convexService.init(appname);
        await interaction.reply({
          content: `convex created: ${result.containerName}\ndomain=${result.domain}\nstatus=${result.status}`,
          ephemeral: true
        });
        return;
      }
      if (sub === "adminkey") {
        const appname = interaction.options.getString("appname", true);
        const key = await convexService.adminKey(appname);
        await interaction.reply({
          content: `admin key:\n\`\`\`\n${key}\n\`\`\``,
          ephemeral: true
        });
        return;
      }
      if (sub === "remove") {
        const appname = interaction.options.getString("appname", true);
        await convexService.remove(appname);
        await interaction.reply({ content: "convex instance removed", ephemeral: true });
        return;
      }
      if (sub === "list") {
        const rows = await convexService.list();
        if (rows.length === 0) {
          await interaction.reply({ content: "no convex instances found", ephemeral: true });
          return;
        }
        const body = rows
          .map((row) => `- ${row.app} | ${row.status} | ${row.domain} | ${row.container}`)
          .join("\n");
        await interaction.reply({ content: body, ephemeral: true });
        return;
      }
      await interaction.reply({ content: "unknown convex subcommand", ephemeral: true });
      return;
    }
    default:
      await interaction.reply({ content: "unknown command", ephemeral: true });
  }
}

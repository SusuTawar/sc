import { SlashCommandBuilder } from "discord.js";

export const commandDefinitions = [
  new SlashCommandBuilder()
    .setName("artifact-list")
    .setDescription("List uploaded artifacts for app/env")
    .addStringOption((o) => o.setName("app").setDescription("App name").setRequired(true))
    .addStringOption((o) => o.setName("env").setDescription("dev|staging|prod|main").setRequired(true))
    .addIntegerOption((o) => o.setName("limit").setDescription("Result limit").setRequired(false)),
  new SlashCommandBuilder()
    .setName("deploy-uploaded")
    .setDescription("Deploy a previously uploaded artifact tag")
    .addStringOption((o) => o.setName("app").setDescription("App name").setRequired(true))
    .addStringOption((o) => o.setName("env").setDescription("dev|staging|prod|main").setRequired(true))
    .addStringOption((o) => o.setName("tag").setDescription("Image tag").setRequired(true)),
  new SlashCommandBuilder()
    .setName("deploy-init")
    .setDescription("Deploy uploaded artifact and configure domain")
    .addStringOption((o) => o.setName("app").setDescription("App name").setRequired(true))
    .addStringOption((o) => o.setName("env").setDescription("dev|staging|prod|main").setRequired(true))
    .addStringOption((o) => o.setName("tag").setDescription("Image tag").setRequired(true))
    .addStringOption((o) => o.setName("domain").setDescription("Custom domain").setRequired(true))
    .addIntegerOption((o) => o.setName("internal_port").setDescription("Container internal port").setRequired(true)),
  new SlashCommandBuilder()
    .setName("deploy-restart")
    .setDescription("Restart a deployed app env")
    .addStringOption((o) => o.setName("app").setDescription("App name").setRequired(true))
    .addStringOption((o) => o.setName("env").setDescription("dev|staging|prod|main").setRequired(true)),
  new SlashCommandBuilder()
    .setName("deploy-stop")
    .setDescription("Stop a deployed app env")
    .addStringOption((o) => o.setName("app").setDescription("App name").setRequired(true))
    .addStringOption((o) => o.setName("env").setDescription("dev|staging|prod|main").setRequired(true)),
  new SlashCommandBuilder()
    .setName("deploy-delete")
    .setDescription("Delete deployed container for app env")
    .addStringOption((o) => o.setName("app").setDescription("App name").setRequired(true))
    .addStringOption((o) => o.setName("env").setDescription("dev|staging|prod|main").setRequired(true)),
  new SlashCommandBuilder()
    .setName("deployment-status")
    .setDescription("Show deployment status for app env")
    .addStringOption((o) => o.setName("app").setDescription("App name").setRequired(true))
    .addStringOption((o) => o.setName("env").setDescription("dev|staging|prod|main").setRequired(true)),
  new SlashCommandBuilder()
    .setName("deployment-logs")
    .setDescription("Tail logs for app env")
    .addStringOption((o) => o.setName("app").setDescription("App name").setRequired(true))
    .addStringOption((o) => o.setName("env").setDescription("dev|staging|prod|main").setRequired(true))
    .addIntegerOption((o) => o.setName("lines").setDescription("Number of lines").setRequired(false)),
  new SlashCommandBuilder()
    .setName("convex")
    .setDescription("Manage Convex backend instances")
    .addSubcommand((sub) =>
      sub
        .setName("init")
        .setDescription("Create a Convex backend instance")
        .addStringOption((o) => o.setName("appname").setDescription("Subdomain name").setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName("adminkey")
        .setDescription("Get Convex admin key for an instance")
        .addStringOption((o) => o.setName("appname").setDescription("Subdomain name").setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Remove a Convex backend instance")
        .addStringOption((o) => o.setName("appname").setDescription("Subdomain name").setRequired(true))
    )
    .addSubcommand((sub) => sub.setName("list").setDescription("List Convex backend instances"))
].map((cmd) => cmd.toJSON());

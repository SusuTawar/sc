import type { EnvConfig } from "../config/env.js";
import { DockerClient } from "../docker/client.js";
import { buildCaddyDockerProxyLabels } from "./caddy.js";

const CONVEX_LABEL_KEY = "sc.convex.app";

function slugifyAppName(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!slug) {
    throw new Error("invalid app name");
  }
  if (slug.length > 63) {
    throw new Error("app name too long for subdomain");
  }
  return slug;
}

function isValidHex(value: string): boolean {
  return /^[0-9a-fA-F]+$/.test(value) && value.length % 2 === 0;
}

export class ConvexService {
  constructor(
    private readonly docker: DockerClient,
    private readonly config: EnvConfig
  ) {}

  async init(appName: string): Promise<{ containerName: string; domain: string; status: string }> {
    const slug = slugifyAppName(appName);
    this.assertConfigured();

    const domain = `${slug}.${this.domainSuffix()}`;
    const containerName = `sc-convex-${slug}`;
    const existing = await this.docker.getContainerStatus(containerName);
    if (existing) {
      throw new Error(`convex instance already exists: ${containerName}`);
    }

    const envVars = {
      CONVEX_CLOUD_ORIGIN: `https://${domain}`,
      CONVEX_SITE_ORIGIN: this.config.SC_CONVEX_SITE_ORIGIN,
      INSTANCE_NAME: this.config.SC_CONVEX_INSTANCE_NAME,
      INSTANCE_SECRET: this.config.SC_CONVEX_INSTANCE_SECRET,
      DO_NOT_REQUIRE_SSL: this.config.SC_CONVEX_DO_NOT_REQUIRE_SSL ? "true" : "false",
      RUST_LOG: this.config.SC_CONVEX_RUST_LOG
    };

    const labels = {
      ...buildCaddyDockerProxyLabels({
        enabled: this.config.SC_CADDY_MODE === "docker-proxy",
        domain,
        internalPort: this.config.SC_CONVEX_INTERNAL_PORT
      }),
      [CONVEX_LABEL_KEY]: slug
    };

    await this.docker.runContainer({
      containerName,
      imageRef: this.config.SC_CONVEX_IMAGE,
      network: this.config.SC_DOCKER_EDGE_NETWORK,
      envVars,
      labels,
      volumes: [`sc_convex_${slug}:/convex/data`]
    });

    const status = (await this.docker.getContainerStatus(containerName)) ?? "unknown";
    return { containerName, domain, status };
  }

  async adminKey(appName: string): Promise<string> {
    const slug = slugifyAppName(appName);
    const containerName = `sc-convex-${slug}`;
    const status = await this.docker.getContainerStatus(containerName);
    if (!status) {
      throw new Error(`convex instance not found: ${containerName}`);
    }
    const output = await this.docker.execContainer(containerName, ["./generate_admin_key.sh"]);
    return output || "(no output)";
  }

  async remove(appName: string): Promise<void> {
    const slug = slugifyAppName(appName);
    const containerName = `sc-convex-${slug}`;
    await this.docker.removeContainer(containerName);
    await this.docker.removeVolume(`sc_convex_${slug}`);
  }

  async list(): Promise<Array<{ app: string; container: string; status: string; domain: string }>> {
    const rows = await this.docker.listContainersByLabel(CONVEX_LABEL_KEY);
    return rows.map((row) => {
      const app = row.name.replace(/^sc-convex-/, "");
      const domain = `${app}.${this.domainSuffix()}`;
      return { app, container: row.name, status: row.status, domain };
    });
  }

  private assertConfigured(): void {
    if (!this.domainSuffix()) {
      throw new Error("SC_CONVEX_DOMAIN_SUFFIX is required");
    }
    if (!this.config.SC_CONVEX_SITE_ORIGIN) {
      throw new Error("SC_CONVEX_SITE_ORIGIN is required");
    }
    if (!this.config.SC_CONVEX_INSTANCE_SECRET) {
      throw new Error("SC_CONVEX_INSTANCE_SECRET is required");
    }
    if (!isValidHex(this.config.SC_CONVEX_INSTANCE_SECRET)) {
      throw new Error("SC_CONVEX_INSTANCE_SECRET must be even-length hex");
    }
  }

  private domainSuffix(): string {
    return this.config.SC_CONVEX_DOMAIN_SUFFIX.replace(/^\.+/, "").trim();
  }
}

export function buildCaddyDockerProxyLabels(args: {
  enabled: boolean;
  domain?: string;
  internalPort: number;
}): Record<string, string> {
  if (!args.enabled || !args.domain) {
    return {};
  }
  return {
    caddy: args.domain,
    "caddy.reverse_proxy": `{{upstreams ${args.internalPort}}}`
  };
}

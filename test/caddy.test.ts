import { describe, expect, it } from "vitest";

import { buildCaddyDockerProxyLabels } from "../src/services/caddy.js";

describe("caddy labels", () => {
  it("returns labels when enabled and domain exists", () => {
    const labels = buildCaddyDockerProxyLabels({
      enabled: true,
      domain: "api.example.com",
      internalPort: 8080
    });

    expect(labels.caddy).toBe("api.example.com");
    expect(labels["caddy.reverse_proxy"]).toBe("{{upstreams 8080}}");
  });

  it("returns empty object when disabled", () => {
    expect(
      buildCaddyDockerProxyLabels({
        enabled: false,
        domain: "api.example.com",
        internalPort: 8080
      })
    ).toEqual({});
  });
});

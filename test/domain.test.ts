import { describe, expect, it } from "vitest";

import { containerName, normalizeEnv } from "../src/types/domain.js";

describe("domain utils", () => {
  it("maps main to prod", () => {
    expect(normalizeEnv("main")).toBe("prod");
  });

  it("normalizes valid envs", () => {
    expect(normalizeEnv("dev")).toBe("dev");
    expect(normalizeEnv("staging")).toBe("staging");
    expect(normalizeEnv("prod")).toBe("prod");
  });

  it("builds deterministic container names", () => {
    expect(containerName("Billing_API", "staging")).toBe("sc-billing-api-staging");
  });
});

import { describe, expect, it } from "vitest";

import { buildWebhookCanonicalPayload, computeWebhookSignatureHex, verifyDigestHex } from "../src/auth/hmac.js";

describe("hmac", () => {
  it("verifies matching digests", () => {
    const digest = computeWebhookSignatureHex("secret", {
      timestampSec: 1700000000,
      source: "circleci",
      app: "myapp",
      env: "staging",
      tag: "abc123",
      imageRepo: "myorg/myapp",
      artifactSha256: "11".repeat(32)
    });
    expect(verifyDigestHex(digest, digest)).toBe(true);
  });

  it("rejects non-matching digests", () => {
    expect(
      verifyDigestHex(
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      )
    ).toBe(false);
  });

  it("builds stable canonical payload", () => {
    const payload = buildWebhookCanonicalPayload({
      timestampSec: 1700000000,
      source: "circleci",
      app: "myapp",
      env: "staging",
      tag: "abc123",
      imageRepo: "myorg/myapp",
      artifactSha256: "11".repeat(32)
    });
    expect(payload).toContain("circleci");
    expect(payload).toContain("myorg/myapp");
  });
});

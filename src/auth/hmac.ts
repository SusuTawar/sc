import { createHmac, timingSafeEqual } from "node:crypto";

export function parseSignatureHeader(headerValue: string | undefined): string {
  if (!headerValue) {
    throw new Error("missing signature header");
  }
  const trimmed = headerValue.trim();
  const value = trimmed.startsWith("sha256=") ? trimmed.slice(7) : trimmed;
  if (!/^[a-fA-F0-9]{64}$/.test(value)) {
    throw new Error("invalid signature format");
  }
  return value.toLowerCase();
}

export type WebhookSignatureInput = {
  timestampSec: number;
  source: string;
  app: string;
  env: string;
  tag: string;
  imageRepo: string;
  artifactSha256: string;
  domain?: string;
  initDeploy?: string;
  internalPort?: string;
};

export function buildWebhookCanonicalPayload(input: WebhookSignatureInput): string {
  return [
    String(input.timestampSec),
    input.source.trim(),
    input.app.trim(),
    input.env.trim(),
    input.tag.trim(),
    input.imageRepo.trim(),
    input.artifactSha256.trim().toLowerCase(),
    (input.domain ?? "").trim(),
    (input.initDeploy ?? "").trim(),
    (input.internalPort ?? "").trim()
  ].join("\n");
}

export function computeWebhookSignatureHex(secret: string, input: WebhookSignatureInput): string {
  const canonical = buildWebhookCanonicalPayload(input);
  return createHmac("sha256", secret).update(canonical).digest("hex");
}

export function verifyDigestHex(expectedHex: string, actualHex: string): boolean {
  const expected = Buffer.from(expectedHex, "hex");
  const actual = Buffer.from(actualHex, "hex");
  if (expected.length !== actual.length) {
    return false;
  }
  return timingSafeEqual(expected, actual);
}

export function validateTimestampSkew(timestampSec: number, maxSkewSec: number): void {
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestampSec) > maxSkewSec) {
    throw new Error("timestamp outside allowed skew");
  }
}

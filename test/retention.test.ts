import { describe, expect, it } from "vitest";

import { splitRetentionCandidates } from "../src/services/retention.service.js";

describe("retention split", () => {
  it("keeps first 5 and returns remaining as prune candidates", () => {
    const source = [1, 2, 3, 4, 5, 6, 7];
    const result = splitRetentionCandidates(source, 5);
    expect(result.kept).toEqual([1, 2, 3, 4, 5]);
    expect(result.pruneCandidates).toEqual([6, 7]);
  });
});

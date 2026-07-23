import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  collectEvidenceForSlug,
  countApplied,
  countViolated,
} from "../../src/core/evidence";
import { appendLogEvent } from "../../src/core/log";

const TEST_VAULT = join(import.meta.dir, "../../fixtures/test-vault");

beforeAll(() => {
  process.env.BRAIN_VAULT = TEST_VAULT;
  mkdirSync(join(TEST_VAULT, "Brain", "log"), { recursive: true });
  mkdirSync(join(TEST_VAULT, "Brain", "preferences"), { recursive: true });
});

afterAll(() => {
  rmSync(TEST_VAULT, { recursive: true, force: true });
});

describe("collectEvidenceForSlug", () => {
  it("counts applied and violated events for a slug", async () => {
    await appendLogEvent({
      kind: "apply-evidence",
      timestamp: "2026-07-23T14:00:00Z",
      pref_id: "pref-test-rule",
      result: "applied",
    });
    await appendLogEvent({
      kind: "apply-evidence",
      timestamp: "2026-07-23T15:00:00Z",
      pref_id: "pref-test-rule",
      result: "violated",
    });
    await appendLogEvent({
      kind: "apply-evidence",
      timestamp: "2026-07-23T16:00:00Z",
      pref_id: "pref-test-rule",
      result: "applied",
    });

    const evidence = collectEvidenceForSlug("pref-test-rule");
    expect(evidence.applied).toBe(2);
    expect(evidence.violated).toBe(1);
    expect(evidence.lastEvidenceAt).toBe("2026-07-23T16:00:00Z");
  });

  it("returns zero when no evidence exists", () => {
    const evidence = collectEvidenceForSlug("pref-nonexistent");
    expect(evidence.applied).toBe(0);
    expect(evidence.violated).toBe(0);
    expect(evidence.lastEvidenceAt).toBeNull();
  });
});

describe("countApplied / countViolated", () => {
  it("returns correct counts", () => {
    expect(countApplied("pref-test-rule")).toBe(2);
    expect(countViolated("pref-test-rule")).toBe(1);
  });
});

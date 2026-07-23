import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { handleBrainDream } from "../../src/mcp/tools/lifecycle";
import { handleBrainApplyEvidence } from "../../src/mcp/tools/writer";
import { writePreference, parsePreference } from "../../src/core/preference";
import { atomicWrite } from "../../src/core/vault";

const TEST_VAULT = join(import.meta.dir, "../../fixtures/test-vault");

beforeAll(async () => {
  process.env.BRAIN_VAULT = TEST_VAULT;
  mkdirSync(join(TEST_VAULT, "Brain"), { recursive: true });
  mkdirSync(join(TEST_VAULT, "Brain", "inbox"), { recursive: true });
  mkdirSync(join(TEST_VAULT, "Brain", "preferences"), { recursive: true });
  mkdirSync(join(TEST_VAULT, "Brain", "retired"), { recursive: true });
  mkdirSync(join(TEST_VAULT, "Brain", "log"), { recursive: true });
  mkdirSync(join(TEST_VAULT, "Brain", ".snapshots"), { recursive: true });
  await atomicWrite(join(TEST_VAULT, "Brain", "_brain.yaml"), `dream:
  candidate_threshold: 3
  stale_evidence_days: 90
  unconfirmed_ttl_days: 30
  low_max_applied: 2
  snapshot_retention: 5
`);
});

afterAll(() => {
  rmSync(TEST_VAULT, { recursive: true, force: true });
});

describe("handleBrainDream", () => {
  it("returns dream result", async () => {
    const result = await handleBrainDream({});
    expect(result).toHaveProperty("run_id");
    expect(result).toHaveProperty("signals_processed");
  });

  it("supports dry_run mode", async () => {
    const result = await handleBrainDream({ dry_run: true });
    const r = result as { dry_run: boolean };
    expect(r.dry_run).toBe(true);
  });
});

describe("handleBrainApplyEvidence", () => {
  it("records applied evidence and promotes to confirmed", async () => {
    await writePreference({
      id: "pref-test-apply",
      status: "unconfirmed",
      created: "2026-07-23T00:00:00Z",
      updated: "2026-07-23T00:00:00Z",
      sign: "positive",
      evidence_count: 0,
      applied_count: 0,
      violated_count: 0,
      confidence: "low",
      pinned: false,
    }, "# Test rule");

    const result = await handleBrainApplyEvidence({
      pref_id: "pref-test-apply",
      result: "applied",
    });
    const r = result as { new_status: string };
    expect(r.new_status).toBe("confirmed");
  });
});

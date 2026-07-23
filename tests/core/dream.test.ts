import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { runDream } from "../../src/core/dream";
import { atomicWrite, brainDir } from "../../src/core/vault";
import { writeSignal } from "../../src/core/signal";
import { writePreference, parsePreference } from "../../src/core/preference";
import { appendLogEvent } from "../../src/core/log";

const TEST_VAULT = join(import.meta.dir, "../../fixtures/test-vault");

beforeAll(async () => {
  process.env.BRAIN_VAULT = TEST_VAULT;
  mkdirSync(join(TEST_VAULT, "Brain", "inbox"), { recursive: true });
  mkdirSync(join(TEST_VAULT, "Brain", "preferences"), { recursive: true });
  mkdirSync(join(TEST_VAULT, "Brain", "retired"), { recursive: true });
  mkdirSync(join(TEST_VAULT, "Brain", "log"), { recursive: true });
  mkdirSync(join(TEST_VAULT, "Brain", ".snapshots"), { recursive: true });

  // Write _brain.yaml with threshold=3
  await atomicWrite(
    join(TEST_VAULT, "Brain", "_brain.yaml"),
    "dream:\n  candidate_threshold: 3\n  stale_evidence_days: 90\n  unconfirmed_ttl_days: 30\n  low_max_applied: 2\n  snapshot_retention: 5\n"
  );
});

afterAll(() => {
  rmSync(TEST_VAULT, { recursive: true, force: true });
});

describe("runDream", () => {
  // Test 1: create rule from >=3 matching signals
  it("creates unconfirmed preference when threshold met", async () => {
    await writeSignal("use-spaces", "negative", "Do not use tabs", "hermes", "coding");
    await writeSignal("use-spaces", "negative", "Use spaces for indentation", "hermes", "coding");
    await writeSignal("use-spaces", "negative", "Tabs break alignment", "claude", "coding");

    const result = await runDream();
    expect(result.signals_processed).toBe(3);
    expect(result.preferences_created).toBe(1);
    expect(result.preferences_retired).toBe(0);
    expect(result.run_id).toContain("dream-");

    // Verify preference was created
    const prefPath = join(brainDir(), "preferences", "pref-use-spaces.md");
    expect(existsSync(prefPath)).toBe(true);

    const pref = await parsePreference(prefPath);
    expect(pref.status).toBe("unconfirmed");
    expect(pref.sign).toBe("negative");
  });

  // Test 2: below threshold — no preference created
  it("processes nothing when below threshold", async () => {
    await writeSignal("use-yarn", "positive", "Prefer yarn", "hermes");
    await writeSignal("use-yarn", "positive", "Yarn is faster", "claude");

    const result = await runDream();
    // The 2 signals for use-yarn should NOT create a preference (below threshold of 3)
    // result.signals_processed counts all signals scanned
    const prefPath = join(brainDir(), "preferences", "pref-use-yarn.md");
    expect(existsSync(prefPath)).toBe(false);
  });

  // Test 3: retire expired unconfirmed preference
  it("retires unconfirmed preference when expired", async () => {
    // Create an old unconfirmed preference directly
    await writePreference(
      "old-rule",
      {
        id: "pref-old-rule",
        status: "unconfirmed",
        created: "2020-01-01T00:00:00Z",
        updated: "2020-01-01T00:00:00Z",
        sign: "positive",
        evidence_count: 0,
        applied_count: 0,
        violated_count: 0,
        confidence: "low",
        pinned: false,
      },
      "# Old rule"
    );

    const result = await runDream();
    expect(result.preferences_retired).toBeGreaterThanOrEqual(1);

    const retiredPath = join(brainDir(), "retired", "ret-old-rule.md");
    expect(existsSync(retiredPath)).toBe(true);
  });

  // Test 4: idempotent — rerun touches nothing when no new signals
  it("idempotent: rerun touches nothing when no new signals", async () => {
    const result = await runDream();
    expect(result.signals_processed).toBe(0);
    expect(result.preferences_created).toBe(0);
  });

  // Test 5: dryRun reports planned changes without writing files
  it("dryRun reports planned changes without writing", async () => {
    await writeSignal("dry-test", "negative", "Test rule", "hermes");
    await writeSignal("dry-test", "negative", "Test rule 2", "hermes");
    await writeSignal("dry-test", "negative", "Test rule 3", "hermes");

    const result = await runDream(true);
    expect(result.dry_run).toBe(true);
    expect(result.preferences_created).toBeGreaterThan(0);

    // File should NOT exist because dryRun
    const prefPath = join(brainDir(), "preferences", "pref-dry-test.md");
    expect(existsSync(prefPath)).toBe(false);
  });

  // Test 6: retire stale confirmed preference with no recent evidence
  it("retires stale confirmed preference with no recent evidence", async () => {
    // Create a confirmed preference from 2020
    const prefPath = await writePreference(
      "stale-confirmed",
      {
        id: "pref-stale-confirmed",
        status: "confirmed",
        created: "2020-01-01T00:00:00Z",
        updated: "2020-01-01T00:00:00Z",
        sign: "positive",
        evidence_count: 1,
        applied_count: 1,
        violated_count: 0,
        confidence: "medium",
        pinned: false,
      },
      "# Stale confirmed rule"
    );

    // Write an old log event that evidence.ts will pick up as last evidence
    await appendLogEvent({
      kind: "apply-evidence",
      timestamp: "2020-01-15T00:00:00Z",
      pref_id: "pref-stale-confirmed",
      result: "applied",
    });

    const result = await runDream();
    expect(result.preferences_retired).toBeGreaterThanOrEqual(1);

    // Verify the preference was retired
    const retiredPath = join(brainDir(), "retired", "ret-stale-confirmed.md");
    expect(existsSync(retiredPath)).toBe(true);

    // Verify the original preference is gone
    expect(existsSync(prefPath)).toBe(false);
  });
});

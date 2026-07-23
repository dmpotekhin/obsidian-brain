import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { regenerateActive } from "../../src/core/active";
import { readFile } from "../../src/core/vault";
import { writePreference } from "../../src/core/preference";

const TEST_VAULT = join(import.meta.dir, "../../fixtures/test-vault");

beforeAll(() => {
  process.env.BRAIN_VAULT = TEST_VAULT;
  mkdirSync(join(TEST_VAULT, "Brain", "preferences"), { recursive: true });
});

afterAll(() => {
  rmSync(TEST_VAULT, { recursive: true, force: true });
});

describe("regenerateActive", () => {
  it("generates active.md from confirmed and quarantined preferences", async () => {
    await writePreference(
      {
        id: "pref-rule-1", status: "confirmed",
        created: "2026-07-01T00:00:00Z", updated: "2026-07-01T00:00:00Z",
        sign: "negative", evidence_count: 5, applied_count: 10,
        violated_count: 0, confidence: "high", pinned: false,
      },
      "# Rule 1\n\nDo not use tabs.",
    );
    await writePreference(
      {
        id: "pref-rule-2", status: "unconfirmed",
        created: "2026-07-01T00:00:00Z", updated: "2026-07-01T00:00:00Z",
        sign: "positive", evidence_count: 0, applied_count: 0,
        violated_count: 0, confidence: "low", pinned: false,
      },
      "# Rule 2\n\nUse spaces.",
    );
    await writePreference(
      {
        id: "pref-rule-3", status: "quarantine",
        created: "2026-07-01T00:00:00Z", updated: "2026-07-01T00:00:00Z",
        sign: "positive", evidence_count: 3, applied_count: 2,
        violated_count: 4, confidence: "low", pinned: false,
      },
      "# Rule 3\n\nUse emoji.",
    );

    const path = await regenerateActive();
    const content = await readFile(path);
    expect(content).toContain("Rule 1");
    expect(content).not.toContain("Rule 2"); // unconfirmed — excluded
    expect(content).toContain("Rule 3");     // quarantine — included
  });

  it("returns path to active.md inside Brain directory", async () => {
    const path = await regenerateActive();
    expect(path).toContain("Brain/active.md");
  });

  it("includes auto-generated header", async () => {
    const path = await regenerateActive();
    const content = await readFile(path);
    expect(content).toContain("# Active Memory");
    expect(content).toContain("Auto-generated");
  });
});

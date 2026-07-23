import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  writePreference,
  parsePreference,
  moveToRetired,
} from "../../src/core/preference";
import { readFile } from "../../src/core/vault";

const TEST_VAULT = join(import.meta.dir, "../../fixtures/test-vault");

beforeAll(() => {
  process.env.BRAIN_VAULT = TEST_VAULT;
  mkdirSync(join(TEST_VAULT, "Brain", "preferences"), { recursive: true });
  mkdirSync(join(TEST_VAULT, "Brain", "retired"), { recursive: true });
});

afterAll(() => {
  rmSync(TEST_VAULT, { recursive: true, force: true });
});

describe("writePreference", () => {
  it("creates preference file with correct frontmatter", async () => {
    const path = await writePreference(
      {
        id: "pref-no-abbrev",
        status: "unconfirmed",
        created: "2026-07-23T14:00:00Z",
        updated: "2026-07-23T14:00:00Z",
        sign: "negative",
        evidence_count: 0,
        applied_count: 0,
        violated_count: 0,
        confidence: "low",
        pinned: false,
      },
      "# No Abbreviations\n\nAlways expand.",
    );

    expect(path).toContain("Brain/preferences/pref-no-abbrev.md");
    expect(existsSync(path)).toBe(true);

    const content = await readFile(path);
    expect(content).toContain("id: pref-no-abbrev");
    expect(content).toContain("status: unconfirmed");
  });
});

describe("parsePreference", () => {
  it("reads preference data and body", async () => {
    const writePath = await writePreference(
      {
        id: "pref-no-abbrev",
        status: "unconfirmed",
        created: "2026-07-23T14:00:00Z",
        updated: "2026-07-23T14:00:00Z",
        sign: "negative",
        evidence_count: 0,
        applied_count: 0,
        violated_count: 0,
        confidence: "low",
        pinned: false,
      },
      "# No Abbreviations\n\nAlways expand.",
    );

    const pref = await parsePreference(writePath);
    expect(pref.id).toBe("pref-no-abbrev");
    expect(pref.status).toBe("unconfirmed");
    expect(pref.body).toContain("# No Abbreviations");
  });
});

describe("moveToRetired", () => {
  it("moves preference to retired with reason", async () => {
    // Write a pref to retire
    await writePreference(
      {
        id: "pref-stale-rule",
        status: "confirmed",
        created: "2026-01-01T00:00:00Z",
        updated: "2026-01-01T00:00:00Z",
        sign: "positive",
        evidence_count: 1,
        applied_count: 1,
        violated_count: 0,
        confidence: "medium",
        pinned: false,
      },
      "# Stale rule",
    );

    const retiredPath = await moveToRetired("pref-stale-rule", "stale-no-evidence");
    expect(retiredPath).toContain("Brain/retired/ret-stale-rule.md");
    expect(existsSync(retiredPath)).toBe(true);

    const content = await readFile(retiredPath);
    expect(content).toContain("retired_reason: stale-no-evidence");
    expect(content).toContain("previous_id: pref-stale-rule");
  });
});

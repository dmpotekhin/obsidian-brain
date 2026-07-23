import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { handleBrainStatus } from "../../src/mcp/tools/admin";

const TEST_VAULT = join(import.meta.dir, "../../fixtures/test-vault");

beforeAll(() => {
  process.env.BRAIN_VAULT = TEST_VAULT;
  mkdirSync(join(TEST_VAULT, "Brain", "inbox"), { recursive: true });
  mkdirSync(join(TEST_VAULT, "Brain", "preferences"), { recursive: true });
  mkdirSync(join(TEST_VAULT, "Brain", "log"), { recursive: true });

  // Create some test files
  writeFileSync(join(TEST_VAULT, "Brain", "preferences", "pref-no-yelling.md"), "# No yelling");
  writeFileSync(join(TEST_VAULT, "Brain", "preferences", "pref-be-concise.md"), "# Be concise");
  writeFileSync(join(TEST_VAULT, "Brain", "inbox", "2026-07-22-positive.md"), "signal");
  writeFileSync(join(TEST_VAULT, "Brain", "log", "2026-07-22.md"), "log entry");
  writeFileSync(join(TEST_VAULT, "Brain", "log", "2026-07-23.md"), "log entry");
});

afterAll(() => {
  rmSync(TEST_VAULT, { recursive: true, force: true });
});

describe("handleBrainStatus", () => {
  it("returns status with vault_path", async () => {
    const result = (await handleBrainStatus()) as Record<string, unknown>;
    expect(result).toHaveProperty("vault_path");
    expect(result.vault_path).toBe(TEST_VAULT);
  });

  it("counts preferences correctly", async () => {
    const result = (await handleBrainStatus()) as Record<string, unknown>;
    expect(result.preferences_count).toBe(2);
  });

  it("counts signals (inbox files) correctly", async () => {
    const result = (await handleBrainStatus()) as Record<string, unknown>;
    expect(result.signals_count).toBe(1);
  });

  it("returns the last dream from log files", async () => {
    const result = (await handleBrainStatus()) as Record<string, unknown>;
    expect(result.last_dream).toBe("2026-07-23");
  });

  it("returns config fields", async () => {
    const result = (await handleBrainStatus()) as Record<string, unknown>;
    expect(result).toHaveProperty("config");
    const config = result.config as Record<string, unknown>;
    expect(config).toHaveProperty("candidate_threshold");
    expect(config).toHaveProperty("stale_evidence_days");
  });
});

// --- Tests for handleBrainAudit ---

describe("handleBrainAudit", () => {
  let handleBrainAudit: (args: Record<string, unknown>) => Promise<unknown>;

  beforeAll(async () => {
    // Dynamic import to avoid module-caching issues
    const mod = await import("../../src/mcp/tools/admin");
    handleBrainAudit = mod.handleBrainAudit;
  });

  it("returns an empty array when no log events match the pref_id", async () => {
    const result = (await handleBrainAudit({ pref_id: "pref-nonexistent" })) as Record<string, unknown>;
    expect(result).toHaveProperty("pref_id");
    expect(result.pref_id).toBe("pref-nonexistent");
    expect(result).toHaveProperty("events");
    const events = result.events as unknown[];
    expect(events.length).toBe(0);
  });

  it("finds events matching a pref_id from log files", async () => {
    // Write a log entry with pref_id
    writeFileSync(
      join(TEST_VAULT, "Brain", "log", "2026-07-23.md"),
      `---
date: 2026-07-23
events_count: 2
---

## Events

- **14:30:22** | apply-evidence | pref_id=pref-no-yelling | result=applied | new_status=confirmed
- **15:00:00** | apply-evidence | pref_id=pref-be-concise | result=violated | new_status=confirmed
`,
    );

    const result = (await handleBrainAudit({ pref_id: "pref-no-yelling" })) as Record<string, unknown>;
    const events = result.events as Array<Record<string, unknown>>;
    expect(events.length).toBe(1);
    expect(events[0]).toHaveProperty("kind");
    expect(events[0]!.pref_id).toBe("pref-no-yelling");
    expect(events[0]!.result).toBe("applied");
  });

  it("returns multiple events if the same pref_id appears in multiple log files", async () => {
    writeFileSync(
      join(TEST_VAULT, "Brain", "log", "2026-07-24.md"),
      `---
date: 2026-07-24
events_count: 1
---

## Events

- **12:00:00** | apply-evidence | pref_id=pref-no-yelling | result=violated | new_status=confirmed
`,
    );

    const result = (await handleBrainAudit({ pref_id: "pref-no-yelling" })) as Record<string, unknown>;
    const events = result.events as Array<Record<string, unknown>>;
    expect(events.length).toBe(2);
  });

  it("throws when pref_id is missing", async () => {
    await expect(handleBrainAudit({})).rejects.toThrow("pref_id is required");
  });
});

// --- Tests for handleBrainRollback ---

describe("handleBrainRollback", () => {
  let handleBrainRollback: (args: Record<string, unknown>) => Promise<unknown>;

  beforeAll(async () => {
    const mod = await import("../../src/mcp/tools/admin");
    handleBrainRollback = mod.handleBrainRollback;
  });

  it("throws when there are no snapshots to restore", async () => {
    await expect(handleBrainRollback({})).rejects.toThrow("No snapshots found");
  });
});

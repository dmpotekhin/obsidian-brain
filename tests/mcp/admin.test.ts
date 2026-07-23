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

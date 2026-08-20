import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "../../src/core/config";
import { atomicWrite, resetVaultRoot } from "../../src/core/vault";

const TEST_VAULT = join(import.meta.dir, "../../fixtures/test-vault");

beforeAll(() => {
  resetVaultRoot();
  process.env.BRAIN_VAULT = TEST_VAULT;
  mkdirSync(join(TEST_VAULT, "Brain"), { recursive: true });
});

afterAll(() => {
  rmSync(TEST_VAULT, { recursive: true, force: true });
});

describe("loadConfig", () => {
  it("returns defaults when no config files exist", async () => {
    const config = await loadConfig();
    expect(config.candidateThreshold).toBe(3);
    expect(config.staleEvidenceDays).toBe(90);
    expect(config.unconfirmedTtlDays).toBe(30);
    expect(config.lowMaxApplied).toBe(2);
    expect(config.snapshotRetention).toBe(5);
    expect(config.vaultPath).toBe(TEST_VAULT);
  });

  it("loads overrides from _brain.yaml", async () => {
    await atomicWrite(
      join(TEST_VAULT, "Brain", "_brain.yaml"),
      `dream:
  candidate_threshold: 5
  stale_evidence_days: 60
  unconfirmed_ttl_days: 14
`
    );
    const config = await loadConfig();
    expect(config.candidateThreshold).toBe(5);
    expect(config.staleEvidenceDays).toBe(60);
    expect(config.unconfirmedTtlDays).toBe(14);
    // Unspecified fields retain defaults
    expect(config.lowMaxApplied).toBe(2);
    expect(config.snapshotRetention).toBe(5);
  });
});

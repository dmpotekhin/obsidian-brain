import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { handleBrainHealth, handleBrainHygiene } from "../../src/mcp/tools/health";
import { resetVaultRoot } from "../../src/core/vault";

const TEST_VAULT = join(import.meta.dir, "../../fixtures/test-vault");

beforeAll(() => {
  resetVaultRoot();
  process.env.BRAIN_VAULT = TEST_VAULT;
  mkdirSync(join(TEST_VAULT, "Brain", "inbox"), { recursive: true });
  mkdirSync(join(TEST_VAULT, "Brain", "preferences"), { recursive: true });
  mkdirSync(join(TEST_VAULT, "Brain", "retired"), { recursive: true });
  mkdirSync(join(TEST_VAULT, "Brain", "log"), { recursive: true });
  mkdirSync(join(TEST_VAULT, "Brain", ".snapshots"), { recursive: true });

  // Create _brain.yaml so config check passes
  writeFileSync(join(TEST_VAULT, "Brain", "_brain.yaml"), "candidate_threshold: 3\n");

  // Create preference files with frontmatter to test duplicate detection
  writeFileSync(
    join(TEST_VAULT, "Brain", "preferences", "pref-no-yelling.md"),
    `---
id: pref-no-yelling
status: confirmed
created: "2026-07-20"
updated: "2026-07-22"
sign: negative
evidence_count: 3
applied_count: 1
violated_count: 0
confidence: high
pinned: false
---

# No yelling

Don't yell at the user.
`,
  );
  writeFileSync(
    join(TEST_VAULT, "Brain", "preferences", "pref-be-concise.md"),
    `---
id: pref-be-concise
status: confirmed
created: "2026-07-20"
updated: "2026-07-22"
sign: positive
evidence_count: 2
applied_count: 0
violated_count: 0
confidence: medium
pinned: false
---

# Be concise

Use short responses.
`,
  );
  // Duplicate ID (same as pref-be-concise)
  writeFileSync(
    join(TEST_VAULT, "Brain", "preferences", "pref-be-concise-duplicate.md"),
    `---
id: pref-be-concise
status: unconfirmed
created: "2026-07-21"
updated: "2026-07-21"
sign: positive
evidence_count: 1
applied_count: 0
violated_count: 0
confidence: low
pinned: false
---

# Be concise v2

Duplicate!
`,
  );

  // Create a stale signal in inbox (older than 90 days)
  writeFileSync(
    join(TEST_VAULT, "Brain", "inbox", "sig-2025-01-15-old.md"),
    "# Old signal",
  );
});

afterAll(() => {
  rmSync(TEST_VAULT, { recursive: true, force: true });
});

describe("handleBrainHealth", () => {
  it("returns verdict and domains", async () => {
    const result = (await handleBrainHealth()) as Record<string, unknown>;
    expect(result).toHaveProperty("verdict");
    expect(result).toHaveProperty("domains");
    expect(Array.isArray(result.domains)).toBe(true);
  });

  it("has verdict 'unhealthy' when duplicate preference IDs exist", async () => {
    const result = (await handleBrainHealth()) as Record<string, unknown>;
    expect(result.verdict).toBe("unhealthy");
  });

  it("config domain is ok when _brain.yaml exists", async () => {
    const result = (await handleBrainHealth()) as Record<string, unknown>;
    const domains = result.domains as Array<Record<string, unknown>>;
    const configDomain = domains.find((d) => d.name === "config");
    expect(configDomain).toBeDefined();
    expect(configDomain!.status).toBe("ok");
    expect((configDomain!.findings as unknown[]).length).toBe(0);
  });

  it("structure domain is ok when all required dirs exist", async () => {
    const result = (await handleBrainHealth()) as Record<string, unknown>;
    const domains = result.domains as Array<Record<string, unknown>>;
    const structureDomain = domains.find((d) => d.name === "structure");
    expect(structureDomain).toBeDefined();
    expect(structureDomain!.status).toBe("ok");
  });

  it("duplicates domain reports duplicate IDs", async () => {
    const result = (await handleBrainHealth()) as Record<string, unknown>;
    const domains = result.domains as Array<Record<string, unknown>>;
    const dupsDomain = domains.find((d) => d.name === "duplicates");
    expect(dupsDomain).toBeDefined();
    expect(dupsDomain!.status).toBe("error");
    const findings = dupsDomain!.findings as Array<Record<string, unknown>>;
    expect(findings.length).toBeGreaterThanOrEqual(1);
    const dup = findings.find((f) => f.kind === "duplicate_id");
    expect(dup).toBeDefined();
  });
});

describe("handleBrainHygiene", () => {
  it("returns findings and count", async () => {
    const result = (await handleBrainHygiene({})) as Record<string, unknown>;
    expect(result).toHaveProperty("findings");
    expect(result).toHaveProperty("count");
    expect(Array.isArray(result.findings)).toBe(true);
    expect(typeof result.count).toBe("number");
  });

  it("detects near-duplicate preferences by title", async () => {
    const result = (await handleBrainHygiene({})) as Record<string, unknown>;
    const findings = result.findings as Array<Record<string, unknown>>;

    // pref-no-yelling and pref-be-concise are different => no near-dup
    // But we have pref-be-concise and pref-be-concise (duplicate ID file with different filename)
    // After normalization: "prefbeconcise" and "prefbeconcise" are identical
    const nearDups = findings.filter((f) => f.kind === "near_duplicate");
    expect(nearDups.length).toBeGreaterThanOrEqual(1);
  });

  it("detects stale signals older than 90 days", async () => {
    const result = (await handleBrainHygiene({})) as Record<string, unknown>;
    const findings = result.findings as Array<Record<string, unknown>>;
    const staleSignals = findings.filter((f) => f.kind === "stale_signal");
    expect(staleSignals.length).toBe(1);
    const sig = staleSignals[0] as Record<string, unknown>;
    expect(sig.description).toContain("sig-2025-01-15");
  });

  it("skips scan when scan=false", async () => {
    const result = (await handleBrainHygiene({ scan: false })) as Record<string, unknown>;
    const findings = result.findings as unknown[];
    expect(findings.length).toBe(0);
    expect(result.message).toBe("Scan skipped (scan=false)");
  });
});

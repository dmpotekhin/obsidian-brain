import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { handleBrainContext, handleBrainContextPack } from "../../src/mcp/tools/reader";
import { writePreference } from "../../src/core/preference";
import { regenerateActive } from "../../src/core/active";

const TEST_VAULT = join(import.meta.dir, "../../fixtures/test-vault");

beforeAll(async () => {
  process.env.BRAIN_VAULT = TEST_VAULT;
  mkdirSync(join(TEST_VAULT, "Brain", "preferences"), { recursive: true });

  await writePreference(
    {
      id: "pref-rule-1", status: "confirmed",
      created: "2026-07-01T00:00:00Z", updated: "2026-07-01T00:00:00Z",
      sign: "negative", evidence_count: 5, applied_count: 10,
      violated_count: 0, confidence: "high", pinned: false,
    },
    "# Rule 1\n\nDo not use tabs.",
  );
});

afterAll(() => {
  rmSync(TEST_VAULT, { recursive: true, force: true });
});

describe("handleBrainContext", () => {
  it("returns active.md content", async () => {
    const result = await handleBrainContext();
    const r = result as { content: string };
    expect(r).toHaveProperty("content");
    expect(typeof r.content).toBe("string");
    expect(r.content.length).toBeGreaterThan(0);
  });

  it("regenerates active.md if it does not exist", async () => {
    // Remove active.md to force regeneration
    const activePath = join(TEST_VAULT, "Brain", "active.md");
    if (existsSync(activePath)) {
      rmSync(activePath);
    }

    const result = await handleBrainContext();
    const r = result as { content: string };
    expect(existsSync(activePath)).toBe(true);
    expect(r.content).toContain("Rule 1");
  });

  it("includes confirmed preferences in content", async () => {
    await regenerateActive(); // ensure fresh content
    const result = await handleBrainContext();
    const r = result as { content: string };
    expect(r.content).toContain("Rule 1");
    expect(r.content).toContain("confirmed");
  });
});

describe("handleBrainContextPack", () => {
  it("returns packed content with token estimate", async () => {
    // Ensure active.md exists with content
    await regenerateActive();

    const result = await handleBrainContextPack({ max_tokens: 500 });
    const r = result as { content: string; estimated_tokens: number; truncated: boolean };

    expect(r).toHaveProperty("content");
    expect(r).toHaveProperty("estimated_tokens");
    expect(r).toHaveProperty("truncated");
    expect(typeof r.estimated_tokens).toBe("number");
    expect(r.estimated_tokens).toBeGreaterThan(0);
  });

  it("truncates content when over token limit", async () => {
    await regenerateActive();

    const result = await handleBrainContextPack({ max_tokens: 1 });
    const r = result as { content: string; estimated_tokens: number; truncated: boolean };

    // With max_tokens=1, charLimit=4 — should truncate
    expect(r.truncated).toBe(true);
    expect(r.content).toContain("[...truncated");
  });

  it("does not truncate content when under token limit", async () => {
    await regenerateActive();

    const result = await handleBrainContextPack({ max_tokens: 10000 });
    const r = result as { content: string; estimated_tokens: number; truncated: boolean };

    expect(r.truncated).toBe(false);
  });

  it("defaults to 2000 tokens when max_tokens not provided", async () => {
    await regenerateActive();

    const result = await handleBrainContextPack({});
    const r = result as { content: string; estimated_tokens: number; truncated: boolean };
    expect(r.estimated_tokens).toBeGreaterThan(0);
  });
});

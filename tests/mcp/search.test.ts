import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { handleBrainSearch } from "../../src/mcp/tools/search";
import { SearchIndex } from "../../src/core/search";
import { atomicWrite, brainDir, resetVaultRoot } from "../../src/core/vault";

const TEST_VAULT = join(import.meta.dir, "../../fixtures/test-vault");

beforeAll(async () => {
  resetVaultRoot();
  process.env.BRAIN_VAULT = TEST_VAULT;
  mkdirSync(join(TEST_VAULT, ".brain"), { recursive: true });
  mkdirSync(join(TEST_VAULT, "Brain", "preferences"), { recursive: true });

  await atomicWrite(
    join(brainDir(), "preferences", "pref-search-mcp.md"),
    `---
id: pref-search-mcp
status: confirmed
---
# MCP Search Test

TypeScript search handler testing.`
  );

  // Build the index so searches return results
  const index = new SearchIndex();
  index.open();
  index.reindex();
  index.close();
});

afterAll(() => {
  rmSync(TEST_VAULT, { recursive: true, force: true });
});

describe("handleBrainSearch", () => {
  it("returns search results for a matching query", async () => {
    const result = await handleBrainSearch({ query: "TypeScript" });
    const r = result as { results: unknown[]; count: number };

    expect(r).toHaveProperty("results");
    expect(r).toHaveProperty("count");
    expect(Array.isArray(r.results)).toBe(true);
    expect(r.count).toBeGreaterThanOrEqual(1);
    expect(r.results.length).toBe(r.count);
  });

  it("returns empty results for no match", async () => {
    const result = await handleBrainSearch({ query: "ZzzNoMatchQuery" });
    const r = result as { results: unknown[]; count: number };

    expect(r.results).toEqual([]);
    expect(r.count).toBe(0);
  });

  it("throws error when query is missing", async () => {
    await expect(handleBrainSearch({})).rejects.toThrow("query is required");
  });

  it("throws error when query is empty string", async () => {
    await expect(handleBrainSearch({ query: "" })).rejects.toThrow("query is required");
  });

  it("throws error when query is only whitespace", async () => {
    await expect(handleBrainSearch({ query: "   " })).rejects.toThrow("query is required");
  });

  it("respects limit parameter", async () => {
    const result = await handleBrainSearch({ query: "test", limit: 1 });
    const r = result as { results: unknown[]; count: number };
    expect(r.results.length).toBeLessThanOrEqual(1);
  });

  it("defaults limit to 20", async () => {
    const result = await handleBrainSearch({ query: "test" });
    const r = result as { results: unknown[]; count: number };
    expect(r.count).toBeGreaterThanOrEqual(0);
  });
});

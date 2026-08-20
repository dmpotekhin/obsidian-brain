import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { SearchIndex } from "../../src/core/search";
import { atomicWrite, brainDir, resetVaultRoot } from "../../src/core/vault";

const TEST_VAULT = join(import.meta.dir, "../../fixtures/test-vault");

beforeAll(async () => {
  resetVaultRoot();
  process.env.BRAIN_VAULT = TEST_VAULT;
  mkdirSync(join(TEST_VAULT, ".brain"), { recursive: true });
  mkdirSync(join(TEST_VAULT, "Brain", "preferences"), { recursive: true });

  await atomicWrite(
    join(brainDir(), "preferences", "pref-search-test.md"),
    `---
id: pref-search-test
status: confirmed
---
# Search Test Rule

Always use TypeScript for new projects.`
  );

  await atomicWrite(
    join(brainDir(), "preferences", "pref-python-rule.md"),
    `---
id: pref-python-rule
status: confirmed
---
# Python Testing

Use pytest for all Python test suites.`
  );
});

afterAll(() => {
  rmSync(TEST_VAULT, { recursive: true, force: true });
});

describe("SearchIndex", () => {
  it("indexes files and returns search results", () => {
    const index = new SearchIndex();
    index.open();
    index.reindex();
    const results = index.search("TypeScript");
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0]!.title).toContain("Search Test Rule");
    index.close();
  });

  it("returns empty array for no match", () => {
    const index = new SearchIndex();
    index.open();
    const results = index.search("RustLangNoMatch");
    expect(results).toEqual([]);
    index.close();
  });

  it("respects limit parameter", () => {
    const index = new SearchIndex();
    index.open();
    index.reindex();
    const results = index.search("test", 1);
    expect(results.length).toBeLessThanOrEqual(1);
    index.close();
  });

  it("finds a note by entity word absent from its body", async () => {
    await atomicWrite(
      join(brainDir(), "notes", "entity-recall-test.md"),
      `---
title: Entity Recall Test
entities:
  - zerba-unicorn
---
# Body without the magic word

This note talks about regular things and never mentions unicorns.`,
    );

    const index = new SearchIndex();
    index.open();
    index.reindex();
    const results = index.search("zerba-unicorn");
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0]!.title).toContain("Entity Recall Test");
    index.close();
  });
});

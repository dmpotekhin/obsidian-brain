import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { handleBrainObligation } from "../../src/mcp/tools/obligations";
import { readFile, listDir } from "../../src/core/vault";
import { brainDir } from "../../src/core/vault";

const TEST_VAULT = join(import.meta.dir, "../../fixtures/test-vault");

beforeAll(() => {
  process.env.BRAIN_VAULT = TEST_VAULT;
  mkdirSync(join(TEST_VAULT, "Brain", "obligations"), { recursive: true });
});

afterAll(() => {
  rmSync(TEST_VAULT, { recursive: true, force: true });
});

describe("handleBrainObligation", () => {
  describe("add", () => {
    it("creates a new obligation file with frontmatter", async () => {
      const result = await handleBrainObligation({
        operation: "add",
        title: "Review weekly goals",
        cadence: "weekly",
        kind: "review",
      });

      expect(result).toHaveProperty("slug");
      expect(result).toHaveProperty("path");

      const r = result as { slug: string; path: string };
      expect(r.slug).toStartWith("obl-");
      expect(existsSync(r.path)).toBe(true);

      const content = await readFile(r.path);
      expect(content).toContain("title: Review weekly goals");
      expect(content).toContain("cadence: weekly");
      expect(content).toContain("kind: review");
      expect(content).toContain("completed_count: 0");
      expect(content).toContain("missed_count: 0");
      expect(content).toContain("next_due:");
      expect(content).toContain("created:");
    });

    it("defaults kind to 'task' when not specified", async () => {
      const result = await handleBrainObligation({
        operation: "add",
        title: "Take out trash",
        cadence: "daily",
      });

      const r = result as { path: string };
      const content = await readFile(r.path);
      expect(content).toContain("kind: task");
    });

    it("generates slug from title", async () => {
      const result = await handleBrainObligation({
        operation: "add",
        title: "Buy Groceries",
        cadence: "weekly",
      });

      const r = result as { slug: string };
      expect(r.slug).toBe("obl-buy-groceries");
    });

    it("supports every-N-days cadence", async () => {
      const result = await handleBrainObligation({
        operation: "add",
        title: "Water plants",
        cadence: "every-3-days",
      });

      const r = result as { path: string };
      const content = await readFile(r.path);
      expect(content).toContain("cadence: every-3-days");
      expect(content).toContain("title: Water plants");
    });

    it("rejects missing title", async () => {
      await expect(
        handleBrainObligation({ operation: "add", cadence: "daily" }),
      ).rejects.toThrow("title is required for add");
    });

    it("rejects missing cadence", async () => {
      await expect(
        handleBrainObligation({ operation: "add", title: "Test" }),
      ).rejects.toThrow("cadence is required for add");
    });

    it("rejects invalid cadence", async () => {
      await expect(
        handleBrainObligation({
          operation: "add",
          title: "Test",
          cadence: "whenever",
        }),
      ).rejects.toThrow("Invalid cadence");
    });
  });

  describe("done", () => {
    it("advances next_due by one cadence interval and increments completed_count", async () => {
      // First add an obligation
      const addResult = await handleBrainObligation({
        operation: "add",
        title: "Daily standup",
        cadence: "daily",
      });

      const { slug, path } = addResult as { slug: string; path: string };

      // Read the original next_due
      const beforeContent = await readFile(path);
      const beforeMatch = beforeContent.match(/next_due:\s*(.+)/);
      const originalNextDue = beforeMatch ? beforeMatch[1] : "";

      // Mark as done
      const doneResult = await handleBrainObligation({
        operation: "done",
        slug,
      });

      expect(doneResult).toHaveProperty("slug", slug);
      expect(doneResult).toHaveProperty("completed_count", 1);
      expect(doneResult).toHaveProperty("next_due");

      const afterContent = await readFile(path);
      expect(afterContent).toContain("completed_count: 1");

      // next_due should have changed
      const afterMatch = afterContent.match(/next_due:\s*(.+)/);
      expect(afterMatch![1]).not.toBe(originalNextDue);
    });

    it("rejects missing slug", async () => {
      await expect(
        handleBrainObligation({ operation: "done" }),
      ).rejects.toThrow("slug is required");
    });

    it("rejects non-existent obligation", async () => {
      await expect(
        handleBrainObligation({
          operation: "done",
          slug: "obl-nonexistent",
        }),
      ).rejects.toThrow("Obligation not found");
    });
  });

  describe("list", () => {
    it("lists all obligations", async () => {
      const result = await handleBrainObligation({ operation: "list" });

      expect(result).toHaveProperty("obligations");
      const r = result as { obligations: Array<Record<string, unknown>> };
      expect(Array.isArray(r.obligations)).toBe(true);
      expect(r.obligations.length).toBeGreaterThanOrEqual(1);
    });

    it("filters by kind", async () => {
      // Add a review-type obligation
      await handleBrainObligation({
        operation: "add",
        title: "Monthly review",
        cadence: "monthly",
        kind: "review",
      });

      const result = await handleBrainObligation({
        operation: "list",
        kind: "review",
      });

      const r = result as { obligations: Array<Record<string, unknown>> };
      for (const obl of r.obligations) {
        expect(obl.kind).toBe("review");
      }
    });
  });

  describe("show", () => {
    it("shows a specific obligation by slug", async () => {
      const addResult = await handleBrainObligation({
        operation: "add",
        title: "Show me",
        cadence: "weekly",
      });

      const { slug } = addResult as { slug: string };

      const result = await handleBrainObligation({
        operation: "show",
        slug,
      });

      expect(result).toHaveProperty("slug", slug);
      expect(result).toHaveProperty("title", "Show me");
      expect(result).toHaveProperty("cadence", "weekly");
    });

    it("rejects missing slug", async () => {
      await expect(
        handleBrainObligation({ operation: "show" }),
      ).rejects.toThrow("slug is required");
    });

    it("rejects non-existent obligation", async () => {
      await expect(
        handleBrainObligation({
          operation: "show",
          slug: "obl-nonexistent",
        }),
      ).rejects.toThrow("Obligation not found");
    });
  });

  describe("remove", () => {
    it("removes an obligation file", async () => {
      const addResult = await handleBrainObligation({
        operation: "add",
        title: "To be removed",
        cadence: "daily",
      });

      const { slug, path } = addResult as { slug: string; path: string };
      expect(existsSync(path)).toBe(true);

      const result = await handleBrainObligation({
        operation: "remove",
        slug,
      });

      expect(result).toEqual({ slug, removed: true });
      expect(existsSync(path)).toBe(false);
    });

    it("rejects missing slug", async () => {
      await expect(
        handleBrainObligation({ operation: "remove" }),
      ).rejects.toThrow("slug is required");
    });

    it("rejects non-existent obligation", async () => {
      await expect(
        handleBrainObligation({
          operation: "remove",
          slug: "obl-nonexistent",
        }),
      ).rejects.toThrow("Obligation not found");
    });
  });

  describe("errors", () => {
    it("rejects invalid operation", async () => {
      await expect(
        handleBrainObligation({ operation: "bogus" }),
      ).rejects.toThrow("Unknown operation");
    });

    it("rejects missing operation", async () => {
      await expect(handleBrainObligation({})).rejects.toThrow(
        "operation is required",
      );
    });
  });
});

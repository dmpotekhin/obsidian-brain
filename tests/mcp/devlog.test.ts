import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { handleBrainDevlog } from "../../src/mcp/tools/writer";
import { brainDir } from "../../src/core/vault";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

function tempVault() {
  const dir = join("/tmp", `brain-devlog-test-${randomUUID()}`);
  const brainPath = join(dir, "Brain");
  mkdirSync(brainPath, { recursive: true });
  // Override vault root for test
  process.env["BRAIN_VAULT"] = dir;
  return dir;
}

describe("handleBrainDevlog", () => {
  let vault: string;

  beforeEach(() => {
    vault = tempVault();
  });

  afterEach(() => {
    rmSync(vault, { recursive: true, force: true });
  });

  it("creates a new journal file with header and entry", async () => {
    const result = await handleBrainDevlog({ entry: "Started working on feature X" });
    expect(result).toHaveProperty("journal");
    expect(result).toHaveProperty("entry");

    const dateStr = new Date().toISOString().slice(0, 10);
    expect((result as any).journal).toBe(`Brain/journal/${dateStr}.md`);

    // Verify file contents
    const journalPath = join(brainDir(), "journal", `${dateStr}.md`);
    const content = readFileSync(journalPath, "utf-8");
    expect(content).toContain("# Dev Journal");
    expect(content).toContain("Started working on feature X");
  });

  it("appends to existing journal file", async () => {
    await handleBrainDevlog({ entry: "First entry" });
    // Small delay so timestamps differ
    await new Promise(r => setTimeout(r, 1100));
    await handleBrainDevlog({ entry: "Second entry" });

    const dateStr = new Date().toISOString().slice(0, 10);
    const journalPath = join(brainDir(), "journal", `${dateStr}.md`);
    const content = readFileSync(journalPath, "utf-8");

    expect(content).toContain("First entry");
    expect(content).toContain("Second entry");
    // Both entries exist: header + blank + 2 timestamped lines
    const nonEmpty = content.split("\n").filter(l => l.trim().length > 0);
    expect(nonEmpty.length).toBeGreaterThanOrEqual(3);
  });

  it("includes project tag when project is specified", async () => {
    const result = await handleBrainDevlog({
      entry: "Created Gradle files",
      project: "qa-trainer",
    });
    expect((result as any).entry).toContain("project:qa-trainer");
  });

  it("does not include project tag when project is empty", async () => {
    const result = await handleBrainDevlog({ entry: "General note" });
    expect((result as any).entry).not.toContain("project:");
  });

  it("throws when entry is missing", async () => {
    await expect(handleBrainDevlog({})).rejects.toThrow("entry is required");
  });

  it("throws when entry is empty string", async () => {
    await expect(handleBrainDevlog({ entry: "" })).rejects.toThrow("entry is required");
  });

  it("throws when entry is whitespace only", async () => {
    await expect(handleBrainDevlog({ entry: "   " })).rejects.toThrow("entry is required");
  });
});

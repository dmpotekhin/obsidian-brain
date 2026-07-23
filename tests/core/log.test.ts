import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { appendLogEvent } from "../../src/core/log";
import { readFile } from "../../src/core/vault";

const TEST_VAULT = join(import.meta.dir, "../../fixtures/test-vault");

beforeAll(() => {
  process.env.BRAIN_VAULT = TEST_VAULT;
  mkdirSync(join(TEST_VAULT, "Brain", "log"), { recursive: true });
});

afterAll(() => {
  rmSync(TEST_VAULT, { recursive: true, force: true });
});

describe("appendLogEvent", () => {
  it("creates daily log file with event", async () => {
    await appendLogEvent({
      kind: "feedback",
      timestamp: "2026-07-23T14:30:00Z",
      topic: "no-abbrev",
      agent: "hermes",
    });

    const today = new Date().toISOString().slice(0, 10);
    const logPath = join(TEST_VAULT, "Brain", "log", `${today}.md`);
    expect(existsSync(logPath)).toBe(true);

    const content = await readFile(logPath);
    expect(content).toContain("feedback");
    expect(content).toContain("no-abbrev");
  });

  it("appends to existing log file", async () => {
    await appendLogEvent({
      kind: "dream",
      timestamp: "2026-07-23T15:00:00Z",
      run_id: "run-123",
    });

    const today = new Date().toISOString().slice(0, 10);
    const content = await readFile(join(TEST_VAULT, "Brain", "log", `${today}.md`));
    const lines = content.split("\n").filter(l => l.startsWith("- **"));
    expect(lines.length).toBeGreaterThanOrEqual(2);
  });
});

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { handleBrainFeedback } from "../../src/mcp/tools/writer";
import { readFile } from "../../src/core/vault";

const TEST_VAULT = join(import.meta.dir, "../../fixtures/test-vault");

beforeAll(() => {
  process.env.BRAIN_VAULT = TEST_VAULT;
  mkdirSync(join(TEST_VAULT, "Brain", "inbox"), { recursive: true });
  mkdirSync(join(TEST_VAULT, "Brain", "log"), { recursive: true });
});

afterAll(() => {
  rmSync(TEST_VAULT, { recursive: true, force: true });
});

describe("handleBrainFeedback", () => {
  it("writes signal and returns path", async () => {
    const result = await handleBrainFeedback({
      topic: "no-abbreviations",
      sign: "negative",
      principle: "Always expand abbreviations",
      agent: "hermes",
      scope: "coding",
    });

    expect(result).toHaveProperty("signal_path");
    expect(result).toHaveProperty("signal_id");

    const r = result as { signal_path: string; signal_id: string };
    expect(existsSync(r.signal_path)).toBe(true);

    const content = await readFile(r.signal_path);
    expect(content).toContain("no-abbreviations");
    expect(content).toContain("Always expand abbreviations");
  });

  it("defaults scope to general", async () => {
    const result = await handleBrainFeedback({
      topic: "be-concise",
      sign: "positive",
      principle: "Use short answers",
      agent: "claude",
    });
    const r = result as { signal_path: string };
    const content = await readFile(r.signal_path);
    expect(content).toContain("scope: general");
  });
});

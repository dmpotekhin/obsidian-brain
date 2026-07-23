import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { writeSignal } from "../../src/core/signal";
import { readFile } from "../../src/core/vault";

const TEST_VAULT = join(import.meta.dir, "../../fixtures/test-vault");

beforeAll(() => {
  process.env.BRAIN_VAULT = TEST_VAULT;
  mkdirSync(join(TEST_VAULT, "Brain", "inbox"), { recursive: true });
});

afterAll(() => {
  rmSync(TEST_VAULT, { recursive: true, force: true });
});

describe("writeSignal", () => {
  it("creates signal file in inbox", async () => {
    const result = await writeSignal(
      "no-internal-abbreviations",
      "negative",
      "Always expand abbreviations",
      "hermes",
      "coding"
    );
    expect(result.path).toContain("Brain/inbox/sig-");
    expect(result.id).toContain("sig-");
    expect(existsSync(result.path)).toBe(true);

    const content = await readFile(result.path);
    expect(content).toContain("no-internal-abbreviations");
    expect(content).toContain("negative");
  });

  it("generates unique IDs for each signal", async () => {
    const r1 = await writeSignal("topic-a", "positive", "Rule A", "agent");
    const r2 = await writeSignal("topic-a", "positive", "Rule A", "agent");
    expect(r1.id).not.toBe(r2.id);
  });
});

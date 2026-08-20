import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { handleBrainFeedback, handleBrainCreateNote } from "../../src/mcp/tools/writer";
import { readFile, resetVaultRoot } from "../../src/core/vault";

const TEST_VAULT = join(import.meta.dir, "../../fixtures/test-vault");

beforeAll(() => {
  resetVaultRoot();
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

describe("handleBrainCreateNote", () => {
  it("auto-generates entities frontmatter from content", async () => {
    const result = await handleBrainCreateNote({
      path: "projects/trainer.md",
      content:
        "The trainer backend runs on FastAPI. The trainer uses PostgreSQL.\n" +
        "Deploy the trainer with docker-compose on the server.",
    });

    const r = result as { path: string };
    const content = await readFile(r.path);
    expect(content).toMatch(/^entities:/m);
    expect(content).toContain("- trainer");
    expect(content).toContain("- postgresql");
    expect(content).toContain("- fastapi");
  });

  it("respects explicit entities and does not overwrite them", async () => {
    const result = await handleBrainCreateNote({
      path: "projects/explicit.md",
      frontmatter: { entities: ["custom-term"] },
      content: "Some body about docker that appears many times docker docker.",
    });

    const r = result as { path: string };
    const content = await readFile(r.path);
    expect(content).toContain("- custom-term");
    expect(content).not.toContain("- docker");
  });
});

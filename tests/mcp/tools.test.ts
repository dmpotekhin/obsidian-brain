import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { buildToolTable } from "../../src/mcp/tools";

const TEST_VAULT = join(import.meta.dir, "../../fixtures/test-vault");

beforeAll(() => {
  process.env.BRAIN_VAULT = TEST_VAULT;
  mkdirSync(join(TEST_VAULT, "Brain", "inbox"), { recursive: true });
  mkdirSync(join(TEST_VAULT, "Brain", "log"), { recursive: true });
});

afterAll(() => {
  rmSync(TEST_VAULT, { recursive: true, force: true });
});

describe("buildToolTable", () => {
  it("returns a map of tools", () => {
    const tools = buildToolTable();
    expect(tools).toBeInstanceOf(Map);
    expect(tools.has("brain_feedback")).toBe(true);
  });

  it("brain_feedback has expected input schema", () => {
    const tools = buildToolTable();
    const feedback = tools.get("brain_feedback");
    expect(feedback).toBeDefined();
    expect(feedback!.inputSchema.required).toContain("topic");
    expect(feedback!.inputSchema.required).toContain("sign");
    expect(feedback!.inputSchema.required).toContain("principle");
    expect(feedback!.inputSchema.required).toContain("agent");
  });
});

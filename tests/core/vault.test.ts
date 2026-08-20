import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  brainDir,
  atomicWrite,
  ensureInsideVault,
  readFile,
  listDir,
} from "../../src/core/vault";

const TEST_VAULT = join(import.meta.dir, "../../fixtures/test-vault");

beforeAll(() => {
  process.env.BRAIN_VAULT = TEST_VAULT;
  mkdirSync(join(TEST_VAULT, "Brain"), { recursive: true });
});

afterAll(() => {
  rmSync(TEST_VAULT, { recursive: true, force: true });
});

describe("brainDir", () => {
  it("returns Brain/ under vault root", () => {
    expect(brainDir()).toBe(join(TEST_VAULT, "Brain"));
  });
});

describe("atomicWrite", () => {
  it("writes file atomically", async () => {
    const target = join(TEST_VAULT, "Brain", "test.md");
    await atomicWrite(target, "# Hello");
    expect(existsSync(target)).toBe(true);
    const content = await readFile(target);
    expect(content).toBe("# Hello");
  });

  it("overwrites existing file", async () => {
    const target = join(TEST_VAULT, "Brain", "test.md");
    await atomicWrite(target, "# Updated");
    const content = await readFile(target);
    expect(content).toBe("# Updated");
  });
});

describe("ensureInsideVault", () => {
  it("returns resolved path when inside vault", () => {
    const path = join(TEST_VAULT, "Brain", "notes", "note.md");
    expect(ensureInsideVault(path)).toBe(path);
  });

  it("throws when path is outside vault", () => {
    expect(() => ensureInsideVault("/etc/passwd")).toThrow("outside vault");
  });

  it("throws on traversal attempt", () => {
    expect(() => ensureInsideVault(join(TEST_VAULT, "..", "etc", "passwd")))
      .toThrow("outside vault");
  });
});

describe("readFile", () => {
  it("reads existing file", async () => {
    const target = join(TEST_VAULT, "Brain", "readme.md");
    await atomicWrite(target, "content");
    expect(await readFile(target)).toBe("content");
  });

  it("throws on missing file", async () => {
    await expect(readFile(join(TEST_VAULT, "Brain", "missing.md")))
      .rejects.toThrow();
  });
});

describe("listDir", () => {
  it("lists files in directory", () => {
    const dir = join(TEST_VAULT, "Brain");
    expect(listDir(dir).length).toBeGreaterThan(0);
  });

  it("returns empty array for empty dir", () => {
    const dir = join(TEST_VAULT, "Brain", "empty");
    mkdirSync(dir, { recursive: true });
    expect(listDir(dir)).toEqual([]);
  });
});

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createSnapshot, restoreSnapshot, pruneSnapshots, listSnapshots } from "../../src/core/snapshot";
import { atomicWrite, readFile, brainDir, resetVaultRoot } from "../../src/core/vault";

const TEST_VAULT = join(import.meta.dir, "../../fixtures/test-vault");

beforeAll(() => {
  resetVaultRoot();
  process.env.BRAIN_VAULT = TEST_VAULT;
  mkdirSync(join(TEST_VAULT, "Brain", "preferences"), { recursive: true });
  mkdirSync(join(TEST_VAULT, "Brain", ".snapshots"), { recursive: true });
});

afterAll(() => {
  rmSync(TEST_VAULT, { recursive: true, force: true });
});

describe("snapshot system", () => {
  it("creates snapshot, restores after modification, prunes old snapshots", async () => {
    // Create a file to snapshot
    const prefPath = join(brainDir(), "preferences", "pref-test.md");
    await atomicWrite(prefPath, "original content");

    // Take snapshot
    const runId = await createSnapshot();
    expect(runId).toContain("dream-");
    const snapshotPath = join(brainDir(), ".snapshots", `${runId}.tar.zst`);
    expect(existsSync(snapshotPath)).toBe(true);

    // Modify the file
    await atomicWrite(prefPath, "modified content");

    // Restore
    await restoreSnapshot(runId);
    const restored = await readFile(prefPath);
    expect(restored).toBe("original content");

    // Create extra snapshots and prune
    await createSnapshot();
    await createSnapshot();
    await createSnapshot();
    const allBefore = listSnapshots();
    expect(allBefore.length).toBeGreaterThanOrEqual(4);

    await pruneSnapshots(2);
    const allAfter = listSnapshots();
    expect(allAfter.length).toBeLessThanOrEqual(2);
  });
});

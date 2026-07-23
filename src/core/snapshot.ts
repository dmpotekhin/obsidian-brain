import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { mkdirSync, existsSync, readdirSync, rmSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { brainDir } from "./vault";

export async function createSnapshot(): Promise<string> {
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:T]/g, "").slice(0, 15);
  const unique = randomBytes(4).toString("hex");
  const runId = `dream-${stamp}-${unique}`;
  const snapshotsDir = join(brainDir(), ".snapshots");
  mkdirSync(snapshotsDir, { recursive: true });

  const target = join(snapshotsDir, `${runId}.tar.zst`);
  const brainPath = brainDir();

  // Pipe tar through zstd for cross-platform compatibility (BSD tar -I ≠ GNU tar -I)
  const tar = spawnSync("tar", [
    "--exclude", ".snapshots",
    "-cf", "-",
    "-C", brainPath + "/..",
    "Brain",
  ]);

  if (tar.status !== 0) {
    throw new Error(`Snapshot tar failed: ${tar.stderr.toString()}`);
  }

  const zstd = spawnSync("zstd", ["-f", "-o", target], { input: tar.stdout });
  if (zstd.status !== 0) {
    throw new Error(`Snapshot zstd failed: ${zstd.stderr.toString()}`);
  }

  return runId;
}

export async function restoreSnapshot(runId: string): Promise<void> {
  const snapshotsDir = join(brainDir(), ".snapshots");
  const source = join(snapshotsDir, `${runId}.tar.zst`);

  if (!existsSync(source)) {
    throw new Error(`Snapshot not found: ${runId}`);
  }

  const brainPath = brainDir();

  // Remove current Brain contents except .snapshots
  const entries = readdirSync(brainPath);
  for (const entry of entries) {
    if (entry === ".snapshots") continue;
    rmSync(join(brainPath, entry), { recursive: true, force: true });
  }

  // Decompress and restore from snapshot via pipe (BSD/GNU tar compatible)
  const zstd = spawnSync("zstd", ["-d", "-c", source]);
  if (zstd.status !== 0) {
    throw new Error(`Restore zstd failed: ${zstd.stderr.toString()}`);
  }

  const tar = spawnSync("tar", [
    "-xf", "-",
    "-C", brainPath + "/..",
  ], { input: zstd.stdout });

  if (tar.status !== 0) {
    throw new Error(`Restore tar failed: ${tar.stderr.toString()}`);
  }
}

export function listSnapshots(): string[] {
  const snapshotsDir = join(brainDir(), ".snapshots");
  if (!existsSync(snapshotsDir)) return [];
  return readdirSync(snapshotsDir)
    .filter(f => f.endsWith(".tar.zst"))
    .map(f => f.replace(".tar.zst", ""))
    .sort()
    .reverse();
}

export async function pruneSnapshots(maxSnapshots: number): Promise<void> {
  const all = listSnapshots();
  if (all.length <= maxSnapshots) return;

  const snapshotsDir = join(brainDir(), ".snapshots");
  const toRemove = all.slice(maxSnapshots);
  for (const id of toRemove) {
    rmSync(join(snapshotsDir, `${id}.tar.zst`), { force: true });
  }
}

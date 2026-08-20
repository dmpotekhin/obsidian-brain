import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, relative } from "node:path";
import { randomUUID } from "node:crypto";

let vaultRootCache: string | null = null;

export function resetVaultRoot(): void {
  vaultRootCache = null;
}

export function vaultRoot(): string {
  if (vaultRootCache) return vaultRootCache;
  const env = process.env["BRAIN_VAULT"];
  if (env) {
    vaultRootCache = resolve(env);
    return vaultRootCache;
  }
  const configPath = join(
    process.env["HOME"] ?? "~",
    ".config", "brain", "config.yaml"
  );
  if (existsSync(configPath)) {
    const raw = readFileSync(configPath, "utf-8");
    const match = raw.match(/vault_path:\s*(.+)/);
    if (match?.[1]) {
      vaultRootCache = resolve(match[1].trim());
      return vaultRootCache;
    }
  }
  throw new Error("BRAIN_VAULT not set and ~/.config/brain/config.yaml not found");
}

export function brainDir(): string {
  return join(vaultRoot(), "Brain");
}

export function ensureInsideVault(filePath: string): string {
  const resolved = resolve(filePath);
  const root = vaultRoot();
  const rel = relative(root, resolved);
  if (rel.startsWith("..") || rel === "") {
    throw new Error(`Path outside vault: ${filePath}`);
  }
  return resolved;
}

export async function atomicWrite(filePath: string, content: string): Promise<void> {
  const target = resolve(filePath);
  const dir = target.substring(0, target.lastIndexOf("/"));
  mkdirSync(dir, { recursive: true });
  const tmpFile = join(tmpdir(), `brain-${randomUUID()}.tmp`);
  writeFileSync(tmpFile, content, "utf-8");
  renameSync(tmpFile, target);
}

export async function readFile(filePath: string): Promise<string> {
  return readFileSync(filePath, "utf-8");
}

export function fileExists(filePath: string): boolean {
  return existsSync(filePath);
}

export function listDir(dirPath: string): string[] {
  if (!existsSync(dirPath)) return [];
  return readdirSync(dirPath);
}

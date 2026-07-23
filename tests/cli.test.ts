import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";

const testDir = dirname(import.meta.path);
const projectRoot = join(testDir, "..");
const CLI = join(projectRoot, "src", "cli.ts");
const FIXTURES = join(projectRoot, "fixtures", "cli-test");
const TEST_VAULT = join(FIXTURES, "test-vault");

beforeAll(() => {
  rmSync(FIXTURES, { recursive: true, force: true });
  mkdirSync(FIXTURES, { recursive: true });
});

afterAll(() => {
  rmSync(FIXTURES, { recursive: true, force: true });
});

// Helper to run CLI with args
async function runCli(args: string[], env: Record<string, string> = {}): Promise<{ exitCode: number; stdout: string }> {
  const proc = Bun.spawn({
    cmd: ["bun", "run", CLI, ...args],
    cwd: projectRoot,
    env: { ...process.env, ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
  await proc.exited;
  const stdout = await new Response(proc.stdout).text();
  return { exitCode: proc.exitCode, stdout };
}

describe("CLI smoke", () => {
  it("shows help with --help", async () => {
    const { exitCode } = await runCli(["--help"]);
    expect(exitCode).toBe(0);
  });

  it("shows help with -h", async () => {
    const { exitCode } = await runCli(["-h"]);
    expect(exitCode).toBe(0);
  });

  it("shows help with no args", async () => {
    const { exitCode } = await runCli([]);
    expect(exitCode).toBe(0);
  });

  it("exits non-zero on unknown command", async () => {
    const { exitCode } = await runCli(["nonexistent"]);
    expect(exitCode).not.toBe(0);
  });

  it("init creates Brain/ directory structure", async () => {
    rmSync(TEST_VAULT, { recursive: true, force: true });
    const { exitCode, stdout } = await runCli(["init", "--vault", TEST_VAULT]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Brain initialized");

    // Parse the init output to find where Brain was created
    const match = stdout.match(/Brain initialized at (.+)/);
    expect(match).not.toBeNull();
    const actualBrainPath = match![1]!;
    expect(existsSync(actualBrainPath)).toBe(true);

    // Check directories exist
    const dirs = [
      "inbox", "inbox/processed", "preferences", "retired",
      "notes", "obligations", "log", ".snapshots",
    ];
    for (const dir of dirs) {
      expect(existsSync(join(actualBrainPath, dir))).toBe(true);
    }

    // Check files exist
    expect(existsSync(join(actualBrainPath, "_brain.yaml"))).toBe(true);
    expect(existsSync(join(actualBrainPath, "_BRAIN.md"))).toBe(true);

    // Verify _brain.yaml content
    const yamlPath = join(actualBrainPath, "_brain.yaml");
    expect(existsSync(yamlPath)).toBe(true);
    const yamlContent = await Bun.file(yamlPath).text();
    expect(yamlContent).toContain("candidate_threshold");
    expect(yamlContent).toContain("snapshot_retention");

    // Verify _BRAIN.md content
    const manualPath = join(actualBrainPath, "_BRAIN.md");
    expect(existsSync(manualPath)).toBe(true);
    const manualContent = await Bun.file(manualPath).text();
    expect(manualContent).toContain("Brain Operating Manual");
    expect(manualContent).toContain("o2b brain dream");
  });

  it("init is idempotent (re-running does not fail)", async () => {
    rmSync(TEST_VAULT, { recursive: true, force: true });
    const { exitCode: e1 } = await runCli(["init", "--vault", TEST_VAULT]);
    expect(e1).toBe(0);
    const { exitCode: e2 } = await runCli(["init", "--vault", TEST_VAULT]);
    expect(e2).toBe(0);
  });

  it("config show works with BRAIN_VAULT set", async () => {
    await runCli(["init", "--vault", TEST_VAULT]);
    const { exitCode, stdout } = await runCli(["config", "show"], {
      BRAIN_VAULT: TEST_VAULT,
    });
    expect(exitCode).toBe(0);
    const config = JSON.parse(stdout);
    expect(config.candidateThreshold).toBe(3);
    expect(config.staleEvidenceDays).toBe(90);
    expect(config.vaultPath).toBe(TEST_VAULT);
  });

  it("brain status works with BRAIN_VAULT set", async () => {
    await runCli(["init", "--vault", TEST_VAULT]);
    const { exitCode, stdout } = await runCli(["brain", "status"], {
      BRAIN_VAULT: TEST_VAULT,
    });
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Brain Vault Status");
    expect(stdout).toContain("Preferences");
    expect(stdout).toContain("Signals");
  });
});

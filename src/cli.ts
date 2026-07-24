#!/usr/bin/env bun
import { join } from "node:path";
import { mkdirSync, existsSync } from "node:fs";
import { MCPServer } from "./mcp/server";
import { runDream } from "./core/dream";
import { loadConfig } from "./core/config";
import { SearchIndex } from "./core/search";
import { brainDir, listDir } from "./core/vault";
import { parsePreference } from "./core/preference";
import { listSnapshots } from "./core/snapshot";

// ── Help ──

const HELP = `o2b — AI-native memory layer for Obsidian vaults

USAGE
  o2b <command> [options]

COMMANDS
  o2b mcp                    Start MCP stdio server
  o2b brain dream [--dry-run]  Run the dream pipeline
  o2b brain status            Show vault status (preferences, snapshots, inbox)
  o2b search reindex          Rebuild the FTS5 search index
  o2b config show             Print resolved configuration
  o2b init --vault <path>     Bootstrap Brain/ directory in an Obsidian vault

EXAMPLES
  o2b init --vault ~/notes
  o2b brain dream --dry-run
  o2b mcp`;

// ── Argument Parsing ──

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

function getFlagValue(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx >= 0 && idx + 1 < args.length) {
    return args[idx + 1];
  }
  return undefined;
}

// ── Subcommand: init ──

const BRAIN_DIRS = [
  "inbox",
  "inbox/processed",
  "preferences",
  "retired",
  "notes",
  "obligations",
  "log",
  ".snapshots",
];

const DEFAULT_BRAIN_YAML = `# Brain configuration — safe to edit
dream:
  candidate_threshold: 3
  stale_evidence_days: 90
  unconfirmed_ttl_days: 30
  low_max_applied: 2
  snapshot_retention: 5
`;

const BRAIN_OPERATING_MANUAL = `# Brain Operating Manual

## What this is
Brain is an AI-native memory layer that lives inside your Obsidian vault. It collects signals, forms preferences, and keeps a human-readable log of decisions.

## How it works
1. **inbox/** — AI agents drop signal files here (kind: signal in frontmatter)
2. **dream** — The dream pipeline runs periodically, groups signals by topic, and creates or rebuts preferences
3. **preferences/** — Machine-readable rules (kind: preference) created by the dream pipeline
4. **retired/** — Preferences that have been rebutted, expired, or gone stale
5. **log/** — Timestamped decision log (one .md file per day)
6. **notes/** — Free-form human notes (never touched by the dream pipeline)
7. **obligations/** — Active obligations the AI must follow
8. **.snapshots/** — Compressed archives created before each dream run for rollback
9. **active.md** — Auto-generated summary of all confirmed and quarantined preferences

## Running the dream
\`\`\`bash
# Preview what would happen
o2b brain dream --dry-run

# Actually run it
o2b brain dream
\`\`\`

## Checking status
\`\`\`bash
o2b brain status
\`\`\`

## Search
\`\`\`bash
o2b search reindex    # Rebuild FTS5 index
\`\`\`

## Writing a signal
Create a .md file in Brain/inbox/ with this frontmatter:
\`\`\`yaml
---
kind: signal
topic: my-topic-slug
sign: positive  # or negative
principle: "The rule the AI should follow"
agent: claude-3.5
timestamp: "2025-01-01T00:00:00Z"
---
\`\`\`

The dream pipeline will collect multiple signals on the same topic and form preferences when the candidate threshold is met.
`;

function cmdInit(args: string[]): void {
  const vaultPath = getFlagValue(args, "--vault");
  if (!vaultPath) {
    console.error("Error: --vault <path> is required for init");
    console.error("Usage: o2b init --vault <path>");
    process.exit(1);
  }

  const resolved = vaultPath.startsWith("/") || vaultPath.startsWith("~")
    ? join(vaultPath.replace(/^~/, process.env["HOME"] ?? "/Users"))
    : join(process.cwd(), vaultPath);
  const brainRoot = join(resolved, "Brain");

  if (existsSync(brainRoot)) {
    console.log(`Brain/ already exists at ${brainRoot}`);
    console.log("Directories that already exist will be skipped.");
  }

  // Create directory structure
  for (const dir of BRAIN_DIRS) {
    const target = join(brainRoot, dir);
    if (!existsSync(target)) {
      mkdirSync(target, { recursive: true });
      console.log(`  created: ${join("Brain", dir)}/`);
    }
  }

  // Write _brain.yaml
  const brainYamlPath = join(brainRoot, "_brain.yaml");
  if (!existsSync(brainYamlPath)) {
    Bun.write(brainYamlPath, DEFAULT_BRAIN_YAML);
    console.log("  created: Brain/_brain.yaml");
  }

  // Write _BRAIN.md
  const brainMdPath = join(brainRoot, "_BRAIN.md");
  if (!existsSync(brainMdPath)) {
    Bun.write(brainMdPath, BRAIN_OPERATING_MANUAL);
    console.log("  created: Brain/_BRAIN.md");
  }

  console.log(`\nBrain initialized at ${brainRoot}`);
  console.log("Set BRAIN_VAULT environment variable:");
  console.log(`  export BRAIN_VAULT="${resolved}"`);
}

// ── Subcommand: config show ──

async function cmdConfigShow(): Promise<void> {
  const config = await loadConfig();
  console.log(JSON.stringify(config, null, 2));
}

// ── Subcommand: brain dream ──

async function cmdBrainDream(args: string[]): Promise<void> {
  const dryRun = hasFlag(args, "--dry-run");
  if (dryRun) {
    console.log("🧠 Brain Dream — DRY RUN (no changes will be made)\n");
  } else {
    console.log("🧠 Brain Dream — running...\n");
  }

  const result = await runDream(dryRun);
  console.log(JSON.stringify(result, null, 2));
}

// ── Subcommand: brain status ──

async function cmdBrainStatus(): Promise<void> {
  const brainPath = brainDir();

  // Inbox signals
  const inboxDir = join(brainPath, "inbox");
  const inboxFiles = listDir(inboxDir).filter(
    (f) => f.endsWith(".md") && !f.includes("processed")
  );

  // Preferences
  const prefsDir = join(brainPath, "preferences");
  const prefFiles = listDir(prefsDir).filter((f) => f.endsWith(".md"));
  const prefs: Array<{ id: string; status: string; confidence: string }> = [];
  for (const file of prefFiles) {
    try {
      const pref = await parsePreference(join(prefsDir, file));
      prefs.push({
        id: pref.id,
        status: pref.status,
        confidence: pref.confidence,
      });
    } catch {
      // skip unparseable
    }
  }

  const unconfirmed = prefs.filter((p) => p.status === "unconfirmed").length;
  const confirmed = prefs.filter((p) => p.status === "confirmed").length;
  const quarantined = prefs.filter((p) => p.status === "quarantine").length;

  // Snapshots
  const snaps = listSnapshots();

  // Retired
  const retiredDir = join(brainPath, "retired");
  const retiredFiles = listDir(retiredDir).filter((f) => f.endsWith(".md"));

  // Obligations
  const oblDir = join(brainPath, "obligations");
  const oblFiles = listDir(oblDir).filter((f) => f.endsWith(".md"));

  // Notes
  const notesDir = join(brainPath, "notes");
  const notesFiles = listDir(notesDir).filter((f) => f.endsWith(".md"));

  // Log
  const logDir = join(brainPath, "log");
  const logFiles = listDir(logDir).filter((f) => f.endsWith(".md"));

  const vault = process.env["BRAIN_VAULT"] ?? "(not set)";

  console.log("Brain Vault Status");
  console.log("==================");
  console.log(`  Vault path:    ${vault}`);
  console.log(`  Brain dir:     ${brainPath}`);
  console.log();
  console.log("Signals");
  console.log("-------");
  console.log(`  Inbox:         ${inboxFiles.length} pending`);
  console.log();
  console.log("Preferences");
  console.log("-----------");
  console.log(`  Total:         ${prefs.length}`);
  console.log(`  Unconfirmed:   ${unconfirmed}`);
  console.log(`  Confirmed:     ${confirmed}`);
  console.log(`  Quarantined:   ${quarantined}`);
  console.log(`  Retired:       ${retiredFiles.length}`);
  console.log();
  console.log("Other");
  console.log("-----");
  console.log(`  Obligations:   ${oblFiles.length}`);
  console.log(`  Notes:         ${notesFiles.length}`);
  console.log(`  Log files:     ${logFiles.length}`);
  console.log(`  Snapshots:     ${snaps.length}`);
}

// ── Subcommand: search reindex ──

function cmdSearchReindex(): void {
  console.log("Rebuilding FTS5 search index...");
  const index = new SearchIndex();
  try {
    index.open();
    index.reindex();
    console.log("Index rebuilt successfully.");
  } finally {
    index.close();
  }
}

// ── Subcommand: mcp ──

function cmdMcp(): void {
  const server = new MCPServer();
  server.start().catch((err) => {
    console.error("MCP server error:", err);
    process.exit(1);
  });
}

// ── Main Dispatch ──

function main(): void {
  const args = process.argv.slice(2);

  if (args.length === 0 || hasFlag(args, "--help") || hasFlag(args, "-h")) {
    console.log(HELP);
    process.exit(0);
  }

  const cmd = args[0];
  const rest = args.slice(1);

  // o2b mcp
  if (cmd === "mcp") {
    cmdMcp();
    return;
  }

  // o2b init
  if (cmd === "init") {
    cmdInit(rest);
    return;
  }

  // o2b config show
  if (cmd === "config" && rest[0] === "show") {
    cmdConfigShow().catch((err) => {
      console.error("Error:", err.message);
      process.exit(1);
    });
    return;
  }

  // o2b brain dream [--dry-run]
  if (cmd === "brain" && rest[0] === "dream") {
    cmdBrainDream(rest).catch((err) => {
      console.error("Error:", err.message);
      process.exit(1);
    });
    return;
  }

  // o2b brain status
  if (cmd === "brain" && rest[0] === "status") {
    cmdBrainStatus().catch((err) => {
      console.error("Error:", err.message);
      process.exit(1);
    });
    return;
  }

  // o2b search reindex
  if (cmd === "search" && rest[0] === "reindex") {
    cmdSearchReindex();
    return;
  }

  // Unknown
  console.error(`Unknown command: ${cmd} ${rest.join(" ")}`);
  console.error("Run 'o2b --help' for usage.");
  process.exit(1);
}

main();

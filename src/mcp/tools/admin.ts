import { join } from "node:path";
import { loadConfig } from "../../core/config";
import { brainDir, listDir, fileExists, readFile } from "../../core/vault";
import { listSnapshots, restoreSnapshot } from "../../core/snapshot";

export async function handleBrainStatus(): Promise<unknown> {
  const config = await loadConfig();
  const prefsDir = join(brainDir(), "preferences");
  const inboxDir = join(brainDir(), "inbox");
  const logDir = join(brainDir(), "log");

  const prefsCount = fileExists(prefsDir)
    ? listDir(prefsDir).filter((f) => f.endsWith(".md")).length
    : 0;
  const signalsCount = fileExists(inboxDir)
    ? listDir(inboxDir).filter((f) => f.endsWith(".md")).length
    : 0;
  const logFiles = fileExists(logDir)
    ? listDir(logDir)
        .filter((f) => f.endsWith(".md"))
        .sort()
    : [];

  return {
    vault_path: config.vaultPath,
    preferences_count: prefsCount,
    signals_count: signalsCount,
    last_dream:
      logFiles.length > 0
        ? logFiles[logFiles.length - 1]!.replace(".md", "")
        : null,
    config: {
      candidate_threshold: config.candidateThreshold,
      stale_evidence_days: config.staleEvidenceDays,
    },
  };
}

function parseLogEntry(line: string): Record<string, unknown> | null {
  // Format: "- **<timestamp>** | <kind> | key=value | key=value | ..."
  const match = line.match(/^- \*\*(\d{2}:\d{2}:\d{2})\*\* \| (\S+)(.*)$/);
  if (!match) return null;

  const timestamp = match[1]!;
  const kind = match[2]!;
  const rest = match[3] ?? "";

  const entry: Record<string, unknown> = { timestamp, kind };

  // Parse remaining key=value pairs
  const pairs = rest.split("|").map((s) => s.trim()).filter(Boolean);
  for (const pair of pairs) {
    const eqIdx = pair.indexOf("=");
    if (eqIdx === -1) continue;
    const key = pair.slice(0, eqIdx).trim();
    const value = pair.slice(eqIdx + 1).trim();
    // Store as-is; let caller distinguish empty vs non-empty
    entry[key] = value || null;
  }

  return entry;
}

export async function handleBrainAudit(
  args: Record<string, unknown>,
): Promise<unknown> {
  const prefId = args["pref_id"] as string;

  if (!prefId) {
    throw new Error("pref_id is required");
  }

  const logDir = join(brainDir(), "log");
  const events: Record<string, unknown>[] = [];

  if (!fileExists(logDir)) {
    return { pref_id: prefId, events };
  }

  const logFiles = listDir(logDir)
    .filter((f) => f.endsWith(".md"))
    .sort();

  for (const logFile of logFiles) {
    const content = await readFile(join(logDir, logFile));
    const lines = content.split("\n");

    for (const line of lines) {
      if (!line.includes(`pref_id=${prefId}`)) continue;

      const entry = parseLogEntry(line);
      if (entry) {
        events.push(entry);
      }
    }
  }

  return { pref_id: prefId, events };
}

export async function handleBrainRollback(
  args: Record<string, unknown>,
): Promise<unknown> {
  const snapshots = listSnapshots();

  if (snapshots.length === 0) {
    throw new Error("No snapshots found. Run a dream cycle first to create snapshots.");
  }

  const latestSnapshot = snapshots[0]!;
  await restoreSnapshot(latestSnapshot);

  return { rollback_id: latestSnapshot };
}

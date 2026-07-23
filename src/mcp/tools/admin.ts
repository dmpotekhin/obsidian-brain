import { join } from "node:path";
import { loadConfig } from "../../core/config";
import { brainDir, listDir, fileExists } from "../../core/vault";

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

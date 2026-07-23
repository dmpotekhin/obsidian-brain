import { join } from "node:path";
import { mkdirSync, renameSync } from "node:fs";
import { brainDir, listDir, readFile, fileExists } from "./vault";
import { parseFrontmatter } from "./frontmatter";
import { loadConfig } from "./config";
import { writePreference, parsePreference, moveToRetired } from "./preference";
import { createSnapshot, pruneSnapshots } from "./snapshot";
import { regenerateActive } from "./active";
import { appendLogEvent } from "./log";
import { collectEvidenceForSlug } from "./evidence";

/**
 * Check if a preference has been marked as outdated (superseded) in the log files.
 * Returns true if any log entry has result=outdated for this preference.
 */
function checkSuperseded(prefId: string): boolean {
  const logDir = join(brainDir(), "log");
  const files = listDir(logDir).filter((f) => f.endsWith(".md"));
  for (const file of files) {
    const logPath = join(logDir, file);
    try {
      const { readFileSync } = require("node:fs");
      const content = readFileSync(logPath, "utf-8");
      if (content.includes(`pref_id=${prefId}`) && content.includes("result=outdated")) {
        return true;
      }
    } catch {
      // skip
    }
  }
  return false;
}

interface SignalRecord {
  id: string;
  slug: string;
  topic: string;
  sign: "positive" | "negative";
  principle: string;
  agent: string;
  timestamp: string;
  path: string;
}

export interface DreamResult {
  run_id: string;
  signals_processed: number;
  preferences_created: number;
  preferences_retired: number;
  quarantine_changes: number;
  dry_run: boolean;
}

export async function runDream(dryRun = false): Promise<DreamResult> {
  const config = await loadConfig();
  const now = new Date();
  const timestamp = now.toISOString().replace(/\.\d{3}/, "");

  // Phase 1: Snapshot (skip in dryRun)
  let runId: string;
  if (dryRun) {
    runId = `dream-dry-${now.toISOString().replace(/[-:T]/g, "").slice(0, 15)}`;
  } else {
    runId = await createSnapshot();
  }

  // Phase 2: Scan inbox signals
  const inboxDir = join(brainDir(), "inbox");
  const signalEntries = listDir(inboxDir)
    .filter((f) => f.endsWith(".md") && !f.includes("processed"));
  const signalFiles = signalEntries.map((f) => join(inboxDir, f));

  const signals: SignalRecord[] = [];
  for (const path of signalFiles) {
    try {
      const content = await readFile(path);
      const { data } = parseFrontmatter(content);
      if (data["kind"] === "signal") {
        signals.push({
          id: path.split("/").pop()!.replace(".md", ""),
          slug: ((data["topic"] as string) ?? ""),
          topic: ((data["topic"] as string) ?? ""),
          sign: (data["sign"] as "positive" | "negative") ?? "positive",
          principle: (data["principle"] as string) ?? "",
          agent: (data["agent"] as string) ?? "unknown",
          timestamp: (data["timestamp"] as string) ?? timestamp,
          path,
        });
      }
    } catch {
      // Skip corrupted files
    }
  }

  // Phase 3: Group by topic slug
  const groups = new Map<string, SignalRecord[]>();
  for (const sig of signals) {
    const key = sig.slug;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(sig);
  }

  // Phase 4: Scan existing preferences
  const prefsDir = join(brainDir(), "preferences");
  const prefFiles = listDir(prefsDir).filter((f) => f.endsWith(".md"));
  const existingPrefs = new Map<
    string,
    { path: string; status: string; pinned: boolean; sign: string }
  >();

  for (const file of prefFiles) {
    try {
      const pref = await parsePreference(join(prefsDir, file));
      existingPrefs.set(pref.id.replace("pref-", ""), {
        path: join(prefsDir, file),
        status: pref.status,
        pinned: pref.pinned,
        sign: pref.sign,
      });
    } catch {
      // Skip
    }
  }

  // Phase 5: Resolve — create new preferences, rebut existing ones
  let created = 0;
  let retired = 0;
  let quarantineChanges = 0;

  // Track all signal paths so every scanned signal gets moved to processed
  // This ensures idempotency: subsequent runs see an empty inbox
  const allSignalPaths: string[] = signals.map((s) => s.path);

  for (const [slug, group] of groups) {
    const negCount = group.filter((s) => s.sign === "negative").length;
    const posCount = group.filter((s) => s.sign === "positive").length;
    const dominantSign: "positive" | "negative" =
      negCount >= posCount ? "negative" : "positive";

    const existing = existingPrefs.get(slug);

    if (existing) {
      if (existing.sign === dominantSign) {
        // Same sign — redundant signals, noted
      } else {
        // Opposite sign — rebut the existing preference if threshold met
        if (group.length >= config.candidateThreshold && !existing.pinned) {
          if (!dryRun) {
            await moveToRetired(`pref-${slug}`, "rebutted");
          }
          retired++;
          // Remove from existingPrefs so retirement phase doesn't double-count
          existingPrefs.delete(slug);
        }
      }
    } else {
      // No existing preference — create if threshold met
      if (group.length >= config.candidateThreshold) {
        if (!dryRun) {
          await writePreference(
            {
              id: `pref-${slug}`,
              status: "unconfirmed",
              created: timestamp,
              updated: timestamp,
              sign: dominantSign,
              evidence_count: 0,
              applied_count: 0,
              violated_count: 0,
              confidence: "low",
              pinned: false,
            },
            `# ${slug.replace(/-/g, " ")}\n\n${group[0]!.principle}\n\nCreated from ${group.length} signals.`
          );
        }
        created++;
      }
    }
  }

  // Phase 6: Retire, quarantine, and supersede checks
  for (const [slug, existing] of existingPrefs) {
    if (existing.status === "unconfirmed") {
      try {
        const pref = await parsePreference(existing.path);
        const createdDate = new Date(pref.created);
        const daysSinceCreation =
          (now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceCreation > config.unconfirmedTtlDays && !existing.pinned) {
          if (!dryRun) {
            await moveToRetired(`pref-${slug}`, "expired-unconfirmed");
          }
          retired++;
        }
      } catch {
        /* skip */
      }
    } else if (existing.status === "confirmed") {
      const evidence = collectEvidenceForSlug(`pref-${slug}`);

      // Check for supersede (outdated) evidence in log files
      const superseeded = checkSuperseded(`pref-${slug}`);
      if (superseeded && !existing.pinned) {
        if (!dryRun) {
          await moveToRetired(`pref-${slug}`, "superseded");
        }
        retired++;
        continue;
      }

      // Check staleness
      if (evidence.lastEvidenceAt) {
        const lastDate = new Date(evidence.lastEvidenceAt);
        const daysSinceEvidence =
          (now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceEvidence > config.staleEvidenceDays && !existing.pinned) {
          if (!dryRun) {
            await moveToRetired(`pref-${slug}`, "stale-no-evidence");
          }
          retired++;
          continue;
        }
      }

      // Quarantine rule: confirmed + violated >= applied AND applied > lowMaxApplied → quarantine
      if (
        evidence.violated >= evidence.applied &&
        evidence.applied > config.lowMaxApplied &&
        !existing.pinned
      ) {
        if (!dryRun) {
          const pref = await parsePreference(existing.path);
          pref.status = "quarantine";
          pref.updated = timestamp;
          await writePreference(pref, pref.body);
        }
        quarantineChanges++;
      }
    } else if (existing.status === "quarantine") {
      const evidence = collectEvidenceForSlug(`pref-${slug}`);

      // Quarantine-recover: applied > violated → back to confirmed
      if (evidence.applied > evidence.violated && !existing.pinned) {
        if (!dryRun) {
          const pref = await parsePreference(existing.path);
          pref.status = "confirmed";
          pref.updated = timestamp;
          await writePreference(pref, pref.body);
        }
        quarantineChanges++;
      }
    }
  }

  // Phase 7: Move processed signals, regenerate active.md, prune snapshots
  if (!dryRun) {
    const processedDir = join(inboxDir, "processed");
    mkdirSync(processedDir, { recursive: true });
    for (const path of allSignalPaths) {
      try {
        const name = path.split("/").pop()!;
        renameSync(path, join(processedDir, name));
      } catch {
        /* already moved */
      }
    }

    await regenerateActive();
    await pruneSnapshots(config.snapshotRetention);
  }

  // Phase 8: Log event (only if changes occurred)
  if (!dryRun && (signals.length > 0 || created > 0 || retired > 0)) {
    await appendLogEvent({
      kind: "dream",
      timestamp,
      run_id: runId,
      signals: signals.length,
      created,
      retired,
      quarantine_changes: quarantineChanges,
    });
  }

  return {
    run_id: runId,
    signals_processed: signals.length,
    preferences_created: created,
    preferences_retired: retired,
    quarantine_changes: quarantineChanges,
    dry_run: dryRun,
  };
}

import { join } from "node:path";
import { brainDir, listDir, fileExists } from "../../core/vault";
import { parsePreference } from "../../core/preference";

interface HealthFinding {
  kind: string;
  description: string;
  path?: string;
}

interface HealthDomain {
  name: string;
  status: "ok" | "warning" | "error";
  findings: HealthFinding[];
}

export async function handleBrainHealth(): Promise<unknown> {
  const domains: HealthDomain[] = [];

  // 1. Config check
  const configPath = join(brainDir(), "_brain.yaml");
  domains.push({
    name: "config",
    status: fileExists(configPath) ? "ok" : "warning",
    findings: fileExists(configPath)
      ? []
      : [{ kind: "missing_config", description: "_brain.yaml not found — using defaults" }],
  });

  // 2. Directory structure
  const requiredDirs = ["inbox", "preferences", "retired", "log", ".snapshots"];
  const missing: HealthFinding[] = [];
  for (const dir of requiredDirs) {
    if (!fileExists(join(brainDir(), dir))) {
      missing.push({ kind: "missing_dir", description: `Directory missing: ${dir}` });
    }
  }
  domains.push({
    name: "structure",
    status: missing.length === 0 ? "ok" : "error",
    findings: missing,
  });

  // 3. Duplicate preference IDs
  const prefsDir = join(brainDir(), "preferences");
  const dups: HealthFinding[] = [];
  if (fileExists(prefsDir)) {
    const ids = new Set<string>();
    for (const f of listDir(prefsDir).filter((file) => file.endsWith(".md"))) {
      try {
        const pref = await parsePreference(join(prefsDir, f));
        if (ids.has(pref.id)) {
          dups.push({
            kind: "duplicate_id",
            description: `Duplicate preference ID: ${pref.id}`,
            path: f,
          });
        }
        ids.add(pref.id);
      } catch {
        /* skip unparseable files */
      }
    }
  }
  domains.push({
    name: "duplicates",
    status: dups.length === 0 ? "ok" : "error",
    findings: dups,
  });

  const hasErrors = domains.some((d) => d.status === "error");
  const hasWarnings = domains.some((d) => d.status === "warning");

  return {
    verdict: hasErrors ? "unhealthy" : hasWarnings ? "watch" : "healthy",
    domains,
  };
}

export async function handleBrainHygiene(
  args: Record<string, unknown>,
): Promise<unknown> {
  const scan = args["scan"] !== false; // default true
  if (!scan) {
    return { findings: [], message: "Scan skipped (scan=false)" };
  }

  const findings: HealthFinding[] = [];

  // Check for very similar preference titles (simple duplicate detection)
  const prefsDir = join(brainDir(), "preferences");
  if (fileExists(prefsDir)) {
    const titles: { path: string; title: string }[] = [];
    for (const f of listDir(prefsDir).filter((file) => file.endsWith(".md"))) {
      try {
        const pref = await parsePreference(join(prefsDir, f));
        titles.push({ path: f, title: pref.id });
      } catch {
        /* skip unparseable files */
      }
    }

    // Find near-duplicates by normalized title
    for (let i = 0; i < titles.length; i++) {
      for (let j = i + 1; j < titles.length; j++) {
        const a = titles[i]!.title.toLowerCase().replace(/[^a-z0-9]/g, "");
        const b = titles[j]!.title.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (
          a === b ||
          (a.length > 5 && b.length > 5 && (a.includes(b) || b.includes(a)))
        ) {
          findings.push({
            kind: "near_duplicate",
            description: `Similar preferences: ${titles[i]!.title} and ${titles[j]!.title}`,
          });
        }
      }
    }
  }

  // Check for orphan signals (very old, unprocessed)
  const inboxDir = join(brainDir(), "inbox");
  if (fileExists(inboxDir)) {
    const oldThreshold = Date.now() - 90 * 24 * 60 * 60 * 1000; // 90 days
    for (const f of listDir(inboxDir).filter((file) => file.endsWith(".md"))) {
      const dateMatch = f.match(/sig-(\d{4}-\d{2}-\d{2})/);
      if (dateMatch) {
        const sigDate = new Date(dateMatch[1]!).getTime();
        if (sigDate < oldThreshold) {
          findings.push({
            kind: "stale_signal",
            description: `Signal older than 90 days: ${f}`,
            path: join(inboxDir, f),
          });
        }
      }
    }
  }

  return { findings, count: findings.length };
}

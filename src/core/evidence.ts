import { join } from "node:path";
import { readFileSync, existsSync } from "node:fs";
import { brainDir, listDir } from "./vault";

export interface EvidenceResult {
  applied: number;
  violated: number;
  lastEvidenceAt: string | null;
}

export function collectEvidenceForSlug(slug: string): EvidenceResult {
  const logDir = join(brainDir(), "log");
  const files = listDir(logDir).filter((f) => f.endsWith(".md"));
  let applied = 0;
  let violated = 0;
  let lastEvidenceAt: string | null = null;

  for (const file of files) {
    const logPath = join(logDir, file);
    if (!existsSync(logPath)) continue;

    const date = file.replace(/\.md$/, "");
    const content = readFileSync(logPath, "utf-8");
    const lines = content.split("\n");
    for (const line of lines) {
      if (!line.includes(`pref_id=${slug}`)) continue;
      if (line.includes("result=applied")) {
        applied++;
        const ts = buildTimestamp(date, line);
        if (ts && (!lastEvidenceAt || ts > lastEvidenceAt)) lastEvidenceAt = ts;
      } else if (line.includes("result=violated")) {
        violated++;
        const ts = buildTimestamp(date, line);
        if (ts && (!lastEvidenceAt || ts > lastEvidenceAt)) lastEvidenceAt = ts;
      }
    }
  }

  return { applied, violated, lastEvidenceAt };
}

function buildTimestamp(_date: string, line: string): string | null {
  const match = line.match(/\*\*(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)\*\*/);
  if (!match) return null;
  return match[1]!;
}

export function countApplied(slug: string): number {
  return collectEvidenceForSlug(slug).applied;
}

export function countViolated(slug: string): number {
  return collectEvidenceForSlug(slug).violated;
}

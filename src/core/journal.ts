import { join } from "node:path";
import { brainDir, listDir, readFile } from "./vault";

export interface JournalEntry {
  time: string;
  project?: string;
  entry: string;
}

const ENTRY_RE = /^(\d{2}:\d{2})(?: \| project:([^|]+))? \| (.*)$/;

/**
 * Returns the last `max` journal entries across journal/YYYY-MM-DD.md files,
 * in chronological order (oldest of the window first, newest last). Entries
 * are read across days, newest day's file last.
 */
export async function getRecentJournalEntries(
  max: number,
): Promise<JournalEntry[]> {
  if (max <= 0) return [];

  const journalDir = join(brainDir(), "journal");
  const files = listDir(journalDir)
    .filter(f => f.endsWith(".md"))
    .toSorted(); // chronological: YYYY-MM-DD sorts lexicographically

  const all: JournalEntry[] = [];

  for (const file of files) {
    const content = await readFile(join(journalDir, file));
    for (const line of content.split("\n")) {
      const match = line.trim().match(ENTRY_RE);
      if (!match) continue;
      all.push({
        time: match[1]!,
        project: match[2]?.trim() || undefined,
        entry: match[3]!.trim(),
      });
    }
  }

  return all.slice(-max);
}

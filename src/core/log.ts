import { join } from "node:path";
import { brainDir, atomicWrite, readFile, fileExists } from "./vault";

export interface BrainLogEntry {
  kind: string;
  timestamp: string;
  [key: string]: unknown;
}

function formatEvent(entry: BrainLogEntry): string {
  const parts = [`**${entry.timestamp}** | ${entry.kind}`];
  for (const [key, value] of Object.entries(entry)) {
    if (key === "kind" || key === "timestamp") continue;
    parts.push(`${key}=${value}`);
  }
  return `- ${parts.join(" | ")}`;
}

export async function appendLogEvent(entry: BrainLogEntry): Promise<string> {
  const date = new Date().toISOString().slice(0, 10);
  const logDir = join(brainDir(), "log");
  const logPath = join(logDir, `${date}.md`);
  const line = formatEvent(entry);

  if (fileExists(logPath)) {
    const existing = await readFile(logPath);
    const updated = existing.trimEnd() + "\n" + line + "\n";
    await atomicWrite(logPath, updated);
  } else {
    const header = `---
date: ${date}
events_count: 1
---

## Events

${line}
`;
    await atomicWrite(logPath, header);
  }

  return line;
}

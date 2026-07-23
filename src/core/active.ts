import { join } from "node:path";
import { brainDir, listDir, atomicWrite } from "./vault";
import { parsePreference } from "./preference";

export async function regenerateActive(): Promise<string> {
  const prefsDir = join(brainDir(), "preferences");
  const files = listDir(prefsDir).filter(f => f.endsWith(".md"));
  const sections: string[] = [];

  sections.push(`# Active Memory\n`);
  sections.push(`> Auto-generated at ${new Date().toISOString()}. Do not edit manually.\n`);

  const confirmed: string[] = [];
  const quarantined: string[] = [];

  for (const file of files) {
    const pref = await parsePreference(join(prefsDir, file));
    if (pref.status === "confirmed") {
      confirmed.push(`## ${pref.id}\n\n**Status:** confirmed | **Confidence:** ${pref.confidence} | **Applied:** ${pref.applied_count}/${pref.applied_count + pref.violated_count}\n\n${pref.body}`);
    } else if (pref.status === "quarantine") {
      quarantined.push(`## ${pref.id} ⚠️ QUARANTINE\n\n**Status:** quarantine | **Applied:** ${pref.applied_count} | **Violated:** ${pref.violated_count}\n\n${pref.body}`);
    }
  }

  if (confirmed.length > 0) {
    sections.push("## Confirmed Rules\n");
    sections.push(...confirmed);
  }

  if (quarantined.length > 0) {
    sections.push("\n## Quarantined Rules\n");
    sections.push(...quarantined);
  }

  if (confirmed.length === 0 && quarantined.length === 0) {
    sections.push("_No active rules yet. Signals are accumulating in Brain/inbox/._");
  }

  const activePath = join(brainDir(), "active.md");
  await atomicWrite(activePath, sections.join("\n\n"));
  return activePath;
}

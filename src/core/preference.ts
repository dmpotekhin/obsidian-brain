import { join } from "node:path";
import { unlinkSync } from "node:fs";
import { brainDir, atomicWrite, readFile, fileExists } from "./vault";
import { writeFrontmatter, parseFrontmatter } from "./frontmatter";

export interface PreferenceData {
  id: string;
  status: "unconfirmed" | "confirmed" | "quarantine";
  created: string;
  updated: string;
  sign: "positive" | "negative";
  evidence_count: number;
  applied_count: number;
  violated_count: number;
  confidence: "low" | "medium" | "high";
  pinned: boolean;
}

export async function writePreference(
  slug: string,
  data: PreferenceData,
  body: string,
): Promise<string> {
  const prefsDir = join(brainDir(), "preferences");
  const path = join(prefsDir, `${data.id}.md`);
  const content = writeFrontmatter(data as unknown as Record<string, unknown>, body);
  await atomicWrite(path, content);
  return path;
}

export async function parsePreference(
  path: string,
): Promise<PreferenceData & { body: string }> {
  const content = await readFile(path);
  const { data, body } = parseFrontmatter(content);
  return {
    id: data["id"] as string,
    status: data["status"] as PreferenceData["status"],
    created: data["created"] as string,
    updated: data["updated"] as string,
    sign: data["sign"] as PreferenceData["sign"],
    evidence_count: (data["evidence_count"] as number) ?? 0,
    applied_count: (data["applied_count"] as number) ?? 0,
    violated_count: (data["violated_count"] as number) ?? 0,
    confidence: (data["confidence"] as PreferenceData["confidence"]) ?? "low",
    pinned: (data["pinned"] as boolean) ?? false,
    body,
  };
}

export async function moveToRetired(
  prefId: string,
  reason: string,
): Promise<string> {
  const prefsDir = join(brainDir(), "preferences");
  const retiredDir = join(brainDir(), "retired");
  const sourcePath = join(prefsDir, `${prefId}.md`);
  const slug = prefId.replace(/^pref-/, "");
  const retiredId = `ret-${slug}`;

  if (!fileExists(sourcePath)) {
    throw new Error(`Preference not found: ${prefId}`);
  }

  const pref = await parsePreference(sourcePath);
  const retiredData = {
    id: retiredId,
    status: "retired",
    retired_reason: reason,
    retired_at: new Date().toISOString().replace(/\.\d{3}/, ""),
    previous_id: prefId,
  };

  const content = writeFrontmatter(
    retiredData as unknown as Record<string, unknown>,
    pref.body,
  );
  const targetPath = join(retiredDir, `${retiredId}.md`);
  await atomicWrite(targetPath, content);

  // Remove original
  unlinkSync(sourcePath);

  return targetPath;
}

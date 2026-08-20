import { writeSignal } from "../../core/signal";
import { parsePreference, writePreference, moveToRetired } from "../../core/preference";
import { appendLogEvent } from "../../core/log";
import { join, resolve, relative, normalize } from "node:path";
import { brainDir, atomicWrite, fileExists } from "../../core/vault";
import { writeFrontmatter } from "../../core/frontmatter";
import { extractEntities } from "../../core/entities";
import { mkdirSync, readFileSync } from "node:fs";

export async function handleBrainFeedback(
  args: Record<string, unknown>,
): Promise<unknown> {
  const topic = args["topic"] as string;
  const sign = args["sign"] as "positive" | "negative";
  const principle = args["principle"] as string;
  const agent = args["agent"] as string;
  const scope = (args["scope"] as string) ?? "general";

  if (!topic || !sign || !principle || !agent) {
    throw new Error("Missing required arguments: topic, sign, principle, agent");
  }

  if (sign !== "positive" && sign !== "negative") {
    throw new Error(`Invalid sign: ${sign}. Must be "positive" or "negative"`);
  }

  const validScopes = ["coding", "communication", "writing", "general"];
  if (scope && !validScopes.includes(scope)) {
    throw new Error(`Invalid scope: ${scope}. Must be one of: ${validScopes.join(", ")}`);
  }

  const result = await writeSignal(topic, sign, principle, agent, scope);
  return {
    signal_path: result.path,
    signal_id: result.id,
  };
}

export async function handleBrainApplyEvidence(
  args: Record<string, unknown>,
): Promise<unknown> {
  const prefId = args["pref_id"] as string;
  const result = args["result"] as "applied" | "violated" | "outdated";
  const context = (args["context"] as string) ?? "";

  if (!prefId || !result) {
    throw new Error("pref_id and result are required");
  }

  if (!["applied", "violated", "outdated"].includes(result)) {
    throw new Error(`Invalid result: ${result}`);
  }

  const timestamp = new Date().toISOString().replace(/\.\d{3}/, "");

  // Handle outdated — immediately retire with reason "superseded"
  if (result === "outdated") {
    await moveToRetired(prefId, "superseded");

    await appendLogEvent({
      kind: "apply-evidence",
      timestamp,
      pref_id: prefId,
      result,
      context: context || undefined,
      new_status: "retired",
    });

    return {
      evidence_id: `ev-${timestamp.replace(/[-:]/g, "")}`,
      new_status: "retired",
    };
  }

  // Read current preference
  const prefPath = join(brainDir(), "preferences", `${prefId}.md`);
  const pref = await parsePreference(prefPath);

  // Update counters
  let newStatus = pref.status;
  if (result === "applied") {
    pref.applied_count++;
    if (pref.status === "unconfirmed") {
      newStatus = "confirmed";
    } else if (pref.status === "quarantine" && pref.applied_count > pref.violated_count) {
      // Quarantine-recover: quarantine + applied > violated → confirmed
      newStatus = "confirmed";
    }
  } else if (result === "violated") {
    pref.violated_count++;
    if (pref.status === "quarantine") {
      // Quarantine-escalate: quarantine + one more violated → retired
      await moveToRetired(prefId, "quarantine-violated");

      await appendLogEvent({
        kind: "apply-evidence",
        timestamp,
        pref_id: prefId,
        result,
        context: context || undefined,
        new_status: "retired",
      });

      return {
        evidence_id: `ev-${timestamp.replace(/[-:]/g, "")}`,
        new_status: "retired",
      };
    }
  }

  pref.updated = timestamp;
  pref.status = newStatus;
  pref.evidence_count = pref.applied_count + pref.violated_count;

  await writePreference(pref, pref.body);

  await appendLogEvent({
    kind: "apply-evidence",
    timestamp,
    pref_id: prefId,
    result,
    context: context || undefined,
    new_status: newStatus,
  });

  return {
    evidence_id: `ev-${timestamp.replace(/[-:]/g, "")}`,
    new_status: newStatus,
  };
}

export async function handleBrainCreateNote(
  args: Record<string, unknown>,
): Promise<unknown> {
  const relPath = args["path"] as string;
  const frontmatter = (args["frontmatter"] as Record<string, unknown>) ?? {};
  const content = (args["content"] as string) ?? "";

  if (!relPath || typeof relPath !== "string") {
    throw new Error("path is required and must be a string");
  }

  // Security: refuse traversal attempts
  const normalized = normalize(relPath);
  if (normalized.includes("..")) {
    throw new Error(`Path traversal denied: ${relPath}`);
  }

  // Security: refuse absolute paths
  if (relPath.startsWith("/")) {
    throw new Error(`Absolute paths not allowed: ${relPath}`);
  }

  // Require .md extension
  if (!relPath.endsWith(".md")) {
    throw new Error("File path must end with .md");
  }

  // Construct the full target path under Brain/notes/
  const notesDir = join(brainDir(), "notes");
  const targetPath = resolve(notesDir, normalized);

  // Verify the resolved path is still inside Brain/notes/
  const rel = relative(notesDir, targetPath);
  if (rel.startsWith("..") || rel === "") {
    throw new Error(`Path outside notes directory: ${relPath}`);
  }

  // Security: refuse clobbering existing files
  if (fileExists(targetPath)) {
    throw new Error(`File already exists: ${relPath}`);
  }

  // Auto-generate entities (ai-memory style) unless explicitly provided
  if (!Array.isArray(frontmatter["entities"])) {
    frontmatter["entities"] = extractEntities(
      content,
      (frontmatter["title"] as string) ?? "",
    );
  }

  // Create the note
  const body = writeFrontmatter(frontmatter, content);
  mkdirSync(targetPath.substring(0, targetPath.lastIndexOf("/")), { recursive: true });
  await atomicWrite(targetPath, body);

  return {
    path: targetPath,
    relative_path: join("Brain/notes", normalized),
  };
}

export async function handleBrainDevlog(
  args: Record<string, unknown>,
): Promise<unknown> {
  const entry = args["entry"] as string;
  const project = (args["project"] as string) ?? "";

  if (!entry || typeof entry !== "string" || entry.trim().length === 0) {
    throw new Error("entry is required and must be a non-empty string");
  }

  // Build journal path: Brain/journal/YYYY-MM-DD.md
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10); // "2026-07-25"
  const timeStr = now.toTimeString().slice(0, 5); // "14:05"

  const journalDir = join(brainDir(), "journal");
  const journalPath = join(journalDir, `${dateStr}.md`);

  // Format the log line
  const projectTag = project.trim() ? ` | project:${project.trim()}` : "";
  const line = `${timeStr}${projectTag} | ${entry.trim()}\n`;

  if (!fileExists(journalPath)) {
    // Create new journal file with header
    const header = `# Dev Journal — ${dateStr}\n\n`;
    mkdirSync(journalDir, { recursive: true });
    await atomicWrite(journalPath, header + line);
  } else {
    // Append to existing file
    const existing = readFileSync(journalPath, "utf-8");
    await atomicWrite(journalPath, existing + line);
  }

  return {
    journal: `Brain/journal/${dateStr}.md`,
    entry: `${timeStr}${projectTag} | ${entry.trim()}`,
  };
}

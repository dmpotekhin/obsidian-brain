import { writeSignal } from "../../core/signal";
import { parsePreference, writePreference } from "../../core/preference";
import { appendLogEvent } from "../../core/log";
import { join } from "node:path";
import { brainDir } from "../../core/vault";

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

  // Read current preference
  const prefPath = join(brainDir(), "preferences", `${prefId}.md`);
  const pref = await parsePreference(prefPath);

  // Update counters
  let newStatus = pref.status;
  if (result === "applied") {
    pref.applied_count++;
    if (pref.status === "unconfirmed") {
      newStatus = "confirmed";
    }
  } else if (result === "violated") {
    pref.violated_count++;
  } else if (result === "outdated") {
    // Outdated triggers retirement in next dream, but record now
  }

  pref.updated = timestamp;
  pref.status = newStatus;
  pref.evidence_count = pref.applied_count + pref.violated_count;

  await writePreference(pref.id.replace("pref-", ""), pref, pref.body);

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

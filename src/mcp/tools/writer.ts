import { writeSignal } from "../../core/signal";

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

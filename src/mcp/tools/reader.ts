import { join } from "node:path";
import { brainDir, readFile, fileExists } from "../../core/vault";
import { regenerateActive } from "../../core/active";
import { getRecentJournalEntries } from "../../core/journal";

export async function handleBrainContext(): Promise<unknown> {
  const activePath = join(brainDir(), "active.md");
  if (!fileExists(activePath)) {
    await regenerateActive();
  }
  const content = await readFile(activePath);
  const recentActivity = await getRecentJournalEntries(5);
  return { content, recent_activity: recentActivity };
}

export async function handleBrainContextPack(
  args: Record<string, unknown>,
): Promise<unknown> {
  const maxTokens = (args["max_tokens"] as number) ?? 2000;

  const activePath = join(brainDir(), "active.md");
  if (!fileExists(activePath)) {
    await regenerateActive();
  }
  const content = await readFile(activePath);

  // Rough token estimation: ~4 chars per token
  const charLimit = maxTokens * 4;
  const truncated = content.length > charLimit
    ? content.slice(0, charLimit) + "\n\n[...truncated, use brain_context for full content]"
    : content;

  return {
    content: truncated,
    estimated_tokens: Math.ceil(truncated.length / 4),
    truncated: truncated.length < content.length,
  };
}

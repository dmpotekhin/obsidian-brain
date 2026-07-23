import { runDream } from "../../core/dream";

export async function handleBrainDream(
  args: Record<string, unknown>,
): Promise<unknown> {
  const dryRun = args["dry_run"] === true;
  const result = await runDream(dryRun);
  return result;
}

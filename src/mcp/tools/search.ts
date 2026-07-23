import { SearchIndex } from "../../core/search";

export async function handleBrainSearch(
  args: Record<string, unknown>,
): Promise<unknown> {
  const query = args["query"] as string;
  const limit = (args["limit"] as number) ?? 20;

  if (!query || query.trim() === "") {
    throw new Error("query is required");
  }

  const index = new SearchIndex();
  index.open();
  try {
    const results = index.search(query, limit);
    return { results, count: results.length };
  } finally {
    index.close();
  }
}

import { handleBrainFeedback, handleBrainApplyEvidence } from "./tools/writer";
import { handleBrainDream } from "./tools/lifecycle";
import { handleBrainContext, handleBrainContextPack } from "./tools/reader";
import { handleBrainSearch } from "./tools/search";

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required: string[];
  };
  handler: (args: Record<string, unknown>) => Promise<unknown>;
}

export function buildToolTable(): Map<string, ToolDefinition> {
  const tools = new Map<string, ToolDefinition>();

  tools.set("brain_feedback", {
    name: "brain_feedback",
    description: "Record a taste signal from user interaction. Stores signal in Brain/inbox/ and appends daily log.",
    inputSchema: {
      type: "object",
      properties: {
        topic: {
          type: "string",
          description: "Normalized topic slug (lowercase, hyphens)",
        },
        sign: {
          type: "string",
          enum: ["positive", "negative"],
          description: "Signal direction",
        },
        principle: {
          type: "string",
          description: "The rule or principle the user expressed",
        },
        agent: {
          type: "string",
          description: "Name of the agent recording this signal",
        },
        scope: {
          type: "string",
          enum: ["coding", "communication", "writing", "general"],
          description: "Category of the signal",
        },
      },
      required: ["topic", "sign", "principle", "agent"],
    },
    handler: handleBrainFeedback,
  });

  tools.set("brain_apply_evidence", {
    name: "brain_apply_evidence",
    description: "Record whether a preference was applied or violated during work.",
    inputSchema: {
      type: "object",
      properties: {
        pref_id: { type: "string", description: "Preference ID (e.g., pref-no-abbrev)" },
        result: { type: "string", enum: ["applied", "violated", "outdated"] },
        context: { type: "string", description: "Optional context about the decision" },
      },
      required: ["pref_id", "result"],
    },
    handler: handleBrainApplyEvidence,
  });

  tools.set("brain_dream", {
    name: "brain_dream",
    description: "Run the deterministic rule engine. Processes signals into preferences, retires obsolete ones. Idempotent.",
    inputSchema: {
      type: "object",
      properties: {
        dry_run: { type: "boolean", description: "Preview changes without writing" },
      },
      required: [],
    },
    handler: handleBrainDream,
  });

  tools.set("brain_context", {
    name: "brain_context",
    description: "Read current active context — all confirmed and quarantined preferences.",
    inputSchema: { type: "object", properties: {}, required: [] },
    handler: handleBrainContext,
  });

  tools.set("brain_context_pack", {
    name: "brain_context_pack",
    description: "Budgeted context slice — packs preferences into token limit.",
    inputSchema: {
      type: "object",
      properties: {
        max_tokens: { type: "number", description: "Maximum tokens for the packed context" },
      },
      required: ["max_tokens"],
    },
    handler: handleBrainContextPack,
  });

  tools.set("brain_search", {
    name: "brain_search",
    description: "Full-text search over vault using FTS5.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        limit: { type: "number", description: "Max results (default 20)" },
      },
      required: ["query"],
    },
    handler: handleBrainSearch,
  });

  return tools;
}

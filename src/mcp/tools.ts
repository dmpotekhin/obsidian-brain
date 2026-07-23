import { handleBrainFeedback, handleBrainApplyEvidence } from "./tools/writer";
import { handleBrainDream } from "./tools/lifecycle";

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

  return tools;
}

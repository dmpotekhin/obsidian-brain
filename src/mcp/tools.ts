import { handleBrainFeedback } from "./tools/writer";

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

  return tools;
}

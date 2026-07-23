import { createInterface } from "node:readline";
import {
  PROTOCOL_VERSION, SERVER_NAME, SERVER_VERSION,
  JSONRPC_VERSION, MCPError, METHOD_NOT_FOUND,
  INTERNAL_ERROR, PARSE_ERROR,
} from "./protocol";
import { buildToolTable, type ToolDefinition } from "./tools";

interface JsonRpcRequest {
  jsonrpc: string;
  id?: number | string;
  method: string;
  params?: Record<string, unknown>;
}

export class MCPServer {
  private tools: Map<string, ToolDefinition>;
  private initialized = false;

  constructor() {
    this.tools = buildToolTable();
  }

  async start(): Promise<void> {
    const rl = createInterface({ input: process.stdin });
    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        const request = JSON.parse(line) as JsonRpcRequest;
        const response = await this.handleRequest(request);
        if (response !== null) {
          process.stdout.write(JSON.stringify(response) + "\n");
        }
      } catch {
        process.stdout.write(JSON.stringify({
          jsonrpc: JSONRPC_VERSION,
          error: { code: PARSE_ERROR, message: "Parse error" },
          id: null,
        }) + "\n");
      }
    }
  }

  private async handleRequest(req: JsonRpcRequest): Promise<unknown | null> {
    try {
      switch (req.method) {
        case "initialize":
          return this.handleInitialize(req);
        case "notifications/initialized":
          this.initialized = true;
          return null; // No response for notifications
        case "tools/list":
          return this.handleToolsList(req);
        case "tools/call":
          return await this.handleToolsCall(req);
        case "ping":
          return { jsonrpc: JSONRPC_VERSION, result: {}, id: req.id };
        default:
          return this.error(req.id, METHOD_NOT_FOUND, `Method not found: ${req.method}`);
      }
    } catch (err) {
      if (err instanceof MCPError) {
        return this.error(req.id, err.code, err.message, err.data);
      }
      return this.error(req.id, INTERNAL_ERROR, String(err));
    }
  }

  private handleInitialize(req: JsonRpcRequest): unknown {
    return {
      jsonrpc: JSONRPC_VERSION,
      result: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      },
      id: req.id,
    };
  }

  private handleToolsList(req: JsonRpcRequest): unknown {
    const tools = Array.from(this.tools.values()).map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }));
    return { jsonrpc: JSONRPC_VERSION, result: { tools }, id: req.id };
  }

  private async handleToolsCall(req: JsonRpcRequest): Promise<unknown> {
    const params = req.params ?? {};
    const toolName = params["name"] as string;
    const toolArgs = (params["arguments"] ?? {}) as Record<string, unknown>;

    if (!toolName) {
      return this.error(req.id, -32602, "Missing tool name");
    }

    const tool = this.tools.get(toolName);
    if (!tool) {
      return this.error(req.id, METHOD_NOT_FOUND, `Tool not found: ${toolName}`);
    }

    try {
      const result = await tool.handler(toolArgs);
      return {
        jsonrpc: JSONRPC_VERSION,
        result: { content: [{ type: "text", text: JSON.stringify(result) }] },
        id: req.id,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        jsonrpc: JSONRPC_VERSION,
        result: { content: [{ type: "text", text: JSON.stringify({ error: message }) }], isError: true },
        id: req.id,
      };
    }
  }

  private error(id: unknown, code: number, message: string, data?: unknown): unknown {
    return {
      jsonrpc: JSONRPC_VERSION,
      error: { code, message, data },
      id: id ?? null,
    };
  }
}

// Entry point when run directly
if (import.meta.main) {
  const server = new MCPServer();
  server.start().catch(console.error);
}

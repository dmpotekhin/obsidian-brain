export const PROTOCOL_VERSION = "2025-06-18";
export const SERVER_NAME = "obsidian-brain";
export const SERVER_VERSION = "0.1.0";
export const JSONRPC_VERSION = "2.0";

// Standard JSON-RPC error codes
export const PARSE_ERROR = -32700;
export const INVALID_REQUEST = -32600;
export const METHOD_NOT_FOUND = -32601;
export const INVALID_PARAMS = -32602;
export const INTERNAL_ERROR = -32603;

export class MCPError extends Error {
  constructor(
    public code: number,
    message: string,
    public data?: unknown,
  ) {
    super(message);
    this.name = "MCPError";
  }
}

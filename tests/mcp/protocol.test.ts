import { describe, it, expect } from "bun:test";
import { MCPError, PROTOCOL_VERSION, SERVER_NAME, INVALID_PARAMS } from "../../src/mcp/protocol";

describe("MCPError", () => {
  it("creates error with code and message", () => {
    const err = new MCPError(INVALID_PARAMS, "Missing topic");
    expect(err.code).toBe(INVALID_PARAMS);
    expect(err.message).toBe("Missing topic");
    expect(err.name).toBe("MCPError");
  });
});

describe("protocol constants", () => {
  it("has expected version", () => {
    expect(PROTOCOL_VERSION).toBe("2025-06-18");
  });
  it("has server name", () => {
    expect(SERVER_NAME).toBe("obsidian-brain");
  });
});

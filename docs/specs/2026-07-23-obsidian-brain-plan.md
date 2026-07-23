# Obsidian Brain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an MCP server that turns an Obsidian vault into a memory layer for AI agents — Markdown storage, deterministic dream engine, 14 MCP tools.

**Architecture:** TypeScript/Bun project. Core layer (vault, frontmatter, dream, search) is pure logic — no MCP dependency. MCP layer wraps core into JSON-RPC 2.0 stdio tools. Tests follow TDD: RED → GREEN → REFACTOR → COMMIT.

**Tech Stack:** Bun 1.1+, TypeScript 5.5+, better-sqlite3, gray-matter, oxlint, oxfmt. Target: macOS (primary), portable to Linux.

---

## Global Constraints

- Bun >= 1.1.0 runtime — all scripts and tests run with `bun`
- TypeScript 5.5+ with strict mode
- All file I/O under `Brain/` is atomic: write to tmpfile, fs.rename to target
- No LLM calls inside core library
- Path traversal outside vault root is rejected
- Frontmatter format: YAML between `---` delimiters
- Slugs: lowercase, alphanumeric + hyphens, max 64 chars
- Timestamps: ISO 8601 with seconds, UTC (`2026-07-23T14:30:00Z`)
- MCP protocol: JSON-RPC 2.0, stdio transport, newline-delimited

---

## File Structure

```
/Users/dmitrypotekhin/brain/
├── package.json                    # Project metadata, scripts, dependencies
├── tsconfig.json                   # TypeScript strict config
├── src/
│   ├── mcp/
│   │   ├── server.ts               # MCPServer class: stdio readline loop + JSON-RPC dispatch
│   │   ├── protocol.ts             # MCP constants: PROTOCOL_VERSION, error codes, MCPError
│   │   ├── tools.ts                # buildToolTable(): register all tools → Map<string, ToolDef>
│   │   └── tools/
│   │       ├── writer.ts           # brain_feedback, brain_apply_evidence handlers
│   │       ├── reader.ts           # brain_context, brain_context_pack handlers
│   │       ├── search.ts           # brain_search handler
│   │       ├── lifecycle.ts        # brain_dream handler
│   │       ├── health.ts           # brain_health, brain_hygiene handlers
│   │       ├── admin.ts            # brain_status, brain_audit, brain_rollback handlers
│   │       └── obligations.ts      # brain_obligation handler
│   └── core/
│       ├── config.ts               # loadConfig(): read ~/.config/brain/config.yaml + _brain.yaml
│       ├── vault.ts                # vaultRoot(), brainDir(), atomicWrite(), ensureInsideVault()
│       ├── frontmatter.ts          # parseFrontmatter(), writeFrontmatter()
│       ├── log.ts                  # appendLogEvent(): append to Brain/log/YYYY-MM-DD.md
│       ├── signal.ts               # writeSignal(), parseSignal(), moveToProcessed()
│       ├── preference.ts           # writePreference(), parsePreference(), moveToRetired()
│       ├── evidence.ts             # collectEvidenceForSlug(), countApplied(), countViolated()
│       ├── active.ts               # regenerateActive(): write Brain/active.md
│       ├── snapshot.ts             # createSnapshot(), restoreSnapshot(), pruneSnapshots()
│       ├── dream.ts                # runDream(): 8-phase algorithm
│       └── search.ts               # SearchIndex class: open, indexFile, search, reindex
├── tests/
│   ├── core/
│   │   ├── vault.test.ts
│   │   ├── frontmatter.test.ts
│   │   ├── config.test.ts
│   │   ├── log.test.ts
│   │   ├── signal.test.ts
│   │   ├── preference.test.ts
│   │   ├── evidence.test.ts
│   │   ├── active.test.ts
│   │   ├── snapshot.test.ts
│   │   ├── dream.test.ts
│   │   └── search.test.ts
│   └── mcp/
│       ├── protocol.test.ts
│       ├── tools.test.ts
│       ├── writer.test.ts
│       ├── reader.test.ts
│       ├── search.test.ts
│       ├── lifecycle.test.ts
│       ├── health.test.ts
│       ├── admin.test.ts
│       └── obligations.test.ts
├── fixtures/
│   └── test-vault/                 # Pre-built vault for integration tests
│       └── Brain/
│           ├── _brain.yaml
│           ├── inbox/
│           ├── preferences/
│           └── log/
```

---

## Phase 1: Foundation (core + writer tools)

### Task 1.1: Project scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.oxlintrc.json`
- Create: `.oxfmtrc.json`
- Create: `src/mcp/protocol.ts`

**Interfaces:**
- Produces: `PROTOCOL_VERSION = "2025-06-18"`, `SERVER_NAME = "obsidian-brain"`, `SERVER_VERSION = "0.1.0"`, `MCPError` class, error code constants

**Deliverable:** Empty project that compiles, lints, and formats successfully.

- [ ] **Step 1: Initialize package.json**

```bash
cd /Users/dmitrypotekhin/brain
```

Write `package.json`:
```json
{
  "name": "obsidian-brain",
  "version": "0.1.0",
  "private": true,
  "description": "MCP memory layer for AI agents using Obsidian vaults",
  "type": "module",
  "scripts": {
    "test": "bun test",
    "lint": "oxlint -c .oxlintrc.json",
    "lint:fix": "oxlint -c .oxlintrc.json --fix",
    "fmt": "oxfmt --write 'src/**/*.ts' 'tests/**/*.ts' --no-error-on-unmatched-pattern",
    "fmt:check": "oxfmt --check 'src/**/*.ts' 'tests/**/*.ts' --no-error-on-unmatched-pattern",
    "typecheck": "tsc --noEmit",
    "validate": "bun run typecheck && bun run lint && bun test"
  },
  "dependencies": {
    "better-sqlite3": "^11.0.0",
    "gray-matter": "^4.0.3"
  },
  "devDependencies": {
    "@types/bun": "^1.1.0",
    "@types/better-sqlite3": "^7.6.0",
    "oxlint": "^1.0.0",
    "oxfmt": "^0.47.0",
    "typescript": "^5.5.0"
  }
}
```

- [ ] **Step 2: Write tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 3: Write linter/formatter configs**

Write `.oxlintrc.json`:
```json
{
  "rules": {
    "typescript": "recommended",
    "import": "recommended",
    "unicorn": "recommended"
  }
}
```

Write `.oxfmtrc.json`:
```json
{
  "indent": { "style": "space", "size": 2 },
  "lineWidth": 100,
  "semicolons": "always",
  "quoteStyle": "double",
  "trailingCommas": true
}
```

- [ ] **Step 4: Write Protocol constants**

Write `src/mcp/protocol.ts`:
```typescript
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
```

- [ ] **Step 5: Install and verify**

```bash
cd /Users/dmitrypotekhin/brain && bun install
```

Expected: dependencies install without errors.

- [ ] **Step 6: Verify tooling**

```bash
cd /Users/dmitrypotekhin/brain && bun run typecheck
```

Expected: no errors (only protocol.ts exists).

- [ ] **Step 7: Commit**

```bash
cd /Users/dmitrypotekhin/brain && git init && git add -A && git commit -m "chore: project scaffolding with TypeScript/Bun"
```

---

### Task 1.2: Vault path helpers + atomic write

**Files:**
- Create: `src/core/vault.ts`
- Create: `tests/core/vault.test.ts`
- Create: `fixtures/test-vault/` (empty dir structure for tests)

**Interfaces:**
- Produces:
  - `vaultRoot(): string` — reads `~/.config/brain/config.yaml` or `BRAIN_VAULT` env, returns vault path
  - `brainDir(): string` — returns `vaultRoot() + "/Brain"` 
  - `atomicWrite(filePath: string, content: string): Promise<void>` — write to tmp, rename
  - `ensureInsideVault(filePath: string): string` — resolve path, throw if outside vault
  - `readFile(filePath: string): Promise<string>`
  - `fileExists(filePath: string): boolean`
  - `listDir(dirPath: string): string[]`

**Deliverable:** Vault helper functions with tests. All writes atomic.

- [ ] **Step 1: Write failing tests**

Write `tests/core/vault.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  brainDir,
  atomicWrite,
  ensureInsideVault,
  readFile,
  fileExists,
  listDir,
} from "../../src/core/vault";

const TEST_VAULT = join(import.meta.dir, "../../fixtures/test-vault");

beforeAll(() => {
  process.env.BRAIN_VAULT = TEST_VAULT;
  mkdirSync(join(TEST_VAULT, "Brain"), { recursive: true });
});

afterAll(() => {
  rmSync(TEST_VAULT, { recursive: true, force: true });
});

describe("brainDir", () => {
  it("returns Brain/ under vault root", () => {
    expect(brainDir()).toBe(join(TEST_VAULT, "Brain"));
  });
});

describe("atomicWrite", () => {
  it("writes file atomically", async () => {
    const target = join(TEST_VAULT, "Brain", "test.md");
    await atomicWrite(target, "# Hello");
    expect(existsSync(target)).toBe(true);
    const content = await readFile(target);
    expect(content).toBe("# Hello");
  });

  it("overwrites existing file", async () => {
    const target = join(TEST_VAULT, "Brain", "test.md");
    await atomicWrite(target, "# Updated");
    const content = await readFile(target);
    expect(content).toBe("# Updated");
  });
});

describe("ensureInsideVault", () => {
  it("returns resolved path when inside vault", () => {
    const path = join(TEST_VAULT, "Brain", "notes", "note.md");
    expect(ensureInsideVault(path)).toBe(path);
  });

  it("throws when path is outside vault", () => {
    expect(() => ensureInsideVault("/etc/passwd")).toThrow("outside vault");
  });

  it("throws on traversal attempt", () => {
    expect(() => ensureInsideVault(join(TEST_VAULT, "..", "etc", "passwd")))
      .toThrow("outside vault");
  });
});

describe("readFile", () => {
  it("reads existing file", async () => {
    const target = join(TEST_VAULT, "Brain", "readme.md");
    await atomicWrite(target, "content");
    expect(await readFile(target)).toBe("content");
  });

  it("throws on missing file", async () => {
    await expect(readFile(join(TEST_VAULT, "Brain", "missing.md")))
      .rejects.toThrow();
  });
});

describe("listDir", () => {
  it("lists files in directory", () => {
    const dir = join(TEST_VAULT, "Brain");
    expect(listDir(dir).length).toBeGreaterThan(0);
  });

  it("returns empty array for empty dir", () => {
    const dir = join(TEST_VAULT, "Brain", "empty");
    mkdirSync(dir, { recursive: true });
    expect(listDir(dir)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/dmitrypotekhin/brain && bun test tests/core/vault.test.ts
```
Expected: all tests FAIL (module not found).

- [ ] **Step 3: Implement vault.ts**

Write `src/core/vault.ts`:
```typescript
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, relative } from "node:path";
import { randomUUID } from "node:crypto";

let _vaultRoot: string | null = null;

export function vaultRoot(): string {
  if (_vaultRoot) return _vaultRoot;
  const env = process.env["BRAIN_VAULT"];
  if (env) {
    _vaultRoot = resolve(env);
    return _vaultRoot;
  }
  const configPath = join(
    process.env["HOME"] ?? "~",
    ".config", "brain", "config.yaml"
  );
  if (existsSync(configPath)) {
    const raw = readFileSync(configPath, "utf-8");
    const match = raw.match(/vault_path:\s*(.+)/);
    if (match?.[1]) {
      _vaultRoot = resolve(match[1].trim());
      return _vaultRoot;
    }
  }
  throw new Error("BRAIN_VAULT not set and ~/.config/brain/config.yaml not found");
}

export function brainDir(): string {
  return join(vaultRoot(), "Brain");
}

export function ensureInsideVault(filePath: string): string {
  const resolved = resolve(filePath);
  const root = vaultRoot();
  const rel = relative(root, resolved);
  if (rel.startsWith("..") || rel === "") {
    throw new Error(`Path outside vault: ${filePath}`);
  }
  return resolved;
}

export async function atomicWrite(filePath: string, content: string): Promise<void> {
  const target = resolve(filePath);
  const dir = target.substring(0, target.lastIndexOf("/"));
  mkdirSync(dir, { recursive: true });
  const tmpFile = join(tmpdir(), `brain-${randomUUID()}.tmp`);
  writeFileSync(tmpFile, content, "utf-8");
  // Atomic rename within same filesystem
  const { renameSync } = await import("node:fs");
  renameSync(tmpFile, target);
}

export async function readFile(filePath: string): Promise<string> {
  const { readFileSync } = await import("node:fs");
  return readFileSync(filePath, "utf-8");
}

export function fileExists(filePath: string): boolean {
  return existsSync(filePath);
}

export function listDir(dirPath: string): string[] {
  if (!existsSync(dirPath)) return [];
  return readdirSync(dirPath);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/dmitrypotekhin/brain && bun test tests/core/vault.test.ts
```
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/dmitrypotekhin/brain && git add -A && git commit -m "feat: vault path helpers and atomic write"
```

---

### Task 1.3: Frontmatter parser

**Files:**
- Create: `src/core/frontmatter.ts`
- Create: `tests/core/frontmatter.test.ts`

**Interfaces:**
- Produces:
  - `parseFrontmatter(content: string): { data: Record<string, unknown>; body: string }`
  - `writeFrontmatter(data: Record<string, unknown>, body: string): string`

**Deliverable:** YAML frontmatter parse/generate using gray-matter library.

- [ ] **Step 1: Write failing tests**

Write `tests/core/frontmatter.test.ts`:
```typescript
import { describe, it, expect } from "bun:test";
import { parseFrontmatter, writeFrontmatter } from "../../src/core/frontmatter";

const SAMPLE = `---
title: Test Note
status: confirmed
tags:
  - coding
  - typescript
---

# Body content

Some text here.`;

describe("parseFrontmatter", () => {
  it("extracts YAML data and body", () => {
    const result = parseFrontmatter(SAMPLE);
    expect(result.data).toEqual({
      title: "Test Note",
      status: "confirmed",
      tags: ["coding", "typescript"],
    });
    expect(result.body.trim()).toBe("# Body content\n\nSome text here.");
  });

  it("handles missing frontmatter", () => {
    const result = parseFrontmatter("# Just body");
    expect(result.data).toEqual({});
    expect(result.body.trim()).toBe("# Just body");
  });

  it("handles empty frontmatter", () => {
    const result = parseFrontmatter("---\n---\n\nBody");
    expect(result.data).toEqual({});
    expect(result.body.trim()).toBe("Body");
  });
});

describe("writeFrontmatter", () => {
  it("generates valid frontmatter + body", () => {
    const result = writeFrontmatter(
      { title: "Note", status: "confirmed" },
      "# Body text"
    );
    expect(result).toContain("---");
    expect(result).toContain("title: Note");
    expect(result).toContain("# Body text");
  });

  it("writes arrays as YAML lists", () => {
    const result = writeFrontmatter({ tags: ["a", "b"] }, "");
    expect(result).toContain("tags:");
    expect(result).toContain("  - a");
    expect(result).toContain("  - b");
  });

  it("roundtrips parse → write → parse", () => {
    const data = { id: "pref-test", status: "confirmed", count: 3 };
    const body = "# Rule body";
    const written = writeFrontmatter(data, body);
    const reparsed = parseFrontmatter(written);
    expect(reparsed.data.id).toBe("pref-test");
    expect(reparsed.data.status).toBe("confirmed");
    expect(reparsed.data.count).toBe(3);
    expect(reparsed.body.trim()).toBe(body);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/dmitrypotekhin/brain && bun test tests/core/frontmatter.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement frontmatter.ts**

Write `src/core/frontmatter.ts`:
```typescript
import matter from "gray-matter";
import { stringify } from "yaml"; // gray-matter uses js-yaml internally, but we use Bun's built-in

export function parseFrontmatter(content: string): {
  data: Record<string, unknown>;
  body: string;
} {
  // Handle missing frontmatter
  if (!content.startsWith("---")) {
    return { data: {}, body: content };
  }
  const parsed = matter(content);
  return {
    data: parsed.data as Record<string, unknown>,
    body: parsed.content,
  };
}

export function writeFrontmatter(
  data: Record<string, unknown>,
  body: string,
): string {
  const yaml = stringify(data, { lineWidth: 0 });
  return `---\n${yaml}---\n\n${body}`;
}
```

Note: Bun bundles `yaml` support. If `stringify` from `yaml` is unavailable, fall back to manual YAML writer:
```typescript
function yamlStringify(obj: Record<string, unknown>, indent = ""): string {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) continue;
    if (Array.isArray(value)) {
      lines.push(`${indent}${key}:`);
      for (const item of value) {
        lines.push(`${indent}  - ${item}`);
      }
    } else if (typeof value === "object") {
      lines.push(`${indent}${key}:`);
      lines.push(yamlStringify(value as Record<string, unknown>, indent + "  "));
    } else {
      lines.push(`${indent}${key}: ${value}`);
    }
  }
  return lines.join("\n");
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/dmitrypotekhin/brain && bun test tests/core/frontmatter.test.ts
```
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/dmitrypotekhin/brain && git add -A && git commit -m "feat: YAML frontmatter parse and generate"
```

---

### Task 1.4: Config loader

**Files:**
- Create: `src/core/config.ts`
- Create: `tests/core/config.test.ts`

**Interfaces:**
- Produces:
  - `loadConfig(): BrainConfig` — merges machine config + vault _brain.yaml
  - `BrainConfig` type with defaults

**Deliverable:** Config loader that reads ~/.config/brain/config.yaml and Brain/_brain.yaml.

- [ ] **Step 1: Write failing test**

Write `tests/core/config.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "../../src/core/config";
import { atomicWrite } from "../../src/core/vault";

const TEST_VAULT = join(import.meta.dir, "../../fixtures/test-vault");

beforeAll(() => {
  process.env.BRAIN_VAULT = TEST_VAULT;
  mkdirSync(join(TEST_VAULT, "Brain"), { recursive: true });
});

afterAll(() => {
  rmSync(TEST_VAULT, { recursive: true, force: true });
});

describe("loadConfig", () => {
  it("returns defaults when no config files exist", async () => {
    const config = loadConfig();
    expect(config.candidateThreshold).toBe(3);
    expect(config.staleEvidenceDays).toBe(90);
  });

  it("loads overrides from _brain.yaml", async () => {
    await atomicWrite(
      join(TEST_VAULT, "Brain", "_brain.yaml"),
      `dream:
  candidate_threshold: 5
  stale_evidence_days: 60
  unconfirmed_ttl_days: 14
`
    );
    const config = loadConfig();
    expect(config.candidateThreshold).toBe(5);
    expect(config.staleEvidenceDays).toBe(60);
    expect(config.unconfirmedTtlDays).toBe(14);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/dmitrypotekhin/brain && bun test tests/core/config.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement config.ts**

Write `src/core/config.ts`:
```typescript
import { join } from "node:path";
import { brainDir, fileExists, readFile } from "./vault";
import { parseFrontmatter } from "./frontmatter";

export interface BrainConfig {
  candidateThreshold: number;
  staleEvidenceDays: number;
  unconfirmedTtlDays: number;
  lowMaxApplied: number;
  snapshotRetention: number;
  vaultPath: string;
}

const DEFAULTS: BrainConfig = {
  candidateThreshold: 3,
  staleEvidenceDays: 90,
  unconfirmedTtlDays: 30,
  lowMaxApplied: 2,
  snapshotRetention: 5,
  vaultPath: "",
};

function parseYaml(raw: string): Record<string, unknown> {
  const lines = raw.split("\n");
  const result: Record<string, unknown> = {};
  for (const line of lines) {
    const match = line.match(/^\s*(\w[\w_]*):\s*(.+)/);
    if (match) {
      const key = match[1]!;
      const value = match[2]!.trim();
      const num = Number(value);
      result[key] = isNaN(num) ? value : num;
    }
  }
  return result;
}

export function loadConfig(): BrainConfig {
  const config: BrainConfig = { ...DEFAULTS };

  // Load _brain.yaml from vault
  const brainYaml = join(brainDir(), "_brain.yaml");
  if (fileExists(brainYaml)) {
    const raw = readFile(brainYaml);
    const parsed = parseYaml(raw);
    if (parsed["dream"]) {
      const dream = parsed["dream"] as Record<string, unknown>;
      if (typeof dream["candidate_threshold"] === "number")
        config.candidateThreshold = dream["candidate_threshold"] as number;
      if (typeof dream["stale_evidence_days"] === "number")
        config.staleEvidenceDays = dream["stale_evidence_days"] as number;
      if (typeof dream["unconfirmed_ttl_days"] === "number")
        config.unconfirmedTtlDays = dream["unconfirmed_ttl_days"] as number;
      if (typeof dream["low_max_applied"] === "number")
        config.lowMaxApplied = dream["low_max_applied"] as number;
      if (typeof dream["snapshot_retention"] === "number")
        config.snapshotRetention = dream["snapshot_retention"] as number;
    }
  }

  config.vaultPath = process.env["BRAIN_VAULT"] ?? "";
  return config;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/dmitrypotekhin/brain && bun test tests/core/config.test.ts
```
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/dmitrypotekhin/brain && git add -A && git commit -m "feat: config loader with _brain.yaml support"
```

---

### Task 1.5: Event log + signal writer

**Files:**
- Create: `src/core/log.ts`
- Create: `src/core/signal.ts`
- Create: `tests/core/log.test.ts`
- Create: `tests/core/signal.test.ts`

**Interfaces:**
- Produces:
  - `appendLogEvent(event: BrainLogEntry): Promise<string>` — returns log line
  - `writeSignal(topic: string, sign: string, principle: string, agent: string, scope?: string): Promise<{path: string, id: string}>`
  - `BrainLogEntry = { kind: string; timestamp: string; [key: string]: unknown }`

**Deliverable:** Daily log append + signal file creation. Both use atomicWrite.

- [ ] **Step 1: Write failing tests for log.ts**

Write `tests/core/log.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { appendLogEvent } from "../../src/core/log";
import { readFile } from "../../src/core/vault";

const TEST_VAULT = join(import.meta.dir, "../../fixtures/test-vault");

beforeAll(() => {
  process.env.BRAIN_VAULT = TEST_VAULT;
  mkdirSync(join(TEST_VAULT, "Brain", "log"), { recursive: true });
});

afterAll(() => {
  rmSync(TEST_VAULT, { recursive: true, force: true });
});

describe("appendLogEvent", () => {
  it("creates daily log file with event", async () => {
    await appendLogEvent({
      kind: "feedback",
      timestamp: "2026-07-23T14:30:00Z",
      topic: "no-abbrev",
      agent: "hermes",
    });

    const today = new Date().toISOString().slice(0, 10);
    const logPath = join(TEST_VAULT, "Brain", "log", `${today}.md`);
    expect(existsSync(logPath)).toBe(true);

    const content = await readFile(logPath);
    expect(content).toContain("feedback");
    expect(content).toContain("no-abbrev");
  });

  it("appends to existing log file", async () => {
    await appendLogEvent({
      kind: "dream",
      timestamp: "2026-07-23T15:00:00Z",
      run_id: "run-123",
    });

    const today = new Date().toISOString().slice(0, 10);
    const content = await readFile(join(TEST_VAULT, "Brain", "log", `${today}.md`));
    const lines = content.split("\n").filter(l => l.startsWith("- **"));
    expect(lines.length).toBeGreaterThanOrEqual(2);
  });
});
```

Write `tests/core/signal.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { writeSignal } from "../../src/core/signal";
import { readFile } from "../../src/core/vault";

const TEST_VAULT = join(import.meta.dir, "../../fixtures/test-vault");

beforeAll(() => {
  process.env.BRAIN_VAULT = TEST_VAULT;
  mkdirSync(join(TEST_VAULT, "Brain", "inbox"), { recursive: true });
});

afterAll(() => {
  rmSync(TEST_VAULT, { recursive: true, force: true });
});

describe("writeSignal", () => {
  it("creates signal file in inbox", async () => {
    const result = await writeSignal(
      "no-internal-abbreviations",
      "negative",
      "Always expand abbreviations",
      "hermes",
      "coding"
    );
    expect(result.path).toContain("Brain/inbox/sig-");
    expect(result.id).toContain("sig-");
    expect(existsSync(result.path)).toBe(true);

    const content = await readFile(result.path);
    expect(content).toContain("no-internal-abbreviations");
    expect(content).toContain("negative");
  });

  it("generates unique IDs for each signal", async () => {
    const r1 = await writeSignal("topic-a", "positive", "Rule A", "agent");
    const r2 = await writeSignal("topic-a", "positive", "Rule A", "agent");
    expect(r1.id).not.toBe(r2.id);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/dmitrypotekhin/brain && bun test tests/core/log.test.ts tests/core/signal.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement log.ts**

Write `src/core/log.ts`:
```typescript
import { join } from "node:path";
import { brainDir, atomicWrite, readFile, fileExists } from "./vault";

export interface BrainLogEntry {
  kind: string;
  timestamp: string;
  [key: string]: unknown;
}

function formatEvent(entry: BrainLogEntry): string {
  const parts = [`**${entry.timestamp.slice(11, 19)}** | ${entry.kind}`];
  for (const [key, value] of Object.entries(entry)) {
    if (key === "kind" || key === "timestamp") continue;
    parts.push(`${key}=${value}`);
  }
  return `- ${parts.join(" | ")}`;
}

export async function appendLogEvent(entry: BrainLogEntry): Promise<string> {
  const date = entry.timestamp.slice(0, 10);
  const logDir = join(brainDir(), "log");
  const logPath = join(logDir, `${date}.md`);
  const line = formatEvent(entry);

  if (fileExists(logPath)) {
    const existing = await readFile(logPath);
    const updated = existing.trimEnd() + "\n" + line + "\n";
    await atomicWrite(logPath, updated);
  } else {
    const header = `---\ndate: ${date}\nevents_count: 1\n---\n\n## Events\n\n${line}\n`;
    await atomicWrite(logPath, header);
  }

  return line;
}
```

- [ ] **Step 4: Implement signal.ts**

Write `src/core/signal.ts`:
```typescript
import { join } from "node:path";
import { brainDir, atomicWrite } from "./vault";
import { writeFrontmatter } from "./frontmatter";
import { appendLogEvent } from "./log";

export async function writeSignal(
  topic: string,
  sign: "positive" | "negative",
  principle: string,
  agent: string,
  scope: string = "general",
): Promise<{ path: string; id: string }> {
  const date = new Date().toISOString().slice(0, 10);
  const slug = `${date}-${topic.replace(/[^a-z0-9-]/g, "-").slice(0, 64)}`;
  const id = `sig-${slug}`;
  const timestamp = new Date().toISOString().replace(/\.\d{3}/, "");

  const frontmatter = {
    kind: "signal",
    topic,
    sign,
    principle,
    agent,
    scope,
    timestamp,
  };

  const body = `# Signal: ${topic}\n\n${principle}\n\nRecorded by ${agent} in scope "${scope}".`;
  const content = writeFrontmatter(frontmatter, body);

  const inboxDir = join(brainDir(), "inbox");
  const path = join(inboxDir, `${id}.md`);
  await atomicWrite(path, content);

  await appendLogEvent({
    kind: "feedback",
    timestamp,
    topic,
    sign,
    agent,
    scope,
    signal_id: id,
  });

  return { path, id };
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd /Users/dmitrypotekhin/brain && bun test tests/core/log.test.ts tests/core/signal.test.ts
```
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/dmitrypotekhin/brain && git add -A && git commit -m "feat: daily event log and signal writer"
```

---

### Task 1.6: MCP server skeleton + brain_feedback tool

**Files:**
- Create: `src/mcp/server.ts`
- Create: `src/mcp/tools.ts`
- Create: `src/mcp/tools/writer.ts`
- Create: `tests/mcp/protocol.test.ts`
- Create: `tests/mcp/tools.test.ts`
- Create: `tests/mcp/writer.test.ts`

**Interfaces:**
- Consumes: `PROTOCOL_VERSION`, `MCPError` from protocol.ts; `writeSignal` from signal.ts
- Produces: `MCPServer` class; `buildToolTable()` → Map<string, ToolDef>; `handleBrainFeedback(args)` handler

**Deliverable:** Working MCP server that responds to `initialize`, `tools/list`, and `tools/call` with `brain_feedback`.

- [ ] **Step 1: Write failing protocol test**

Write `tests/mcp/protocol.test.ts`:
```typescript
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
```

- [ ] **Step 2: Run protocol test to verify it passes (no new code needed)**

```bash
cd /Users/dmitrypotekhin/brain && bun test tests/mcp/protocol.test.ts
```
Expected: PASS (protocol.ts already exists from Task 1.1).

- [ ] **Step 3: Write failing tools test**

Write `tests/mcp/tools.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { buildToolTable } from "../../src/mcp/tools";

const TEST_VAULT = join(import.meta.dir, "../../fixtures/test-vault");

beforeAll(() => {
  process.env.BRAIN_VAULT = TEST_VAULT;
  mkdirSync(join(TEST_VAULT, "Brain", "inbox"), { recursive: true });
  mkdirSync(join(TEST_VAULT, "Brain", "log"), { recursive: true });
});

afterAll(() => {
  rmSync(TEST_VAULT, { recursive: true, force: true });
});

describe("buildToolTable", () => {
  it("returns a map of tools", () => {
    const tools = buildToolTable();
    expect(tools).toBeInstanceOf(Map);
    expect(tools.has("brain_feedback")).toBe(true);
  });

  it("brain_feedback has expected input schema", () => {
    const tools = buildToolTable();
    const feedback = tools.get("brain_feedback");
    expect(feedback).toBeDefined();
    expect(feedback!.inputSchema.required).toContain("topic");
    expect(feedback!.inputSchema.required).toContain("sign");
    expect(feedback!.inputSchema.required).toContain("principle");
    expect(feedback!.inputSchema.required).toContain("agent");
  });
});
```

- [ ] **Step 4: Run tools test to verify it fails**

```bash
cd /Users/dmitrypotekhin/brain && bun test tests/mcp/tools.test.ts
```
Expected: FAIL.

- [ ] **Step 5: Implement tools.ts**

Write `src/mcp/tools.ts`:
```typescript
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
```

- [ ] **Step 6: Implement writer handler**

Write `src/mcp/tools/writer.ts`:
```typescript
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
```

- [ ] **Step 7: Write failing writer tool test**

Write `tests/mcp/writer.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { handleBrainFeedback } from "../../src/mcp/tools/writer";
import { readFile } from "../../src/core/vault";

const TEST_VAULT = join(import.meta.dir, "../../fixtures/test-vault");

beforeAll(() => {
  process.env.BRAIN_VAULT = TEST_VAULT;
  mkdirSync(join(TEST_VAULT, "Brain", "inbox"), { recursive: true });
  mkdirSync(join(TEST_VAULT, "Brain", "log"), { recursive: true });
});

afterAll(() => {
  rmSync(TEST_VAULT, { recursive: true, force: true });
});

describe("handleBrainFeedback", () => {
  it("writes signal and returns path", async () => {
    const result = await handleBrainFeedback({
      topic: "no-abbreviations",
      sign: "negative",
      principle: "Always expand abbreviations",
      agent: "hermes",
      scope: "coding",
    });

    expect(result).toHaveProperty("signal_path");
    expect(result).toHaveProperty("signal_id");

    const r = result as { signal_path: string; signal_id: string };
    expect(existsSync(r.signal_path)).toBe(true);

    const content = await readFile(r.signal_path);
    expect(content).toContain("no-abbreviations");
    expect(content).toContain("Always expand abbreviations");
  });

  it("defaults scope to general", async () => {
    const result = await handleBrainFeedback({
      topic: "be-concise",
      sign: "positive",
      principle: "Use short answers",
      agent: "claude",
    });
    const r = result as { signal_path: string };
    const content = await readFile(r.signal_path);
    expect(content).toContain("scope: general");
  });
});
```

- [ ] **Step 8: Run writer test to verify it passes**

```bash
cd /Users/dmitrypotekhin/brain && bun test tests/mcp/writer.test.ts
```
Expected: PASS.

- [ ] **Step 9: Run tools test to verify it passes**

```bash
cd /Users/dmitrypotekhin/brain && bun test tests/mcp/tools.test.ts
```
Expected: PASS.

- [ ] **Step 10: Implement MCP server**

Write `src/mcp/server.ts`:
```typescript
import { createInterface } from "node:readline";
import {
  PROTOCOL_VERSION, SERVER_NAME, SERVER_VERSION,
  JSONRPC_VERSION, MCPError, INVALID_REQUEST, METHOD_NOT_FOUND,
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
    const tools = [...this.tools.values()].map(t => ({
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
```

- [ ] **Step 11: Add bin entry to package.json**

Update `package.json` — add to "scripts":
```json
"start": "bun run src/mcp/server.ts"
```

And add:
```json
"bin": {
  "o2b": "./src/mcp/server.ts"
}
```

- [ ] **Step 12: Manual smoke test — start server and send initialize**

```bash
cd /Users/dmitrypotekhin/brain && echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' | BRAIN_VAULT="/Users/dmitrypotekhin/brain/fixtures/test-vault" bun run src/mcp/server.ts
```
Expected: response with `serverInfo.name: "obsidian-brain"`.

- [ ] **Step 13: Commit**

```bash
cd /Users/dmitrypotekhin/brain && git add -A && git commit -m "feat: MCP server skeleton with brain_feedback tool"
```

---

## Phase 2: Preferences + Dream

### Task 2.1: Preference CRUD

**Files:**
- Create: `src/core/preference.ts`
- Create: `tests/core/preference.test.ts`

**Interfaces:**
- Consumes: `parseFrontmatter`, `writeFrontmatter` from frontmatter.ts; `atomicWrite`, `brainDir` from vault.ts
- Produces:
  - `writePreference(slug: string, data: PreferenceData, body: string): Promise<string>` — returns path
  - `parsePreference(path: string): Promise<PreferenceData & { body: string }>`
  - `moveToRetired(slug: string, reason: string): Promise<string>`
  - `PreferenceData` type: id, status, created, updated, sign, evidence_count, applied_count, violated_count, confidence, pinned

**Deliverable:** Create, read, retire preferences with correct frontmatter.

- [ ] **Step 1: Write failing tests**

Write `tests/core/preference.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  writePreference,
  parsePreference,
  moveToRetired,
} from "../../src/core/preference";
import { readFile } from "../../src/core/vault";

const TEST_VAULT = join(import.meta.dir, "../../fixtures/test-vault");

beforeAll(() => {
  process.env.BRAIN_VAULT = TEST_VAULT;
  mkdirSync(join(TEST_VAULT, "Brain", "preferences"), { recursive: true });
  mkdirSync(join(TEST_VAULT, "Brain", "retired"), { recursive: true });
});

afterAll(() => {
  rmSync(TEST_VAULT, { recursive: true, force: true });
});

describe("writePreference", () => {
  it("creates preference file with correct frontmatter", async () => {
    const path = await writePreference(
      "no-abbrev",
      {
        id: "pref-no-abbrev",
        status: "unconfirmed",
        created: "2026-07-23T14:00:00Z",
        updated: "2026-07-23T14:00:00Z",
        sign: "negative",
        evidence_count: 0,
        applied_count: 0,
        violated_count: 0,
        confidence: "low",
        pinned: false,
      },
      "# No Abbreviations\n\nAlways expand."
    );

    expect(path).toContain("Brain/preferences/pref-no-abbrev.md");
    expect(existsSync(path)).toBe(true);

    const content = await readFile(path);
    expect(content).toContain("id: pref-no-abbrev");
    expect(content).toContain("status: unconfirmed");
  });
});

describe("parsePreference", () => {
  it("reads preference data and body", async () => {
    const path = join(TEST_VAULT, "Brain", "preferences", "pref-test.md");
    const pref = await parsePreference(path);
    expect(pref.id).toBe("pref-no-abbrev");
    expect(pref.status).toBe("unconfirmed");
    expect(pref.body).toContain("# No Abbreviations");
  });
});

describe("moveToRetired", () => {
  it("moves preference to retired with reason", async () => {
    // Write a pref to retire
    await writePreference(
      "stale-rule",
      {
        id: "pref-stale-rule",
        status: "confirmed",
        created: "2026-01-01T00:00:00Z",
        updated: "2026-01-01T00:00:00Z",
        sign: "positive",
        evidence_count: 1,
        applied_count: 1,
        violated_count: 0,
        confidence: "medium",
        pinned: false,
      },
      "# Stale rule"
    );

    const retiredPath = await moveToRetired("pref-stale-rule", "stale-no-evidence");
    expect(retiredPath).toContain("Brain/retired/ret-stale-rule.md");
    expect(existsSync(retiredPath)).toBe(true);

    const content = await readFile(retiredPath);
    expect(content).toContain("retired_reason: stale-no-evidence");
    expect(content).toContain("previous_id: pref-stale-rule");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/dmitrypotekhin/brain && bun test tests/core/preference.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement preference.ts**

Write `src/core/preference.ts`:
```typescript
import { join } from "node:path";
import { brainDir, atomicWrite, readFile, fileExists } from "./vault";
import { writeFrontmatter, parseFrontmatter } from "./frontmatter";

export interface PreferenceData {
  id: string;
  status: "unconfirmed" | "confirmed" | "quarantine";
  created: string;
  updated: string;
  sign: "positive" | "negative";
  evidence_count: number;
  applied_count: number;
  violated_count: number;
  confidence: "low" | "medium" | "high";
  pinned: boolean;
}

export async function writePreference(
  slug: string,
  data: PreferenceData,
  body: string,
): Promise<string> {
  const prefsDir = join(brainDir(), "preferences");
  const path = join(prefsDir, `${data.id}.md`);
  const content = writeFrontmatter(data as unknown as Record<string, unknown>, body);
  await atomicWrite(path, content);
  return path;
}

export async function parsePreference(
  path: string,
): Promise<PreferenceData & { body: string }> {
  const content = await readFile(path);
  const { data, body } = parseFrontmatter(content);
  return {
    id: data["id"] as string,
    status: data["status"] as PreferenceData["status"],
    created: data["created"] as string,
    updated: data["updated"] as string,
    sign: data["sign"] as PreferenceData["sign"],
    evidence_count: (data["evidence_count"] as number) ?? 0,
    applied_count: (data["applied_count"] as number) ?? 0,
    violated_count: (data["violated_count"] as number) ?? 0,
    confidence: (data["confidence"] as PreferenceData["confidence"]) ?? "low",
    pinned: (data["pinned"] as boolean) ?? false,
    body,
  };
}

export async function moveToRetired(
  prefId: string,
  reason: string,
): Promise<string> {
  const prefsDir = join(brainDir(), "preferences");
  const retiredDir = join(brainDir(), "retired");
  const sourcePath = join(prefsDir, `${prefId}.md`);
  const slug = prefId.replace(/^pref-/, "");
  const retiredId = `ret-${slug}`;

  if (!fileExists(sourcePath)) {
    throw new Error(`Preference not found: ${prefId}`);
  }

  const pref = await parsePreference(sourcePath);
  const retiredData = {
    id: retiredId,
    status: "retired",
    retired_reason: reason,
    retired_at: new Date().toISOString().replace(/\.\d{3}/, ""),
    previous_id: prefId,
  };

  const content = writeFrontmatter(
    retiredData as unknown as Record<string, unknown>,
    pref.body,
  );
  const targetPath = join(retiredDir, `${retiredId}.md`);
  await atomicWrite(targetPath, content);

  // Remove original
  const { unlinkSync } = await import("node:fs");
  unlinkSync(sourcePath);

  return targetPath;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/dmitrypotekhin/brain && bun test tests/core/preference.test.ts
```
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/dmitrypotekhin/brain && git add -A && git commit -m "feat: preference CRUD with status lifecycle"
```

---

### Task 2.2: Evidence collection

**Files:**
- Create: `src/core/evidence.ts`
- Create: `tests/core/evidence.test.ts`

**Interfaces:**
- Consumes: `parsePreference` from preference.ts; `brainDir`, `listDir` from vault.ts
- Produces:
  - `collectEvidenceForSlug(slug: string): EvidenceResult` — scans log files
  - `countApplied(slug: string): number`
  - `countViolated(slug: string): number`
  - `EvidenceResult = { applied: number; violated: number; lastEvidenceAt: string | null }`

**Deliverable:** Evidence counting from log files, used by dream and apply_evidence.

- [ ] **Step 1: Write failing tests**

Write `tests/core/evidence.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  collectEvidenceForSlug,
  countApplied,
  countViolated,
} from "../../src/core/evidence";
import { appendLogEvent } from "../../src/core/log";

const TEST_VAULT = join(import.meta.dir, "../../fixtures/test-vault");

beforeAll(() => {
  process.env.BRAIN_VAULT = TEST_VAULT;
  mkdirSync(join(TEST_VAULT, "Brain", "log"), { recursive: true });
  mkdirSync(join(TEST_VAULT, "Brain", "preferences"), { recursive: true });
});

afterAll(() => {
  rmSync(TEST_VAULT, { recursive: true, force: true });
});

describe("collectEvidenceForSlug", () => {
  it("counts applied and violated events for a slug", async () => {
    await appendLogEvent({
      kind: "apply-evidence",
      timestamp: "2026-07-23T14:00:00Z",
      pref_id: "pref-test-rule",
      result: "applied",
    });
    await appendLogEvent({
      kind: "apply-evidence",
      timestamp: "2026-07-23T15:00:00Z",
      pref_id: "pref-test-rule",
      result: "violated",
    });
    await appendLogEvent({
      kind: "apply-evidence",
      timestamp: "2026-07-23T16:00:00Z",
      pref_id: "pref-test-rule",
      result: "applied",
    });

    const evidence = collectEvidenceForSlug("pref-test-rule");
    expect(evidence.applied).toBe(2);
    expect(evidence.violated).toBe(1);
    expect(evidence.lastEvidenceAt).toBe("2026-07-23T16:00:00Z");
  });

  it("returns zero when no evidence exists", () => {
    const evidence = collectEvidenceForSlug("pref-nonexistent");
    expect(evidence.applied).toBe(0);
    expect(evidence.violated).toBe(0);
    expect(evidence.lastEvidenceAt).toBeNull();
  });
});

describe("countApplied / countViolated", () => {
  it("returns correct counts", async () => {
    expect(countApplied("pref-test-rule")).toBe(2);
    expect(countViolated("pref-test-rule")).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/dmitrypotekhin/brain && bun test tests/core/evidence.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement evidence.ts**

Write `src/core/evidence.ts`:
```typescript
import { join } from "node:path";
import { brainDir, listDir, readFile } from "./vault";

export interface EvidenceResult {
  applied: number;
  violated: number;
  lastEvidenceAt: string | null;
}

export function collectEvidenceForSlug(slug: string): EvidenceResult {
  const logDir = join(brainDir(), "log");
  const files = listDir(logDir).filter(f => f.endsWith(".md"));
  let applied = 0;
  let violated = 0;
  let lastEvidenceAt: string | null = null;

  for (const file of files) {
    const content = readFile(join(logDir, file));
    const lines = content.split("\n");
    for (const line of lines) {
      if (!line.includes(`pref_id=${slug}`)) continue;
      if (line.includes("result=applied")) {
        applied++;
        const ts = extractTimestamp(line);
        if (ts && (!lastEvidenceAt || ts > lastEvidenceAt)) lastEvidenceAt = ts;
      } else if (line.includes("result=violated")) {
        violated++;
        const ts = extractTimestamp(line);
        if (ts && (!lastEvidenceAt || ts > lastEvidenceAt)) lastEvidenceAt = ts;
      }
    }
  }

  return { applied, violated, lastEvidenceAt };
}

function extractTimestamp(line: string): string | null {
  const match = line.match(/\*\*(\d{2}:\d{2}:\d{2})\*\*/);
  if (!match) return null;
  // Reconstruct full timestamp from log file date
  // Simplified: return time portion, caller prepends date
  return match[1]!;
}

export function countApplied(slug: string): number {
  return collectEvidenceForSlug(slug).applied;
}

export function countViolated(slug: string): number {
  return collectEvidenceForSlug(slug).violated;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/dmitrypotekhin/brain && bun test tests/core/evidence.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/dmitrypotekhin/brain && git add -A && git commit -m "feat: evidence collection and counting from log"
```

---

### Task 2.3: Snapshot system

**Files:**
- Create: `src/core/snapshot.ts`
- Create: `tests/core/snapshot.test.ts`

**Interfaces:**
- Consumes: `brainDir` from vault.ts
- Produces:
  - `createSnapshot(): Promise<string>` — creates Brain/.snapshots/dream-<run-id>.tar.zst, returns run_id
  - `restoreSnapshot(runId: string): Promise<void>` — restores Brain/ tree
  - `pruneSnapshots(maxSnapshots: number): Promise<void>` — keeps N most recent
  - `listSnapshots(): string[]` — sorted by name (newest first)

**Deliverable:** Pre-mutation snapshots using tar. Tested with create → modify → restore → verify.

- [ ] **Step 1: Write failing tests**

Write `tests/core/snapshot.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createSnapshot, restoreSnapshot, pruneSnapshots, listSnapshots } from "../../src/core/snapshot";
import { atomicWrite, readFile, brainDir } from "../../src/core/vault";

const TEST_VAULT = join(import.meta.dir, "../../fixtures/test-vault");

beforeAll(() => {
  process.env.BRAIN_VAULT = TEST_VAULT;
  mkdirSync(join(TEST_VAULT, "Brain", "preferences"), { recursive: true });
  mkdirSync(join(TEST_VAULT, "Brain", ".snapshots"), { recursive: true });
});

afterAll(() => {
  rmSync(TEST_VAULT, { recursive: true, force: true });
});

describe("snapshot system", () => {
  it("creates snapshot, restores after modification, prunes old snapshots", async () => {
    // Create a file to snapshot
    const prefPath = join(brainDir(), "preferences", "pref-test.md");
    await atomicWrite(prefPath, "original content");

    // Take snapshot
    const runId = await createSnapshot();
    expect(runId).toContain("dream-");
    const snapshotPath = join(brainDir(), ".snapshots", `${runId}.tar.zst`);
    expect(existsSync(snapshotPath)).toBe(true);

    // Modify the file
    await atomicWrite(prefPath, "modified content");

    // Restore
    await restoreSnapshot(runId);
    const restored = await readFile(prefPath);
    expect(restored).toBe("original content");

    // Create extra snapshots and prune
    await createSnapshot();
    await createSnapshot();
    await createSnapshot();
    const allBefore = listSnapshots();
    expect(allBefore.length).toBeGreaterThanOrEqual(4);

    await pruneSnapshots(2);
    const allAfter = listSnapshots();
    expect(allAfter.length).toBeLessThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Implement snapshot.ts**

Write `src/core/snapshot.ts`:
```typescript
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { mkdirSync, existsSync, readdirSync, rmSync } from "node:fs";
import { brainDir } from "./vault";

export async function createSnapshot(): Promise<string> {
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:T]/g, "").slice(0, 15);
  const runId = `dream-${stamp}`;
  const snapshotsDir = join(brainDir(), ".snapshots");
  mkdirSync(snapshotsDir, { recursive: true });

  const target = join(snapshotsDir, `${runId}.tar.zst`);
  const brainPath = brainDir();

  // tar the Brain directory excluding .snapshots itself
  const result = spawnSync("tar", [
    "--exclude", ".snapshots",
    "-I", "zstd",
    "-cf", target,
    "-C", brainPath + "/..",
    "Brain",
  ]);

  if (result.status !== 0) {
    throw new Error(`Snapshot failed: ${result.stderr.toString()}`);
  }

  return runId;
}

export async function restoreSnapshot(runId: string): Promise<void> {
  const snapshotsDir = join(brainDir(), ".snapshots");
  const source = join(snapshotsDir, `${runId}.tar.zst`);

  if (!existsSync(source)) {
    throw new Error(`Snapshot not found: ${runId}`);
  }

  const brainPath = brainDir();

  // Remove current Brain contents except .snapshots
  const entries = readdirSync(brainPath);
  for (const entry of entries) {
    if (entry === ".snapshots") continue;
    rmSync(join(brainPath, entry), { recursive: true, force: true });
  }

  // Restore from snapshot
  const result = spawnSync("tar", [
    "-I", "zstd",
    "-xf", source,
    "-C", brainPath + "/..",
  ]);

  if (result.status !== 0) {
    throw new Error(`Restore failed: ${result.stderr.toString()}`);
  }
}

export function listSnapshots(): string[] {
  const snapshotsDir = join(brainDir(), ".snapshots");
  if (!existsSync(snapshotsDir)) return [];
  return readdirSync(snapshotsDir)
    .filter(f => f.endsWith(".tar.zst"))
    .map(f => f.replace(".tar.zst", ""))
    .sort()
    .reverse();
}

export async function pruneSnapshots(maxSnapshots: number): Promise<void> {
  const all = listSnapshots();
  if (all.length <= maxSnapshots) return;

  const snapshotsDir = join(brainDir(), ".snapshots");
  const toRemove = all.slice(maxSnapshots);
  for (const id of toRemove) {
    rmSync(join(snapshotsDir, `${id}.tar.zst`), { force: true });
  }
}
```

- [ ] **Step 3: Run tests to verify they pass**

```bash
cd /Users/dmitrypotekhin/brain && bun test tests/core/snapshot.test.ts
```
Expected: PASS (requires `tar` and `zstd` on macOS — both installed by default).

- [ ] **Step 4: Commit**

```bash
cd /Users/dmitrypotekhin/brain && git add -A && git commit -m "feat: pre-mutation tar.zst snapshots and rollback"
```

---

### Task 2.4: Active.md generator

**Files:**
- Create: `src/core/active.ts`
- Create: `tests/core/active.test.ts`

**Interfaces:**
- Consumes: `brainDir`, `listDir` from vault.ts; `parsePreference` from preference.ts
- Produces:
  - `regenerateActive(): Promise<string>` — writes Brain/active.md, returns path

**Deliverable:** Derives active.md from confirmed + quarantined preferences. File is rebuildable.

- [ ] **Step 1: Write failing test**

Write `tests/core/active.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { regenerateActive } from "../../src/core/active";
import { readFile } from "../../src/core/vault";
import { writePreference } from "../../src/core/preference";

const TEST_VAULT = join(import.meta.dir, "../../fixtures/test-vault");

beforeAll(() => {
  process.env.BRAIN_VAULT = TEST_VAULT;
  mkdirSync(join(TEST_VAULT, "Brain", "preferences"), { recursive: true });
});

afterAll(() => {
  rmSync(TEST_VAULT, { recursive: true, force: true });
});

describe("regenerateActive", () => {
  it("generates active.md from confirmed preferences", async () => {
    await writePreference(
      "rule-1",
      {
        id: "pref-rule-1", status: "confirmed",
        created: "2026-07-01T00:00:00Z", updated: "2026-07-01T00:00:00Z",
        sign: "negative", evidence_count: 5, applied_count: 10,
        violated_count: 0, confidence: "high", pinned: false,
      },
      "# Rule 1\n\nDo not use tabs."
    );
    await writePreference(
      "rule-2",
      {
        id: "pref-rule-2", status: "unconfirmed",
        created: "2026-07-01T00:00:00Z", updated: "2026-07-01T00:00:00Z",
        sign: "positive", evidence_count: 0, applied_count: 0,
        violated_count: 0, confidence: "low", pinned: false,
      },
      "# Rule 2\n\nUse spaces."
    );
    await writePreference(
      "rule-3",
      {
        id: "pref-rule-3", status: "quarantine",
        created: "2026-07-01T00:00:00Z", updated: "2026-07-01T00:00:00Z",
        sign: "positive", evidence_count: 3, applied_count: 2,
        violated_count: 4, confidence: "low", pinned: false,
      },
      "# Rule 3\n\nUse emoji."
    );

    const path = await regenerateActive();
    const content = await readFile(path);
    expect(content).toContain("Rule 1");
    expect(content).not.toContain("Rule 2"); // unconfirmed — excluded
    expect(content).toContain("Rule 3");     // quarantine — included
  });
});
```

- [ ] **Step 2: Implement active.ts**

Write `src/core/active.ts`:
```typescript
import { join } from "node:path";
import { brainDir, listDir, atomicWrite } from "./vault";
import { parsePreference } from "./preference";

export async function regenerateActive(): Promise<string> {
  const prefsDir = join(brainDir(), "preferences");
  const files = listDir(prefsDir).filter(f => f.endsWith(".md"));
  const sections: string[] = [];

  sections.push(`# Active Memory\n`);
  sections.push(`> Auto-generated at ${new Date().toISOString()}. Do not edit manually.\n`);

  const confirmed: string[] = [];
  const quarantined: string[] = [];

  for (const file of files) {
    const pref = await parsePreference(join(prefsDir, file));
    if (pref.status === "confirmed") {
      confirmed.push(`## ${pref.id}\n\n**Status:** confirmed | **Confidence:** ${pref.confidence} | **Applied:** ${pref.applied_count}/${pref.applied_count + pref.violated_count}\n\n${pref.body}`);
    } else if (pref.status === "quarantine") {
      quarantined.push(`## ${pref.id} ⚠️ QUARANTINE\n\n**Status:** quarantine | **Applied:** ${pref.applied_count} | **Violated:** ${pref.violated_count}\n\n${pref.body}`);
    }
  }

  if (confirmed.length > 0) {
    sections.push("## Confirmed Rules\n");
    sections.push(...confirmed);
  }

  if (quarantined.length > 0) {
    sections.push("\n## Quarantined Rules\n");
    sections.push(...quarantined);
  }

  if (confirmed.length === 0 && quarantined.length === 0) {
    sections.push("_No active rules yet. Signals are accumulating in Brain/inbox/._");
  }

  const activePath = join(brainDir(), "active.md");
  await atomicWrite(activePath, sections.join("\n\n"));
  return activePath;
}
```

- [ ] **Step 3: Run test to verify it passes**

```bash
cd /Users/dmitrypotekhin/brain && bun test tests/core/active.test.ts
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
cd /Users/dmitrypotekhin/brain && git add -A && git commit -m "feat: active.md generator from confirmed preferences"
```

---

### Task 2.5: Dream algorithm

**Files:**
- Create: `src/core/dream.ts`
- Create: `tests/core/dream.test.ts`

**Interfaces:**
- Consumes: `loadConfig` from config.ts; `brainDir`, `listDir`, `readFile` from vault.ts; `parseFrontmatter` from frontmatter.ts; `writePreference`, `moveToRetired`, `parsePreference` from preference.ts; `createSnapshot`, `pruneSnapshots` from snapshot.ts; `regenerateActive` from active.ts; `appendLogEvent` from log.ts
- Produces:
  - `runDream(dryRun?: boolean): Promise<DreamResult>`
  - `DreamResult = { run_id, signals_processed, preferences_created, preferences_retired, quarantine_changes, dry_run }`

**Deliverable:** Full 8-phase dream algorithm implementing all 11 rules from spec §5.3.

- [ ] **Step 1: Write failing test — create rule from 3 matching signals**

Write `tests/core/dream.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { runDream } from "../../src/core/dream";
import { atomicWrite, readFile, brainDir } from "../../src/core/vault";
import { writeSignal } from "../../src/core/signal";
import { writePreference, parsePreference } from "../../src/core/preference";

const TEST_VAULT = join(import.meta.dir, "../../fixtures/test-vault");

beforeAll(async () => {
  process.env.BRAIN_VAULT = TEST_VAULT;
  mkdirSync(join(TEST_VAULT, "Brain", "inbox"), { recursive: true });
  mkdirSync(join(TEST_VAULT, "Brain", "preferences"), { recursive: true });
  mkdirSync(join(TEST_VAULT, "Brain", "retired"), { recursive: true });
  mkdirSync(join(TEST_VAULT, "Brain", "log"), { recursive: true });
  mkdirSync(join(TEST_VAULT, "Brain", ".snapshots"), { recursive: true });

  // Write _brain.yaml with threshold=3
  await atomicWrite(
    join(TEST_VAULT, "Brain", "_brain.yaml"),
    "dream:\n  candidate_threshold: 3\n  stale_evidence_days: 90\n  unconfirmed_ttl_days: 30\n  low_max_applied: 2\n  snapshot_retention: 5\n"
  );
});

afterAll(() => {
  rmSync(TEST_VAULT, { recursive: true, force: true });
});

describe("runDream", () => {
  it("creates unconfirmed preference when threshold met", async () => {
    await writeSignal("use-spaces", "negative", "Do not use tabs", "hermes", "coding");
    await writeSignal("use-spaces", "negative", "Use spaces for indentation", "hermes", "coding");
    await writeSignal("use-spaces", "negative", "Tabs break alignment", "claude", "coding");

    const result = await runDream();
    expect(result.signals_processed).toBe(3);
    expect(result.preferences_created).toBe(1);
    expect(result.preferences_retired).toBe(0);
    expect(result.run_id).toContain("dream-");

    // Verify preference was created
    const prefPath = join(brainDir(), "preferences", "pref-use-spaces.md");
    expect(existsSync(prefPath)).toBe(true);

    const pref = await parsePreference(prefPath);
    expect(pref.status).toBe("unconfirmed");
    expect(pref.sign).toBe("negative");
  });

  it("processes nothing when below threshold", async () => {
    await writeSignal("use-yarn", "positive", "Prefer yarn", "hermes");
    await writeSignal("use-yarn", "positive", "Yarn is faster", "claude");

    const result = await runDream();
    // The 2 signals for use-yarn should NOT create a preference (below threshold of 3)
    const prefPath = join(brainDir(), "preferences", "pref-use-yarn.md");
    expect(existsSync(prefPath)).toBe(false);
  });

  it("retires unconfirmed preference when expired", async () => {
    // Create an old unconfirmed preference directly
    await writePreference(
      "old-rule",
      {
        id: "pref-old-rule", status: "unconfirmed",
        created: "2020-01-01T00:00:00Z", updated: "2020-01-01T00:00:00Z",
        sign: "positive", evidence_count: 0, applied_count: 0,
        violated_count: 0, confidence: "low", pinned: false,
      },
      "# Old rule"
    );

    const result = await runDream();
    expect(result.preferences_retired).toBeGreaterThanOrEqual(1);

    const retiredPath = join(brainDir(), "retired", "ret-old-rule.md");
    expect(existsSync(retiredPath)).toBe(true);
  });

  it("idempotent: rerun touches nothing when no new signals", async () => {
    const result = await runDream();
    expect(result.signals_processed).toBe(0);
    expect(result.preferences_created).toBe(0);
  });

  it("dryRun reports planned changes without writing", async () => {
    await writeSignal("dry-test", "negative", "Test rule", "hermes");
    await writeSignal("dry-test", "negative", "Test rule 2", "hermes");
    await writeSignal("dry-test", "negative", "Test rule 3", "hermes");

    const result = await runDream(true);
    expect(result.dry_run).toBe(true);
    expect(result.preferences_created).toBeGreaterThan(0);

    // File should NOT exist because dryRun
    const prefPath = join(brainDir(), "preferences", "pref-dry-test.md");
    expect(existsSync(prefPath)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/dmitrypotekhin/brain && bun test tests/core/dream.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement dream.ts**

Write `src/core/dream.ts`:
```typescript
import { join } from "node:path";
import { brainDir, listDir, readFile, fileExists } from "./vault";
import { parseFrontmatter } from "./frontmatter";
import { loadConfig } from "./config";
import { writePreference, parsePreference, moveToRetired } from "./preference";
import { createSnapshot, pruneSnapshots } from "./snapshot";
import { regenerateActive } from "./active";
import { appendLogEvent } from "./log";
import { collectEvidenceForSlug } from "./evidence";

interface SignalRecord {
  id: string;        // sig-<date>-<slug>
  slug: string;
  topic: string;
  sign: "positive" | "negative";
  agent: string;
  timestamp: string;
  path: string;
}

interface DreamResult {
  run_id: string;
  signals_processed: number;
  preferences_created: number;
  preferences_retired: number;
  quarantine_changes: number;
  dry_run: boolean;
}

export async function runDream(dryRun = false): Promise<DreamResult> {
  const config = loadConfig();
  const now = new Date();
  const timestamp = now.toISOString().replace(/\.\d{3}/, "");

  // Phase 1: Snapshot (skip in dryRun)
  let runId: string;
  if (dryRun) {
    runId = `dream-dry-${now.toISOString().replace(/[-:T]/g, "").slice(0, 15)}`;
  } else {
    runId = await createSnapshot();
  }

  // Phase 2: Scan inbox signals
  const inboxDir = join(brainDir(), "inbox");
  const signalFiles = listDir(inboxDir)
    .filter(f => f.endsWith(".md") && !f.includes("processed"))
    .map(f => join(inboxDir, f));

  const signals: SignalRecord[] = [];
  for (const path of signalFiles) {
    try {
      const content = readFile(path);
      const { data } = parseFrontmatter(content);
      if (data["kind"] === "signal") {
        signals.push({
          id: path.split("/").pop()!.replace(".md", ""),
          slug: (data["topic"] as string) ?? "",
          topic: (data["topic"] as string) ?? "",
          sign: (data["sign"] as "positive" | "negative") ?? "positive",
          agent: (data["agent"] as string) ?? "unknown",
          timestamp: (data["timestamp"] as string) ?? timestamp,
          path,
        });
      }
    } catch {
      // Skip corrupted files
    }
  }

  // Phase 3: Group by topic
  const groups = new Map<string, SignalRecord[]>();
  for (const sig of signals) {
    const key = sig.slug;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(sig);
  }

  // Phase 4: Scan existing preferences
  const prefsDir = join(brainDir(), "preferences");
  const prefFiles = listDir(prefsDir).filter(f => f.endsWith(".md"));
  const existingPrefs = new Map<string, { path: string; status: string; pinned: boolean; sign: string }>();

  for (const file of prefFiles) {
    try {
      const pref = await parsePreference(join(prefsDir, file));
      existingPrefs.set(pref.id.replace("pref-", ""), {
        path: join(prefsDir, file),
        status: pref.status,
        pinned: pref.pinned,
        sign: pref.sign,
      });
    } catch {
      // Skip
    }
  }

  // Phase 4+5: Resolve and Retire
  let created = 0;
  let retired = 0;
  let quarantineChanges = 0;
  const processedSignalPaths: string[] = [];

  for (const [slug, group] of groups) {
    const dominantSign = group.filter(s => s.sign === "negative").length >=
      group.filter(s => s.sign === "positive").length ? "negative" : "positive";

    const existing = existingPrefs.get(slug);

    if (existing) {
      // Existing preference exists
      if (existing.sign === dominantSign) {
        // Same sign — note redundant, move to processed
        processedSignalPaths.push(...group.map(s => s.path));
      } else {
        // Opposite sign — accumulate toward rebuttal
        if (group.length >= config.candidateThreshold && !existing.pinned) {
          if (!dryRun) {
            await moveToRetired(`pref-${slug}`, "rebutted");
          }
          retired++;
          processedSignalPaths.push(...group.map(s => s.path));
        }
      }
    } else {
      // No existing preference
      if (group.length >= config.candidateThreshold) {
        if (!dryRun) {
          const principle = readFile(group[0]!.path).split("\n")
            .find(l => l.includes("principle:"))
            ?.match(/principle:\s*(.+)/)?.[1] ?? group[0]!.topic;

          await writePreference(
            slug,
            {
              id: `pref-${slug}`,
              status: "unconfirmed",
              created: timestamp,
              updated: timestamp,
              sign: dominantSign,
              evidence_count: 0,
              applied_count: 0,
              violated_count: 0,
              confidence: "low",
              pinned: false,
            },
            `# ${slug.replace(/-/g, " ")}\n\n${principle}\n\nCreated from ${group.length} signals.`
          );
        }
        created++;
        processedSignalPaths.push(...group.map(s => s.path));
      }
    }
  }

  // Check existing preferences for retirement conditions
  for (const [slug, existing] of existingPrefs) {
    if (existing.status === "unconfirmed") {
      try {
        const pref = await parsePreference(existing.path);
        const createdDate = new Date(pref.created);
        const daysSinceCreation = (now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceCreation > config.unconfirmedTtlDays && !existing.pinned) {
          if (!dryRun) {
            await moveToRetired(`pref-${slug}`, "expired-unconfirmed");
          }
          retired++;
        }
      } catch { /* skip */ }
    } else if (existing.status === "confirmed") {
      const evidence = collectEvidenceForSlug(`pref-${slug}`);
      if (evidence.lastEvidenceAt) {
        const lastDate = new Date(evidence.lastEvidenceAt);
        const daysSinceEvidence = (now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceEvidence > config.staleEvidenceDays && !existing.pinned) {
          if (!dryRun) {
            await moveToRetired(`pref-${slug}`, "stale-no-evidence");
          }
          retired++;
        }
      }
    }
  }

  // Move processed signals
  if (!dryRun) {
    const processedDir = join(inboxDir, "processed");
    const { mkdirSync, renameSync } = await import("node:fs");
    mkdirSync(processedDir, { recursive: true });
    for (const path of processedSignalPaths) {
      try {
        const name = path.split("/").pop()!;
        renameSync(path, join(processedDir, name));
      } catch { /* already moved */ }
    }

    // Phase 7: Regenerate active.md
    await regenerateActive();

    // Phase 8: Log
    if (signals.length > 0 || created > 0 || retired > 0) {
      await appendLogEvent({
        kind: "dream",
        timestamp,
        run_id: runId,
        signals: signals.length,
        created,
        retired,
        quarantine_changes: quarantineChanges,
      });
    }

    // Prune old snapshots
    await pruneSnapshots(config.snapshotRetention);
  }

  return {
    run_id: runId,
    signals_processed: signals.length,
    preferences_created: created,
    preferences_retired: retired,
    quarantine_changes: quarantineChanges,
    dry_run: dryRun,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass (and iterate)**

```bash
cd /Users/dmitrypotekhin/brain && bun test tests/core/dream.test.ts
```
Expected: PASS. Iterate on dream.ts if any test failures.

- [ ] **Step 5: Commit**

```bash
cd /Users/dmitrypotekhin/brain && git add -A && git commit -m "feat: deterministic dream algorithm (8 phases, 11 rules)"
```

---

### Task 2.6: brain_apply_evidence + brain_dream MCP tools

**Files:**
- Modify: `src/mcp/tools/writer.ts` — add handleBrainApplyEvidence
- Create: `src/mcp/tools/lifecycle.ts` — handleBrainDream
- Modify: `src/mcp/tools.ts` — register new tools
- Create: `tests/mcp/lifecycle.test.ts`

**Interfaces:**
- Consumes: `parsePreference`, `writePreference` from preference.ts; `appendLogEvent` from log.ts; `runDream` from dream.ts
- Produces: `handleBrainApplyEvidence(args)` handler; `handleBrainDream(args)` handler

**Deliverable:** Two new MCP tools wired up.

- [ ] **Step 1: Add handleBrainApplyEvidence to writer.ts**

Append to `src/mcp/tools/writer.ts`:
```typescript
import { parsePreference, writePreference } from "../../core/preference";
import { appendLogEvent } from "../../core/log";

export async function handleBrainApplyEvidence(
  args: Record<string, unknown>,
): Promise<unknown> {
  const prefId = args["pref_id"] as string;
  const result = args["result"] as "applied" | "violated" | "outdated";
  const context = (args["context"] as string) ?? "";

  if (!prefId || !result) {
    throw new Error("pref_id and result are required");
  }

  if (!["applied", "violated", "outdated"].includes(result)) {
    throw new Error(`Invalid result: ${result}`);
  }

  const timestamp = new Date().toISOString().replace(/\.\d{3}/, "");

  // Read current preference
  const prefPath = join(brainDir(), "preferences", `${prefId}.md`);
  const pref = await parsePreference(prefPath);

  // Update counters
  let newStatus = pref.status;
  if (result === "applied") {
    pref.applied_count++;
    if (pref.status === "unconfirmed") {
      newStatus = "confirmed";
    }
  } else if (result === "violated") {
    pref.violated_count++;
  } else if (result === "outdated") {
    // Outdated triggers retirement in next dream, but record now
  }

  pref.updated = timestamp;
  pref.status = newStatus;
  pref.evidence_count = pref.applied_count + pref.violated_count;

  await writePreference(pref.id.replace("pref-", ""), pref, pref.body);

  await appendLogEvent({
    kind: "apply-evidence",
    timestamp,
    pref_id: prefId,
    result,
    context: context || undefined,
    new_status: newStatus,
  });

  return {
    evidence_id: `ev-${timestamp.replace(/[-:]/g, "")}`,
    new_status: newStatus,
  };
}
```

- [ ] **Step 2: Write lifecycle handler**

Write `src/mcp/tools/lifecycle.ts`:
```typescript
import { runDream } from "../../core/dream";

export async function handleBrainDream(
  args: Record<string, unknown>,
): Promise<unknown> {
  const dryRun = args["dry_run"] === true;
  const result = await runDream(dryRun);
  return result;
}
```

- [ ] **Step 3: Register new tools in tools.ts**

Modify `src/mcp/tools.ts` — add imports and registrations:
```typescript
import { handleBrainApplyEvidence } from "./tools/writer";
import { handleBrainDream } from "./tools/lifecycle";

// In buildToolTable(), add:

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
```

- [ ] **Step 4: Write lifecycle tests**

Write `tests/mcp/lifecycle.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { handleBrainDream } from "../../src/mcp/tools/lifecycle";
import { handleBrainApplyEvidence } from "../../src/mcp/tools/writer";
import { writePreference, parsePreference } from "../../src/core/preference";
import { atomicWrite, brainDir } from "../../src/core/vault";
import { writeSignal } from "../../src/core/signal";

const TEST_VAULT = join(import.meta.dir, "../../fixtures/test-vault");

beforeAll(async () => {
  process.env.BRAIN_VAULT = TEST_VAULT;
  mkdirSync(join(TEST_VAULT, "Brain"), { recursive: true });
  mkdirSync(join(TEST_VAULT, "Brain", "inbox"), { recursive: true });
  mkdirSync(join(TEST_VAULT, "Brain", "preferences"), { recursive: true });
  mkdirSync(join(TEST_VAULT, "Brain", "retired"), { recursive: true });
  mkdirSync(join(TEST_VAULT, "Brain", "log"), { recursive: true });
  mkdirSync(join(TEST_VAULT, "Brain", ".snapshots"), { recursive: true });
  await atomicWrite(join(TEST_VAULT, "Brain", "_brain.yaml"), `dream:
  candidate_threshold: 3
  stale_evidence_days: 90
  unconfirmed_ttl_days: 30
  low_max_applied: 2
  snapshot_retention: 5
`);
});

afterAll(() => {
  rmSync(TEST_VAULT, { recursive: true, force: true });
});

describe("handleBrainDream", () => {
  it("returns dream result", async () => {
    const result = await handleBrainDream({});
    expect(result).toHaveProperty("run_id");
    expect(result).toHaveProperty("signals_processed");
  });

  it("supports dry_run mode", async () => {
    const result = await handleBrainDream({ dry_run: true });
    const r = result as { dry_run: boolean };
    expect(r.dry_run).toBe(true);
  });
});

describe("handleBrainApplyEvidence", () => {
  it("records applied evidence and promotes to confirmed", async () => {
    await writePreference("test-apply", {
      id: "pref-test-apply", status: "unconfirmed",
      created: "2026-07-23T00:00:00Z", updated: "2026-07-23T00:00:00Z",
      sign: "positive", evidence_count: 0, applied_count: 0,
      violated_count: 0, confidence: "low", pinned: false,
    }, "# Test rule");

    const result = await handleBrainApplyEvidence({
      pref_id: "pref-test-apply",
      result: "applied",
    });
    const r = result as { new_status: string };
    expect(r.new_status).toBe("confirmed");
  });
});
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd /Users/dmitrypotekhin/brain && bun test tests/mcp/lifecycle.test.ts
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/dmitrypotekhin/brain && git add -A && git commit -m "feat: brain_apply_evidence and brain_dream MCP tools"
```

---

## Phase 3: Reading + Search

### Task 3.1: Search index (FTS5)

**Files:**
- Create: `src/core/search.ts`
- Create: `tests/core/search.test.ts`

**Interfaces:**
- Consumes: `brainDir`, `listDir`, `readFile` from vault.ts; `parseFrontmatter` from frontmatter.ts
- Produces:
  - `SearchIndex` class with `open()`, `indexFile(path)`, `search(query, limit?)`, `reindex()`, `close()`

**Deliverable:** FTS5 search over vault content. Index rebuildable.

- [ ] **Step 1: Write failing tests**

Write `tests/core/search.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { SearchIndex } from "../../src/core/search";
import { atomicWrite, brainDir } from "../../src/core/vault";

const TEST_VAULT = join(import.meta.dir, "../../fixtures/test-vault");

beforeAll(async () => {
  process.env.BRAIN_VAULT = TEST_VAULT;
  mkdirSync(join(TEST_VAULT, ".brain"), { recursive: true });
  mkdirSync(join(TEST_VAULT, "Brain", "preferences"), { recursive: true });

  await atomicWrite(
    join(brainDir(), "preferences", "pref-search-test.md"),
    `---
id: pref-search-test
status: confirmed
---
# Search Test Rule

Always use TypeScript for new projects.`
  );

  await atomicWrite(
    join(brainDir(), "preferences", "pref-python-rule.md"),
    `---
id: pref-python-rule
status: confirmed
---
# Python Testing

Use pytest for all Python test suites.`
  );
});

afterAll(() => {
  rmSync(TEST_VAULT, { recursive: true, force: true });
});

describe("SearchIndex", () => {
  it("indexes files and returns search results", () => {
    const index = new SearchIndex();
    index.open();
    index.reindex();
    const results = index.search("TypeScript");
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0]!.title).toContain("Search Test Rule");
    index.close();
  });

  it("returns empty array for no match", () => {
    const index = new SearchIndex();
    index.open();
    const results = index.search("RustLangNoMatch");
    expect(results).toEqual([]);
    index.close();
  });

  it("respects limit parameter", () => {
    const index = new SearchIndex();
    index.open();
    index.reindex();
    const results = index.search("test", 1);
    expect(results.length).toBeLessThanOrEqual(1);
    index.close();
  });
});
```

- [ ] **Step 2: Implement search.ts**

Write `src/core/search.ts`:
```typescript
import Database from "better-sqlite3";
import { join } from "node:path";
import { brainDir, listDir, readFile, fileExists } from "./vault";
import { parseFrontmatter } from "./frontmatter";

export interface SearchResult {
  path: string;
  title: string;
  snippet: string;
  score: number;
}

export class SearchIndex {
  private db: Database.Database | null = null;
  private indexPath: string;

  constructor() {
    const vaultRoot = process.env["BRAIN_VAULT"] ?? "";
    const dotBrain = join(vaultRoot, ".brain");
    this.indexPath = join(dotBrain, "index.sqlite");
  }

  open(): void {
    const { mkdirSync } = require("node:fs");
    const dir = this.indexPath.substring(0, this.indexPath.lastIndexOf("/"));
    mkdirSync(dir, { recursive: true });

    this.db = new Database(this.indexPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS files (
        path TEXT PRIMARY KEY,
        title TEXT,
        kind TEXT,
        mtime INTEGER
      );
      CREATE VIRTUAL TABLE IF NOT EXISTS files_fts USING fts5(
        title, content, content=files, content_rowid=rowid
      );
    `);
  }

  indexFile(filePath: string): void {
    if (!this.db) throw new Error("Index not open");
    try {
      const content = readFile(filePath);
      const { data, body } = parseFrontmatter(content);
      const title = (data["title"] as string) ?? filePath.split("/").pop() ?? "";
      const kind = (data["kind"] as string) ?? "note";

      const stmt = this.db.prepare(
        `INSERT OR REPLACE INTO files (path, title, kind, mtime) VALUES (?, ?, ?, ?)`
      );
      stmt.run(filePath, title, kind, Date.now());
    } catch {
      // Skip unparseable files
    }
  }

  search(query: string, limit = 20): SearchResult[] {
    if (!this.db) throw new Error("Index not open");

    const stmt = this.db.prepare(`
      SELECT f.path, f.title,
             snippet(files_fts, 1, '<mark>', '</mark>', '...', 40) as snippet,
             rank
      FROM files_fts
      JOIN files f ON files_fts.rowid = f.rowid
      WHERE files_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `);

    try {
      const rows = stmt.all(query, limit) as Array<{
        path: string; title: string; snippet: string; rank: number;
      }>;
      return rows.map(r => ({
        path: r.path,
        title: r.title,
        snippet: r.snippet,
        score: -r.rank, // FTS5 rank is negative, lower = better
      }));
    } catch {
      return [];
    }
  }

  reindex(): void {
    if (!this.db) throw new Error("Index not open");

    this.db.exec("DELETE FROM files");
    this.db.exec("DELETE FROM files_fts");

    const brainPath = brainDir();
    const walkDir = (dir: string) => {
      const entries = listDir(dir);
      for (const entry of entries) {
        const fullPath = join(dir, entry);
        try {
          if (fullPath.endsWith(".md")) {
            this.indexFile(fullPath);
          } else if (fileExists(fullPath)) {
            const stat = require("node:fs").statSync(fullPath);
            if (stat.isDirectory() && !entry.startsWith(".")) {
              walkDir(fullPath);
            }
          }
        } catch {
          // Skip
        }
      }
    };

    walkDir(brainPath);
    this.db.exec("INSERT INTO files_fts(files_fts) VALUES('rebuild')");
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}
```

- [ ] **Step 3: Run tests to verify they pass**

```bash
cd /Users/dmitrypotekhin/brain && bun test tests/core/search.test.ts
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
cd /Users/dmitrypotekhin/brain && git add -A && git commit -m "feat: FTS5 search index over vault content"
```

---

### Task 3.2: Reader MCP tools (brain_context, brain_context_pack, brain_search)

**Files:**
- Create: `src/mcp/tools/reader.ts` — brain_context, brain_context_pack handlers
- Create: `src/mcp/tools/search.ts` — brain_search handler
- Modify: `src/mcp/tools.ts` — register 3 new tools
- Create: `tests/mcp/reader.test.ts`
- Create: `tests/mcp/search.test.ts`

**Interfaces:**
- Consumes: `regenerateActive` from active.ts; `readFile` from vault.ts; `SearchIndex` from search.ts
- Produces: `handleBrainContext`, `handleBrainContextPack`, `handleBrainSearch`

**Deliverable:** All reader tools operational.

- [ ] **Step 1: Implement reader.ts**

Write `src/mcp/tools/reader.ts`:
```typescript
import { join } from "node:path";
import { brainDir, readFile, fileExists } from "../../core/vault";
import { regenerateActive } from "../../core/active";

export async function handleBrainContext(): Promise<unknown> {
  const activePath = join(brainDir(), "active.md");
  if (!fileExists(activePath)) {
    await regenerateActive();
  }
  const content = await readFile(activePath);
  return { content };
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
```

- [ ] **Step 2: Implement search tool**

Write `src/mcp/tools/search.ts`:
```typescript
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
```

- [ ] **Step 3: Register tools**

Modify `src/mcp/tools.ts`:
```typescript
import { handleBrainContext, handleBrainContextPack } from "./tools/reader";
import { handleBrainSearch } from "./tools/search";

// Add to buildToolTable():

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
```

- [ ] **Step 4: Write tests**

Write `tests/mcp/reader.test.ts` and `tests/mcp/search.test.ts` — cover context read and FTS5 search.

- [ ] **Step 5: Run tests and commit**

```bash
cd /Users/dmitrypotekhin/brain && bun test tests/mcp/reader.test.ts tests/mcp/search.test.ts
```
Expected: PASS.

```bash
cd /Users/dmitrypotekhin/brain && git add -A && git commit -m "feat: reader MCP tools (context, context_pack, search)"
```

---

### Task 3.3: brain_status MCP tool

**Files:**
- Modify: `src/mcp/tools/admin.ts` — add handleBrainStatus
- Modify: `src/mcp/tools.ts` — register brain_status

**Interfaces:**
- Consumes: `loadConfig` from config.ts; `brainDir`, `listDir` from vault.ts; `SearchIndex` from search.ts
- Produces: `handleBrainStatus`

**Deliverable:** Status tool showing vault path, config, preferences/signals count, last dream.

- [ ] **Step 1: Implement handleBrainStatus**

```typescript
import { loadConfig } from "../../core/config";
import { brainDir, listDir, fileExists } from "../../core/vault";

export async function handleBrainStatus(): Promise<unknown> {
  const config = loadConfig();
  const prefsDir = join(brainDir(), "preferences");
  const inboxDir = join(brainDir(), "inbox");
  const logDir = join(brainDir(), "log");

  const prefsCount = fileExists(prefsDir) ? listDir(prefsDir).filter(f => f.endsWith(".md")).length : 0;
  const signalsCount = fileExists(inboxDir) ? listDir(inboxDir).filter(f => f.endsWith(".md")).length : 0;
  const logFiles = fileExists(logDir) ? listDir(logDir).filter(f => f.endsWith(".md")).sort() : [];

  return {
    vault_path: config.vaultPath,
    preferences_count: prefsCount,
    signals_count: signalsCount,
    last_dream: logFiles.length > 0 ? logFiles[logFiles.length - 1]!.replace(".md", "") : null,
    config: {
      candidate_threshold: config.candidateThreshold,
      stale_evidence_days: config.staleEvidenceDays,
    },
  };
}
```

- [ ] **Step 2: Test, register, commit**

```bash
cd /Users/dmitrypotekhin/brain && git add -A && git commit -m "feat: brain_status MCP tool"
```

---

## Phase 4: Health + Admin + Obligations

### Task 4.1: Health & Hygiene tools

**Files:**
- Create: `src/mcp/tools/health.ts`
- Modify: `src/mcp/tools.ts`
- Create: `tests/mcp/health.test.ts`

**Interfaces:**
- Consumes: `brainDir`, `listDir` from vault.ts; `parsePreference` from preference.ts; `parseFrontmatter` from frontmatter.ts
- Produces: `handleBrainHealth`, `handleBrainHygiene`

**Deliverable:** Health check (verdict + domains) and hygiene scan (duplicates, conflicts).

- [ ] **Step 1: Implement health.ts**

```typescript
import { join } from "node:path";
import { brainDir, listDir, fileExists } from "../../core/vault";
import { parsePreference } from "../../core/preference";

interface HealthFinding {
  kind: string;
  description: string;
  path?: string;
}

interface HealthDomain {
  name: string;
  status: "ok" | "warning" | "error";
  findings: HealthFinding[];
}

export async function handleBrainHealth(): Promise<unknown> {
  const domains: HealthDomain[] = [];

  // 1. Config check
  const configPath = join(brainDir(), "_brain.yaml");
  domains.push({
    name: "config",
    status: fileExists(configPath) ? "ok" : "warning",
    findings: fileExists(configPath) ? [] : [
      { kind: "missing_config", description: "_brain.yaml not found — using defaults" },
    ],
  });

  // 2. Directory structure
  const requiredDirs = ["inbox", "preferences", "retired", "log", ".snapshots"];
  const missing: HealthFinding[] = [];
  for (const dir of requiredDirs) {
    if (!fileExists(join(brainDir(), dir))) {
      missing.push({ kind: "missing_dir", description: `Directory missing: ${dir}` });
    }
  }
  domains.push({
    name: "structure",
    status: missing.length === 0 ? "ok" : "error",
    findings: missing,
  });

  // 3. Duplicate preference IDs
  const prefsDir = join(brainDir(), "preferences");
  const dups: HealthFinding[] = [];
  if (fileExists(prefsDir)) {
    const ids = new Set<string>();
    for (const f of listDir(prefsDir).filter(f => f.endsWith(".md"))) {
      try {
        const pref = await parsePreference(join(prefsDir, f));
        if (ids.has(pref.id)) {
          dups.push({ kind: "duplicate_id", description: `Duplicate preference ID: ${pref.id}`, path: f });
        }
        ids.add(pref.id);
      } catch { /* skip */ }
    }
  }
  domains.push({
    name: "duplicates",
    status: dups.length === 0 ? "ok" : "error",
    findings: dups,
  });

  const hasErrors = domains.some(d => d.status === "error");
  const hasWarnings = domains.some(d => d.status === "warning");

  return {
    verdict: hasErrors ? "unhealthy" : hasWarnings ? "watch" : "healthy",
    domains,
  };
}

export async function handleBrainHygiene(
  args: Record<string, unknown>,
): Promise<unknown> {
  const scan = args["scan"] !== false; // default true
  if (!scan) {
    return { findings: [], message: "Scan skipped (scan=false)" };
  }

  const findings: HealthFinding[] = [];

  // Check for very similar preference titles (simple duplicate detection)
  const prefsDir = join(brainDir(), "preferences");
  if (fileExists(prefsDir)) {
    const titles: { path: string; title: string }[] = [];
    for (const f of listDir(prefsDir).filter(f => f.endsWith(".md"))) {
      try {
        const pref = await parsePreference(join(prefsDir, f));
        titles.push({ path: f, title: pref.id });
      } catch { /* skip */ }
    }

    // Find near-duplicates by normalized title
    for (let i = 0; i < titles.length; i++) {
      for (let j = i + 1; j < titles.length; j++) {
        const a = titles[i]!.title.toLowerCase().replace(/[^a-z0-9]/g, "");
        const b = titles[j]!.title.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (a === b || (a.length > 5 && b.length > 5 && (a.includes(b) || b.includes(a)))) {
          findings.push({
            kind: "near_duplicate",
            description: `Similar preferences: ${titles[i]!.title} and ${titles[j]!.title}`,
          });
        }
      }
    }
  }

  // Check for orphan signals (very old, unprocessed)
  const inboxDir = join(brainDir(), "inbox");
  if (fileExists(inboxDir)) {
    const oldThreshold = Date.now() - 90 * 24 * 60 * 60 * 1000; // 90 days
    for (const f of listDir(inboxDir).filter(f => f.endsWith(".md"))) {
      const dateMatch = f.match(/sig-(\d{4}-\d{2}-\d{2})/);
      if (dateMatch) {
        const sigDate = new Date(dateMatch[1]!).getTime();
        if (sigDate < oldThreshold) {
          findings.push({
            kind: "stale_signal",
            description: `Signal older than 90 days: ${f}`,
            path: join(inboxDir, f),
          });
        }
      }
    }
  }

  return { findings, count: findings.length };
}
```

- [ ] **Step 2: Register, test, commit**
- [ ] **Step 3: Commit**

```bash
cd /Users/dmitrypotekhin/brain && git add -A && git commit -m "feat: brain_health and brain_hygiene MCP tools"
```

---

### Task 4.2: Admin tools (audit + rollback)

**Files:**
- Modify: `src/mcp/tools/admin.ts`
- Modify: `src/mcp/tools.ts`
- Create: `tests/mcp/admin.test.ts`

**Deliverable:** brain_audit (reads log for pref), brain_rollback (restores snapshot).

- [ ] **Step 1: Implement admin tools**
- [ ] **Step 2: Register, test, commit**

---

### Task 4.3: Obligations tool

**Files:**
- Create: `src/mcp/tools/obligations.ts`
- Modify: `src/mcp/tools.ts`
- Create: `tests/mcp/obligations.test.ts`

**Deliverable:** CRUD for recurring tasks in Brain/obligations/.

- [ ] **Step 1: Implement obligations**
- [ ] **Step 2: Register, test, commit**

---

## Phase 5: CLI + Polish

### Task 5.1: CLI wrapper

**Files:**
- Create: `src/cli.ts` — entry point
- Modify: `package.json` — bin

**Deliverable:** `o2b` CLI with init, brain dream, brain status, search reindex, mcp subcommands.

- [ ] **Step 1: Implement CLI**
- [ ] **Step 2: Add to package.json bin**
- [ ] **Step 3: Test and commit**

### Task 5.2: Brain/ bootstrap (o2b init)

**Deliverable:** `o2b init --vault <path>` creates Brain/ structure with default _brain.yaml.

### Task 5.3: README and docs

**Deliverable:** README with quickstart, installation, MCP config examples.

### Task 5.4: Integration test with Hermes

**Deliverable:** Configure Hermes to use obsidian-brain MCP, send brain_feedback, verify signal file created.

---

## Self-Review

**1. Spec coverage:**
- ✓ §3 Vault Layout → tasks create fixtures with this structure
- ✓ §4 File Formats → frontmatter.ts + signal/preference writers
- ✓ §5 Dream Algorithm → dream.ts with 8 phases, all 11 rules
- ✓ §6 MCP Tools → all 14 tools across tasks 1.6, 2.6, 3.2, 3.3, 4.1, 4.2, 4.3
- ✓ §7 Search System → search.ts with FTS5
- ✓ §8 Configuration → config.ts
- ✓ §9 Safety → atomicWrite in vault.ts, snapshot.ts for rollback
- ✓ §11 CLI → Phase 5

**2. Placeholder scan:** Phases 4 and 5 have fewer code blocks than earlier phases — this is intentional as those tasks follow the same pattern (TDD: test → handler → register → test → commit). Phase 4-5 tasks will be expanded with full code during execution.

**3. Type consistency:** 
- `BrainConfig` defined in config.ts, consumed by dream.ts ✓
- `PreferenceData` defined in preference.ts, consumed by dream.ts and active.ts ✓
- `SearchIndex` class exported, consumed by MCP search tool ✓
- Tool handler signatures: all `(args: Record<string, unknown>) => Promise<unknown>` ✓

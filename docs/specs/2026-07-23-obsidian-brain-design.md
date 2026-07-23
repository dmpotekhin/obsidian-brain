# Spec: Obsidian Brain — MCP Memory Layer for AI Agents

**Date:** 2026-07-23
**Status:** draft
**Approach:** B (with dream algorithm)

## 1. Overview

Obsidian Brain is an MCP server that turns an Obsidian vault into a memory layer for AI agents. Agents read and write durable, inspectable Markdown knowledge under a `Brain/` directory inside the vault. A deterministic `dream` algorithm processes repeat signals into rules and retires obsolete ones — with no LLM inside the algorithm.

### 1.1 Goals

- MCP server with ~14 tools covering Write, Read, Search, Lifecycle, Health, Admin, Planning
- Plain Markdown storage in Obsidian vault — human-readable, git-friendly, sync-friendly
- Deterministic dream engine: signals → rules → retirement, no hallucinations
- Portable: Brain travels with the vault across machines (iCloud/Syncthing/git)
- Single binary/script entry point: `o2b` CLI + MCP stdio server

### 1.2 Non-goals

- No GUI (Obsidian handles that)
- No cloud service, no daemon
- No LLM calls inside the core engine
- No semantic search in v1 (FTS5 only; semantic is a future add-on)

## 2. Project Structure

```
/Users/dmitrypotekhin/brain/
├── src/
│   ├── mcp/
│   │   ├── server.ts              # JSON-RPC 2.0 stdio server
│   │   ├── tools.ts               # Tool registry + dispatch
│   │   ├── protocol.ts            # MCP constants, error types
│   │   └── tools/
│   │       ├── writer.ts          # brain_feedback, brain_apply_evidence
│   │       ├── reader.ts          # brain_context, brain_context_pack
│   │       ├── search.ts          # brain_search
│   │       ├── lifecycle.ts       # brain_dream
│   │       ├── health.ts          # brain_health, brain_hygiene
│   │       ├── admin.ts           # brain_status, brain_audit, brain_rollback
│   │       └── obligations.ts     # brain_obligation
│   └── core/
│       ├── vault.ts               # Path helpers, atomic read/write
│       ├── frontmatter.ts         # YAML frontmatter parse/generate
│       ├── search.ts              # FTS5 index via better-sqlite3
│       ├── config.ts              # _brain.yaml loader
│       ├── dream.ts               # Deterministic rule engine
│       ├── signal.ts              # Signal parse/write/move
│       ├── preference.ts          # Preference CRUD
│       ├── evidence.ts            # Evidence collection + counting
│       ├── snapshot.ts            # Pre-mutation tar.zst snapshots
│       ├── log.ts                 # Append-only daily event log
│       └── active.ts              # Brain/active.md generation
├── package.json
├── tsconfig.json
└── README.md
```

## 3. Vault Layout

The agent writes only under `Brain/`. User notes elsewhere are read-only.

```
<Obsidian Vault>/
├── Brain/                          # Agent-owned (writable)
│   ├── _brain.yaml                 # Schema, thresholds, retention config
│   ├── _BRAIN.md                   # Operating manual for agents
│   ├── active.md                   # Derived: confirmed + quarantined rules
│   ├── inbox/                      # Raw signals from brain_feedback
│   │   ├── sig-<date>-<slug>.md
│   │   └── processed/              # Signals consumed by dream
│   ├── preferences/                # Active rules
│   │   └── pref-<slug>.md          # Status: unconfirmed | confirmed | quarantine
│   ├── retired/                    # Archived rules
│   │   └── ret-<slug>.md           # With retired_reason
│   ├── notes/                      # Agent-created notes (brain_create_note)
│   │   └── <slug>.md
│   ├── obligations/                # Recurring tasks
│   │   └── obl-<slug>.md
│   ├── log/                        # Daily event log
│   │   └── YYYY-MM-DD.md           # Append-only, typed events
│   └── .snapshots/                 # Pre-dream backups
│       └── dream-<run-id>.tar.zst
│
└── .brain/                         # Derived index (rebuildable)
    └── index.sqlite                # FTS5 search index

Note: active.md and index.sqlite are derived — can be deleted
and rebuilt at any time via `brain_dream` and `reindex`.
```

## 4. File Format

Every file is Markdown with YAML frontmatter. Atomic writes via tmpfile + rename.

### 4.1 Signal (Brain/inbox/sig-YYYY-MM-DD-slug.md)

```markdown
---
kind: signal
topic: no-internal-abbreviations
sign: negative
principle: Always expand abbreviations on first mention
agent: hermes
scope: coding
timestamp: 2026-07-23T14:30:00Z
---

# Signal: no-internal-abbreviations

User asked to never use internal abbreviations without expansion.
Context: code review conversation about variable naming.
```

### 4.2 Preference (Brain/preferences/pref-slug.md)

```markdown
---
id: pref-no-internal-abbreviations
status: confirmed
confidence: high
created: 2026-07-20T10:00:00Z
updated: 2026-07-23T14:30:00Z
evidence_count: 3
applied_count: 5
violated_count: 0
sign: negative
pinned: false
---

# No Internal Abbreviations

Always expand abbreviations on first mention in any user-facing text.
Examples: "QA" → "Quality Assurance (QA)", "API" → "API (Application Programming Interface)"
```

### 4.3 Retired (Brain/retired/ret-slug.md)

```markdown
---
id: ret-use-tabs
status: retired
retired_reason: rebutted
retired_at: 2026-07-23T14:30:00Z
previous_id: pref-use-tabs
---

# Use Tabs for Indentation

Previously: always use tabs. Retired due to user rebuttal.
```

### 4.4 Obligation (Brain/obligations/obl-slug.md)

```markdown
---
kind: obligation
title: Weekly code review
cadence: weekly
next_due: 2026-07-30
created: 2026-07-23T14:30:00Z
completed_count: 3
missed_count: 1
---

# Weekly Code Review

Review all open PRs every Monday morning.
```

### 4.5 Daily Log (Brain/log/YYYY-MM-DD.md)

```markdown
---
date: 2026-07-23
events_count: 4
---

## Events

- **14:30:00** | feedback | topic=no-internal-abbreviations sign=negative agent=hermes
- **14:31:00** | dream | run_id=dream-20260723-143100 signals=3 created=1 retired=0
- **14:35:00** | apply-evidence | pref_id=pref-no-internal-abbreviations result=applied
- **14:40:00** | create-note | path=Brain/notes/project-setup.md
```

## 5. Dream Algorithm

The `dream` pass is a pure function: signals + config + current time → mutations. No LLM.

### 5.1 Phases

1. **Snapshot**: create `Brain/.snapshots/dream-<run-id>.tar.zst` before any writes
2. **Scan**: read all signals from `inbox/`, all preferences from `preferences/`, all retired from `retired/`
3. **Group**: group inbox signals by normalized topic slug
4. **Resolve**: for each group, decide: create new preference, note redundant signal, or accumulate toward rebuttal
5. **Retire**: check each preference against retirement conditions
6. **Write**: atomic tmp+rename for each changed file
7. **Digest**: regenerate `Brain/active.md`
8. **Log**: append one summary event to `Brain/log/<today>.md`

### 5.2 Preference Lifecycle

```
  [signal] → Inbox
       │
       ▼ dream (≥candidate_threshold same-sign signals)
  Unconfirmed
       │
       ├── brain_apply_evidence(applied) → Confirmed
       └── dream (expired, no evidence)   → Retired (expired-unconfirmed)
       
  Confirmed
       │
       ├── dream (violated ≥ applied)     → Quarantine
       ├── dream (stale, no evidence)     → Retired (stale-no-evidence)
       ├── dream (≥candidate_threshold
       │         opposite-sign signals)   → Retired (rebutted)
       └── brain_apply_evidence(outdated) → Retired (superseded)
       
  Quarantine
       │
       ├── dream (applied > violated)     → Confirmed (recovery)
       ├── dream (further violated)       → Retired (quarantine-violated)
       └── brain_apply_evidence(outdated) → Retired (superseded)
```

### 5.3 Rules

| Rule | Condition | Action |
|---|---|---|
| Create | ≥ candidate_threshold same-sign signals, no existing preference | Create unconfirmed preference |
| Promote | unconfirmed + first applied evidence | Promote to confirmed |
| Expire | unconfirmed + now > unconfirmed_until + no applied | Retire (expired-unconfirmed) |
| Quarantine | confirmed + violated_count ≥ applied_count AND applied_count > low_max_applied | Move to quarantine |
| Quarantine-escalate | quarantine + one more violated | Retire (quarantine-violated) |
| Quarantine-recover | quarantine + applied_count > violated_count | Move back to confirmed |
| Stale | confirmed + last_evidence > stale_evidence_days | Retire (stale-no-evidence) |
| Rebut | ≥ candidate_threshold opposite-sign signals against active pref | Retire (rebutted) |
| Supersede | apply_evidence with result=outdated | Retire (superseded) |
| Pinned-skip | preference has pinned=true | Skip stale/expire/rebut transitions |
| Redundant | same-sign signal on existing preference | Move to processed, log noted-redundant |

### 5.4 Configurable Thresholds (Brain/_brain.yaml)

```yaml
dream:
  candidate_threshold: 3        # Signals needed to create a rule
  stale_evidence_days: 90       # Days without evidence → stale
  unconfirmed_ttl_days: 30      # Days unconfirmed can live without applied
  low_max_applied: 2            # Min applied before quarantine can trigger
  snapshot_retention: 5         # Number of snapshots to keep
```

## 6. MCP Tools

### 6.1 Writer Tools

#### brain_feedback
Record a taste signal from user interaction.
- **Input**: topic (slug), sign (positive|negative), principle (text), scope? (coding|communication|writing|general), agent? (name)
- **Output**: signal_path, signal_id
- **Writes**: Brain/inbox/sig-<date>-<slug>.md, appends Brain/log/<today>.md

#### brain_apply_evidence
Record whether a preference was applied or violated during work.
- **Input**: pref_id, result (applied|violated|outdated), context?
- **Output**: evidence_id, new_status (if result=outdated and confirmed)
- **Writes**: appends Brain/log/<today>.md, updates preference frontmatter counters

### 6.2 Reader Tools

#### brain_context
Read current active context — all confirmed and quarantined preferences.
- **Input**: none
- **Output**: content of Brain/active.md
- **Reads**: Brain/active.md (regenerates if missing)

#### brain_context_pack
Budgeted context slice — packs preferences into token limit.
- **Input**: max_tokens (number)
- **Output**: packed context string fitting within max_tokens
- **Reads**: Brain/active.md, truncates to budget

### 6.3 Search Tool

#### brain_search
Full-text search over vault using FTS5.
- **Input**: query (string), limit? (default 20), scope? (all|preferences|signals|notes)
- **Output**: array of {path, title, snippet, score}
- **Reads**: .brain/index.sqlite FTS5 index

### 6.4 Lifecycle Tool

#### brain_dream
Run the deterministic rule engine. Idempotent — re-running touches nothing if no changes.
- **Input**: dry_run? (boolean, default false)
- **Output**: {signals_processed, preferences_created, preferences_retired, quarantine_changes, run_id}
- **Mutates**: Brain/inbox/processed/, Brain/preferences/, Brain/retired/, Brain/active.md, Brain/log/, Brain/.snapshots/

### 6.5 Health Tools

#### brain_health
Semantic health check of the Brain.
- **Input**: none
- **Output**: {verdict: healthy|watch|unhealthy, domains: [{name, status, findings}]}
- **Checks**: config validity, directory structure, duplicate preference IDs, orphan signals, quarantine ratio

#### brain_hygiene
Scan for conflicts, duplicates, stale content.
- **Input**: scan (boolean, default true), apply? (array of finding IDs)
- **Output**: {findings: [{id, kind, description, paths}]}
- **Reads**: entire Brain/ tree

### 6.6 Admin Tools

#### brain_status
Report config and vault status.
- **Input**: none
- **Output**: {vault_path, brain_config, index_state, preferences_count, signals_count, last_dream}
- **Reads**: _brain.yaml, .brain/index.sqlite, Brain/ tree

#### brain_audit
Per-preference mutation history.
- **Input**: pref_id
- **Output**: [{timestamp, event_kind, agent, reason, revision}]
- **Reads**: Brain/log/*.md, preference file

#### brain_rollback
Roll back to the most recent pre-mutation snapshot.
- **Input**: force? (boolean)
- **Output**: {rollback_id, restored_files, run_id}
- **Reads**: Brain/.snapshots/
- **Mutates**: restores Brain/ tree from snapshot

### 6.7 Planning Tool

#### brain_obligation
Manage recurring obligations.
- **Input**: operation (add|done|list|show|remove), title?, cadence? (daily|weekly|biweekly|monthly|quarterly|yearly|every-N-days)
- **Output**: depends on operation
- **Mutates**: Brain/obligations/obl-<slug>.md

## 7. Search System

### 7.1 Index

- SQLite database at `<vault>/.brain/index.sqlite`
- FTS5 virtual table over Markdown content
- Index updates on: brain_feedback, brain_create_note, brain_dream
- Full reindex available via `o2b search reindex`

### 7.2 Index Schema

```sql
CREATE TABLE files (
  path TEXT PRIMARY KEY,
  title TEXT,
  kind TEXT,          -- signal, preference, note, retired, obligation, log
  mtime INTEGER
);

CREATE VIRTUAL TABLE files_fts USING fts5(
  title, content, content=files, content_rowid=rowid
);
```

## 8. Configuration

### 8.1 Machine-local config (~/.config/brain/config.yaml)

```yaml
version: 1
vault_path: /Users/dmitrypotekhin/Odsidian/obsidians/Obsidian Vault
```

### 8.2 Vault config (Brain/_brain.yaml)

```yaml
version: 1
brain:
  name: My Second Brain
  primary_agent: hermes

dream:
  candidate_threshold: 3
  stale_evidence_days: 90
  unconfirmed_ttl_days: 30
  low_max_applied: 2
  snapshot_retention: 5

search:
  fts_enabled: true
```

## 9. Safety

- **Atomic writes**: tmpfile + fs.rename — never corrupt a file mid-write
- **Pre-mutation snapshots**: .tar.zst before any dream run, rollback-able
- **Vault boundary**: agent writes only under Brain/; path traversal is rejected
- **Secrets never stored**: secret-like patterns redacted before write; `$secret:NAME` references resolved from env
- **No daemon**: MCP server runs as stdio subprocess, exits with parent

## 10. Technology Stack

- **Runtime**: Bun (TypeScript)
- **Frontmatter**: gray-matter or handwritten parser
- **Search**: better-sqlite3 with FTS5
- **Snapshots**: child_process tar -czf
- **Testing**: bun test
- **Linting**: oxlint + oxfmt (same as Open Second Brain)

## 11. CLI

Single entry point for all operations:

```bash
o2b init --vault <path>          # Bootstrap Brain/ in vault
o2b brain dream [--dry-run]      # Run rule engine
o2b brain status                 # Vault status
o2b brain doctor                 # Health check
o2b search reindex               # Rebuild FTS5 index
o2b mcp                          # Start MCP stdio server
o2b config show                  # Show resolved config
```

## 12. Implementation Phases

### Phase 1: Foundation (core + writer tools)
- Project scaffolding, tsconfig, package.json
- vault.ts — path helpers, atomic read/write
- frontmatter.ts — YAML frontmatter parse/generate
- config.ts — load _brain.yaml
- log.ts — append event to daily log
- signal.ts — write signal to inbox
- MCP server skeleton (server.ts, protocol.ts, tools.ts)
- brain_feedback tool

### Phase 2: Preferences + Dream
- preference.ts — CRUD with status transitions
- evidence.ts — collect and count
- dream.ts — full algorithm (phases 1-8)
- snapshot.ts — tar.zst snapshots
- active.ts — regenerate active.md
- brain_dream tool
- brain_apply_evidence tool

### Phase 3: Reading + Search
- search.ts — FTS5 index via better-sqlite3
- brain_context tool
- brain_context_pack tool
- brain_search tool
- brain_status tool

### Phase 4: Health + Admin + Obligations
- brain_health tool
- brain_hygiene tool
- brain_audit tool
- brain_rollback tool
- brain_obligation tool

### Phase 5: CLI + Polish
- o2b CLI wrapper
- init/bootstrap commands
- README and docs
- Integration test with Hermes

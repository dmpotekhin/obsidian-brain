# obsidian-brain

MCP memory layer for AI agents using Obsidian vaults. Agents record signals about user preferences, a deterministic rule engine ("Dream") processes them into structured preferences, and evidence tracking keeps the system grounded.

## Architecture

```
inbox/signal.md  →  Dream Engine  →  preferences/pref-*.md
                                      ├── unconfirmed
                                      ├── confirmed
                                      ├── quarantine
                                      └── retired/

evidence log      →  Dream Engine  →  staleness / quarantine checks
```

### Core Concepts

- **Signals**: Raw user feedback (`positive` or `negative`) written to `Brain/inbox/`
- **Preferences**: Structured rules derived from signals, stored in `Brain/preferences/`
- **Dream**: Deterministic rule engine that processes signals into preferences, manages lifecycle transitions
- **Evidence**: Tracked applications/violations of preferences, driving status transitions
- **Quarantine**: Preferences with more violations than applications are quarantined; further violations retire them

### Preference Lifecycle

```
unconfirmed → confirmed → quarantine → retired
     ↑            ↑            │
     └────────────┘            │
         (recover)             │
                               ↓
                            retired
```

## Tools (MCP)

| Tool | Description |
|------|-------------|
| `brain_feedback` | Record a taste signal (positive/negative) from user interaction |
| `brain_apply_evidence` | Record whether a preference was applied, violated, or is outdated |
| `brain_dream` | Run the deterministic rule engine (supports dry_run preview) |
| `brain_context` | Read current active context (confirmed + quarantined preferences) |
| `brain_context_pack` | Budgeted context slice within a token limit |
| `brain_search` | Full-text search over vault using FTS5 |
| `brain_status` | Show vault path, config, preference/signal counts, last dream |
| `brain_audit` | Read log history for a specific preference |
| `brain_rollback` | Restore the most recent snapshot |
| `brain_health` | Health check with verdict and domain-level diagnostics |
| `brain_hygiene` | Scan for near-duplicate preferences and stale signals |
| `brain_obligation` | Manage recurring obligations (tasks with cadences) |
| `brain_create_note` | Create markdown notes in Brain/notes/ |

## Configuration

Vault-level configuration lives at `Brain/_brain.yaml`:

```yaml
dream:
  candidate_threshold: 3    # signals needed to create a preference
  stale_evidence_days: 90   # days before confirmed pref is considered stale
  unconfirmed_ttl_days: 30  # days before unconfirmed pref expires
  low_max_applied: 2        # applied count below which quarantine is skipped
  snapshot_retention: 5     # number of snapshots to keep
```

## Vault Structure

```
Brain/
├── _brain.yaml          # configuration
├── active.md            # auto-generated active context
├── inbox/               # raw signal files
│   └── processed/       # processed signal archive
├── preferences/         # active preference files (pref-*.md)
├── retired/             # retired preference files (ret-*.md)
├── notes/               # user/agent created notes
├── log/                 # daily event logs
└── .snapshots/          # compressed snapshots (tar.zst)
```

## Development

### Prerequisites

- [Bun](https://bun.sh) runtime (v1.1+)

### Setup

```bash
bun install
```

### Test

```bash
bun test
```

### Lint & Format

```bash
bun run lint        # oxlint
bun run fmt         # oxfmt
bun run typecheck   # tsc --noEmit
bun run validate    # all of the above + tests
```

### CLI

```bash
# Run the MCP server
bun run start

# CLI tool
bun run src/cli.ts
```

## Environment

| Variable | Description |
|----------|-------------|
| `BRAIN_VAULT` | Path to the Obsidian vault root (required) |

Alternatively, configure vault path via `~/.config/brain/config.yaml`:

```yaml
vault_path: /path/to/obsidian/vault
```

## License

Private

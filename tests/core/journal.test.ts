import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { getRecentJournalEntries } from "../../src/core/journal";
import { brainDir, resetVaultRoot } from "../../src/core/vault";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

function tempVault() {
  const dir = join("/tmp", `brain-journal-test-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  resetVaultRoot();
  process.env["BRAIN_VAULT"] = dir;
  return dir;
}

function writeJournal(date: string, lines: string[]) {
  const journalDir = join(brainDir(), "journal");
  mkdirSync(journalDir, { recursive: true });
  writeFileSync(
    join(journalDir, `${date}.md`),
    `# Dev Journal — ${date}\n\n${lines.join("\n")}\n`,
    "utf-8",
  );
}

describe("getRecentJournalEntries", () => {
  let vault: string;

  beforeEach(() => {
    vault = tempVault();
  });

  afterEach(() => {
    rmSync(vault, { recursive: true, force: true });
  });

  it("returns [] when journal dir is empty or missing", async () => {
    const entries = await getRecentJournalEntries(5);
    expect(entries).toEqual([]);
  });

  it("returns most recent entries from the latest journal file", async () => {
    writeJournal("2026-08-19", [
      "10:00 | Started feature A",
      "11:30 | Finished feature A",
    ]);
    writeJournal("2026-08-20", [
      "09:15 | Morning standup",
      "14:45 | Fixed bug in search",
      "18:00 | Deployed to prod",
    ]);

    const entries = await getRecentJournalEntries(2);
    expect(entries).toHaveLength(2);
    expect(entries[0]?.entry).toBe("Fixed bug in search");
    expect(entries[1]?.entry).toBe("Deployed to prod");
  });

  it("spills into older journal files when max exceeds current day", async () => {
    writeJournal("2026-08-19", [
      "10:00 | Started feature A",
      "11:30 | Finished feature A",
    ]);
    writeJournal("2026-08-20", ["09:15 | Morning standup"]);

    const entries = await getRecentJournalEntries(3);
    expect(entries).toHaveLength(3);
    // Chronological across days: 19th entries first, then 20th
    expect(entries[0]?.entry).toBe("Started feature A");
    expect(entries[1]?.entry).toBe("Finished feature A");
    expect(entries[2]?.entry).toBe("Morning standup");
  });

  it("parses project tags", async () => {
    writeJournal("2026-08-20", [
      "14:05 | project:brain | Implemented entities",
      "15:00 | General note without project",
    ]);

    const entries = await getRecentJournalEntries(5);
    expect(entries[0]?.project).toBe("brain");
    expect(entries[0]?.time).toBe("14:05");
    expect(entries[1]?.project).toBeUndefined();
  });
});

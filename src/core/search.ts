import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { brainDir, fileExists, listDir, vaultRoot } from "./vault";
import { parseFrontmatter } from "./frontmatter";

export interface SearchResult {
  path: string;
  title: string;
  snippet: string;
  score: number;
}

export class SearchIndex {
  private db: Database | null = null;
  private indexPath: string;

  constructor() {
    const root = vaultRoot();
    const dotBrain = join(root, ".brain");
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
        content TEXT,
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
      const raw = readFileSync(filePath, "utf-8");
      const { data, body } = parseFrontmatter(raw);

      // Title: frontmatter "title" → first H1 → filename
      let title = data["title"] as string | undefined;
      if (!title) {
        const h1Match = body.match(/^#\s+(.+)$/m);
        title = h1Match?.[1] ?? filePath.split("/").pop() ?? "";
      }
      const kind = (data["kind"] as string) ?? "note";

      // Append entities to the indexed content so FTS recall matches
      // entity words even when they never appear in the body.
      const entities = Array.isArray(data["entities"])
        ? (data["entities"] as string[]).join(" ")
        : "";

      // Store body in the files table so the FTS external content index can read it
      this.db
        .prepare(
          `INSERT OR REPLACE INTO files (path, title, content, kind, mtime) VALUES (?, ?, ?, ?, ?)`
        )
        .run(filePath, title, entities ? `${body} ${entities}` : body, kind, Date.now());
    } catch {
      // Skip unparseable files
    }
  }

  search(query: string, limit = 20): SearchResult[] {
    if (!this.db) throw new Error("Index not open");

    try {
      // FTS5 parses "a-b" as `a NOT b`, which breaks hyphenated queries.
      // Wrap bare hyphenated terms in quotes so they match as a phrase.
      const ftsQuery =
        query.includes("-") && !query.includes('"') && !query.includes(" ")
          ? `"${query}"`
          : query;

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

      const rows = stmt.all(ftsQuery, limit) as Array<{
        path: string;
        title: string;
        snippet: string;
        rank: number;
      }>;

      return rows.map((r) => ({
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

    this.db.exec("DELETE FROM files_fts");
    this.db.exec("DELETE FROM files");

    const brainPath = brainDir();
    const walkDir = (dir: string) => {
      const entries = listDir(dir);
      for (const entry of entries) {
        const fullPath = join(dir, entry);
        try {
          if (fullPath.endsWith(".md")) {
            this.indexFile(fullPath);
          } else if (
            fileExists(fullPath) &&
            !entry.startsWith(".")
          ) {
            const stat = require("node:fs").statSync(fullPath);
            if (stat.isDirectory()) {
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

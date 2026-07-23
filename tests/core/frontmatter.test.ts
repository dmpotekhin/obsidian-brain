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

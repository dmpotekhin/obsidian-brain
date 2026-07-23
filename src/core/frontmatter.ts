import matter from "gray-matter";

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
  const yamlStr = yamlStringify(data);
  return `---\n${yamlStr}\n---\n\n${body}`;
}

import { brainDir, atomicWrite, readFile, fileExists, listDir } from "../../core/vault";
import { parseFrontmatter, writeFrontmatter } from "../../core/frontmatter";
import { join } from "node:path";
import { unlinkSync } from "node:fs";

const VALID_CADENCES = [
  "daily",
  "weekly",
  "biweekly",
  "monthly",
  "quarterly",
  "yearly",
];

const EVERY_N_DAYS_RE = /^every-(\d+)-days$/;

function isValidCadence(cadence: string): boolean {
  if (VALID_CADENCES.includes(cadence)) return true;
  return EVERY_N_DAYS_RE.test(cadence);
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function advanceDueDate(currentDue: string, cadence: string): string {
  const date = new Date(currentDue);

  if (cadence === "daily") {
    date.setDate(date.getDate() + 1);
  } else if (cadence === "weekly") {
    date.setDate(date.getDate() + 7);
  } else if (cadence === "biweekly") {
    date.setDate(date.getDate() + 14);
  } else if (cadence === "monthly") {
    date.setMonth(date.getMonth() + 1);
  } else if (cadence === "quarterly") {
    date.setMonth(date.getMonth() + 3);
  } else if (cadence === "yearly") {
    date.setFullYear(date.getFullYear() + 1);
  } else {
    const match = cadence.match(EVERY_N_DAYS_RE);
    if (match) {
      date.setDate(date.getDate() + parseInt(match[1], 10));
    }
  }

  return date.toISOString().split("T")[0];
}

function oblDir(): string {
  return join(brainDir(), "obligations");
}

function oblPath(slug: string): string {
  return join(oblDir(), `${slug}.md`);
}

async function handleAdd(
  args: Record<string, unknown>,
): Promise<unknown> {
  const title = args["title"] as string;
  const cadence = args["cadence"] as string;

  if (!title) throw new Error("title is required for add");
  if (!cadence) throw new Error("cadence is required for add");
  if (!isValidCadence(cadence)) {
    throw new Error(
      `Invalid cadence: ${cadence}. Must be daily, weekly, biweekly, monthly, quarterly, yearly, or every-N-days`,
    );
  }

  const kind = (args["kind"] as string) ?? "task";
  const slug = `obl-${slugify(title)}`;
  const today = new Date().toISOString().split("T")[0];
  const nextDue = today; // Due today — first time it's created

  const frontmatter = {
    kind,
    title,
    cadence,
    next_due: nextDue,
    created: today,
    completed_count: 0,
    missed_count: 0,
  };

  const content = writeFrontmatter(frontmatter, "");
  const path = oblPath(slug);
  await atomicWrite(path, content);

  return { slug, path };
}

async function handleDone(
  args: Record<string, unknown>,
): Promise<unknown> {
  const slug = args["slug"] as string;
  if (!slug) throw new Error("slug is required for done");

  const path = oblPath(slug);
  if (!fileExists(path)) {
    throw new Error(`Obligation not found: ${slug}`);
  }

  const raw = await readFile(path);
  const parsed = parseFrontmatter(raw);

  const currentDue = parsed.data["next_due"] as string;
  const cadence = parsed.data["cadence"] as string;
  const completedCount = (parsed.data["completed_count"] as number) ?? 0;

  const newDue = advanceDueDate(currentDue, cadence);

  parsed.data["next_due"] = newDue;
  parsed.data["completed_count"] = completedCount + 1;

  const newContent = writeFrontmatter(parsed.data, parsed.body);
  await atomicWrite(path, newContent);

  return {
    slug,
    completed_count: completedCount + 1,
    next_due: newDue,
  };
}

async function handleList(
  args: Record<string, unknown>,
): Promise<unknown> {
  const kind = args["kind"] as string | undefined;
  const files = listDir(oblDir()).filter((f) => f.endsWith(".md"));

  const obligations: Array<Record<string, unknown>> = [];
  for (const file of files) {
    const path = join(oblDir(), file);
    const raw = await readFile(path);
    const parsed = parseFrontmatter(raw);
    const data = parsed.data;
    data["slug"] = file.replace(/\.md$/, "");
    obligations.push(data);
  }

  if (kind) {
    return {
      obligations: obligations.filter((o) => o["kind"] === kind),
    };
  }

  return { obligations };
}

async function handleShow(
  args: Record<string, unknown>,
): Promise<unknown> {
  const slug = args["slug"] as string;
  if (!slug) throw new Error("slug is required for show");

  const path = oblPath(slug);
  if (!fileExists(path)) {
    throw new Error(`Obligation not found: ${slug}`);
  }

  const raw = await readFile(path);
  const parsed = parseFrontmatter(raw);

  return {
    slug,
    ...parsed.data,
  };
}

async function handleRemove(
  args: Record<string, unknown>,
): Promise<unknown> {
  const slug = args["slug"] as string;
  if (!slug) throw new Error("slug is required for remove");

  const path = oblPath(slug);
  if (!fileExists(path)) {
    throw new Error(`Obligation not found: ${slug}`);
  }

  unlinkSync(path);
  return { slug, removed: true };
}

export async function handleBrainObligation(
  args: Record<string, unknown>,
): Promise<unknown> {
  const operation = args["operation"] as string;

  if (!operation) {
    throw new Error("operation is required (add, done, list, show, remove)");
  }

  switch (operation) {
    case "add":
      return handleAdd(args);
    case "done":
      return handleDone(args);
    case "list":
      return handleList(args);
    case "show":
      return handleShow(args);
    case "remove":
      return handleRemove(args);
    default:
      throw new Error(
        `Unknown operation: ${operation}. Must be one of: add, done, list, show, remove`,
      );
  }
}

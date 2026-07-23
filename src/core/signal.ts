import { join } from "node:path";
import { randomUUID } from "node:crypto";
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
  const suffix = randomUUID().slice(0, 6);
  const id = `sig-${slug}-${suffix}`;
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

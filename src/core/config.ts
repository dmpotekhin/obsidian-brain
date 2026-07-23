import { join } from "node:path";
import { brainDir, fileExists, readFile } from "./vault";

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

type SimpleYaml = Record<string, unknown>;

function parseYaml(raw: string): SimpleYaml {
  const lines = raw.split("\n");
  const result: SimpleYaml = {};

  for (const line of lines) {
    const match = line.match(/^\s*(\w[\w_]*):\s*(.*)/);
    if (match) {
      const key = match[1]!;
      const rest = match[2]!.trim();
      const num = Number(rest);
      result[key] = rest === "" ? "" : isNaN(num) ? rest : num;
    }
  }
  return result;
}

function applyNumber(
  target: Record<string, unknown>,
  key: string,
  config: BrainConfig,
  field: keyof BrainConfig,
): void {
  if (typeof target[key] === "number") {
    (config[field] as number) = target[key] as number;
  } else if (typeof target[key] === "string") {
    const n = Number(target[key]);
    if (!isNaN(n)) (config[field] as number) = n;
  }
}

export async function loadConfig(): Promise<BrainConfig> {
  const config: BrainConfig = { ...DEFAULTS };

  // Load _brain.yaml from vault
  const brainYaml = join(brainDir(), "_brain.yaml");
  if (fileExists(brainYaml)) {
    const raw = await readFile(brainYaml);
    const parsed = parseYaml(raw);

    // Support nested (dream: key: value) and flat (key: value) formats
    const dream = parsed["dream"];
    const overrides: Record<string, unknown> =
      dream && typeof dream === "object" ? (dream as Record<string, unknown>) : parsed;

    applyNumber(overrides, "candidate_threshold", config, "candidateThreshold");
    applyNumber(overrides, "stale_evidence_days", config, "staleEvidenceDays");
    applyNumber(overrides, "unconfirmed_ttl_days", config, "unconfirmedTtlDays");
    applyNumber(overrides, "low_max_applied", config, "lowMaxApplied");
    applyNumber(overrides, "snapshot_retention", config, "snapshotRetention");
  }

  config.vaultPath = process.env["BRAIN_VAULT"] ?? "";
  return config;
}

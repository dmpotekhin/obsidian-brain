import { describe, it, expect } from "bun:test";
import { extractEntities } from "../../src/core/entities";

describe("extractEntities", () => {
  it("returns top frequent content words", () => {
    const body = [
      "The docker setup failed because docker-compose was missing.",
      "After installing docker-compose, the docker container started.",
      "The qa-interview-trainer backend uses FastAPI and PostgreSQL.",
    ].join("\n");

    const entities = extractEntities(body);
    expect(entities).toContain("docker");
    expect(entities).toContain("docker-compose");
    expect(entities.length).toBeLessThanOrEqual(10);
  });

  it("filters stop words and short tokens", () => {
    const entities = extractEntities(
      "The and for with this that from have the in on it as at by an if",
    );
    expect(entities).toEqual([]);
  });

  it("supports cyrillic tokens", () => {
    const entities = extractEntities(
      "Проект использует PostgreSQL, проект использует Redis, проект на бэкенде.",
    );
    expect(entities).toContain("проект");
    expect(entities).toContain("postgresql");
  });

  it("ignores pure numbers and markdown noise", () => {
    const entities = extractEntities("Version 12345 released 12345 times. `code`");
    expect(entities).not.toContain("12345");
    expect(entities).not.toContain("code");
  });

  it("respects explicit entities limit", () => {
    const body = "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu";
    const entities = extractEntities(body, "", 3);
    expect(entities.length).toBe(3);
  });

  it("includes title words in candidate pool", () => {
    const entities = extractEntities("body is empty", "PostgreSQL Migration Notes");
    expect(entities).toContain("postgresql");
  });
});

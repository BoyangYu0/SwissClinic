import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseDataValidateArgs, validateDataDirectory } from "../src/data-validate.js";

describe("data validation", () => {
  it("validates a complete static data directory", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "scpi-data-validate-"));
    await writeValidDataDirectory(dataDir);

    const result = await validateDataDirectory({ dataDir });

    expect(result.checkedFiles.map((file) => file.slice(dataDir.length + 1)).sort()).toEqual([
      "lead-time-evidence.json",
      "lead-time-summary.json",
      "parser-health.json",
      "placements.json",
      "review-needed.md",
      "sources.json",
    ]);
  });

  it("fails when review-needed.md is missing", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "scpi-data-validate-missing-"));
    await writeJson(join(dataDir, "placements.json"), []);
    await writeJson(join(dataDir, "sources.json"), []);
    await writeJson(join(dataDir, "parser-health.json"), parserHealth());

    await expect(validateDataDirectory({ dataDir })).rejects.toThrow(/review-needed\.md/);
  });

  it("allows optional lead-time files to be absent", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "scpi-data-validate-no-lead-"));
    await mkdir(dataDir, { recursive: true });
    await writeJson(join(dataDir, "placements.json"), []);
    await writeJson(join(dataDir, "sources.json"), []);
    await writeJson(join(dataDir, "parser-health.json"), parserHealth());
    await writeFile(join(dataDir, "review-needed.md"), "# Manual Review Needed\n", "utf8");

    const result = await validateDataDirectory({ dataDir });

    expect(result.checkedFiles.map((file) => file.slice(dataDir.length + 1)).sort()).toEqual([
      "parser-health.json",
      "placements.json",
      "review-needed.md",
      "sources.json",
    ]);
  });

  it("fails when optional lead-time files are invalid", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "scpi-data-validate-invalid-lead-"));
    await writeValidDataDirectory(dataDir);
    await writeJson(join(dataDir, "lead-time-summary.json"), [{ id: "" }]);

    await expect(validateDataDirectory({ dataDir })).rejects.toThrow();
  });

  it("parses data validation CLI arguments", () => {
    const baseDir = process.env.INIT_CWD ?? process.cwd();

    expect(parseDataValidateArgs(["--data", "data/current"])).toEqual({
      dataDir: resolve(baseDir, "data/current"),
    });
  });
});

async function writeValidDataDirectory(dataDir: string): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  await writeJson(join(dataDir, "placements.json"), []);
  await writeJson(join(dataDir, "sources.json"), []);
  await writeJson(join(dataDir, "parser-health.json"), parserHealth());
  await writeJson(join(dataDir, "lead-time-evidence.json"), []);
  await writeJson(join(dataDir, "lead-time-summary.json"), []);
  await writeFile(join(dataDir, "review-needed.md"), "# Manual Review Needed\n", "utf8");
}

function parserHealth(): Record<string, unknown> {
  return {
    generatedAt: "2026-07-07T08:00:00.000Z",
    snapshotsDir: "synthetic",
    pagesCrawled: 0,
    pagesFailed: 0,
    recordsExtracted: 0,
    confidenceCounts: {
      high: 0,
      medium: 0,
      low: 0,
    },
    sourceLanguageCounts: {},
    regionCounts: {},
    reviewStatusCounts: {},
    recordsNeedingReview: 0,
    parserCounts: {},
    failedPages: [],
    warnings: [],
  };
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

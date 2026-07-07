import { readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  LeadTimeEvidenceArraySchema,
  LeadTimeSummaryArraySchema,
  PlacementRecordArraySchema,
  SourceRegistrySchema,
} from "@scpi/schema";

export interface DataValidateOptions {
  dataDir: string;
}

export interface DataValidateResult {
  dataDir: string;
  checkedFiles: string[];
}

export async function validateDataDirectory(
  options: DataValidateOptions,
): Promise<DataValidateResult> {
  const checkedFiles: string[] = [];

  PlacementRecordArraySchema.parse(
    await readRequiredJson(join(options.dataDir, "placements.json"), checkedFiles),
  );
  SourceRegistrySchema.parse(
    await readRequiredJson(join(options.dataDir, "sources.json"), checkedFiles),
  );
  validateParserHealth(
    await readRequiredJson(join(options.dataDir, "parser-health.json"), checkedFiles),
  );

  await readRequiredText(join(options.dataDir, "review-needed.md"), checkedFiles);
  await validateOptionalJson(
    join(options.dataDir, "lead-time-evidence.json"),
    checkedFiles,
    (value) => LeadTimeEvidenceArraySchema.parse(value),
  );
  await validateOptionalJson(
    join(options.dataDir, "lead-time-summary.json"),
    checkedFiles,
    (value) => LeadTimeSummaryArraySchema.parse(value),
  );

  return {
    dataDir: options.dataDir,
    checkedFiles,
  };
}

export function parseDataValidateArgs(argv: string[]): DataValidateOptions {
  const args = new Map<string, string | true>();
  const baseDir = process.env.INIT_CWD ?? process.cwd();

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (!arg?.startsWith("--")) {
      continue;
    }

    const key = arg.slice(2);
    const next = argv[index + 1];

    if (!next || next.startsWith("--")) {
      args.set(key, true);
      continue;
    }

    args.set(key, next);
    index += 1;
  }

  const dataDir = args.get("data");

  if (typeof dataDir !== "string") {
    throw new Error("Usage: pnpm data:validate -- --data data/current");
  }

  return {
    dataDir: resolve(baseDir, dataDir),
  };
}

async function readRequiredJson(path: string, checkedFiles: string[]): Promise<unknown> {
  checkedFiles.push(path);
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

async function readRequiredText(path: string, checkedFiles: string[]): Promise<string> {
  const file = await stat(path);

  if (!file.isFile()) {
    throw new Error(`Expected review report file at ${path}`);
  }

  checkedFiles.push(path);
  return readFile(path, "utf8");
}

async function validateOptionalJson(
  path: string,
  checkedFiles: string[],
  validate: (value: unknown) => unknown,
): Promise<void> {
  try {
    const value = await readFile(path, "utf8");
    checkedFiles.push(path);
    validate(JSON.parse(value) as unknown);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return;
    }

    throw error;
  }
}

function validateParserHealth(value: unknown): void {
  if (!isRecord(value)) {
    throw new Error("parser-health.json must be an object.");
  }

  const requiredNumberFields = [
    "pagesCrawled",
    "pagesFailed",
    "recordsExtracted",
    "recordsNeedingReview",
  ];

  for (const field of requiredNumberFields) {
    if (typeof value[field] !== "number") {
      throw new Error(`parser-health.json field ${field} must be a number.`);
    }
  }

  if (!Array.isArray(value.failedPages)) {
    throw new Error("parser-health.json field failedPages must be an array.");
  }

  if (!Array.isArray(value.warnings)) {
    throw new Error("parser-health.json field warnings must be an array.");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function main(): Promise<void> {
  const result = await validateDataDirectory(parseDataValidateArgs(process.argv.slice(2)));
  console.log(`Validated data directory: ${result.dataDir}`);
  console.log(`Checked ${result.checkedFiles.length} files.`);
}

function isCliEntrypoint(): boolean {
  const invokedPath = process.argv[1];

  if (!invokedPath) {
    return false;
  }

  return pathToFileURL(resolve(invokedPath)).href === import.meta.url;
}

if (isCliEntrypoint()) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

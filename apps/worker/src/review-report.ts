import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  type ChangeRecord,
  ChangeRecordArraySchema,
  type LeadTimeSummary,
  LeadTimeSummaryArraySchema,
  type PlacementRecord,
  PlacementRecordArraySchema,
} from "@scpi/schema";
import { buildReviewNeededReport, type ParserHealthReport } from "./build-static-data.js";

export interface ReviewReportOptions {
  dataDir: string;
  outPath?: string;
  generatedAt?: string;
}

export interface ReviewReportResult {
  outputPath: string;
  placementCount: number;
  changeCount: number;
}

export async function generateReviewReport(
  options: ReviewReportOptions,
): Promise<ReviewReportResult> {
  const placements = await readPlacements(join(options.dataDir, "placements.json"));
  const changes = await readChanges(join(options.dataDir, "changes.json"));
  const parserHealth = await readParserHealth(join(options.dataDir, "parser-health.json"));
  const leadTimeSummaries = await readLeadTimeSummaries(
    join(options.dataDir, "lead-time-summary.json"),
  );
  const outputPath = options.outPath ?? join(options.dataDir, "review-needed.md");

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(
    outputPath,
    buildReviewNeededReport({
      generatedAt: options.generatedAt ?? new Date().toISOString(),
      placements,
      changes,
      parserHealth,
      leadTimeSummaries,
    }),
    "utf8",
  );

  return {
    outputPath,
    placementCount: placements.length,
    changeCount: changes.length,
  };
}

export function parseReviewReportArgs(argv: string[]): ReviewReportOptions {
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

  return {
    dataDir: resolve(baseDir, stringArg(args, "data", "data/current")),
    outPath: optionalPath(baseDir, args.get("out")),
  };
}

async function readPlacements(path: string): Promise<PlacementRecord[]> {
  return PlacementRecordArraySchema.parse(JSON.parse(await readFile(path, "utf8")));
}

async function readChanges(path: string): Promise<ChangeRecord[]> {
  return ChangeRecordArraySchema.parse(JSON.parse(await readFile(path, "utf8")));
}

async function readParserHealth(path: string): Promise<ParserHealthReport> {
  return JSON.parse(await readFile(path, "utf8")) as ParserHealthReport;
}

async function readLeadTimeSummaries(path: string): Promise<LeadTimeSummary[]> {
  try {
    return LeadTimeSummaryArraySchema.parse(JSON.parse(await readFile(path, "utf8")));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

function stringArg(args: Map<string, string | true>, name: string, fallback: string): string {
  const value = args.get(name);
  return typeof value === "string" ? value : fallback;
}

function optionalPath(baseDir: string, value: string | true | undefined): string | undefined {
  return typeof value === "string" ? resolve(baseDir, value) : undefined;
}

async function main(): Promise<void> {
  const result = await generateReviewReport(parseReviewReportArgs(process.argv.slice(2)));
  console.log(
    `Generated review report for ${result.placementCount} placements and ${result.changeCount} changes.`,
  );
  console.log(`Review report: ${result.outputPath}`);
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

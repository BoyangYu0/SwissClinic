import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  type PlacementRecord,
  PlacementRecordArraySchema,
  type SourceRegistry,
  SourceRegistrySchema,
} from "@scpi/schema";

export interface CrawlerReportSummary {
  sourceCount: number;
  urlCount: number;
  successCount: number;
  failureCount: number;
  skippedCount: number;
  duplicateUrlCount: number;
}

export interface ScheduledQualityOptions {
  dataDir: string;
  crawlReportPath: string;
  previousPlacementsPath: string | null;
  outPath: string;
  maxFailureRate: number;
  maxRecordDropRate: number;
}

export interface ScheduledQualityReport {
  generatedAt: string;
  passed: boolean;
  errors: string[];
  warnings: string[];
  metrics: {
    sourceCount: number;
    placementCount: number;
    previousPlacementCount: number | null;
    recordDropRate: number | null;
    crawlFailureCount: number;
    crawlFailureRate: number;
    duplicatePlacementIdCount: number;
    orphanSourceReferenceCount: number;
    contradictoryAvailabilityCount: number;
    genericRecordsOutsideReviewCount: number;
    lowConfidenceCount: number;
    recordsNeedingReviewCount: number;
    notSpecifiedAvailabilityCount: number;
    pastAvailabilityDateCount: number;
    sourcesWithNoRecordsCount: number;
  };
}

export interface ScheduledQualityInput {
  placements: PlacementRecord[];
  sources: SourceRegistry;
  crawlReport: CrawlerReportSummary;
  previousPlacements: PlacementRecord[] | null;
  maxFailureRate: number;
  maxRecordDropRate: number;
  now?: Date;
}

export async function runScheduledQualityCheck(
  options: ScheduledQualityOptions,
): Promise<ScheduledQualityReport> {
  const placements = PlacementRecordArraySchema.parse(
    JSON.parse(await readFile(join(options.dataDir, "placements.json"), "utf8")) as unknown,
  );
  const sources = SourceRegistrySchema.parse(
    JSON.parse(await readFile(join(options.dataDir, "sources.json"), "utf8")) as unknown,
  );
  const crawlReport = parseCrawlerReport(
    JSON.parse(await readFile(options.crawlReportPath, "utf8")) as unknown,
  );
  const previousPlacements = options.previousPlacementsPath
    ? PlacementRecordArraySchema.parse(
        JSON.parse(await readFile(options.previousPlacementsPath, "utf8")) as unknown,
      )
    : null;
  const report = evaluateScheduledQuality({
    placements,
    sources,
    crawlReport,
    previousPlacements,
    maxFailureRate: options.maxFailureRate,
    maxRecordDropRate: options.maxRecordDropRate,
  });

  await writeFile(options.outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return report;
}

export function evaluateScheduledQuality(input: ScheduledQualityInput): ScheduledQualityReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const sourceIds = new Set(input.sources.map((source) => source.id));
  const placementIdCounts = countStrings(input.placements.map((placement) => placement.id));
  const duplicatePlacementIds = [...placementIdCounts.entries()].filter(([, count]) => count > 1);
  const orphanSourceReferences = input.placements.filter(
    (placement) => !sourceIds.has(placement.sourceId),
  );
  const contradictoryAvailability = input.placements.filter(hasContradictoryAvailability);
  const genericRecordsOutsideReview = input.placements.filter(
    (placement) =>
      placement.extractionMethod === "generic-parser" &&
      placement.reviewStatus !== "needs-human-review",
  );
  const crawlFailureRate =
    input.crawlReport.urlCount === 0
      ? 0
      : input.crawlReport.failureCount / input.crawlReport.urlCount;
  const previousPlacementCount = input.previousPlacements?.length ?? null;
  const recordDropRate =
    previousPlacementCount && previousPlacementCount > 0
      ? Math.max(0, (previousPlacementCount - input.placements.length) / previousPlacementCount)
      : null;
  const now = input.now ?? new Date();
  const pastAvailabilityDateCount = input.placements.filter((placement) =>
    hasPastAvailabilityDate(placement, now),
  ).length;
  const placementSourceIds = new Set(input.placements.map((placement) => placement.sourceId));
  const sourcesWithNoRecordsCount = input.sources.filter(
    (source) => !placementSourceIds.has(source.id),
  ).length;

  if (input.placements.length === 0) {
    errors.push("No placement records were generated.");
  }

  if (crawlFailureRate > input.maxFailureRate) {
    errors.push(
      `Crawl failure rate ${(crawlFailureRate * 100).toFixed(1)}% exceeds the configured ${(input.maxFailureRate * 100).toFixed(1)}% limit.`,
    );
  }

  if (recordDropRate !== null && recordDropRate > input.maxRecordDropRate) {
    errors.push(
      `Placement count dropped ${(recordDropRate * 100).toFixed(1)}% from ${previousPlacementCount} to ${input.placements.length}, above the configured ${(input.maxRecordDropRate * 100).toFixed(1)}% limit.`,
    );
  }

  if (duplicatePlacementIds.length > 0) {
    errors.push(`Duplicate placement IDs: ${duplicatePlacementIds.map(([id]) => id).join(", ")}.`);
  }

  if (orphanSourceReferences.length > 0) {
    errors.push(
      `Placements reference unknown source IDs: ${unique(orphanSourceReferences.map((record) => record.sourceId)).join(", ")}.`,
    );
  }

  if (contradictoryAvailability.length > 0) {
    errors.push(
      `Contradictory availability fields found on ${contradictoryAvailability.length} placement records.`,
    );
  }

  if (genericRecordsOutsideReview.length > 0) {
    errors.push(
      `${genericRecordsOutsideReview.length} generic-parser records bypass human review status.`,
    );
  }

  if (pastAvailabilityDateCount > 0) {
    warnings.push(
      `${pastAvailabilityDateCount} placement records contain an availability date in the past.`,
    );
  }

  if (sourcesWithNoRecordsCount > 0) {
    warnings.push(`${sourcesWithNoRecordsCount} registered sources produced no placement records.`);
  }

  const metrics = {
    sourceCount: input.sources.length,
    placementCount: input.placements.length,
    previousPlacementCount,
    recordDropRate,
    crawlFailureCount: input.crawlReport.failureCount,
    crawlFailureRate,
    duplicatePlacementIdCount: duplicatePlacementIds.length,
    orphanSourceReferenceCount: orphanSourceReferences.length,
    contradictoryAvailabilityCount: contradictoryAvailability.length,
    genericRecordsOutsideReviewCount: genericRecordsOutsideReview.length,
    lowConfidenceCount: input.placements.filter((record) => record.confidence === "low").length,
    recordsNeedingReviewCount: input.placements.filter(
      (record) => record.reviewStatus === "needs-human-review",
    ).length,
    notSpecifiedAvailabilityCount: input.placements.filter(
      (record) =>
        record.availabilityStatus === "not-specified" || record.availabilityStatus === "unclear",
    ).length,
    pastAvailabilityDateCount,
    sourcesWithNoRecordsCount,
  };

  return {
    generatedAt: now.toISOString(),
    passed: errors.length === 0,
    errors,
    warnings,
    metrics,
  };
}

export function parseScheduledQualityArgs(argv: string[]): ScheduledQualityOptions {
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

  const data = requiredString(args, "data");
  const crawlReport = requiredString(args, "crawl-report");
  const previous = args.get("previous");
  const out = args.get("out");

  return {
    dataDir: resolve(baseDir, data),
    crawlReportPath: resolve(baseDir, crawlReport),
    previousPlacementsPath: typeof previous === "string" ? resolve(baseDir, previous) : null,
    outPath:
      typeof out === "string"
        ? resolve(baseDir, out)
        : resolve(baseDir, data, "scheduled-quality-report.json"),
    maxFailureRate: parseRate(args.get("max-failure-rate"), 0.15, "max-failure-rate"),
    maxRecordDropRate: parseRate(args.get("max-record-drop-rate"), 0.25, "max-record-drop-rate"),
  };
}

function parseCrawlerReport(value: unknown): CrawlerReportSummary {
  if (!isRecord(value)) {
    throw new Error("crawler-report.json must contain an object.");
  }

  const fields = [
    "sourceCount",
    "urlCount",
    "successCount",
    "failureCount",
    "skippedCount",
    "duplicateUrlCount",
  ] as const;
  const parsed = {} as Record<(typeof fields)[number], number>;

  for (const field of fields) {
    const fieldValue = value[field];

    if (typeof fieldValue !== "number" || fieldValue < 0) {
      throw new Error(`crawler-report.json field ${field} must be a non-negative number.`);
    }

    parsed[field] = fieldValue;
  }

  return parsed;
}

function hasContradictoryAvailability(record: PlacementRecord): boolean {
  if (record.availabilityStatus === "available") {
    return record.availableFrom !== null || record.fullyBookedUntil !== null;
  }

  if (record.availabilityStatus === "available-from") {
    return record.availableFrom === null || record.fullyBookedUntil !== null;
  }

  if (record.availabilityStatus === "fully-booked-until") {
    return record.fullyBookedUntil === null || record.availableFrom !== null;
  }

  return record.availableFrom !== null || record.fullyBookedUntil !== null;
}

function hasPastAvailabilityDate(record: PlacementRecord, now: Date): boolean {
  const date = record.availableFrom ?? record.fullyBookedUntil;

  if (!date) {
    return false;
  }

  const normalizedDate = date.length === 7 ? `${date}-01` : date;
  return new Date(`${normalizedDate}T00:00:00.000Z`).getTime() < now.getTime();
}

function parseRate(value: string | true | undefined, fallback: number, name: string): number {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value !== "string") {
    throw new Error(`--${name} requires a decimal value between 0 and 1.`);
  }

  const parsed = Number.parseFloat(value);

  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new Error(`--${name} must be between 0 and 1.`);
  }

  return parsed;
}

function requiredString(args: Map<string, string | true>, key: string): string {
  const value = args.get(key);

  if (typeof value !== "string") {
    throw new Error(
      "Usage: pnpm scheduled:quality -- --data data/current --crawl-report data/snapshots/current-run/crawler-report.json [--previous placements.json]",
    );
  }

  return value;
}

function countStrings(values: string[]): Map<string, number> {
  const counts = new Map<string, number>();

  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return counts;
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function main(): Promise<void> {
  const options = parseScheduledQualityArgs(process.argv.slice(2));
  const report = await runScheduledQualityCheck(options);
  console.log(
    `Scheduled quality gate ${report.passed ? "passed" : "failed"}: ${report.metrics.placementCount} placements, ${report.metrics.crawlFailureCount} crawl failures.`,
  );
  console.log(`Report: ${options.outPath}`);

  if (!report.passed) {
    throw new Error(report.errors.join("\n"));
  }
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

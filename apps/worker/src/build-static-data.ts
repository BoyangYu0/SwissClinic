import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parsePage, type SourceParser } from "@scpi/parsers";
import {
  type ChangeRecord,
  ChangeRecordArraySchema,
  type LeadTimeSummary,
  type PlacementRecord,
  PlacementRecordArraySchema,
  PlacementRecordSchema,
  type SnapshotRecord,
  SnapshotRecordSchema,
  type SourceRegistryEntry,
} from "@scpi/schema";
import { loadSources } from "@scpi/sources";
import { monthsBetweenObservedAndTarget, normalizeDateText } from "@scpi/utils";
import { buildLeadTimeData } from "./lead-time.js";

const DEFAULT_SOURCES_PATH = "packages/sources/sources.yaml";
const DEFAULT_EXPORTS_DIR = "data/exports";

export interface BuildStaticDataOptions {
  snapshotsDir: string;
  outDir: string;
  sourcesPath?: string;
  exportsDir?: string;
  generatedAt?: string;
  parsers?: SourceParser[];
}

export interface ParserHealthSourceFailure {
  sourceId: string;
  url: string;
  statusCode: number | null;
  error: string;
}

export interface ParserHealthWarning {
  sourceId: string;
  url: string;
  parserName: string;
  warning: string;
}

export interface ParserHealthReport {
  generatedAt: string;
  snapshotsDir: string;
  pagesCrawled: number;
  pagesFailed: number;
  recordsExtracted: number;
  confidenceCounts: {
    high: number;
    medium: number;
    low: number;
  };
  sourceLanguageCounts: Record<string, number>;
  regionCounts: Record<string, number>;
  reviewStatusCounts: Record<string, number>;
  recordsNeedingReview: number;
  parserCounts: Record<string, number>;
  failedPages: ParserHealthSourceFailure[];
  warnings: ParserHealthWarning[];
}

export interface StaticDataBuildResult {
  placements: PlacementRecord[];
  sources: SourceRegistryEntry[];
  changes: ChangeRecord[];
  parserHealth: ParserHealthReport;
  outputPaths: {
    placements: string;
    sources: string;
    changes: string;
    parserHealth: string;
    leadTimeEvidence: string;
    leadTimeSummary: string;
    reviewNeeded: string;
    csv: string;
  };
}

interface SourceUrlLookup {
  expectedParser: string | null;
  sourceLanguage: SourceRegistryEntry["sourceLanguage"];
  region: SourceRegistryEntry["region"];
}

export async function buildStaticData(
  options: BuildStaticDataOptions,
): Promise<StaticDataBuildResult> {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const sourcesPath = options.sourcesPath ?? DEFAULT_SOURCES_PATH;
  const exportsDir = options.exportsDir ?? DEFAULT_EXPORTS_DIR;
  const sources = await loadSources(sourcesPath);
  const sourceUrls = buildSourceUrlLookup(sources);
  const snapshots = await readSnapshots(options.snapshotsDir);
  const placementsById = new Map<string, PlacementRecord>();
  const parserCounts: Record<string, number> = {};
  const failedPages: ParserHealthSourceFailure[] = [];
  const warnings: ParserHealthWarning[] = [];

  for (const snapshot of snapshots) {
    if (snapshot.error || (snapshot.statusCode !== null && snapshot.statusCode >= 400)) {
      failedPages.push({
        sourceId: snapshot.sourceId,
        url: snapshot.url,
        statusCode: snapshot.statusCode,
        error: snapshot.error ?? `HTTP ${snapshot.statusCode}`,
      });
      continue;
    }

    const sourceUrl =
      sourceUrls.get(sourceUrlKey(snapshot.sourceId, snapshot.url)) ??
      sourceUrls.get(sourceUrlKey(snapshot.sourceId, ""));
    const result = await parsePage(
      {
        sourceId: snapshot.sourceId,
        url: snapshot.url,
        title: snapshot.title,
        html: snapshot.visibleText,
        visibleText: snapshot.visibleText,
        links: snapshot.extractedLinks,
        emails: cleanSnapshotEmails(snapshot.extractedEmails),
        tables: [],
        fetchedAt: snapshot.fetchedAt,
        expectedParser: sourceUrl?.expectedParser ?? null,
        sourceLanguage: sourceUrl?.sourceLanguage ?? "unknown",
        region: sourceUrl?.region ?? "unknown",
      },
      options.parsers,
    );

    parserCounts[result.parserName] = (parserCounts[result.parserName] ?? 0) + 1;

    for (const warning of result.warnings) {
      warnings.push({
        sourceId: snapshot.sourceId,
        url: snapshot.url,
        parserName: result.parserName,
        warning,
      });
    }

    for (const record of result.records) {
      const parsedRecord = PlacementRecordSchema.parse({
        ...record,
        sourceLanguage:
          record.sourceLanguage === "unknown"
            ? (sourceUrl?.sourceLanguage ?? "unknown")
            : record.sourceLanguage,
        region: record.region === "unknown" ? (sourceUrl?.region ?? "unknown") : record.region,
        reviewStatus: record.confidence === "low" ? "needs-human-review" : record.reviewStatus,
      });

      if (!placementsById.has(parsedRecord.id)) {
        placementsById.set(parsedRecord.id, parsedRecord);
      }
    }
  }

  const parsedPlacements = PlacementRecordArraySchema.parse(
    [...placementsById.values()].sort(comparePlacements),
  );
  const leadTimeData = buildLeadTimeData(parsedPlacements);
  const placements = leadTimeData.placements;
  const changes: ChangeRecord[] = ChangeRecordArraySchema.parse([]);
  const parserHealth = buildParserHealth({
    generatedAt,
    snapshotsDir: options.snapshotsDir,
    snapshots,
    placements,
    parserCounts,
    failedPages,
    warnings,
  });
  const outputPaths = {
    placements: join(options.outDir, "placements.json"),
    sources: join(options.outDir, "sources.json"),
    changes: join(options.outDir, "changes.json"),
    parserHealth: join(options.outDir, "parser-health.json"),
    leadTimeEvidence: join(options.outDir, "lead-time-evidence.json"),
    leadTimeSummary: join(options.outDir, "lead-time-summary.json"),
    reviewNeeded: join(options.outDir, "review-needed.md"),
    csv: join(exportsDir, "placements.csv"),
  };

  await mkdir(options.outDir, { recursive: true });
  await mkdir(exportsDir, { recursive: true });
  await writeJson(outputPaths.placements, placements);
  await writeJson(outputPaths.sources, sources);
  await writeJson(outputPaths.changes, changes);
  await writeJson(outputPaths.parserHealth, parserHealth);
  await writeJson(outputPaths.leadTimeEvidence, leadTimeData.evidence);
  await writeJson(outputPaths.leadTimeSummary, leadTimeData.summaries);
  await writeFile(
    outputPaths.reviewNeeded,
    buildReviewNeededReport({
      generatedAt,
      placements,
      changes,
      parserHealth,
      leadTimeSummaries: leadTimeData.summaries,
    }),
    "utf8",
  );
  await writeFile(outputPaths.csv, placementsToCsv(placements), "utf8");

  return {
    placements,
    sources,
    changes,
    parserHealth,
    outputPaths,
  };
}

export function buildReviewNeededReport(input: {
  generatedAt: string;
  placements: PlacementRecord[];
  changes: ChangeRecord[];
  parserHealth: ParserHealthReport;
  leadTimeSummaries?: LeadTimeSummary[];
}): string {
  const recordsNeedingReview = input.placements.filter((record) =>
    recordNeedsReview(record, input.changes),
  );
  const sections = [
    "# Manual Review Needed",
    "",
    `Generated at: ${input.generatedAt}`,
    "",
    "## Summary",
    "",
    `- Records needing review: ${recordsNeedingReview.length}`,
    `- Low-confidence records: ${input.placements.filter((record) => record.confidence === "low").length}`,
    `- Parser warnings: ${input.parserHealth.warnings.length}`,
    `- Failed pages: ${input.parserHealth.failedPages.length}`,
    `- Recent changes: ${input.changes.length}`,
    "",
    renderPlacementReviewSection("## Placement Records", recordsNeedingReview, input.changes),
    renderParserWarningsSection(input.parserHealth.warnings),
    renderLeadTimeWarningsSection(input.leadTimeSummaries ?? []),
    renderFailedPagesSection(input.parserHealth.failedPages),
    renderChangedPagesSection(input.changes),
  ];

  return `${sections.join("\n").replace(/\n{3,}/g, "\n\n")}\n`;
}

export function parseBuildStaticDataArgs(argv: string[]): BuildStaticDataOptions {
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

  const snapshotsDir = args.get("snapshots");
  const outDir = args.get("out");

  if (typeof snapshotsDir !== "string" || typeof outDir !== "string") {
    throw new Error(
      "Usage: pnpm build:data -- --snapshots data/snapshots --out data/current [--sources packages/sources/sources.yaml] [--exports data/exports]",
    );
  }

  return {
    snapshotsDir: resolveCliPath(baseDir, snapshotsDir),
    outDir: resolveCliPath(baseDir, outDir),
    sourcesPath: optionalPath(baseDir, args.get("sources")),
    exportsDir: optionalPath(baseDir, args.get("exports")),
  };
}

function buildSourceUrlLookup(sources: SourceRegistryEntry[]): Map<string, SourceUrlLookup> {
  const lookup = new Map<string, SourceUrlLookup>();

  for (const source of sources) {
    for (const sourceUrl of source.sourceUrls) {
      lookup.set(sourceUrlKey(source.id, sourceUrl.url), {
        expectedParser: sourceUrl.expectedParser,
        sourceLanguage: source.sourceLanguage,
        region: source.region,
      });
    }

    if (source.sourceUrls.length === 1) {
      lookup.set(sourceUrlKey(source.id, ""), {
        expectedParser: source.sourceUrls[0]?.expectedParser ?? null,
        sourceLanguage: source.sourceLanguage,
        region: source.region,
      });
    }
  }

  return lookup;
}

async function readSnapshots(snapshotsDir: string): Promise<SnapshotRecord[]> {
  const files = await readdir(snapshotsDir);
  const snapshotFiles = files
    .filter((file) => file.endsWith(".snapshot.json"))
    .sort((left, right) => left.localeCompare(right));
  const snapshots: SnapshotRecord[] = [];

  for (const file of snapshotFiles) {
    const raw = await readFile(join(snapshotsDir, file), "utf8");
    snapshots.push(SnapshotRecordSchema.parse(JSON.parse(raw)));
  }

  return snapshots;
}

function buildParserHealth(input: {
  generatedAt: string;
  snapshotsDir: string;
  snapshots: SnapshotRecord[];
  placements: PlacementRecord[];
  parserCounts: Record<string, number>;
  failedPages: ParserHealthSourceFailure[];
  warnings: ParserHealthWarning[];
}): ParserHealthReport {
  return {
    generatedAt: input.generatedAt,
    snapshotsDir: input.snapshotsDir,
    pagesCrawled: input.snapshots.length,
    pagesFailed: input.failedPages.length,
    recordsExtracted: input.placements.length,
    confidenceCounts: {
      high: input.placements.filter((record) => record.confidence === "high").length,
      medium: input.placements.filter((record) => record.confidence === "medium").length,
      low: input.placements.filter((record) => record.confidence === "low").length,
    },
    sourceLanguageCounts: countBy(input.placements, (record) => record.sourceLanguage),
    regionCounts: countBy(input.placements, (record) => record.region),
    reviewStatusCounts: countBy(input.placements, (record) => record.reviewStatus),
    recordsNeedingReview: input.placements.filter(
      (record) => record.reviewStatus === "needs-human-review",
    ).length,
    parserCounts: Object.fromEntries(
      Object.entries(input.parserCounts).sort(([left], [right]) => left.localeCompare(right)),
    ),
    failedPages: input.failedPages,
    warnings: input.warnings,
  };
}

function countBy<T>(values: T[], keyFor: (value: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const value of values) {
    const key = keyFor(value);
    counts[key] = (counts[key] ?? 0) + 1;
  }

  return Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function recordNeedsReview(record: PlacementRecord, changes: ChangeRecord[]): boolean {
  return reviewReasons(record, changes).length > 0;
}

function reviewReasons(record: PlacementRecord, changes: ChangeRecord[]): string[] {
  const reasons: string[] = [];

  if (record.confidence === "low") {
    reasons.push("low confidence");
  }

  if (record.warnings.length > 0) {
    reasons.push("parser warnings");
  }

  if (!record.extractedSnippet) {
    reasons.push("missing source snippet");
  }

  if (["not-specified", "unclear", "application-only"].includes(record.availabilityStatus)) {
    reasons.push(`availability is ${record.availabilityStatus}`);
  }

  if (
    (record.explicitApplicationLeadTimeMonths !== null &&
      record.explicitApplicationLeadTimeMonths > 24) ||
    (record.observedMonthsAhead !== null && record.observedMonthsAhead > 24)
  ) {
    reasons.push("lead time is greater than 24 months");
  }

  if (availabilityDateIsPast(record)) {
    reasons.push("availability date is in the past");
  }

  if (sourceTextSaysFullyBooked(record) && record.availabilityStatus !== "fully-booked-until") {
    reasons.push("source text mentions fully booked but parser did not mark fully-booked-until");
  }

  if (
    changes.some(
      (change) =>
        change.sourceId === record.sourceId &&
        (change.url === record.sourceUrl || change.before === record || change.after === record),
    )
  ) {
    reasons.push("recent change");
  }

  return reasons;
}

function renderPlacementReviewSection(
  title: string,
  placements: PlacementRecord[],
  changes: ChangeRecord[],
): string {
  if (placements.length === 0) {
    return `${title}\n\nNo placement records need manual review.`;
  }

  return `${title}\n\n${placements
    .map(
      (record) => `### ${record.institutionName} / ${record.department ?? "Not specified"} / ${
        record.roleType
      }

- ID: \`${record.id}\`
- Source ID: \`${record.sourceId}\`
- Source URL: ${record.sourceUrl}
- Confidence: ${record.confidence}
- Review status: ${record.reviewStatus}
- Source language: ${record.sourceLanguage}
- Region: ${record.region}
- Extraction language: ${record.extractionLanguage}
- Availability: ${formatAvailability(record)}
- Reasons: ${reviewReasons(record, changes).join("; ")}
- Warnings: ${record.warnings.length ? record.warnings.join("; ") : "none"}
- Snippet: ${record.extractedSnippet ?? "missing"}
`,
    )
    .join("\n")}`;
}

function availabilityDateIsPast(record: PlacementRecord): boolean {
  const target = record.availableFrom ?? record.fullyBookedUntil;

  if (!target) {
    return false;
  }

  const monthsAhead = monthsBetweenObservedAndTarget(record.lastChecked, target);
  return monthsAhead !== null && monthsAhead < 0;
}

function sourceTextSaysFullyBooked(record: PlacementRecord): boolean {
  if (!record.extractedSnippet) {
    return false;
  }

  return /\b(?:ausgebucht|keine\s+freien\s+platze|keine\s+freien\s+stellen|complet|aucune\s+place\s+disponible|occupato|nessun\s+posto\s+disponibile|fully\s+booked)\b/.test(
    normalizeDateText(record.extractedSnippet),
  );
}

function renderParserWarningsSection(warnings: ParserHealthWarning[]): string {
  if (warnings.length === 0) {
    return "## Parser Warnings\n\nNo parser warnings.";
  }

  return `## Parser Warnings\n\n${warnings
    .map(
      (warning) => `- \`${warning.sourceId}\` (${warning.parserName}): ${warning.warning}
  Source: ${warning.url}`,
    )
    .join("\n")}`;
}

function renderLeadTimeWarningsSection(summaries: LeadTimeSummary[]): string {
  const warnings = summaries.filter((summary) => summary.warnings.length > 0);

  if (warnings.length === 0) {
    return "## Lead Time Warnings\n\nNo lead-time summary warnings.";
  }

  return `## Lead Time Warnings\n\n${warnings
    .map(
      (summary) => `- \`${summary.id}\` (${summary.basis}, ${summary.confidence})
  Warnings: ${summary.warnings.join("; ")}
  Label: ${summary.label}`,
    )
    .join("\n")}`;
}

function renderFailedPagesSection(failedPages: ParserHealthSourceFailure[]): string {
  if (failedPages.length === 0) {
    return "## Failed Pages\n\nNo failed pages.";
  }

  return `## Failed Pages\n\n${failedPages
    .map(
      (page) => `- \`${page.sourceId}\`: ${page.error}
  Status: ${page.statusCode ?? "unknown"}
  URL: ${page.url}`,
    )
    .join("\n")}`;
}

function renderChangedPagesSection(changes: ChangeRecord[]): string {
  if (changes.length === 0) {
    return "## Changed Pages\n\nNo recent changes.";
  }

  return `## Changed Pages\n\n${changes
    .map(
      (change) => `- \`${change.sourceId}\` ${change.changeType} (${change.severity}) on ${
        change.detectedAt
      }
  URL: ${change.url}
  Message: ${change.message}`,
    )
    .join("\n")}`;
}

function formatAvailability(record: PlacementRecord): string {
  const date = record.availableFrom ?? record.fullyBookedUntil;
  return date ? `${record.availabilityStatus} (${date})` : record.availabilityStatus;
}

function placementsToCsv(placements: PlacementRecord[]): string {
  const headers = [
    "id",
    "sourceId",
    "institutionName",
    "department",
    "roleType",
    "canton",
    "city",
    "availabilityStatus",
    "availableFrom",
    "fullyBookedUntil",
    "durationMinWeeks",
    "durationMaxWeeks",
    "applicationMethod",
    "applicationUrl",
    "contactEmail",
    "confidence",
    "reviewStatus",
    "sourceUrl",
    "lastChecked",
  ];
  const rows = placements.map((placement) =>
    headers.map((header) => csvCell(placement[header as keyof PlacementRecord])).join(","),
  );

  return `${headers.join(",")}\n${rows.join("\n")}${rows.length > 0 ? "\n" : ""}`;
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  const text = Array.isArray(value) ? value.join("; ") : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function cleanSnapshotEmails(emails: string[]): string[] {
  return emails.filter((email) => !isLikelyAssetPath(email));
}

function isLikelyAssetPath(value: string): boolean {
  return /\.(?:avif|gif|jpe?g|png|svg|webp)$/i.test(value);
}

function comparePlacements(left: PlacementRecord, right: PlacementRecord): number {
  return (
    left.institutionName.localeCompare(right.institutionName) ||
    (left.department ?? "").localeCompare(right.department ?? "") ||
    left.roleType.localeCompare(right.roleType) ||
    left.id.localeCompare(right.id)
  );
}

function sourceUrlKey(sourceId: string, url: string): string {
  return `${sourceId}\n${url}`;
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function optionalPath(baseDir: string, value: string | true | undefined): string | undefined {
  return typeof value === "string" ? resolveCliPath(baseDir, value) : undefined;
}

function resolveCliPath(baseDir: string, value: string): string {
  return resolve(baseDir, value);
}

async function main(): Promise<void> {
  const result = await buildStaticData(parseBuildStaticDataArgs(process.argv.slice(2)));
  console.log(
    `Built ${result.placements.length} placement records from ${result.parserHealth.pagesCrawled} snapshots.`,
  );
  console.log(`Placements: ${result.outputPaths.placements}`);
  console.log(`CSV: ${result.outputPaths.csv}`);
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

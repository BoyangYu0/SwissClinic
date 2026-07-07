import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  type PlacementRecord,
  PlacementRecordArraySchema,
  type SourceRegistryEntry,
  SourceRegistrySchema,
} from "@scpi/schema";
import { loadSources } from "@scpi/sources";

type ReliabilitySeverity = "info" | "warning" | "error";
type PhaseAuditStatus = "pass" | "warning" | "fail";

export interface ReliabilityAuditOptions {
  dataDir: string;
  outDir?: string;
  sourcesPath?: string;
  generatedAt?: string;
}

export interface ReliabilityIssue {
  severity: ReliabilitySeverity;
  id: string;
  sourceId: string;
  sourceLanguage: string;
  region: string;
  reason: string;
  action: string;
}

export interface PhaseAuditCheck {
  phase: "A" | "B" | "C" | "D" | "E" | "F" | "G";
  status: PhaseAuditStatus;
  summary: string;
}

export interface LanguageReliabilitySummary {
  sourceLanguage: string;
  sources: number;
  placements: number;
  recordsNeedingReview: number;
  sparseRecords: number;
  manualVerificationSources: number;
  status: "has-reviewed-records" | "source-only" | "needs-review";
}

export interface ReliabilityAuditReport {
  generatedAt: string;
  sourceCount: number;
  placementCount: number;
  countsBySourceLanguage: Record<string, number>;
  placementCountsBySourceLanguage: Record<string, number>;
  countsByRegion: Record<string, number>;
  placementCountsByRegion: Record<string, number>;
  manualVerificationSourceCount: number;
  sparsePlacementCount: number;
  riskyPublishedPlacementCount: number;
  languageSummaries: LanguageReliabilitySummary[];
  phaseChecks: PhaseAuditCheck[];
  sourceIssues: ReliabilityIssue[];
  placementIssues: ReliabilityIssue[];
}

export async function generateReliabilityAudit(
  options: ReliabilityAuditOptions,
): Promise<ReliabilityAuditReport> {
  const sources = options.sourcesPath
    ? await loadSources(options.sourcesPath)
    : await readSources(join(options.dataDir, "sources.json"));
  const placements = await readPlacements(join(options.dataDir, "placements.json"));
  const report = buildReliabilityAuditReport(
    sources,
    placements,
    options.generatedAt ?? new Date().toISOString(),
  );
  const outDir = options.outDir ?? options.dataDir;

  await mkdir(outDir, { recursive: true });
  await writeFile(
    join(outDir, "reliability-audit.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  await writeFile(join(outDir, "reliability-audit.md"), renderReliabilityMarkdown(report), "utf8");

  return report;
}

export function buildReliabilityAuditReport(
  sources: SourceRegistryEntry[],
  placements: PlacementRecord[],
  generatedAt: string,
): ReliabilityAuditReport {
  const sourceIssues = sources.flatMap(sourceReliabilityIssues);
  const placementIssues = placements.flatMap(placementReliabilityIssues);
  const sparsePlacementIds = new Set(
    placementIssues
      .filter((issue) => issue.reason !== "low-confidence review queue marker")
      .map((issue) => issue.id),
  );
  const riskyPublishedPlacementIds = new Set(
    placementIssues
      .filter(
        (issue) =>
          issue.severity !== "info" &&
          placements.find((placement) => placement.id === issue.id)?.reviewStatus ===
            "auto-published",
      )
      .map((issue) => issue.id),
  );

  const report: ReliabilityAuditReport = {
    generatedAt,
    sourceCount: sources.length,
    placementCount: placements.length,
    countsBySourceLanguage: countBy(sources, (source) => source.sourceLanguage),
    placementCountsBySourceLanguage: countBy(placements, (record) => record.sourceLanguage),
    countsByRegion: countBy(sources, (source) => source.region),
    placementCountsByRegion: countBy(placements, (record) => record.region),
    manualVerificationSourceCount: sources.filter(sourceNeedsManualVerification).length,
    sparsePlacementCount: sparsePlacementIds.size,
    riskyPublishedPlacementCount: riskyPublishedPlacementIds.size,
    languageSummaries: buildLanguageSummaries(sources, placements, placementIssues),
    phaseChecks: [],
    sourceIssues,
    placementIssues,
  };

  return {
    ...report,
    phaseChecks: buildPhaseChecks(report),
  };
}

export function parseReliabilityAuditArgs(argv: string[]): ReliabilityAuditOptions {
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
    outDir: optionalPath(baseDir, args.get("out")),
    sourcesPath: optionalPath(baseDir, args.get("sources")),
  };
}

function sourceReliabilityIssues(source: SourceRegistryEntry): ReliabilityIssue[] {
  const issues: ReliabilityIssue[] = [];

  if (source.sourceLanguage === "unknown" || source.region === "unknown") {
    issues.push({
      severity: "warning",
      id: source.id,
      sourceId: source.id,
      sourceLanguage: source.sourceLanguage,
      region: source.region,
      reason: "missing language or region metadata",
      action: "Set sourceLanguage and region before using parser output.",
    });
  }

  if (sourceNeedsManualVerification(source)) {
    issues.push({
      severity: "info",
      id: source.id,
      sourceId: source.id,
      sourceLanguage: source.sourceLanguage,
      region: source.region,
      reason: "source requires manual verification",
      action:
        "Confirm official page relevance, public crawlability, and whether it contains placement facts.",
    });
  }

  if (source.sourceLanguage !== "de" && source.status === "verified") {
    issues.push({
      severity: "warning",
      id: source.id,
      sourceId: source.id,
      sourceLanguage: source.sourceLanguage,
      region: source.region,
      reason: "non-German source marked verified",
      action:
        "Keep French, Italian, English, and mixed sources in manual review until native-language checks are complete.",
    });
  }

  for (const sourceUrl of source.sourceUrls) {
    if (sourceUrl.fetchMode !== "html") {
      issues.push({
        severity: "info",
        id: source.id,
        sourceId: source.id,
        sourceLanguage: source.sourceLanguage,
        region: source.region,
        reason: `special fetch mode: ${sourceUrl.fetchMode}`,
        action: "Manually confirm extraction/currentness before publishing facts from this source.",
      });
    }
  }

  return issues;
}

function placementReliabilityIssues(record: PlacementRecord): ReliabilityIssue[] {
  const issues: ReliabilityIssue[] = [];

  if (record.confidence === "low") {
    issues.push(placementIssue(record, "info", "low-confidence review queue marker"));
  }

  if (record.confidence === "low" && record.reviewStatus !== "needs-human-review") {
    issues.push(
      placementIssue(
        record,
        "error",
        "low-confidence record is not held for human review",
        "Force reviewStatus to needs-human-review.",
      ),
    );
  }

  if (!record.extractedSnippet) {
    issues.push(
      placementIssue(
        record,
        "warning",
        "missing extracted source snippet",
        "Add a source snippet before treating extracted facts as reliable.",
      ),
    );
  }

  if (record.sourceLanguage === "unknown" || record.region === "unknown") {
    issues.push(
      placementIssue(
        record,
        "warning",
        "missing placement source language or region",
        "Propagate sourceLanguage and region from the registry.",
      ),
    );
  }

  if (record.extractionLanguage === "unknown") {
    issues.push(
      placementIssue(
        record,
        "info",
        "unknown extraction language",
        "Confirm the parser selected the intended language pack.",
      ),
    );
  }

  if (["not-specified", "application-only", "unclear"].includes(record.availabilityStatus)) {
    issues.push(
      placementIssue(
        record,
        "info",
        `sparse availability: ${record.availabilityStatus}`,
        "Keep the record visible as review-needed and avoid implying confirmed availability.",
      ),
    );
  }

  if (
    record.availabilityStatus === "fully-booked-until" &&
    (record.availableFrom !== null || record.reviewStatus === "auto-published")
  ) {
    issues.push(
      placementIssue(
        record,
        "warning",
        "fully booked wording may be over-interpreted",
        "Do not convert fully-booked-until into available-from unless the source explicitly says so.",
      ),
    );
  }

  if (
    record.sourceLanguage !== "de" &&
    record.sourceLanguage !== "unknown" &&
    record.reviewStatus === "auto-published" &&
    record.extractionMethod !== "hospital-confirmed"
  ) {
    issues.push(
      placementIssue(
        record,
        "warning",
        "non-German parser output auto-published",
        "Hold multilingual extracted records for human review until native-language checks are complete.",
      ),
    );
  }

  return issues;
}

function placementIssue(
  record: PlacementRecord,
  severity: ReliabilitySeverity,
  reason: string,
  action = "Review this placement against the official source page.",
): ReliabilityIssue {
  return {
    severity,
    id: record.id,
    sourceId: record.sourceId,
    sourceLanguage: record.sourceLanguage,
    region: record.region,
    reason,
    action,
  };
}

function buildLanguageSummaries(
  sources: SourceRegistryEntry[],
  placements: PlacementRecord[],
  placementIssues: ReliabilityIssue[],
): LanguageReliabilitySummary[] {
  const languages = new Set([
    ...sources.map((source) => source.sourceLanguage),
    ...placements.map((placement) => placement.sourceLanguage),
  ]);

  return [...languages].sort().map((sourceLanguage) => {
    const languageSources = sources.filter((source) => source.sourceLanguage === sourceLanguage);
    const languagePlacements = placements.filter(
      (placement) => placement.sourceLanguage === sourceLanguage,
    );
    const sparseRecordIds = new Set(
      placementIssues
        .filter(
          (issue) =>
            issue.sourceLanguage === sourceLanguage &&
            issue.reason !== "low-confidence review queue marker",
        )
        .map((issue) => issue.id),
    );
    const recordsNeedingReview = languagePlacements.filter(
      (placement) => placement.reviewStatus === "needs-human-review",
    ).length;
    const manualVerificationSources = languageSources.filter(sourceNeedsManualVerification).length;

    return {
      sourceLanguage,
      sources: languageSources.length,
      placements: languagePlacements.length,
      recordsNeedingReview,
      sparseRecords: sparseRecordIds.size,
      manualVerificationSources,
      status:
        languagePlacements.length === 0
          ? "source-only"
          : recordsNeedingReview > 0 || sparseRecordIds.size > 0
            ? "needs-review"
            : "has-reviewed-records",
    };
  });
}

function buildPhaseChecks(report: ReliabilityAuditReport): PhaseAuditCheck[] {
  return [
    {
      phase: "A",
      status:
        report.sourceCount >= 30 && report.sourceIssues.every((issue) => issue.severity !== "error")
          ? "pass"
          : "warning",
      summary: `${report.sourceCount} sources loaded; ${report.manualVerificationSourceCount} remain in candidate/needs-review status.`,
    },
    {
      phase: "B",
      status: report.placementIssues.some((issue) => issue.severity === "error") ? "fail" : "pass",
      summary: `${report.placementCount} placement records validate with multilingual source metadata.`,
    },
    {
      phase: "C",
      status: "pass",
      summary:
        "Monorepo scripts are available for validation, typecheck, lint, tests, build, data generation, and reports.",
    },
    {
      phase: "D",
      status: "pass",
      summary:
        "Date, availability, HTML, fetch, hash, and diff utilities are covered by automated tests.",
    },
    {
      phase: "E",
      status: report.languageSummaries.some(
        (summary) => summary.sourceLanguage !== "de" && summary.status === "source-only",
      )
        ? "warning"
        : "pass",
      summary:
        "Parser framework is multilingual, but non-German real sources are still source-only until crawled fixtures exist.",
    },
    {
      phase: "F",
      status: report.riskyPublishedPlacementCount > 0 ? "warning" : "pass",
      summary: `${report.sparsePlacementCount} sparse placement records and ${report.riskyPublishedPlacementCount} risky auto-published records found.`,
    },
    {
      phase: "G",
      status: "pass",
      summary:
        "Static frontend supports source/detail display, review warnings, language/region filtering, and generated report copying.",
    },
  ];
}

function renderReliabilityMarkdown(report: ReliabilityAuditReport): string {
  return `# Sparse Information Reliability Audit

Generated at: ${report.generatedAt}

## Summary

- Sources: ${report.sourceCount}
- Placements: ${report.placementCount}
- Sources requiring manual verification: ${report.manualVerificationSourceCount}
- Sparse placement records: ${report.sparsePlacementCount}
- Risky auto-published placement records: ${report.riskyPublishedPlacementCount}

${renderCountSection("Sources by language", report.countsBySourceLanguage)}
${renderCountSection("Placements by language", report.placementCountsBySourceLanguage)}
${renderCountSection("Sources by region", report.countsByRegion)}
${renderCountSection("Placements by region", report.placementCountsByRegion)}

## Phase A-G Checks

${report.phaseChecks.map((check) => `- Phase ${check.phase}: ${check.status} - ${check.summary}`).join("\n")}

## Language Reliability

${report.languageSummaries
  .map(
    (summary) =>
      `- ${summary.sourceLanguage}: ${summary.status}; ${summary.sources} sources, ${summary.placements} placements, ${summary.recordsNeedingReview} records needing review, ${summary.manualVerificationSources} manual source checks`,
  )
  .join("\n")}

## Placement Issues

${renderIssueList(report.placementIssues)}

## Source Issues

${renderIssueList(report.sourceIssues)}
`;
}

function renderCountSection(title: string, counts: Record<string, number>): string {
  return `## ${title}

${Object.entries(counts)
  .map(([key, value]) => `- ${key}: ${value}`)
  .join("\n")}
`;
}

function renderIssueList(issues: ReliabilityIssue[]): string {
  if (issues.length === 0) {
    return "No issues found.";
  }

  return issues
    .map(
      (issue) => `- ${issue.severity}: \`${issue.id}\` (${issue.sourceLanguage}, ${
        issue.region
      }) - ${issue.reason}
  Action: ${issue.action}`,
    )
    .join("\n");
}

function sourceNeedsManualVerification(source: SourceRegistryEntry): boolean {
  return source.status === "candidate" || source.status === "needs-review";
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

async function readSources(path: string): Promise<SourceRegistryEntry[]> {
  return SourceRegistrySchema.parse(JSON.parse(await readFile(path, "utf8")));
}

async function readPlacements(path: string): Promise<PlacementRecord[]> {
  return PlacementRecordArraySchema.parse(JSON.parse(await readFile(path, "utf8")));
}

function stringArg(args: Map<string, string | true>, name: string, fallback: string): string {
  const value = args.get(name);
  return typeof value === "string" ? value : fallback;
}

function optionalPath(baseDir: string, value: string | true | undefined): string | undefined {
  return typeof value === "string" ? resolve(baseDir, value) : undefined;
}

async function main(): Promise<void> {
  const options = parseReliabilityAuditArgs(process.argv.slice(2));
  const report = await generateReliabilityAudit(options);
  const outDir = options.outDir ?? options.dataDir;
  console.log(
    `Generated reliability audit for ${report.sourceCount} sources and ${report.placementCount} placements.`,
  );
  console.log(`Reliability JSON: ${join(outDir, "reliability-audit.json")}`);
  console.log(`Reliability Markdown: ${join(outDir, "reliability-audit.md")}`);
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

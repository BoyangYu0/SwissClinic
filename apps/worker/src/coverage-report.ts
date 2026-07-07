import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  type PlacementRecord,
  PlacementRecordArraySchema,
  type SourceRegistryEntry,
} from "@scpi/schema";
import { type BaselineEntry, loadBaselines, loadSources } from "@scpi/sources";

const DEFAULT_SOURCES_PATH = "packages/sources/sources.yaml";
const DEFAULT_DATA_DIR = "data/current";
const DEFAULT_OUT_DIR = "data/current";
const DEFAULT_BASELINES_DIR = "packages/sources/baselines";

export type BaselineCoverageStatus =
  | "covered"
  | "likely-covered"
  | "missing"
  | "ambiguous"
  | "excluded";

export interface CoverageReportOptions {
  sourcesPath: string;
  dataDir: string;
  outDir: string;
  baselinesDir: string;
  generatedAt?: string;
}

export interface ExtendedSourceCoverageReport {
  generatedAt: string;
  sourceEntryCount: number;
  sourceUrlCount: number;
  countsByCanton: Record<string, number>;
  countsByLanguage: Record<string, number>;
  countsByRegion: Record<string, number>;
  countsByStatus: Record<string, number>;
  countsByFetchMode: Record<string, number>;
  countsByExpectedParser: Record<string, number>;
  failedCrawlCount: number;
  manualPdfPlaywrightCount: number;
  sourcesWithNoExtractedRecords: SourceCoverageSourceItem[];
}

export interface SourceCoverageSourceItem {
  id: string;
  institutionName: string;
  canton: string;
  city: string;
  status: string;
  sourceLanguage: string;
  region: string;
  urls: string[];
}

export interface InstitutionCoverageReport {
  generatedAt: string;
  uniqueInstitutionCount: number;
  institutionsByCanton: Record<string, number>;
  institutionsByLanguageRegion: Record<string, number>;
  institutionsWithExtractedRecords: InstitutionCoverageItem[];
  institutionsWithoutExtractedRecords: InstitutionCoverageItem[];
  institutionsWithFailedCrawl: InstitutionCoverageItem[];
  institutionsNeedingManualVerification: InstitutionCoverageItem[];
}

export interface InstitutionCoverageItem {
  institutionName: string;
  normalizedName: string;
  canton: string;
  city: string;
  sourceIds: string[];
  sourceCount: number;
  recordCount: number;
  status: string[];
  sourceLanguage: string[];
  region: string[];
}

export interface RecordCoverageReport {
  generatedAt: string;
  totalRecords: number;
  recordsByCanton: Record<string, number>;
  recordsByLanguage: Record<string, number>;
  recordsByRegion: Record<string, number>;
  recordsByDepartmentNormalized: Record<string, number>;
  recordsByRoleType: Record<string, number>;
  recordsByAvailabilityStatus: Record<string, number>;
  recordsByConfidence: Record<string, number>;
  recordsByExtractionMethod: Record<string, number>;
  highConfidenceCount: number;
  reviewNeededCount: number;
  highConfidenceToReviewNeededRatio: number | null;
}

export interface BaselineCoverageReport {
  generatedAt: string;
  baselineCount: number;
  baselineCountsBySource: Record<string, number>;
  statusCounts: Record<BaselineCoverageStatus, number>;
  matches: BaselineCoverageMatch[];
  sourceInstitutionsWithoutBaselineMatch: InstitutionCoverageItem[];
}

export interface BaselineCoverageMatch {
  baseline: BaselineEntry;
  status: BaselineCoverageStatus;
  matchType: "exact" | "alias" | "fuzzy" | "none" | "excluded" | "ambiguous";
  matchedInstitutions: InstitutionCoverageItem[];
  notes: string[];
}

export interface FullCoverageReport {
  sourceCoverage: ExtendedSourceCoverageReport;
  institutionCoverage: InstitutionCoverageReport;
  recordCoverage: RecordCoverageReport;
  baselineCoverage: BaselineCoverageReport;
}

interface ParserHealthFile {
  failedPages?: Array<{ sourceId: string; url: string; error: string }>;
}

export async function generateCoverageReports(
  options: CoverageReportOptions,
): Promise<FullCoverageReport> {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const sources = await loadSources(options.sourcesPath);
  const placements = PlacementRecordArraySchema.parse(
    JSON.parse(await readFile(join(options.dataDir, "placements.json"), "utf8")),
  );
  const parserHealth = await readParserHealth(join(options.dataDir, "parser-health.json"));
  const baselines = await loadBaselines(options.baselinesDir);
  const institutions = buildInstitutionItems(sources, placements);
  const sourceCoverage = buildExtendedSourceCoverageReport({
    generatedAt,
    sources,
    placements,
    parserHealth,
  });
  const institutionCoverage = buildInstitutionCoverageReport({
    generatedAt,
    institutions,
    parserHealth,
  });
  const recordCoverage = buildRecordCoverageReport(generatedAt, placements);
  const baselineCoverage = buildBaselineCoverageReport({
    generatedAt,
    baselines,
    institutions,
  });

  await mkdir(options.outDir, { recursive: true });
  await writeJson(join(options.outDir, "source-coverage.json"), sourceCoverage);
  await writeFile(
    join(options.outDir, "source-coverage.md"),
    renderSourceCoverageMarkdown(sourceCoverage),
    "utf8",
  );
  await writeJson(join(options.outDir, "institution-coverage.json"), institutionCoverage);
  await writeFile(
    join(options.outDir, "institution-coverage.md"),
    renderInstitutionCoverageMarkdown(institutionCoverage),
    "utf8",
  );
  await writeJson(join(options.outDir, "record-coverage.json"), recordCoverage);
  await writeFile(
    join(options.outDir, "record-coverage.md"),
    renderRecordCoverageMarkdown(recordCoverage),
    "utf8",
  );
  await writeFile(
    join(options.outDir, "missing-sources.md"),
    renderMissingSourcesMarkdown(baselineCoverage),
    "utf8",
  );
  await writeFile(
    join(options.outDir, "coverage-by-baseline.md"),
    renderBaselineCoverageMarkdown(baselineCoverage),
    "utf8",
  );

  return {
    sourceCoverage,
    institutionCoverage,
    recordCoverage,
    baselineCoverage,
  };
}

export function buildExtendedSourceCoverageReport(input: {
  generatedAt: string;
  sources: SourceRegistryEntry[];
  placements: PlacementRecord[];
  parserHealth?: ParserHealthFile;
}): ExtendedSourceCoverageReport {
  const sourceIdsWithRecords = new Set(input.placements.map((record) => record.sourceId));

  return {
    generatedAt: input.generatedAt,
    sourceEntryCount: input.sources.length,
    sourceUrlCount: input.sources.reduce((count, source) => count + source.sourceUrls.length, 0),
    countsByCanton: countBy(input.sources, (source) => source.canton),
    countsByLanguage: countBy(input.sources, (source) => source.sourceLanguage),
    countsByRegion: countBy(input.sources, (source) => source.region),
    countsByStatus: countBy(input.sources, (source) => source.status),
    countsByFetchMode: countBy(
      input.sources.flatMap((source) => source.sourceUrls),
      (sourceUrl) => sourceUrl.fetchMode,
    ),
    countsByExpectedParser: countBy(
      input.sources.flatMap((source) => source.sourceUrls),
      (sourceUrl) => sourceUrl.expectedParser,
    ),
    failedCrawlCount: input.parserHealth?.failedPages?.length ?? 0,
    manualPdfPlaywrightCount: input.sources.filter((source) =>
      source.sourceUrls.some((sourceUrl) =>
        ["manual", "pdf", "playwright"].includes(sourceUrl.fetchMode),
      ),
    ).length,
    sourcesWithNoExtractedRecords: input.sources
      .filter((source) => !sourceIdsWithRecords.has(source.id))
      .map(toSourceCoverageItem),
  };
}

export function buildInstitutionCoverageReport(input: {
  generatedAt: string;
  institutions: InstitutionCoverageItem[];
  parserHealth?: ParserHealthFile;
}): InstitutionCoverageReport {
  const failedSourceIds = new Set(input.parserHealth?.failedPages?.map((page) => page.sourceId));

  return {
    generatedAt: input.generatedAt,
    uniqueInstitutionCount: input.institutions.length,
    institutionsByCanton: countBy(input.institutions, (institution) => institution.canton),
    institutionsByLanguageRegion: countBy(input.institutions, (institution) =>
      institution.region.join("+"),
    ),
    institutionsWithExtractedRecords: input.institutions.filter(
      (institution) => institution.recordCount > 0,
    ),
    institutionsWithoutExtractedRecords: input.institutions.filter(
      (institution) => institution.recordCount === 0,
    ),
    institutionsWithFailedCrawl: input.institutions.filter((institution) =>
      institution.sourceIds.some((sourceId) => failedSourceIds.has(sourceId)),
    ),
    institutionsNeedingManualVerification: input.institutions.filter((institution) =>
      institution.status.some((status) => status === "candidate" || status === "needs-review"),
    ),
  };
}

export function buildRecordCoverageReport(
  generatedAt: string,
  placements: PlacementRecord[],
): RecordCoverageReport {
  const highConfidenceCount = placements.filter((record) => record.confidence === "high").length;
  const reviewNeededCount = placements.filter(
    (record) => record.reviewStatus === "needs-human-review",
  ).length;

  return {
    generatedAt,
    totalRecords: placements.length,
    recordsByCanton: countBy(placements, (record) => record.canton ?? "unknown"),
    recordsByLanguage: countBy(placements, (record) => record.sourceLanguage),
    recordsByRegion: countBy(placements, (record) => record.region),
    recordsByDepartmentNormalized: countBy(
      placements,
      (record) => record.departmentNormalized ?? "not-specified",
    ),
    recordsByRoleType: countBy(placements, (record) => record.roleType),
    recordsByAvailabilityStatus: countBy(placements, (record) => record.availabilityStatus),
    recordsByConfidence: countBy(placements, (record) => record.confidence),
    recordsByExtractionMethod: countBy(placements, (record) => record.extractionMethod),
    highConfidenceCount,
    reviewNeededCount,
    highConfidenceToReviewNeededRatio:
      reviewNeededCount === 0 ? null : highConfidenceCount / reviewNeededCount,
  };
}

export function buildBaselineCoverageReport(input: {
  generatedAt: string;
  baselines: BaselineEntry[];
  institutions: InstitutionCoverageItem[];
}): BaselineCoverageReport {
  const matches = input.baselines.map((baseline) =>
    matchBaselineInstitution(baseline, input.institutions),
  );
  const matchedInstitutionKeys = new Set(
    matches.flatMap((match) =>
      match.status === "missing" || match.status === "excluded"
        ? []
        : match.matchedInstitutions.map((institution) => institution.normalizedName),
    ),
  );

  return {
    generatedAt: input.generatedAt,
    baselineCount: input.baselines.length,
    baselineCountsBySource: countBy(input.baselines, (baseline) => baseline.baselineSource),
    statusCounts: countBy(matches, (match) => match.status) as Record<
      BaselineCoverageStatus,
      number
    >,
    matches,
    sourceInstitutionsWithoutBaselineMatch: input.institutions.filter(
      (institution) => !matchedInstitutionKeys.has(institution.normalizedName),
    ),
  };
}

export function matchBaselineInstitution(
  baseline: BaselineEntry,
  institutions: InstitutionCoverageItem[],
): BaselineCoverageMatch {
  if (/\b(excluded|out[- ]of[- ]scope|not clinical placement)\b/i.test(baseline.notes)) {
    return {
      baseline,
      status: "excluded",
      matchType: "excluded",
      matchedInstitutions: [],
      notes: ["Baseline entry marked as excluded by notes."],
    };
  }

  const candidates = institutions
    .map((institution) => ({
      institution,
      matchType: institutionMatchType(baseline.name, institution.institutionName),
    }))
    .filter((match) => match.matchType !== "none");
  const exactMatches = candidates.filter((match) => match.matchType === "exact");
  const usableMatches = exactMatches.length > 0 ? exactMatches : candidates;

  if (usableMatches.length === 0) {
    return {
      baseline,
      status: "missing",
      matchType: "none",
      matchedInstitutions: [],
      notes: ["No source-registry institution matched this baseline entry."],
    };
  }

  if (usableMatches.length > 1 && exactMatches.length === 0) {
    return {
      baseline,
      status: "ambiguous",
      matchType: "ambiguous",
      matchedInstitutions: usableMatches.map((match) => match.institution),
      notes: ["Multiple possible source-registry institution matches require manual review."],
    };
  }

  const match = usableMatches[0];
  if (!match) {
    throw new Error("Baseline match expected at least one usable match.");
  }
  const status: BaselineCoverageStatus =
    match.institution.recordCount > 0 ? "covered" : "likely-covered";

  return {
    baseline,
    status,
    matchType: match.matchType,
    matchedInstitutions: [match.institution],
    notes:
      status === "covered"
        ? ["Matched source registry institution has extracted placement records."]
        : ["Matched source registry institution is source-only; no records extracted yet."],
  };
}

function institutionMatchType(
  baselineName: string,
  institutionName: string,
): "exact" | "alias" | "fuzzy" | "none" {
  const baselineKey = normalizeInstitutionName(baselineName);
  const institutionKey = normalizeInstitutionName(institutionName);

  if (baselineKey === institutionKey) {
    return "exact";
  }

  if (canonicalInstitutionAlias(baselineKey) === canonicalInstitutionAlias(institutionKey)) {
    return "alias";
  }

  const baselineTokens = meaningfulTokens(baselineKey);
  const institutionTokens = meaningfulTokens(institutionKey);
  const shared = baselineTokens.filter((token) => institutionTokens.includes(token));
  const denominator = Math.min(baselineTokens.length, institutionTokens.length);

  if (
    (denominator >= 2 && shared.length / denominator >= 0.75) ||
    (baselineTokens.length === 1 && shared.length === 1)
  ) {
    return "fuzzy";
  }

  return "none";
}

export function normalizeInstitutionName(value: string): string {
  return value
    .replaceAll("ä", "ae")
    .replaceAll("ö", "oe")
    .replaceAll("ü", "ue")
    .replaceAll("Ä", "Ae")
    .replaceAll("Ö", "Oe")
    .replaceAll("Ü", "Ue")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(universitaet|universitat|university|universite|universita)\b/g, "universitat")
    .replace(/\b(hopitaux|hopital|hospital|spital|ospedale|clinique|clinic|klinik)\b/g, "hospital")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function canonicalInstitutionAlias(value: string): string {
  const aliases: Record<string, string> = {
    "universitatsspital zurich": "usz",
    "universitaetsspital zuerich": "usz",
    "universitat hospital zurich": "usz",
    "university hospital zurich": "usz",
    usz: "usz",
    "universitatsspital basel": "usb",
    "university hospital basel": "usb",
    "usb basel": "usb",
    "inselspital bern": "inselgruppe",
    "university hospital bern": "inselgruppe",
    "insel gruppe": "inselgruppe",
    "hopitaux universitaires de geneve": "hug",
    "geneva university hospitals": "hug",
    hug: "hug",
    "centre hospitalier universitaire vaudois": "chuv",
    "lausanne university hospital": "chuv",
    chuv: "chuv",
    "ente ospedaliero cantonale": "eoc",
    eoc: "eoc",
  };

  return aliases[value] ?? value;
}

function meaningfulTokens(value: string): string[] {
  const ignored = new Set([
    "and",
    "bei",
    "cantonale",
    "cantonaux",
    "de",
    "der",
    "des",
    "du",
    "hospital",
    "kantonsspital",
    "la",
    "le",
    "les",
    "of",
    "the",
    "und",
    "universitat",
  ]);

  return value.split(" ").filter((token) => token.length > 1 && !ignored.has(token));
}

function buildInstitutionItems(
  sources: SourceRegistryEntry[],
  placements: PlacementRecord[],
): InstitutionCoverageItem[] {
  const recordsByInstitution = countBy(placements, (record) =>
    normalizeInstitutionName(record.institutionName),
  );
  const groups = new Map<string, SourceRegistryEntry[]>();

  for (const source of sources) {
    const key = normalizeInstitutionName(source.institutionName);
    groups.set(key, [...(groups.get(key) ?? []), source]);
  }

  return [...groups.entries()]
    .map(([normalizedName, groupSources]) => ({
      institutionName: groupSources[0]?.institutionName ?? normalizedName,
      normalizedName,
      canton: groupSources[0]?.canton ?? "unknown",
      city: groupSources[0]?.city ?? "unknown",
      sourceIds: groupSources.map((source) => source.id).sort(),
      sourceCount: groupSources.length,
      recordCount: recordsByInstitution[normalizedName] ?? 0,
      status: unique(groupSources.map((source) => source.status)),
      sourceLanguage: unique(groupSources.map((source) => source.sourceLanguage)),
      region: unique(groupSources.map((source) => source.region)),
    }))
    .sort((left, right) => left.institutionName.localeCompare(right.institutionName));
}

async function readParserHealth(path: string): Promise<ParserHealthFile> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as ParserHealthFile;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return {};
    }

    throw error;
  }
}

export function parseCoverageReportArgs(argv: string[]): CoverageReportOptions {
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
    sourcesPath: resolve(baseDir, stringArg(args, "sources", DEFAULT_SOURCES_PATH)),
    dataDir: resolve(baseDir, stringArg(args, "data", DEFAULT_DATA_DIR)),
    outDir: resolve(baseDir, stringArg(args, "out", DEFAULT_OUT_DIR)),
    baselinesDir: resolve(baseDir, stringArg(args, "baselines", DEFAULT_BASELINES_DIR)),
  };
}

function renderSourceCoverageMarkdown(report: ExtendedSourceCoverageReport): string {
  return `# Source Coverage

Generated at: ${report.generatedAt}

Record count is not national clinic coverage. This report counts curated source entries and source URLs, not every Swiss hospital, clinic, department, or placement slot.

## Summary

| Metric | Count |
| --- | ---: |
| Source entries | ${report.sourceEntryCount} |
| Source URLs | ${report.sourceUrlCount} |
| Failed crawl pages | ${report.failedCrawlCount} |
| Manual/PDF/Playwright sources | ${report.manualPdfPlaywrightCount} |
| Sources with no extracted records | ${report.sourcesWithNoExtractedRecords.length} |

${renderCountTable("Sources by canton", report.countsByCanton)}
${renderCountTable("Sources by language", report.countsByLanguage)}
${renderCountTable("Sources by region", report.countsByRegion)}
${renderCountTable("Sources by status", report.countsByStatus)}
${renderCountTable("Source URLs by fetch mode", report.countsByFetchMode)}
${renderCountTable("Source URLs by expected parser", report.countsByExpectedParser)}

## Sources With No Extracted Records

${renderSourceItems(report.sourcesWithNoExtractedRecords)}
`;
}

function renderInstitutionCoverageMarkdown(report: InstitutionCoverageReport): string {
  return `# Institution Coverage

Generated at: ${report.generatedAt}

Coverage is measured by normalized institution names from the source registry and extracted placement records. Candidate sources may not yet be verified.

## Summary

| Metric | Count |
| --- | ---: |
| Unique institutions | ${report.uniqueInstitutionCount} |
| Institutions with extracted records | ${report.institutionsWithExtractedRecords.length} |
| Institutions without extracted records | ${report.institutionsWithoutExtractedRecords.length} |
| Institutions with failed crawl | ${report.institutionsWithFailedCrawl.length} |
| Institutions needing manual verification | ${report.institutionsNeedingManualVerification.length} |

${renderCountTable("Institutions by canton", report.institutionsByCanton)}
${renderCountTable("Institutions by language region", report.institutionsByLanguageRegion)}

## Institutions Without Extracted Records

${renderInstitutionItems(report.institutionsWithoutExtractedRecords)}
`;
}

function renderRecordCoverageMarkdown(report: RecordCoverageReport): string {
  return `# Record Coverage

Generated at: ${report.generatedAt}

Record count is not national clinic coverage. Some hospitals may not publish placement availability online.

## Summary

| Metric | Count |
| --- | ---: |
| Total records | ${report.totalRecords} |
| High-confidence records | ${report.highConfidenceCount} |
| Review-needed records | ${report.reviewNeededCount} |
| High-confidence / review-needed ratio | ${
    report.highConfidenceToReviewNeededRatio === null
      ? "Not applicable"
      : report.highConfidenceToReviewNeededRatio.toFixed(2)
  } |

${renderCountTable("Records by canton", report.recordsByCanton)}
${renderCountTable("Records by language", report.recordsByLanguage)}
${renderCountTable("Records by region", report.recordsByRegion)}
${renderCountTable("Records by normalized department", report.recordsByDepartmentNormalized)}
${renderCountTable("Records by role type", report.recordsByRoleType)}
${renderCountTable("Records by availability status", report.recordsByAvailabilityStatus)}
${renderCountTable("Records by confidence", report.recordsByConfidence)}
${renderCountTable("Records by extraction method", report.recordsByExtractionMethod)}
`;
}

function renderMissingSourcesMarkdown(report: BaselineCoverageReport): string {
  const missing = report.matches.filter((match) => match.status === "missing");
  const ambiguous = report.matches.filter((match) => match.status === "ambiguous");

  return `# Missing Sources

Generated at: ${report.generatedAt}

Coverage is measured against selected baselines. These example baseline files are not complete unless manually verified.

## Summary

| Metric | Count |
| --- | ---: |
| Missing baseline entries | ${missing.length} |
| Ambiguous baseline entries | ${ambiguous.length} |

## Missing

${renderBaselineMatches(missing)}

## Ambiguous

${renderBaselineMatches(ambiguous)}
`;
}

function renderBaselineCoverageMarkdown(report: BaselineCoverageReport): string {
  return `# Coverage By Baseline

Generated at: ${report.generatedAt}

Coverage is measured against selected baselines. Candidate sources may not yet be verified, and some hospitals may not publish placement availability online.

## Summary

| Metric | Count |
| --- | ---: |
| Baseline entries | ${report.baselineCount} |
${Object.entries(report.statusCounts)
  .map(([status, count]) => `| ${displayLabel(status)} | ${count} |`)
  .join("\n")}

${renderCountTable("Baseline entries by baseline source", report.baselineCountsBySource)}
${renderCountTable("Baseline match status", report.statusCounts)}

## Baseline Matches

${renderBaselineMatches(report.matches)}

## Source Institutions Without Baseline Match

${renderInstitutionItems(report.sourceInstitutionsWithoutBaselineMatch)}
`;
}

function renderCountTable(title: string, counts: Record<string, number>): string {
  const rows = Object.entries(counts)
    .map(([key, count]) => `| ${key} | ${count} |`)
    .join("\n");

  return `## ${title}

| Value | Count |
| --- | ---: |
${rows || "| None | 0 |"}
`;
}

function renderSourceItems(items: SourceCoverageSourceItem[]): string {
  if (items.length === 0) {
    return "No sources in this category.";
  }

  return items
    .map(
      (item) => `- \`${item.id}\` ${item.institutionName} (${item.canton}, ${item.city})
  Status: ${item.status}; language: ${item.sourceLanguage}; region: ${item.region}
  URLs: ${item.urls.join(", ")}`,
    )
    .join("\n");
}

function renderInstitutionItems(items: InstitutionCoverageItem[]): string {
  if (items.length === 0) {
    return "No institutions in this category.";
  }

  return items
    .map(
      (item) => `- ${item.institutionName} (${item.canton}, ${item.city})
  Sources: ${item.sourceIds.join(", ")}
  Records: ${item.recordCount}
  Status: ${item.status.join(", ")}`,
    )
    .join("\n");
}

function renderBaselineMatches(matches: BaselineCoverageMatch[]): string {
  if (matches.length === 0) {
    return "No baseline entries in this category.";
  }

  return matches
    .map(
      (match) => `- \`${match.baseline.id}\` ${match.baseline.name} (${match.baseline.canton}, ${
        match.baseline.city
      }): ${match.status} (${match.matchType})
  Matched institutions: ${
    match.matchedInstitutions.length
      ? match.matchedInstitutions.map((institution) => institution.institutionName).join(", ")
      : "none"
  }
  Baseline source: ${match.baseline.baselineSource}
  Source URL: ${match.baseline.sourceUrl}
  Notes: ${match.notes.join("; ")}`,
    )
    .join("\n");
}

function toSourceCoverageItem(source: SourceRegistryEntry): SourceCoverageSourceItem {
  return {
    id: source.id,
    institutionName: source.institutionName,
    canton: source.canton,
    city: source.city,
    status: source.status,
    sourceLanguage: source.sourceLanguage,
    region: source.region,
    urls: source.sourceUrls.map((sourceUrl) => sourceUrl.url),
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

function unique(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function writeJson(path: string, value: unknown): Promise<void> {
  return writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function stringArg(args: Map<string, string | true>, name: string, fallback: string): string {
  const value = args.get(name);
  return typeof value === "string" ? value : fallback;
}

function displayLabel(value: string): string {
  return value
    .split("-")
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

async function main(): Promise<void> {
  const options = parseCoverageReportArgs(process.argv.slice(2));
  const report = await generateCoverageReports(options);
  console.log(
    `Generated coverage reports for ${report.sourceCoverage.sourceEntryCount} sources, ${report.institutionCoverage.uniqueInstitutionCount} institutions, and ${report.recordCoverage.totalRecords} records.`,
  );
  console.log(`Coverage output: ${options.outDir}`);
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

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  type LeadTimeEvidence,
  LeadTimeEvidenceArraySchema,
  type LeadTimeSummary,
  LeadTimeSummaryArraySchema,
  makeLeadTimeEvidenceId,
  makeLeadTimePlacementKey,
  makeLeadTimeSummaryId,
  type PlacementRecord,
  PlacementRecordArraySchema,
  PlacementRecordSchema,
} from "@scpi/schema";
import { monthsBetweenObservedAndTarget } from "@scpi/utils";

export interface LeadTimeBuildResult {
  placements: PlacementRecord[];
  evidence: LeadTimeEvidence[];
  summaries: LeadTimeSummary[];
}

export interface LeadTimeFileOptions {
  dataDir: string;
}

export interface LeadTimeFileResult {
  placementCount: number;
  evidenceCount: number;
  summaryCount: number;
  paths: {
    placements: string;
    evidence: string;
    summary: string;
  };
}

export async function generateLeadTimeFiles(
  options: LeadTimeFileOptions,
): Promise<LeadTimeFileResult> {
  const placementsPath = join(options.dataDir, "placements.json");
  const evidencePath = join(options.dataDir, "lead-time-evidence.json");
  const summaryPath = join(options.dataDir, "lead-time-summary.json");
  const placements = PlacementRecordArraySchema.parse(
    JSON.parse(await readFile(placementsPath, "utf8")),
  );
  const result = buildLeadTimeData(placements);

  await mkdir(options.dataDir, { recursive: true });
  await writeJson(placementsPath, result.placements);
  await writeJson(evidencePath, result.evidence);
  await writeJson(summaryPath, result.summaries);

  return {
    placementCount: result.placements.length,
    evidenceCount: result.evidence.length,
    summaryCount: result.summaries.length,
    paths: {
      placements: placementsPath,
      evidence: evidencePath,
      summary: summaryPath,
    },
  };
}

export function buildLeadTimeData(placements: PlacementRecord[]): LeadTimeBuildResult {
  const enrichedPlacements = PlacementRecordArraySchema.parse(placements.map(enrichPlacement));
  const evidence = LeadTimeEvidenceArraySchema.parse(enrichedPlacements.flatMap(evidenceForRecord));
  const summaries = LeadTimeSummaryArraySchema.parse(summarizeLeadTimeEvidence(evidence));

  return {
    placements: enrichedPlacements,
    evidence,
    summaries,
  };
}

export function enrichPlacement(record: PlacementRecord): PlacementRecord {
  const explicitApplicationLeadTimeMonths =
    record.explicitApplicationLeadTimeMonths ?? record.applicationLeadTimeMonths;
  const observedMonthsAhead = observedMonthsAheadForRecord(record);
  const placementKey = makeLeadTimePlacementKey(record);
  const hasLeadTimeEvidence =
    explicitApplicationLeadTimeMonths !== null || observedMonthsAhead !== null;

  return PlacementRecordSchema.parse({
    ...record,
    explicitApplicationLeadTimeMonths,
    observedMonthsAhead,
    leadTimeSummaryId: hasLeadTimeEvidence ? makeLeadTimeSummaryId(placementKey) : null,
  });
}

export function evidenceForRecord(record: PlacementRecord): LeadTimeEvidence[] {
  const evidence: LeadTimeEvidence[] = [];
  const placementKey = makeLeadTimePlacementKey(record);
  const explicitMonths =
    record.explicitApplicationLeadTimeMonths ?? record.applicationLeadTimeMonths;

  if (explicitMonths !== null) {
    evidence.push(
      evidenceRecord({
        record,
        placementKey,
        evidenceType: "explicit-source",
        monthsAhead: explicitMonths,
        targetStartMonth: targetStartMonth(record),
        confidence: record.confidence === "low" ? "medium" : record.confidence,
        label: `Explicitly stated by source: apply ${explicitMonths} months ahead.`,
        notes: record.extractedSnippet,
      }),
    );
  }

  if (record.observedMonthsAhead !== null) {
    evidence.push(
      evidenceRecord({
        record,
        placementKey,
        evidenceType: "historical-observed",
        monthsAhead: record.observedMonthsAhead,
        targetStartMonth: targetStartMonth(record),
        confidence: "low",
        label: `Estimated from public page history: observed ${record.observedMonthsAhead} months ahead.`,
        notes:
          "One historical observation describes what was visible when checked; it is not a recommendation by itself.",
      }),
    );
  }

  return evidence;
}

export function summarizeLeadTimeEvidence(evidence: LeadTimeEvidence[]): LeadTimeSummary[] {
  const byPlacementKey = new Map<string, LeadTimeEvidence[]>();

  for (const item of evidence) {
    const items = byPlacementKey.get(item.placementKey) ?? [];
    items.push(item);
    byPlacementKey.set(item.placementKey, items);
  }

  return [...byPlacementKey.entries()]
    .map(([placementKey, items]) => summarizePlacementEvidence(placementKey, items))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function summarizePlacementEvidence(
  placementKey: string,
  evidence: LeadTimeEvidence[],
): LeadTimeSummary {
  const hospitalConfirmed = evidence.filter((item) => item.evidenceType === "hospital-confirmed");
  const explicitSource = evidence.filter((item) => item.evidenceType === "explicit-source");
  const studentReported = evidence.filter((item) => item.evidenceType === "student-reported");
  const historicalObserved = evidence.filter((item) => item.evidenceType === "historical-observed");
  const estimated = evidence.filter((item) => item.evidenceType === "estimated");
  const observationMonths = historicalObserved
    .map((item) => item.monthsAhead)
    .filter((value): value is number => value !== null)
    .sort((left, right) => left - right);
  const warnings: string[] = [];
  const authoritative = hospitalConfirmed[0] ?? explicitSource[0];
  const recommendedMonths = authoritative?.monthsAhead ?? null;
  let basis: LeadTimeSummary["basis"] = "estimated";
  let confidence: LeadTimeSummary["confidence"] = "low";
  let label = "No reliable apply-ahead recommendation is available.";

  if (hospitalConfirmed[0]) {
    basis = "hospital-confirmed";
    confidence = "high";
    label = `Hospital confirmed: apply ${recommendedMonths} months ahead.`;
  } else if (explicitSource[0]) {
    basis = "explicit-source";
    confidence = explicitSource[0].confidence === "low" ? "medium" : explicitSource[0].confidence;
    label = `Explicitly stated by source: apply ${recommendedMonths} months ahead.`;
  } else if (observationMonths.length >= 3) {
    basis = "historical-observed";
    confidence = "medium";
    label = `Estimated from public page history: usually visible ${median(observationMonths)} months ahead.`;
  } else if (studentReported.length > 0) {
    basis = "student-reported";
    confidence = "low";
    label = "Student-reported lead time is present but not yet enough for a recommendation.";
  } else if (estimated.length > 0 || observationMonths.length > 0) {
    basis = observationMonths.length > 0 ? "historical-observed" : "estimated";
    confidence = "low";
    label = "Estimated lead time is low confidence and should not be treated as fact.";
  }

  if (basis === "historical-observed" && observationMonths.length < 3) {
    warnings.push("Estimated recommendation is based on fewer than 3 observations.");
  }

  if (recommendedMonths !== null && recommendedMonths > 24) {
    warnings.push("Lead time is greater than 24 months and needs manual review.");
  }

  return {
    id: makeLeadTimeSummaryId(placementKey),
    placementKey,
    sourceId: evidence[0]?.sourceId ?? "unknown",
    recommendedApplyAheadMinMonths:
      recommendedMonths ?? (observationMonths.length >= 3 ? Math.min(...observationMonths) : null),
    recommendedApplyAheadMaxMonths:
      recommendedMonths ?? (observationMonths.length >= 3 ? Math.max(...observationMonths) : null),
    medianObservedMonthsAhead: observationMonths.length > 0 ? median(observationMonths) : null,
    observedRangeMinMonths: observationMonths.length > 0 ? Math.min(...observationMonths) : null,
    observedRangeMaxMonths: observationMonths.length > 0 ? Math.max(...observationMonths) : null,
    evidenceCount: evidence.length,
    observationCount: observationMonths.length,
    basis,
    confidence,
    label,
    warnings,
  };
}

function evidenceRecord(input: {
  record: PlacementRecord;
  placementKey: string;
  evidenceType: LeadTimeEvidence["evidenceType"];
  monthsAhead: number | null;
  targetStartMonth: string | null;
  confidence: LeadTimeEvidence["confidence"];
  label: string;
  notes: string | null;
}): LeadTimeEvidence {
  return {
    id: makeLeadTimeEvidenceId({
      placementId: input.record.id,
      evidenceType: input.evidenceType,
      monthsAhead: input.monthsAhead,
      targetStartMonth: input.targetStartMonth,
      observedAt: input.record.lastChecked,
    }),
    placementId: input.record.id,
    placementKey: input.placementKey,
    sourceId: input.record.sourceId,
    sourceUrl: input.record.sourceUrl,
    evidenceType: input.evidenceType,
    monthsAhead: input.monthsAhead,
    targetStartMonth: input.targetStartMonth,
    observedAt: input.record.lastChecked,
    confidence: input.confidence,
    label: input.label,
    notes: input.notes,
  };
}

function observedMonthsAheadForRecord(record: PlacementRecord): number | null {
  const target = targetStartMonth(record);
  const monthsAhead = target ? monthsBetweenObservedAndTarget(record.lastChecked, target) : null;
  return monthsAhead !== null && monthsAhead >= 0 ? monthsAhead : null;
}

function targetStartMonth(record: PlacementRecord): string | null {
  const target = record.availableFrom ?? record.fullyBookedUntil;
  return target ? target.slice(0, 7) : null;
}

function median(values: number[]): number {
  const midpoint = Math.floor(values.length / 2);
  const middle = values[midpoint] ?? 0;

  if (values.length % 2 === 1) {
    return middle;
  }

  const lower = values[midpoint - 1] ?? middle;
  return Math.round((lower + middle) / 2);
}

export function parseLeadTimeFileArgs(argv: string[]): LeadTimeFileOptions {
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
  };
}

function stringArg(args: Map<string, string | true>, name: string, fallback: string): string {
  const value = args.get(name);
  return typeof value === "string" ? value : fallback;
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function main(): Promise<void> {
  const result = await generateLeadTimeFiles(parseLeadTimeFileArgs(process.argv.slice(2)));
  console.log(
    `Generated ${result.evidenceCount} lead-time evidence records and ${result.summaryCount} summaries from ${result.placementCount} placements.`,
  );
  console.log(`Placements: ${result.paths.placements}`);
  console.log(`Evidence: ${result.paths.evidence}`);
  console.log(`Summary: ${result.paths.summary}`);
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

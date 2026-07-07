import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PlacementRecord, SourceRegistryEntry } from "@scpi/schema";
import { describe, expect, it } from "vitest";
import {
  buildBaselineCoverageReport,
  buildExtendedSourceCoverageReport,
  buildInstitutionCoverageReport,
  buildRecordCoverageReport,
  generateCoverageReports,
  matchBaselineInstitution,
  normalizeInstitutionName,
} from "../src/coverage-report.js";

describe("coverage report", () => {
  const generatedAt = "2026-07-07T08:00:00.000Z";

  it("matches baseline institutions by exact normalized name", () => {
    const report = buildBaselineCoverageReport({
      generatedAt,
      baselines: [baseline("usb", "Universitaetsspital Basel")],
      institutions: [institution("Universitaetsspital Basel", { recordCount: 2 })],
    });

    expect(report.matches[0]).toMatchObject({
      status: "covered",
      matchType: "exact",
    });
  });

  it("matches baseline institutions by alias", () => {
    const match = matchBaselineInstitution(baseline("usz", "University Hospital Zurich"), [
      institution("Universitaetsspital Zuerich", { recordCount: 1 }),
    ]);

    expect(match).toMatchObject({
      status: "covered",
      matchType: "alias",
    });
  });

  it("marks ambiguous matches for manual review", () => {
    const match = matchBaselineInstitution(baseline("city", "City Hospital"), [
      institution("City Hospital North", { recordCount: 1 }),
      institution("City Hospital South", { recordCount: 0 }),
    ]);

    expect(match.status).toBe("ambiguous");
    expect(match.matchedInstitutions).toHaveLength(2);
  });

  it("marks missing baseline institutions", () => {
    const match = matchBaselineInstitution(baseline("missing", "Missing Hospital"), [
      institution("Known Hospital", { recordCount: 1 }),
    ]);

    expect(match).toMatchObject({
      status: "missing",
      matchType: "none",
    });
  });

  it("distinguishes institutions with records from source-only coverage", () => {
    const institutions = [
      institution("Record Hospital", { recordCount: 3 }),
      institution("Source Only Hospital", { recordCount: 0 }),
    ];
    const report = buildInstitutionCoverageReport({
      generatedAt,
      institutions,
      parserHealth: { failedPages: [] },
    });

    expect(report.institutionsWithExtractedRecords.map((item) => item.institutionName)).toEqual([
      "Record Hospital",
    ]);
    expect(report.institutionsWithoutExtractedRecords.map((item) => item.institutionName)).toEqual([
      "Source Only Hospital",
    ]);
  });

  it("reports source institutions with records but no baseline match", () => {
    const report = buildBaselineCoverageReport({
      generatedAt,
      baselines: [baseline("known", "Known Hospital")],
      institutions: [
        institution("Known Hospital", { recordCount: 1 }),
        institution("Extra Hospital", { recordCount: 2 }),
      ],
    });

    expect(
      report.sourceInstitutionsWithoutBaselineMatch.map((item) => item.institutionName),
    ).toEqual(["Extra Hospital"]);
  });

  it("summarizes source and record coverage counts", () => {
    const sources = [
      source("source-with-record", "Record Hospital", { canton: "ZH" }),
      source("source-only", "Source Only Hospital", { canton: "VD", fetchMode: "pdf" }),
    ];
    const placements = [placement("source-with-record", "Record Hospital")];
    const sourceReport = buildExtendedSourceCoverageReport({
      generatedAt,
      sources,
      placements,
      parserHealth: {
        failedPages: [{ sourceId: "source-only", url: "https://example.ch", error: "404" }],
      },
    });
    const recordReport = buildRecordCoverageReport(generatedAt, placements);

    expect(sourceReport.sourcesWithNoExtractedRecords.map((item) => item.id)).toEqual([
      "source-only",
    ]);
    expect(sourceReport.failedCrawlCount).toBe(1);
    expect(sourceReport.manualPdfPlaywrightCount).toBe(1);
    expect(recordReport.totalRecords).toBe(1);
    expect(recordReport.recordsByCanton).toEqual({ ZH: 1 });
  });

  it("normalizes accented and transliterated institution names", () => {
    expect(normalizeInstitutionName("Universitätsspital Zürich")).toBe(
      normalizeInstitutionName("Universitaetsspital Zuerich"),
    );
  });

  it("generates markdown files with summary tables", async () => {
    const root = await mkdtemp(join(tmpdir(), "scpi-coverage-report-"));
    const dataDir = join(root, "data");
    const outDir = join(root, "out");
    const baselinesDir = join(root, "baselines");
    const sourcesPath = join(root, "sources.yaml");
    await mkdir(dataDir, { recursive: true });
    await mkdir(baselinesDir, { recursive: true });
    await writeFile(
      sourcesPath,
      `- id: record-source
  institutionName: "Record Hospital"
  institutionType: "hospital"
  canton: "ZH"
  city: "Zuerich"
  language: "de"
  sourceLanguage: "de"
  region: "de-CH"
  country: "CH"
  sourceUrls:
    - url: "https://example.ch/record"
      pageType: "hospital-placement-page"
      expectedParser: "generic"
      fetchMode: "html"
  notes: "Synthetic source for coverage report integration test."
  priority: 1
  status: "needs-review"
`,
      "utf8",
    );
    await writeJson(join(dataDir, "placements.json"), [
      placement("record-source", "Record Hospital"),
    ]);
    await writeJson(join(dataDir, "parser-health.json"), {
      failedPages: [],
    });
    await writeFile(
      join(baselinesDir, "baseline.yaml"),
      `- id: record-hospital
  name: "Record Hospital"
  canton: "ZH"
  city: "Zuerich"
  type: "hospital"
  sourceUrl: "https://example.ch"
  baselineSource: "synthetic"
  notes: "Synthetic baseline."
`,
      "utf8",
    );

    await generateCoverageReports({
      sourcesPath,
      dataDir,
      outDir,
      baselinesDir,
      generatedAt,
    });

    await expect(readFile(join(outDir, "record-coverage.md"), "utf8")).resolves.toContain(
      "| Metric | Count |",
    );
    await expect(readFile(join(outDir, "coverage-by-baseline.md"), "utf8")).resolves.toContain(
      "| Baseline entries | 1 |",
    );
  });
});

function baseline(id: string, name: string) {
  return {
    id,
    name,
    canton: "ZH",
    city: "Zuerich",
    type: "hospital",
    sourceUrl: "https://example.ch",
    baselineSource: "synthetic",
    notes: "Synthetic baseline for coverage tests.",
  };
}

function institution(
  institutionName: string,
  overrides: Partial<ReturnType<typeof institutionShape>> = {},
) {
  return {
    ...institutionShape(institutionName),
    ...overrides,
  };
}

function institutionShape(institutionName: string) {
  return {
    institutionName,
    normalizedName: normalizeInstitutionName(institutionName),
    canton: "ZH",
    city: "Zuerich",
    sourceIds: [institutionName.toLowerCase().replaceAll(" ", "-")],
    sourceCount: 1,
    recordCount: 0,
    status: ["needs-review"],
    sourceLanguage: ["de"],
    region: ["de-CH"],
  };
}

function source(
  id: string,
  institutionName: string,
  overrides: Partial<SourceRegistryEntry> & {
    canton?: SourceRegistryEntry["canton"];
    fetchMode?: SourceRegistryEntry["sourceUrls"][number]["fetchMode"];
  } = {},
): SourceRegistryEntry {
  const { fetchMode, ...sourceOverrides } = overrides;

  return {
    id,
    institutionName,
    institutionType: "hospital",
    canton: sourceOverrides.canton ?? "ZH",
    city: "Example",
    language: "de",
    sourceLanguage: "de",
    region: "de-CH",
    country: "CH",
    sourceUrls: [
      {
        url: `https://example.ch/${id}`,
        pageType: "hospital-education-page",
        expectedParser: "generic",
        fetchMode: fetchMode ?? "html",
      },
    ],
    notes: "Synthetic source for coverage tests.",
    priority: 3,
    status: "needs-review",
    ...sourceOverrides,
  };
}

function placement(sourceId: string, institutionName: string): PlacementRecord {
  return {
    id: `${sourceId}-placement`,
    sourceId,
    institutionName,
    department: "Innere Medizin",
    departmentNormalized: "internal-medicine",
    roleType: "Unterassistenz",
    country: "CH",
    canton: "ZH",
    city: "Zuerich",
    language: "de",
    sourceLanguage: "de",
    region: "de-CH",
    availabilityStatus: "not-specified",
    availableFrom: null,
    fullyBookedUntil: null,
    durationMinWeeks: null,
    durationMaxWeeks: null,
    applicationLeadTimeMonths: null,
    explicitApplicationLeadTimeMonths: null,
    observedMonthsAhead: null,
    leadTimeSummaryId: null,
    applicationMethod: "not-specified",
    applicationUrl: null,
    contactEmail: null,
    contactName: null,
    originalDepartmentName: "Innere Medizin",
    roleTypeOriginal: "Unterassistenz",
    eligibilityNotes: null,
    languageRequirement: null,
    compensation: null,
    housing: null,
    sourceUrl: "https://example.ch",
    sourceTitle: "Example",
    extractedSnippet: "Unterassistenz Innere Medizin",
    sourceLastModified: null,
    lastChecked: "2026-07-07T08:00:00.000Z",
    extractionMethod: "generic-parser",
    extractionLanguage: "de",
    confidence: "low",
    reviewStatus: "needs-human-review",
    warnings: ["Synthetic record."],
  };
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

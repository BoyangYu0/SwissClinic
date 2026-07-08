import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { ParserResult, SourceParser } from "@scpi/parsers";
import {
  type ChangeRecord,
  makePlacementId,
  type PlacementRecord,
  type PlacementRecordInput,
  type SnapshotRecord,
} from "@scpi/schema";
import { describe, expect, it } from "vitest";
import {
  buildReviewNeededReport,
  buildStaticData,
  type ParserHealthReport,
  parseBuildStaticDataArgs,
} from "../src/build-static-data.js";

describe("buildStaticData", () => {
  it("writes placements, sources, changes, parser health, and CSV from synthetic snapshots", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "scpi-build-data-"));
    const snapshotsDir = join(workspace, "snapshots");
    const outDir = join(workspace, "current");
    const exportsDir = join(workspace, "exports");
    const sourcesPath = join(workspace, "sources.yaml");
    await writeSources(sourcesPath, [
      ["medium-source", "https://example.ch/medium", "synthetic"],
      ["low-source", "https://example.ch/low", "synthetic"],
      ["failed-source", "https://example.ch/failed", "synthetic"],
    ]);
    await writeSnapshot(
      snapshotsDir,
      snapshot("medium-source", "https://example.ch/medium", {
        extractedEmails: ["gespraech-interdisziplinaer@2x.55558371.jpg"],
      }),
    );
    await writeSnapshot(snapshotsDir, snapshot("low-source", "https://example.ch/low"));
    await writeSnapshot(
      snapshotsDir,
      snapshot("failed-source", "https://example.ch/failed", {
        statusCode: 500,
        error: "HTTP 500",
      }),
    );
    const mediumRecord = placement("medium-source", "https://example.ch/medium", "medium", {
      canton: null,
      city: null,
    });
    const lowRecord = placement("low-source", "https://example.ch/low", "low", {
      reviewStatus: "auto-published",
      warnings: ["Synthetic low confidence record."],
    });
    const parser = parserReturning("synthetic", {
      "medium-source": [mediumRecord, mediumRecord],
      "low-source": [lowRecord],
    });

    const result = await buildStaticData({
      snapshotsDir,
      outDir,
      exportsDir,
      sourcesPath,
      generatedAt: "2026-07-07T08:00:00.000Z",
      parsers: [parser],
    });

    expect(result.placements).toHaveLength(2);
    expect(result.placements.map((record) => record.id).sort()).toEqual(
      [mediumRecord.id, lowRecord.id].sort(),
    );
    expect(result.placements.find((record) => record.id === lowRecord.id)?.reviewStatus).toBe(
      "needs-human-review",
    );
    expect(result.placements.find((record) => record.id === mediumRecord.id)).toMatchObject({
      canton: "ZH",
      city: "Zuerich",
    });
    expect(result.parserHealth).toMatchObject({
      pagesCrawled: 3,
      pagesFailed: 1,
      recordsExtracted: 2,
      confidenceCounts: {
        high: 0,
        medium: 1,
        low: 1,
      },
      sourceLanguageCounts: {
        de: 2,
      },
      regionCounts: {
        "de-CH": 2,
      },
      reviewStatusCounts: {
        "needs-human-review": 1,
        "auto-published": 1,
      },
      recordsNeedingReview: 1,
      parserCounts: {
        synthetic: 2,
      },
    });
    expect(result.parserHealth.failedPages[0]).toMatchObject({
      sourceId: "failed-source",
      statusCode: 500,
      error: "HTTP 500",
    });

    const placementsJson = JSON.parse(await readFile(join(outDir, "placements.json"), "utf8"));
    const sourcesJson = JSON.parse(await readFile(join(outDir, "sources.json"), "utf8"));
    const changesJson = JSON.parse(await readFile(join(outDir, "changes.json"), "utf8"));
    const parserHealthJson = JSON.parse(await readFile(join(outDir, "parser-health.json"), "utf8"));
    const leadTimeEvidenceJson = JSON.parse(
      await readFile(join(outDir, "lead-time-evidence.json"), "utf8"),
    );
    const leadTimeSummaryJson = JSON.parse(
      await readFile(join(outDir, "lead-time-summary.json"), "utf8"),
    );
    const reviewNeeded = await readFile(join(outDir, "review-needed.md"), "utf8");
    const csv = await readFile(join(exportsDir, "placements.csv"), "utf8");

    expect(placementsJson).toHaveLength(2);
    expect(sourcesJson).toHaveLength(3);
    expect(changesJson).toEqual([]);
    expect(parserHealthJson.recordsNeedingReview).toBe(1);
    expect(leadTimeEvidenceJson).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          evidenceType: "historical-observed",
          monthsAhead: 12,
        }),
      ]),
    );
    expect(leadTimeSummaryJson[0]).toEqual(
      expect.objectContaining({
        basis: "historical-observed",
        confidence: "low",
      }),
    );
    expect(reviewNeeded).toContain("# Manual Review Needed");
    expect(reviewNeeded).toContain("## Lead Time Warnings");
    expect(reviewNeeded).toContain(
      "Estimated recommendation is based on fewer than 3 observations.",
    );
    expect(reviewNeeded).toContain(lowRecord.id);
    expect(reviewNeeded).toContain("Synthetic low confidence record.");
    expect(reviewNeeded).toContain("HTTP 500");
    expect(reviewNeeded).toContain("Synthetic parser warning.");
    expect(reviewNeeded).not.toContain(mediumRecord.id);
    expect(csv.split("\n")[0]).toBe(
      "id,sourceId,institutionName,department,roleType,canton,city,availabilityStatus,availableFrom,fullyBookedUntil,durationMinWeeks,durationMaxWeeks,applicationMethod,applicationUrl,contactEmail,confidence,reviewStatus,sourceUrl,lastChecked",
    );
    expect(csv).toContain(`"${mediumRecord.id}"`);
  });

  it("fails when parser output does not validate as a placement record", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "scpi-build-data-invalid-"));
    const snapshotsDir = join(workspace, "snapshots");
    const sourcesPath = join(workspace, "sources.yaml");
    await writeSources(sourcesPath, [["invalid-source", "https://example.ch/invalid", "invalid"]]);
    await writeSnapshot(snapshotsDir, snapshot("invalid-source", "https://example.ch/invalid"));
    const invalidParser: SourceParser = {
      id: "invalid",
      match: () => true,
      async parse(): Promise<ParserResult> {
        return {
          parserName: "invalid",
          confidence: "high",
          warnings: [],
          records: [
            {
              id: "bad-record",
              sourceId: "invalid-source",
              confidence: "impossible",
            },
          ] as unknown as PlacementRecord[],
        };
      },
    };

    await expect(
      buildStaticData({
        snapshotsDir,
        outDir: join(workspace, "current"),
        exportsDir: join(workspace, "exports"),
        sourcesPath,
        parsers: [invalidParser],
      }),
    ).rejects.toThrow();
  });

  it("excludes high-confidence records unless they changed", () => {
    const highRecord = placement("high-source", "https://example.ch/high", "high");
    const changedHighRecord = placement("changed-source", "https://example.ch/changed", "high");
    const report = buildReviewNeededReport({
      generatedAt: "2026-07-07T08:00:00.000Z",
      placements: [highRecord, changedHighRecord],
      changes: [changeFor(changedHighRecord)],
      parserHealth: emptyParserHealth(),
    });

    expect(report).not.toContain(highRecord.id);
    expect(report).toContain(changedHighRecord.id);
    expect(report).toContain("recent change");
  });
});

describe("parseBuildStaticDataArgs", () => {
  it("parses the build:data CLI arguments", () => {
    const baseDir = process.env.INIT_CWD ?? process.cwd();

    expect(
      parseBuildStaticDataArgs([
        "--snapshots",
        "data/snapshots",
        "--out",
        "data/current",
        "--sources",
        "packages/sources/sources.yaml",
        "--exports",
        "data/exports",
      ]),
    ).toEqual({
      snapshotsDir: resolve(baseDir, "data/snapshots"),
      outDir: resolve(baseDir, "data/current"),
      sourcesPath: resolve(baseDir, "packages/sources/sources.yaml"),
      exportsDir: resolve(baseDir, "data/exports"),
    });
  });
});

function parserReturning(
  id: string,
  recordsBySourceId: Record<string, PlacementRecord[]>,
): SourceParser {
  return {
    id,
    match: () => true,
    async parse(input): Promise<ParserResult> {
      if (input.emails.some((email) => email.endsWith(".jpg"))) {
        throw new Error("Asset-like email was not filtered before parsing.");
      }

      const records = recordsBySourceId[input.sourceId] ?? [];
      return {
        records,
        warnings: records.some((record) => record.confidence === "low")
          ? ["Synthetic parser warning."]
          : [],
        parserName: id,
        confidence: records.some((record) => record.confidence === "low") ? "low" : "medium",
      };
    },
  };
}

function placement(
  sourceId: string,
  sourceUrl: string,
  confidence: PlacementRecord["confidence"],
  overrides: Partial<PlacementRecordInput> = {},
): PlacementRecord {
  const input: PlacementRecordInput = {
    id: "temporary",
    sourceId,
    institutionName: "Example Hospital",
    department: "Innere Medizin",
    departmentNormalized: "internal-medicine",
    originalDepartmentName: "Innere Medizin",
    roleType: "Unterassistenz",
    roleTypeOriginal: "Unterassistenz",
    country: "CH",
    canton: "ZH",
    city: "Zuerich",
    language: "de",
    sourceLanguage: "de",
    region: "de-CH",
    availabilityStatus: "available-from",
    availableFrom: "2027-07",
    fullyBookedUntil: null,
    durationMinWeeks: 4,
    durationMaxWeeks: 16,
    applicationLeadTimeMonths: null,
    applicationMethod: "online-form",
    applicationUrl: sourceUrl,
    contactEmail: null,
    contactName: null,
    eligibilityNotes: null,
    languageRequirement: null,
    compensation: null,
    housing: null,
    sourceUrl,
    sourceTitle: "Synthetic placement",
    extractedSnippet: "Unterassistenz Innere Medizin ab Juli 2027.",
    sourceLastModified: null,
    lastChecked: "2026-07-07T08:00:00.000Z",
    extractionMethod: "site-parser",
    extractionLanguage: "de",
    confidence,
    reviewStatus: confidence === "low" ? "needs-human-review" : "auto-published",
    warnings: confidence === "low" ? ["Synthetic low confidence record."] : [],
    ...overrides,
  };
  return { ...input, id: makePlacementId(input) } as PlacementRecord;
}

function snapshot(
  sourceId: string,
  url: string,
  overrides: Partial<SnapshotRecord> = {},
): SnapshotRecord {
  return {
    sourceId,
    url,
    fetchedAt: "2026-07-07T08:00:00.000Z",
    statusCode: 200,
    contentType: "text/html",
    rawHash: `raw-${sourceId}`,
    textHash: `text-${sourceId}`,
    title: "Synthetic placement",
    visibleText: "Unterassistenz Innere Medizin ab Juli 2027. Bewerbung online.",
    extractedLinks: [{ text: "Bewerbung", href: url }],
    extractedEmails: [],
    fetchModeUsed: "html",
    error: null,
    ...overrides,
  };
}

function changeFor(record: PlacementRecord): ChangeRecord {
  return {
    id: "change-test",
    sourceId: record.sourceId,
    url: record.sourceUrl,
    detectedAt: "2026-07-07T08:00:00.000Z",
    changeType: "content-changed",
    severity: "review",
    before: null,
    after: record,
    message: `Changed page for ${record.institutionName}.`,
  };
}

function emptyParserHealth(): ParserHealthReport {
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

async function writeSnapshot(snapshotsDir: string, record: SnapshotRecord): Promise<void> {
  await mkdir(snapshotsDir, { recursive: true });
  await writeFile(
    join(snapshotsDir, `${record.sourceId}.snapshot.json`),
    `${JSON.stringify(record, null, 2)}\n`,
    "utf8",
  );
}

async function writeSources(
  sourcesPath: string,
  sources: Array<[id: string, url: string, expectedParser: string]>,
): Promise<void> {
  const yaml = sources
    .map(
      ([id, url, expectedParser]) => `- id: ${id}
  institutionName: "Example Hospital"
  institutionType: "hospital"
  canton: "ZH"
  city: "Zuerich"
  language: "de"
  sourceLanguage: "de"
  region: "de-CH"
  country: "CH"
  sourceUrls:
    - url: "${url}"
      pageType: "hospital-placement-page"
      expectedParser: "${expectedParser}"
      fetchMode: "html"
  notes: "Synthetic source for static data builder tests."
  priority: 1
  status: "candidate"
`,
    )
    .join("\n");
  await writeFile(sourcesPath, yaml, "utf8");
}

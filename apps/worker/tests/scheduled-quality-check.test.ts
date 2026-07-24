import { resolve } from "node:path";
import type { PlacementRecord, SourceRegistryEntry } from "@scpi/schema";
import { describe, expect, it } from "vitest";
import {
  evaluateScheduledQuality,
  parseScheduledQualityArgs,
} from "../src/scheduled-quality-check.js";

describe("scheduled quality check", () => {
  it("passes a stable scheduled refresh and reports expected review warnings", () => {
    const report = evaluateScheduledQuality({
      placements: [placement()],
      sources: [source()],
      crawlReport: crawlReport(),
      previousPlacements: [placement()],
      maxFailureRate: 0.15,
      maxRecordDropRate: 0.25,
      now: new Date("2026-07-24T12:00:00.000Z"),
    });

    expect(report.passed).toBe(true);
    expect(report.errors).toEqual([]);
    expect(report.metrics).toMatchObject({
      placementCount: 1,
      previousPlacementCount: 1,
      crawlFailureRate: 0,
      duplicatePlacementIdCount: 0,
      orphanSourceReferenceCount: 0,
    });
  });

  it("fails large record drops, crawl failures, and unsafe generic publication", () => {
    const unsafe = placement({
      extractionMethod: "generic-parser",
      reviewStatus: "auto-published",
    });
    const report = evaluateScheduledQuality({
      placements: [unsafe],
      sources: [source()],
      crawlReport: crawlReport({ urlCount: 10, successCount: 7, failureCount: 3 }),
      previousPlacements: Array.from({ length: 4 }, (_, index) =>
        placement({ id: `previous-${index}` }),
      ),
      maxFailureRate: 0.15,
      maxRecordDropRate: 0.25,
      now: new Date("2026-07-24T12:00:00.000Z"),
    });

    expect(report.passed).toBe(false);
    expect(report.errors.join(" ")).toMatch(/failure rate/i);
    expect(report.errors.join(" ")).toMatch(/dropped/i);
    expect(report.errors.join(" ")).toMatch(/bypass human review/i);
  });

  it("fails contradictory availability and orphan source references", () => {
    const report = evaluateScheduledQuality({
      placements: [
        placement({
          sourceId: "missing-source",
          availabilityStatus: "available-from",
          availableFrom: null,
        }),
      ],
      sources: [source()],
      crawlReport: crawlReport(),
      previousPlacements: null,
      maxFailureRate: 0.15,
      maxRecordDropRate: 0.25,
      now: new Date("2026-07-24T12:00:00.000Z"),
    });

    expect(report.passed).toBe(false);
    expect(report.metrics.orphanSourceReferenceCount).toBe(1);
    expect(report.metrics.contradictoryAvailabilityCount).toBe(1);
  });

  it("parses CLI thresholds and output paths", () => {
    const baseDir = process.env.INIT_CWD ?? process.cwd();
    const options = parseScheduledQualityArgs([
      "--data",
      "data/current",
      "--crawl-report",
      "data/snapshots/current-run/crawler-report.json",
      "--previous",
      "previous.json",
      "--max-failure-rate",
      "0.1",
      "--max-record-drop-rate",
      "0.2",
    ]);

    expect(options).toMatchObject({
      dataDir: expect.stringContaining("data"),
      previousPlacementsPath: expect.stringContaining("previous.json"),
      maxFailureRate: 0.1,
      maxRecordDropRate: 0.2,
    });
    expect(options.outPath).toBe(resolve(baseDir, "data/current", "scheduled-quality-report.json"));
  });
});

function crawlReport(
  overrides: Partial<{
    sourceCount: number;
    urlCount: number;
    successCount: number;
    failureCount: number;
    skippedCount: number;
    duplicateUrlCount: number;
  }> = {},
) {
  return {
    sourceCount: 1,
    urlCount: 1,
    successCount: 1,
    failureCount: 0,
    skippedCount: 0,
    duplicateUrlCount: 0,
    ...overrides,
  };
}

function source(overrides: Partial<SourceRegistryEntry> = {}): SourceRegistryEntry {
  return {
    id: "example-source",
    institutionName: "Spital Beispiel",
    institutionType: "hospital",
    canton: "ZH",
    city: "Zürich",
    language: "de",
    sourceLanguage: "de",
    region: "de-CH",
    country: "CH",
    sourceUrls: [
      {
        url: "https://example.ch/placement",
        pageType: "placement",
        expectedParser: "generic",
        fetchMode: "html",
      },
    ],
    notes: "Synthetic source.",
    priority: 1,
    status: "candidate",
    ...overrides,
  };
}

function placement(overrides: Partial<PlacementRecord> = {}): PlacementRecord {
  return {
    id: "example-placement",
    sourceId: "example-source",
    institutionName: "Spital Beispiel",
    department: "Innere Medizin",
    departmentNormalized: "internal-medicine",
    roleType: "Unterassistenz",
    country: "CH",
    canton: "ZH",
    city: "Zürich",
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
    sourceUrl: "https://example.ch/placement",
    sourceTitle: "Unterassistenz",
    extractedSnippet: "Unterassistenz Innere Medizin.",
    sourceLastModified: null,
    lastChecked: "2026-07-24T08:00:00.000Z",
    extractionMethod: "generic-parser",
    extractionLanguage: "de",
    confidence: "low",
    reviewStatus: "needs-human-review",
    warnings: ["Synthetic fixture."],
    ...overrides,
  };
}

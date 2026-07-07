import type { PlacementRecord, PlacementRecordInput, SourceRegistryEntry } from "@scpi/schema";
import { makePlacementId } from "@scpi/schema";
import { describe, expect, it } from "vitest";
import { buildReliabilityAuditReport } from "../src/reliability-audit.js";

describe("reliability audit", () => {
  it("summarizes multilingual source-only coverage and sparse placement risks", () => {
    const sources = [
      source("de-source", "de", "de-CH", "candidate"),
      source("fr-source", "fr", "fr-CH", "needs-review"),
      source("it-source", "it", "it-CH", "candidate", "pdf"),
    ];
    const placements = [
      placement("de-source", {
        confidence: "medium",
        reviewStatus: "auto-published",
        extractedSnippet: null,
      }),
    ];

    const report = buildReliabilityAuditReport(sources, placements, "2026-07-07T08:00:00.000Z");

    expect(report).toMatchObject({
      sourceCount: 3,
      placementCount: 1,
      countsBySourceLanguage: {
        de: 1,
        fr: 1,
        it: 1,
      },
      placementCountsBySourceLanguage: {
        de: 1,
      },
      manualVerificationSourceCount: 3,
      sparsePlacementCount: 1,
      riskyPublishedPlacementCount: 1,
    });
    expect(report.languageSummaries).toContainEqual(
      expect.objectContaining({
        sourceLanguage: "fr",
        sources: 1,
        placements: 0,
        status: "source-only",
      }),
    );
    expect(report.languageSummaries).toContainEqual(
      expect.objectContaining({
        sourceLanguage: "it",
        sources: 1,
        placements: 0,
        status: "source-only",
      }),
    );
    expect(report.phaseChecks).toContainEqual(
      expect.objectContaining({
        phase: "E",
        status: "warning",
      }),
    );
    expect(report.sourceIssues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceId: "it-source",
          reason: "special fetch mode: pdf",
        }),
      ]),
    );
    expect(report.placementIssues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceId: "de-source",
          reason: "missing extracted source snippet",
        }),
      ]),
    );
  });
});

function source(
  id: string,
  sourceLanguage: SourceRegistryEntry["sourceLanguage"],
  region: SourceRegistryEntry["region"],
  status: SourceRegistryEntry["status"],
  fetchMode: SourceRegistryEntry["sourceUrls"][number]["fetchMode"] = "html",
): SourceRegistryEntry {
  return {
    id,
    institutionName: "Example Hospital",
    institutionType: "hospital",
    canton: region === "it-CH" ? "TI" : region === "fr-CH" ? "VD" : "ZH",
    city: "Example",
    language:
      sourceLanguage === "mixed" ? "de" : sourceLanguage === "unknown" ? "de" : sourceLanguage,
    sourceLanguage,
    region,
    country: "CH",
    sourceUrls: [
      {
        url: `https://example.ch/${id}`,
        pageType: "hospital-placement-page",
        expectedParser: "generic",
        fetchMode,
      },
    ],
    notes: "Synthetic source for reliability audit tests.",
    priority: 1,
    status,
  };
}

function placement(
  sourceId: string,
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
    applicationUrl: "https://example.ch/apply",
    contactEmail: null,
    contactName: null,
    eligibilityNotes: null,
    languageRequirement: null,
    compensation: null,
    housing: null,
    sourceUrl: `https://example.ch/${sourceId}`,
    sourceTitle: "Synthetic placement",
    extractedSnippet: "Unterassistenz Innere Medizin ab Juli 2027.",
    sourceLastModified: null,
    lastChecked: "2026-07-07T08:00:00.000Z",
    extractionMethod: "generic-parser",
    extractionLanguage: "de",
    confidence: "medium",
    reviewStatus: "needs-human-review",
    warnings: [],
    ...overrides,
  };
  return { ...input, id: makePlacementId(input) } as PlacementRecord;
}

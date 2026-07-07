import {
  type LeadTimeEvidence,
  makeLeadTimePlacementKey,
  makeLeadTimeSummaryId,
  makePlacementId,
  type PlacementRecord,
  type PlacementRecordInput,
} from "@scpi/schema";
import { describe, expect, it } from "vitest";
import {
  buildLeadTimeData,
  evidenceForRecord,
  summarizeLeadTimeEvidence,
} from "../src/lead-time.js";

describe("lead-time data", () => {
  it("generates explicit-source and historical-observed evidence from placement records", () => {
    const record = placement({
      applicationLeadTimeMonths: 12,
      explicitApplicationLeadTimeMonths: 12,
      availableFrom: "2027-07",
      lastChecked: "2026-07-07T08:00:00.000Z",
    });
    const result = buildLeadTimeData([record]);

    expect(result.placements[0]).toMatchObject({
      explicitApplicationLeadTimeMonths: 12,
      observedMonthsAhead: 12,
      leadTimeSummaryId: makeLeadTimeSummaryId(makeLeadTimePlacementKey(record)),
    });
    expect(result.evidence).toHaveLength(2);
    expect(result.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          evidenceType: "explicit-source",
          monthsAhead: 12,
          targetStartMonth: "2027-07",
        }),
        expect.objectContaining({
          evidenceType: "historical-observed",
          monthsAhead: 12,
          confidence: "low",
        }),
      ]),
    );
    expect(result.summaries[0]).toMatchObject({
      basis: "explicit-source",
      confidence: "medium",
      recommendedApplyAheadMinMonths: 12,
      recommendedApplyAheadMaxMonths: 12,
    });
  });

  it("does not treat one historical observation as a medium-confidence recommendation", () => {
    const record = placement({
      availableFrom: "2027-07",
      lastChecked: "2026-07-07T08:00:00.000Z",
    });
    const evidence = evidenceForRecord({
      ...record,
      observedMonthsAhead: 12,
      leadTimeSummaryId: makeLeadTimeSummaryId(makeLeadTimePlacementKey(record)),
    });
    const summary = summarizeLeadTimeEvidence(evidence)[0];

    expect(summary).toMatchObject({
      basis: "historical-observed",
      confidence: "low",
      recommendedApplyAheadMinMonths: null,
      recommendedApplyAheadMaxMonths: null,
      observationCount: 1,
    });
    expect(summary?.warnings).toContain(
      "Estimated recommendation is based on fewer than 3 observations.",
    );
  });

  it("lets hospital-confirmed evidence override explicit and historical evidence", () => {
    const record = placement();
    const placementKey = makeLeadTimePlacementKey(record);
    const summary = summarizeLeadTimeEvidence([
      evidence(record, placementKey, "historical-observed", 8, "low"),
      evidence(record, placementKey, "explicit-source", 12, "medium"),
      evidence(record, placementKey, "hospital-confirmed", 6, "high"),
    ])[0];

    expect(summary).toMatchObject({
      basis: "hospital-confirmed",
      confidence: "high",
      recommendedApplyAheadMinMonths: 6,
      recommendedApplyAheadMaxMonths: 6,
    });
  });
});

function evidence(
  record: PlacementRecord,
  placementKey: string,
  evidenceType: LeadTimeEvidence["evidenceType"],
  monthsAhead: number,
  confidence: LeadTimeEvidence["confidence"],
): LeadTimeEvidence {
  return {
    id: `${evidenceType}-${monthsAhead}`,
    placementId: record.id,
    placementKey,
    sourceId: record.sourceId,
    sourceUrl: record.sourceUrl,
    evidenceType,
    monthsAhead,
    targetStartMonth: "2027-07",
    observedAt: record.lastChecked,
    confidence,
    label: `${evidenceType} ${monthsAhead}`,
    notes: null,
  };
}

function placement(overrides: Partial<PlacementRecordInput> = {}): PlacementRecord {
  const input: PlacementRecordInput = {
    id: "temporary",
    sourceId: "example-source",
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
    availableFrom: null,
    fullyBookedUntil: null,
    durationMinWeeks: 4,
    durationMaxWeeks: 16,
    applicationLeadTimeMonths: null,
    explicitApplicationLeadTimeMonths: null,
    observedMonthsAhead: null,
    leadTimeSummaryId: null,
    applicationMethod: "online-form",
    applicationUrl: "https://example.ch/apply",
    contactEmail: null,
    contactName: null,
    eligibilityNotes: null,
    languageRequirement: null,
    compensation: null,
    housing: null,
    sourceUrl: "https://example.ch/placement",
    sourceTitle: "Example placement",
    extractedSnippet: "Bewerbungen 12 Monate im Voraus.",
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

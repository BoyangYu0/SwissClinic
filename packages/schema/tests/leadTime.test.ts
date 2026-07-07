import { describe, expect, it } from "vitest";
import {
  LeadTimeEvidenceSchema,
  LeadTimeSummarySchema,
  makeLeadTimeEvidenceId,
  makeLeadTimePlacementKey,
  makeLeadTimeSummaryId,
} from "../src/leadTime.js";

describe("lead-time schemas", () => {
  it("validates explicit lead-time evidence and summaries", () => {
    const placementKey = makeLeadTimePlacementKey({
      sourceId: "example-source",
      institutionName: "Example Hospital",
      departmentNormalized: "internal-medicine",
      department: "Innere Medizin",
      roleType: "Unterassistenz",
    });
    const evidence = LeadTimeEvidenceSchema.parse({
      id: makeLeadTimeEvidenceId({
        placementId: "placement-1",
        evidenceType: "explicit-source",
        monthsAhead: 12,
        targetStartMonth: "2027-07",
        observedAt: "2026-07-07T08:00:00.000Z",
      }),
      placementId: "placement-1",
      placementKey,
      sourceId: "example-source",
      sourceUrl: "https://example.ch/placement",
      evidenceType: "explicit-source",
      monthsAhead: 12,
      targetStartMonth: "2027-07",
      observedAt: "2026-07-07T08:00:00.000Z",
      confidence: "medium",
      label: "Explicitly stated by source: apply 12 months ahead.",
      notes: null,
    });
    const summary = LeadTimeSummarySchema.parse({
      id: makeLeadTimeSummaryId(placementKey),
      placementKey,
      sourceId: "example-source",
      recommendedApplyAheadMinMonths: 12,
      recommendedApplyAheadMaxMonths: 12,
      medianObservedMonthsAhead: null,
      observedRangeMinMonths: null,
      observedRangeMaxMonths: null,
      evidenceCount: 1,
      observationCount: 0,
      basis: "explicit-source",
      confidence: "medium",
      label: "Explicitly stated by source: apply 12 months ahead.",
      warnings: [],
    });

    expect(evidence.id).toMatch(/^leadtime-evidence-[a-f0-9]{12}$/);
    expect(summary.id).toBe(makeLeadTimeSummaryId(placementKey));
  });

  it("rejects inverted recommended apply-ahead windows", () => {
    const result = LeadTimeSummarySchema.safeParse({
      id: "summary",
      placementKey: "placement-key",
      sourceId: "example-source",
      recommendedApplyAheadMinMonths: 18,
      recommendedApplyAheadMaxMonths: 12,
      medianObservedMonthsAhead: null,
      observedRangeMinMonths: null,
      observedRangeMaxMonths: null,
      evidenceCount: 1,
      observationCount: 0,
      basis: "estimated",
      confidence: "low",
      label: "Estimated lead time.",
      warnings: [],
    });

    expect(result.success).toBe(false);
  });
});

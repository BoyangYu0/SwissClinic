import {
  type ChangeRecord,
  makePlacementId,
  type PlacementRecord,
  type PlacementRecordInput,
  type SourceRegistryEntry,
} from "@scpi/schema";
import { describe, expect, it } from "vitest";
import { filterPlacements } from "../src/placement-index.js";
import { renderPlacementIndexPage, renderSourceDetailPage } from "../src/render.js";

const lastChecked = "2026-07-07T08:00:00.000Z";

describe("placement index frontend", () => {
  it("renders sample records with filters, badges, source links, and warnings", () => {
    const placements = [
      placement({ confidence: "high", reviewStatus: "auto-published", warnings: [] }),
      placement({
        sourceId: "low-source",
        sourceUrl: "https://example.ch/low",
        institutionName: "Example Review Hospital",
        availabilityStatus: "not-specified",
        confidence: "low",
        reviewStatus: "needs-human-review",
        warnings: ["Availability phrase needs review."],
        explicitApplicationLeadTimeMonths: null,
        observedMonthsAhead: 12,
        leadTimeSummaryId: "leadtime-summary-low",
      }),
    ];

    const html = renderPlacementIndexPage({
      placements,
      sources: [source("example-source"), source("low-source")],
      leadTimeSummaries: [
        {
          id: "leadtime-summary-example",
          placementKey: "example",
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
        },
        {
          id: "leadtime-summary-low",
          placementKey: "low",
          sourceId: "low-source",
          recommendedApplyAheadMinMonths: null,
          recommendedApplyAheadMaxMonths: null,
          medianObservedMonthsAhead: 12,
          observedRangeMinMonths: 12,
          observedRangeMaxMonths: 12,
          evidenceCount: 1,
          observationCount: 1,
          basis: "historical-observed",
          confidence: "low",
          label: "Estimated lead time is low confidence and should not be treated as fact.",
          warnings: ["Estimated recommendation is based on fewer than 3 observations."],
        },
      ],
      csvHref: "data/exports/placements.csv",
      dataHref: "data/current/placements.json",
    });

    expect(html).toContain("Swiss Clinical Placement Index");
    expect(html).toContain('name="canton"');
    expect(html).toContain('name="availabilityStatus"');
    expect(html).toContain('<option value="not-specified">Not specified</option>');
    expect(html).toContain('name="region"');
    expect(html).toContain("Example Hospital");
    expect(html).toContain("Example Review Hospital");
    expect(html).toContain("internal-medicine");
    expect(html).toContain("Extraction language");
    expect(html).toContain("needs-human-review");
    expect(html).toContain("Needs human review");
    expect(html).toContain("Availability phrase needs review.");
    expect(html).toContain("https://example.ch/placement");
    expect(html).toContain("No placement records match the selected filters.");
    expect(html).toContain("data/exports/placements.csv");
    expect(html).toContain("Source detail");
    expect(html).toContain('value === null || value === undefined ? ""');
    expect(html).toContain("Explicit lead time");
    expect(html).toContain("explicitly stated by source");
    expect(html).toContain("estimated from public page history");
    expect(html).toContain("Warning: low confidence estimate.");
  });

  it("filters records by search and structured fields", () => {
    const placements = [
      placement(),
      placement({
        sourceId: "bern-source",
        sourceUrl: "https://example.ch/bern",
        institutionName: "Bern Hospital",
        canton: "BE",
        city: "Bern",
        department: "Chirurgie",
        roleType: "PJ",
        originalDepartmentName: "Chirurgie",
        departmentNormalized: "surgery",
        availabilityStatus: "not-specified",
        confidence: "medium",
        language: "de",
        sourceLanguage: "de",
        region: "de-CH",
        extractionLanguage: "de",
      }),
    ];

    expect(filterPlacements(placements, { query: "bern" })).toHaveLength(1);
    expect(filterPlacements(placements, { canton: "ZH" })).toHaveLength(1);
    expect(filterPlacements(placements, { department: "surgery", roleType: "PJ" })).toHaveLength(1);
    expect(filterPlacements(placements, { language: "de", region: "de-CH" })).toHaveLength(2);
    expect(filterPlacements(placements, { availabilityStatus: "available" })).toHaveLength(1);
    expect(filterPlacements(placements, { confidence: "low" })).toHaveLength(0);
  });

  it("renders a source detail page with provenance, records, warnings, and changes", () => {
    const record = placement({
      confidence: "low",
      reviewStatus: "needs-human-review",
      warnings: ["Parser could not infer exact month."],
    });
    const html = renderSourceDetailPage({
      source: source("example-source"),
      placements: [record],
      changes: [change("example-source")],
      indexHref: "../../index.html",
    });

    expect(html).toContain("Example Hospital");
    expect(html).toContain("https://example.ch/placement");
    expect(html).toContain("Last checked");
    expect(html).toContain("site-parser");
    expect(html).toContain("needs-human-review");
    expect(html).toContain("Innere Medizin");
    expect(html).toContain("Availability changed for Example Hospital.");
    expect(html).toContain("Parser could not infer exact month.");
  });

  it("renders a graceful missing source page", () => {
    const html = renderSourceDetailPage({
      source: null,
      placements: [],
      changes: [],
      indexHref: "../../index.html",
    });

    expect(html).toContain("Source not found");
    expect(html).toContain("This source is not present in the current static dataset.");
    expect(html).toContain("../../index.html");
  });
});

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
    availabilityStatus: "available",
    availableFrom: null,
    fullyBookedUntil: null,
    durationMinWeeks: 4,
    durationMaxWeeks: 16,
    applicationLeadTimeMonths: null,
    explicitApplicationLeadTimeMonths: 12,
    observedMonthsAhead: 12,
    leadTimeSummaryId: "leadtime-summary-example",
    applicationMethod: "online-form",
    applicationUrl: "https://example.ch/apply",
    contactEmail: "placement@example.ch",
    contactName: null,
    eligibilityNotes: null,
    languageRequirement: null,
    compensation: null,
    housing: "yes",
    sourceUrl: "https://example.ch/placement",
    sourceTitle: "Example source",
    extractedSnippet: "Unterassistenz Innere Medizin available.",
    sourceLastModified: null,
    lastChecked,
    extractionMethod: "site-parser",
    extractionLanguage: "de",
    confidence: "high",
    reviewStatus: "auto-published",
    warnings: [],
    ...overrides,
  };

  return { ...input, id: makePlacementId(input) } as PlacementRecord;
}

function source(id: string): SourceRegistryEntry {
  return {
    id,
    institutionName: "Example Hospital",
    institutionType: "hospital",
    canton: "ZH",
    city: "Zuerich",
    language: "de",
    country: "CH",
    sourceUrls: [
      {
        url: "https://example.ch/placement",
        pageType: "hospital-placement-page",
        expectedParser: "generic",
        fetchMode: "html",
      },
    ],
    notes: "Synthetic frontend test source.",
    priority: 1,
    status: "candidate",
  };
}

function change(sourceId: string): ChangeRecord {
  return {
    id: "change-example",
    sourceId,
    url: "https://example.ch/placement",
    detectedAt: lastChecked,
    changeType: "availability-changed",
    severity: "review",
    before: {
      availabilityStatus: "not-specified",
      availableFrom: null,
      fullyBookedUntil: null,
    },
    after: {
      availabilityStatus: "available",
      availableFrom: null,
      fullyBookedUntil: null,
    },
    message: "Availability changed for Example Hospital.",
  };
}

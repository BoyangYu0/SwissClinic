import { type PlacementRecord, PlacementRecordSchema } from "@scpi/schema";
import { describe, expect, it } from "vitest";
import { diffPlacementRecords } from "../src/diff.js";

describe("diffPlacementRecords", () => {
  it("creates an availability-changed record when availability changes", () => {
    const before = makePlacement({
      availabilityStatus: "available-from",
      availableFrom: "2027-07",
    });
    const after = makePlacement({
      availabilityStatus: "fully-booked-until",
      availableFrom: null,
      fullyBookedUntil: "2027-12",
    });

    const changes = diffPlacementRecords([before], [after]);

    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      sourceId: "usz-neuroradiologie",
      url: "https://www.usz.ch/example",
      detectedAt: "2026-07-07T08:00:00.000Z",
      changeType: "availability-changed",
      severity: "review",
      before: {
        availabilityStatus: "available-from",
        availableFrom: "2027-07",
        fullyBookedUntil: null,
      },
      after: {
        availabilityStatus: "fully-booked-until",
        availableFrom: null,
        fullyBookedUntil: "2027-12",
      },
    });
    expect(changes[0]?.message).toContain("Availability changed");
  });

  it("creates a record-added change for new placement records", () => {
    const record = makePlacement();

    const changes = diffPlacementRecords([], [record]);

    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      changeType: "record-added",
      severity: "info",
      before: null,
      after: record,
      message: "Placement added: Universitätsspital Zürich / Neuroradiologie / Unterassistenz.",
    });
  });

  it("ignores lastChecked-only changes", () => {
    const before = makePlacement({ lastChecked: "2026-07-07T08:00:00.000Z" });
    const after = makePlacement({ lastChecked: "2026-07-08T08:00:00.000Z" });

    expect(diffPlacementRecords([before], [after])).toEqual([]);
  });

  it("creates parser-output-changed when non-availability record fields change", () => {
    const before = makePlacement({ compensation: "CHF 1'100 pro Monat" });
    const after = makePlacement({ compensation: "CHF 1'200 pro Monat" });

    const changes = diffPlacementRecords([before], [after]);

    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      changeType: "parser-output-changed",
      severity: "review",
      before,
      after,
    });
  });
});

function makePlacement(overrides: Partial<PlacementRecord> = {}): PlacementRecord {
  return PlacementRecordSchema.parse({
    id: "usz-neuroradiologie-unterassistenz",
    sourceId: "usz-neuroradiologie",
    institutionName: "Universitätsspital Zürich",
    department: "Neuroradiologie",
    departmentNormalized: "Neuroradiologie",
    roleType: "Unterassistenz",
    country: "CH",
    canton: "ZH",
    city: "Zürich",
    language: "de",
    availabilityStatus: "available-from",
    availableFrom: "2027-07",
    fullyBookedUntil: null,
    durationMinWeeks: 4,
    durationMaxWeeks: 16,
    applicationLeadTimeMonths: null,
    applicationMethod: "online-form",
    applicationUrl: "https://jobs.usz.ch/example",
    contactEmail: "education@example.ch",
    contactName: "Education Office",
    eligibilityNotes: null,
    languageRequirement: "Deutsch B2",
    compensation: "CHF 1'100 pro Monat",
    housing: "unknown",
    sourceUrl: "https://www.usz.ch/example",
    sourceTitle: "Unterassistenzen Neuroradiologie",
    extractedSnippet: "Bewerbung für das Jahr 2027",
    sourceLastModified: null,
    lastChecked: "2026-07-07T08:00:00.000Z",
    extractionMethod: "generic-parser",
    confidence: "medium",
    reviewStatus: "needs-human-review",
    warnings: [],
    ...overrides,
  });
}

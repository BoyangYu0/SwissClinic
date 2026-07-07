import { describe, expect, it } from "vitest";
import type { PlacementRecordInput } from "../src/placement.js";
import { makePlacementId, PlacementRecordSchema } from "../src/placement.js";

const validMinimumRecord: PlacementRecordInput = {
  id: "placeholder-id",
  sourceId: "ksw-winterthur-unterassistenz-famulatur-wahlstudienjahr",
  institutionName: "Kantonsspital Winterthur",
  department: null,
  departmentNormalized: null,
  roleType: "Unknown",
  country: "CH",
  canton: "ZH",
  city: "Winterthur",
  language: "de",
  availabilityStatus: "not-specified",
  availableFrom: null,
  fullyBookedUntil: null,
  durationMinWeeks: null,
  durationMaxWeeks: null,
  applicationLeadTimeMonths: null,
  applicationMethod: "not-specified",
  applicationUrl: null,
  contactEmail: null,
  contactName: null,
  eligibilityNotes: null,
  languageRequirement: null,
  compensation: null,
  housing: null,
  sourceUrl:
    "https://www.ksw.ch/jobs-karriere/ausbildung/unterassistenz-famulatur-wahlstudienjahr/",
  sourceTitle: null,
  extractedSnippet: null,
  sourceLastModified: null,
  lastChecked: "2026-07-06T20:00:00.000Z",
  extractionMethod: "manual",
  confidence: "medium",
  reviewStatus: "needs-human-review",
  warnings: [],
};

describe("PlacementRecordSchema", () => {
  it("accepts a valid minimum record", () => {
    const parsed = PlacementRecordSchema.parse(validMinimumRecord);

    expect(parsed.institutionName).toBe("Kantonsspital Winterthur");
    expect(parsed.sourceLanguage).toBe("unknown");
    expect(parsed.region).toBe("unknown");
    expect(parsed.originalDepartmentName).toBeNull();
    expect(parsed.roleTypeOriginal).toBeNull();
    expect(parsed.extractionLanguage).toBe("unknown");
    expect(parsed.explicitApplicationLeadTimeMonths).toBeNull();
    expect(parsed.observedMonthsAhead).toBeNull();
    expect(parsed.leadTimeSummaryId).toBeNull();
  });

  it("rejects invalid availableFrom values", () => {
    const result = PlacementRecordSchema.safeParse({
      ...validMinimumRecord,
      availableFrom: "July 2027",
    });

    expect(result.success).toBe(false);
  });

  it("rejects invalid source URLs", () => {
    const result = PlacementRecordSchema.safeParse({
      ...validMinimumRecord,
      sourceUrl: "not-a-url",
    });

    expect(result.success).toBe(false);
  });

  it("rejects invalid confidence values", () => {
    const result = PlacementRecordSchema.safeParse({
      ...validMinimumRecord,
      confidence: "certain",
    });

    expect(result.success).toBe(false);
  });

  it("generates stable placement IDs across repeated calls", () => {
    const record = {
      ...validMinimumRecord,
      department: "Innere Medizin",
      departmentNormalized: "innere-medizin",
      roleType: "Unterassistenz",
    } satisfies PlacementRecordInput;

    expect(makePlacementId(record)).toBe(makePlacementId(record));
    expect(makePlacementId(record)).toMatch(
      /^kantonsspital-winterthur-innere-medizin-unterassistenz-[a-f0-9]{12}$/,
    );
  });

  it("requires a warning when confidence is low", () => {
    const result = PlacementRecordSchema.safeParse({
      ...validMinimumRecord,
      confidence: "low",
      warnings: [],
    });

    expect(result.success).toBe(false);
  });
});

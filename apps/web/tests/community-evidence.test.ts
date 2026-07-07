import {
  type LeadTimeReport,
  makePlacementId,
  type PlacementRecord,
  type PlacementRecordInput,
  type VerificationEvidence,
} from "@scpi/schema";
import { describe, expect, it } from "vitest";
import { buildReliabilitySummaries, computeMonthsAhead } from "../src/community-evidence.js";
import {
  buildCommunityEvidenceIssueUrl,
  buildLeadTimeReportPayload,
  buildVerificationEvidencePayload,
} from "../src/review-mode.js";

const createdAt = "2026-07-07T08:00:00.000Z";

describe("community evidence", () => {
  it("calculates computedMonthsAhead from application and desired start months", () => {
    expect(computeMonthsAhead("2026-07", "2027-07")).toBe(12);
    expect(computeMonthsAhead("2026-12", "2027-03")).toBe(3);
  });

  it("summarizes positive verification reports as student checked", () => {
    const record = placement();
    const [summary] = buildReliabilitySummaries(
      [record],
      [
        verification(record.id, { verdict: "correct", officialSourceCorrect: "yes" }),
        verification(record.id, { verdict: "correct", officialSourceCorrect: "yes" }),
      ],
      [],
    );

    expect(summary?.verificationCount).toBe(2);
    expect(summary?.positiveReports).toBe(2);
    expect(summary?.reliabilityLabel).toBe("multiple-student-checked");
  });

  it("detects conflicting verification reports", () => {
    const record = placement();
    const [summary] = buildReliabilitySummaries(
      [record],
      [
        verification(record.id, { verdict: "correct", officialSourceCorrect: "yes" }),
        verification(record.id, { verdict: "wrong", officialSourceCorrect: "no" }),
      ],
      [],
    );

    expect(summary?.conflictingReports).toBe(2);
    expect(summary?.reliabilityLabel).toBe("conflicting-reports");
  });

  it("computes community lead-time median and range from at least three usable reports", () => {
    const record = placement();
    const [summary] = buildReliabilitySummaries(
      [record],
      [],
      [leadTimeReport(record, 10), leadTimeReport(record, 12), leadTimeReport(record, 14)],
    );

    expect(summary?.leadTimeReportCount).toBe(3);
    expect(summary?.communityLeadTimeMedianMonthsAhead).toBe(12);
    expect(summary?.communityLeadTimeRangeMinMonthsAhead).toBe(10);
    expect(summary?.communityLeadTimeRangeMaxMonthsAhead).toBe(14);
  });

  it("does not produce a community lead-time recommendation from fewer than three reports", () => {
    const record = placement();
    const [summary] = buildReliabilitySummaries(
      [record],
      [],
      [leadTimeReport(record, 12), leadTimeReport(record, 13)],
    );

    expect(summary?.communityLeadTimeMedianMonthsAhead).toBeNull();
    expect(summary?.warnings).toContain(
      "Community lead-time reports are present but fewer than 3 usable reports.",
    );
  });

  it("builds structured GitHub issue payloads for verification and lead-time reports", () => {
    const record = placement();
    const verificationPayload = buildVerificationEvidencePayload(
      record,
      { verdict: "partly-wrong", availabilityCorrect: "no" },
      createdAt,
    );
    const leadTimePayload = buildLeadTimeReportPayload(
      record,
      {
        desiredStartMonth: "2027-07",
        applicationMonth: "2026-07",
        outcome: "accepted",
        evidenceType: "own-application",
        reviewerRegion: "fr-CH",
        comment: "Applied roughly a year ahead.",
        canDisplayAnonymously: true,
      },
      createdAt,
    );

    const verificationIssue = new URL(
      buildCommunityEvidenceIssueUrl(
        "verification",
        verificationPayload,
        "https://github.com/example/repo/issues/new",
      ),
    );
    const leadTimeIssue = new URL(
      buildCommunityEvidenceIssueUrl(
        "lead-time-report",
        leadTimePayload,
        "https://github.com/example/repo/issues/new",
      ),
    );

    expect(verificationIssue.searchParams.get("body")).toContain('"evidenceKind": "verification"');
    expect(verificationIssue.searchParams.get("body")).toContain('"availabilityCorrect": "no"');
    expect(leadTimeIssue.searchParams.get("body")).toContain('"computedMonthsAhead": 12');
    expect(leadTimeIssue.searchParams.get("body")).toContain('"canDisplayAnonymously": true');
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
    explicitApplicationLeadTimeMonths: null,
    observedMonthsAhead: null,
    leadTimeSummaryId: null,
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
    lastChecked: createdAt,
    extractionMethod: "site-parser",
    extractionLanguage: "de",
    confidence: "high",
    reviewStatus: "auto-published",
    warnings: [],
    ...overrides,
  };

  return { ...input, id: makePlacementId(input) } as PlacementRecord;
}

function verification(
  recordId: string,
  overrides: Partial<VerificationEvidence> = {},
): VerificationEvidence {
  return {
    recordId,
    reviewerRole: "medical-student",
    reviewerRegion: "de-CH",
    officialSourceCorrect: "unsure",
    departmentCorrect: "yes",
    availabilityCorrect: "yes",
    applicationLinkCorrect: "yes",
    confidenceSuggested: "unknown",
    verdict: "unknown",
    createdAt,
    ...overrides,
  };
}

function leadTimeReport(
  record: PlacementRecord,
  monthsAhead: number,
  overrides: Partial<LeadTimeReport> = {},
): LeadTimeReport {
  return {
    recordId: record.id,
    sourceId: record.sourceId,
    institutionName: record.institutionName,
    departmentNormalized: record.departmentNormalized,
    desiredStartMonth: "2027-07",
    applicationMonth: monthMinus("2027-07", monthsAhead),
    computedMonthsAhead: monthsAhead,
    outcome: "accepted",
    evidenceType: "own-application",
    reviewerRegion: "de-CH",
    comment: "",
    createdAt,
    canDisplayAnonymously: true,
    ...overrides,
  };
}

function monthMinus(month: string, monthsAhead: number): string {
  const [year = 0, monthNumber = 0] = month.split("-").map(Number);
  const zeroBased = year * 12 + (monthNumber - 1) - monthsAhead;
  const resultYear = Math.floor(zeroBased / 12);
  const resultMonth = (zeroBased % 12) + 1;

  return `${resultYear}-${String(resultMonth).padStart(2, "0")}`;
}

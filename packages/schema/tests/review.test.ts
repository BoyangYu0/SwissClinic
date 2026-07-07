import { describe, expect, it } from "vitest";
import {
  LeadTimeReportSchema,
  ReliabilitySummarySchema,
  ReviewSubmissionSchema,
  VerificationEvidenceSchema,
} from "../src/review.js";

describe("ReviewSubmissionSchema", () => {
  it("accepts a structured static review submission", () => {
    const parsed = ReviewSubmissionSchema.parse({
      recordId: "record-1",
      sourceId: "source-1",
      institutionName: "Example Hospital",
      departmentNormalized: "internal-medicine",
      reviewerRole: "medical-student",
      reviewerRegion: "fr-CH",
      verdict: "partly-wrong",
      officialSourceCorrect: "yes",
      departmentCorrect: "no",
      availabilityCorrect: "unsure",
      applicationLinkCorrect: "yes",
      confidenceSuggested: "medium",
      comment: "Department name should be checked against the official page.",
      createdAt: "2026-07-07T08:00:00.000Z",
    });

    expect(parsed.verdict).toBe("partly-wrong");
    expect(parsed.departmentCorrect).toBe("no");
  });

  it("rejects invalid answers and malformed dates", () => {
    const result = ReviewSubmissionSchema.safeParse({
      recordId: "record-1",
      sourceId: "source-1",
      institutionName: "Example Hospital",
      departmentNormalized: "internal-medicine",
      verdict: "correct",
      officialSourceCorrect: "maybe",
      departmentCorrect: "yes",
      availabilityCorrect: "yes",
      applicationLinkCorrect: "yes",
      createdAt: "today",
    });

    expect(result.success).toBe(false);
  });
});

describe("community evidence schemas", () => {
  it("accepts verification evidence without source metadata", () => {
    const parsed = VerificationEvidenceSchema.parse({
      recordId: "record-1",
      reviewerRole: "medical-student",
      reviewerRegion: "it-CH",
      officialSourceCorrect: "yes",
      departmentCorrect: "yes",
      availabilityCorrect: "unsure",
      applicationLinkCorrect: "yes",
      confidenceSuggested: "medium",
      verdict: "correct",
      createdAt: "2026-07-07T08:00:00.000Z",
    });

    expect(parsed.reviewerRegion).toBe("it-CH");
    expect(parsed.verdict).toBe("correct");
  });

  it("validates computed months ahead for lead-time reports", () => {
    const parsed = LeadTimeReportSchema.parse({
      recordId: "record-1",
      sourceId: "source-1",
      institutionName: "Example Hospital",
      departmentNormalized: "internal-medicine",
      desiredStartMonth: "2027-07",
      applicationMonth: "2026-07",
      computedMonthsAhead: 12,
      outcome: "accepted",
      evidenceType: "own-application",
      reviewerRegion: "de-CH",
      comment: "",
      createdAt: "2026-07-07T08:00:00.000Z",
      canDisplayAnonymously: true,
    });

    expect(parsed.computedMonthsAhead).toBe(12);
  });

  it("rejects mismatched lead-time calculations", () => {
    const result = LeadTimeReportSchema.safeParse({
      recordId: "record-1",
      sourceId: "source-1",
      institutionName: "Example Hospital",
      departmentNormalized: "internal-medicine",
      desiredStartMonth: "2027-07",
      applicationMonth: "2026-07",
      computedMonthsAhead: 6,
      outcome: "accepted",
      evidenceType: "own-application",
      reviewerRegion: "de-CH",
      createdAt: "2026-07-07T08:00:00.000Z",
      canDisplayAnonymously: true,
    });

    expect(result.success).toBe(false);
  });

  it("accepts reliability summaries with community lead-time ranges", () => {
    const parsed = ReliabilitySummarySchema.parse({
      recordId: "record-1",
      verificationCount: 2,
      latestVerificationDate: "2026-07-08T08:00:00.000Z",
      positiveReports: 2,
      negativeReports: 0,
      conflictingReports: 0,
      leadTimeReportCount: 3,
      communityLeadTimeMedianMonthsAhead: 12,
      communityLeadTimeRangeMinMonthsAhead: 10,
      communityLeadTimeRangeMaxMonthsAhead: 14,
      reliabilityLabel: "multiple-student-checked",
      warnings: [],
    });

    expect(parsed.reliabilityLabel).toBe("multiple-student-checked");
  });
});

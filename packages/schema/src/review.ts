import { z } from "zod";
import {
  PlacementConfidenceSchema,
  PlacementRegionSchema,
  PlacementSourceLanguageSchema,
} from "./placement.js";

const isoMonthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;

export const ReviewAnswerSchema = z.enum(["yes", "no", "unsure"]);
export const ReviewVerdictSchema = z.enum([
  "correct",
  "partly-wrong",
  "wrong",
  "not-relevant",
  "unknown",
]);
export const ReviewerRoleSchema = z
  .enum(["medical-student", "resident", "doctor", "administrator", "other", "unknown"])
  .default("unknown");
export const ReviewerRegionSchema = PlacementRegionSchema.or(PlacementSourceLanguageSchema).default(
  "unknown",
);

export const ReviewSubmissionSchema = z.object({
  recordId: z.string().min(1),
  sourceId: z.string().min(1),
  institutionName: z.string().min(1),
  departmentNormalized: z.string().min(1).nullable(),
  reviewerRole: ReviewerRoleSchema,
  reviewerRegion: ReviewerRegionSchema,
  verdict: ReviewVerdictSchema,
  officialSourceCorrect: ReviewAnswerSchema,
  departmentCorrect: ReviewAnswerSchema,
  availabilityCorrect: ReviewAnswerSchema,
  applicationLinkCorrect: ReviewAnswerSchema,
  confidenceSuggested: PlacementConfidenceSchema.or(z.literal("unknown")).default("unknown"),
  comment: z.string().max(4000).default(""),
  createdAt: z.string().datetime(),
});

export const VerificationEvidenceSchema = z.object({
  recordId: z.string().min(1),
  reviewerRole: ReviewerRoleSchema,
  reviewerRegion: ReviewerRegionSchema,
  officialSourceCorrect: ReviewAnswerSchema,
  departmentCorrect: ReviewAnswerSchema,
  availabilityCorrect: ReviewAnswerSchema,
  applicationLinkCorrect: ReviewAnswerSchema,
  confidenceSuggested: PlacementConfidenceSchema.or(z.literal("unknown")).default("unknown"),
  verdict: ReviewVerdictSchema,
  createdAt: z.string().datetime(),
});

export const LeadTimeReportSchema = z
  .object({
    recordId: z.string().min(1),
    sourceId: z.string().min(1),
    institutionName: z.string().min(1),
    departmentNormalized: z.string().min(1).nullable(),
    desiredStartMonth: z.string().regex(isoMonthPattern),
    applicationMonth: z.string().regex(isoMonthPattern),
    computedMonthsAhead: z.number().int(),
    outcome: z.enum([
      "accepted",
      "rejected-full",
      "waitlisted",
      "no-response",
      "told-apply-later",
      "unknown",
    ]),
    evidenceType: z.enum([
      "own-application",
      "hospital-email-reported",
      "classmate-report",
      "official-source",
      "estimate",
    ]),
    reviewerRegion: ReviewerRegionSchema,
    comment: z.string().max(4000).default(""),
    createdAt: z.string().datetime(),
    canDisplayAnonymously: z.boolean(),
  })
  .superRefine((report, ctx) => {
    const computed = monthsBetween(report.applicationMonth, report.desiredStartMonth);

    if (computed !== report.computedMonthsAhead) {
      ctx.addIssue({
        code: "custom",
        message: "computedMonthsAhead must match desiredStartMonth minus applicationMonth.",
        path: ["computedMonthsAhead"],
      });
    }
  });

export const ReliabilitySummarySchema = z.object({
  recordId: z.string().min(1),
  verificationCount: z.number().int().nonnegative(),
  latestVerificationDate: z.string().datetime().nullable(),
  positiveReports: z.number().int().nonnegative(),
  negativeReports: z.number().int().nonnegative(),
  conflictingReports: z.number().int().nonnegative(),
  leadTimeReportCount: z.number().int().nonnegative(),
  communityLeadTimeMedianMonthsAhead: z.number().nonnegative().nullable(),
  communityLeadTimeRangeMinMonthsAhead: z.number().int().nonnegative().nullable(),
  communityLeadTimeRangeMaxMonthsAhead: z.number().int().nonnegative().nullable(),
  reliabilityLabel: z.enum([
    "unverified",
    "student-checked",
    "multiple-student-checked",
    "conflicting-reports",
    "hospital-confirmed",
  ]),
  warnings: z.array(z.string().min(1)),
});

export const ReviewSubmissionArraySchema = z.array(ReviewSubmissionSchema);
export const VerificationEvidenceArraySchema = z.array(VerificationEvidenceSchema);
export const LeadTimeReportArraySchema = z.array(LeadTimeReportSchema);
export const ReliabilitySummaryArraySchema = z.array(ReliabilitySummarySchema);

export type ReviewSubmission = z.infer<typeof ReviewSubmissionSchema>;
export type VerificationEvidence = z.infer<typeof VerificationEvidenceSchema>;
export type LeadTimeReport = z.infer<typeof LeadTimeReportSchema>;
export type ReliabilitySummary = z.infer<typeof ReliabilitySummarySchema>;

function monthsBetween(fromMonth: string, toMonth: string): number {
  const [fromYear = 0, fromMonthNumber = 0] = fromMonth.split("-").map(Number);
  const [toYear = 0, toMonthNumber = 0] = toMonth.split("-").map(Number);

  return (toYear - fromYear) * 12 + (toMonthNumber - fromMonthNumber);
}

import { z } from "zod";
import { PlacementConfidenceSchema } from "./placement.js";
import { ReviewerRoleSchema } from "./review.js";

export const FeedbackTypeSchema = z.enum([
  "wrong-availability",
  "wrong-department",
  "wrong-application-link",
  "missing-hospital-source",
  "irrelevant-source",
  "broken-source-url",
  "wrong-language-region",
  "parser-bug",
  "other",
]);

export const FeedbackStatusSchema = z.enum([
  "new",
  "triaged",
  "accepted",
  "rejected",
  "needs-evidence",
]);

export const FeedbackEvidenceTypeSchema = z.enum([
  "official-source",
  "student-review",
  "student-lead-time-report",
  "hospital-email-redacted",
  "maintainer-check",
  "other",
]);

export const FeedbackRecordSchema = z
  .object({
    id: z.string().min(1),
    placementId: z.string().min(1).nullable(),
    sourceId: z.string().min(1).nullable(),
    submittedAt: z.string().datetime(),
    submittedByRole: ReviewerRoleSchema.or(z.literal("anonymous")),
    feedbackType: FeedbackTypeSchema,
    institutionName: z.string().min(1).nullable().default(null),
    departmentNormalized: z.string().min(1).nullable().default(null),
    currentValue: z.string().max(4000).nullable(),
    suggestedValue: z.string().max(4000).nullable(),
    evidenceType: FeedbackEvidenceTypeSchema,
    evidenceUrl: z.string().url().nullable(),
    evidenceNote: z.string().max(4000).nullable(),
    confidenceSuggested: PlacementConfidenceSchema.or(z.literal("unknown")).default("unknown"),
    status: FeedbackStatusSchema,
    reviewerNote: z.string().max(4000).nullable(),
  })
  .strict()
  .superRefine((feedback, ctx) => {
    if (feedback.status === "accepted" && !feedback.reviewerNote?.trim()) {
      ctx.addIssue({
        code: "custom",
        message: "accepted feedback requires a reviewerNote explaining the accepted change.",
        path: ["reviewerNote"],
      });
    }

    if (
      !feedback.placementId &&
      !feedback.sourceId &&
      feedback.feedbackType !== "missing-hospital-source"
    ) {
      ctx.addIssue({
        code: "custom",
        message:
          "feedback must reference a placementId, sourceId, or be a missing-hospital-source report.",
        path: ["placementId"],
      });
    }
  });

export const FeedbackRecordArraySchema = z.array(FeedbackRecordSchema);

export type FeedbackType = z.infer<typeof FeedbackTypeSchema>;
export type FeedbackStatus = z.infer<typeof FeedbackStatusSchema>;
export type FeedbackEvidenceType = z.infer<typeof FeedbackEvidenceTypeSchema>;
export type FeedbackRecord = z.infer<typeof FeedbackRecordSchema>;

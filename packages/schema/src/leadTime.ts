import { createHash } from "node:crypto";
import { z } from "zod";

const isoMonthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;

export const LeadTimeEvidenceTypeSchema = z.enum([
  "explicit-source",
  "historical-observed",
  "student-reported",
  "hospital-confirmed",
  "estimated",
]);

export const LeadTimeBasisSchema = z.enum([
  "explicit-source",
  "historical-observed",
  "student-reported",
  "hospital-confirmed",
  "estimated",
  "mixed",
]);

export const LeadTimeEvidenceSchema = z.object({
  id: z.string().min(1),
  placementId: z.string().min(1),
  placementKey: z.string().min(1),
  sourceId: z.string().min(1),
  sourceUrl: z.url().nullable(),
  evidenceType: LeadTimeEvidenceTypeSchema,
  monthsAhead: z.number().int().nonnegative().nullable(),
  targetStartMonth: z.string().regex(isoMonthPattern).nullable(),
  observedAt: z.string().datetime(),
  confidence: z.enum(["high", "medium", "low"]),
  label: z.string().min(1),
  notes: z.string().min(1).nullable(),
});

export const LeadTimeSummarySchema = z
  .object({
    id: z.string().min(1),
    placementKey: z.string().min(1),
    sourceId: z.string().min(1),
    recommendedApplyAheadMinMonths: z.number().int().nonnegative().nullable(),
    recommendedApplyAheadMaxMonths: z.number().int().nonnegative().nullable(),
    medianObservedMonthsAhead: z.number().int().nonnegative().nullable(),
    observedRangeMinMonths: z.number().int().nonnegative().nullable(),
    observedRangeMaxMonths: z.number().int().nonnegative().nullable(),
    evidenceCount: z.number().int().nonnegative(),
    observationCount: z.number().int().nonnegative(),
    basis: LeadTimeBasisSchema,
    confidence: z.enum(["high", "medium", "low"]),
    label: z.string().min(1),
    warnings: z.array(z.string().min(1)),
  })
  .superRefine((summary, ctx) => {
    if (
      summary.recommendedApplyAheadMinMonths !== null &&
      summary.recommendedApplyAheadMaxMonths !== null &&
      summary.recommendedApplyAheadMinMonths > summary.recommendedApplyAheadMaxMonths
    ) {
      ctx.addIssue({
        code: "custom",
        message:
          "recommendedApplyAheadMinMonths cannot be greater than recommendedApplyAheadMaxMonths.",
        path: ["recommendedApplyAheadMinMonths"],
      });
    }
  });

export const LeadTimeEvidenceArraySchema = z.array(LeadTimeEvidenceSchema);
export const LeadTimeSummaryArraySchema = z.array(LeadTimeSummarySchema);

export type LeadTimeEvidence = z.infer<typeof LeadTimeEvidenceSchema>;
export type LeadTimeEvidenceInput = z.input<typeof LeadTimeEvidenceSchema>;
export type LeadTimeSummary = z.infer<typeof LeadTimeSummarySchema>;
export type LeadTimeSummaryInput = z.input<typeof LeadTimeSummarySchema>;

export function makeLeadTimeEvidenceId(input: {
  placementId: string;
  evidenceType: string;
  monthsAhead: number | null;
  targetStartMonth: string | null;
  observedAt: string;
}): string {
  return `leadtime-evidence-${shortHash(
    [
      input.placementId,
      input.evidenceType,
      input.monthsAhead ?? "",
      input.targetStartMonth ?? "",
      input.observedAt,
    ].join("|"),
  )}`;
}

export function makeLeadTimeSummaryId(placementKey: string): string {
  return `leadtime-summary-${shortHash(placementKey)}`;
}

export function makeLeadTimePlacementKey(input: {
  sourceId: string;
  institutionName: string;
  departmentNormalized: string | null;
  department: string | null;
  roleType: string;
}): string {
  return [
    input.sourceId,
    input.institutionName,
    input.departmentNormalized ?? input.department ?? "unknown",
    input.roleType,
  ]
    .map(slugify)
    .join("|");
}

function shortHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/g, "");
}

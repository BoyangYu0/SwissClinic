import { createHash } from "node:crypto";
import { z } from "zod";

const isoMonthOrDatePattern = /^\d{4}-(0[1-9]|1[0-2])(-([0-2]\d|3[01]))?$/;

const NullableTextSchema = z.string().min(1).nullable();
const NullableUrlSchema = z.url().nullable();
const NullableEmailSchema = z.email().nullable();
const NullableIsoMonthOrDateSchema = z
  .string()
  .regex(isoMonthOrDatePattern, "Expected ISO month YYYY-MM or ISO date YYYY-MM-DD")
  .nullable();
const NullableDateTimeSchema = z.string().datetime().nullable();

export const PlacementRoleTypeSchema = z.enum([
  "Unterassistenz",
  "Wahlstudienjahr",
  "PJ",
  "Famulatur",
  "ClinicalPlacement",
  "Unknown",
]);

export const PlacementLanguageSchema = z.enum(["de", "fr", "it", "en", "unknown"]);

export const PlacementAvailabilityStatusSchema = z.enum([
  "available",
  "available-from",
  "fully-booked-until",
  "not-specified",
  "application-only",
  "unclear",
]);

export const PlacementApplicationMethodSchema = z.enum([
  "online-form",
  "email",
  "contact-form",
  "external-platform",
  "postal",
  "not-specified",
  "unknown",
]);

export const PlacementExtractionMethodSchema = z.enum([
  "site-parser",
  "generic-parser",
  "manual",
  "hospital-confirmed",
  "student-feedback",
  "llm-suggested",
]);

export const PlacementConfidenceSchema = z.enum(["high", "medium", "low"]);

export const PlacementReviewStatusSchema = z.enum([
  "auto-published",
  "needs-human-review",
  "human-verified",
  "hospital-confirmed",
  "deprecated",
]);

export const PlacementHousingSchema = z.enum(["yes", "no", "unknown"]).nullable();

export const PlacementRecordSchema = z
  .object({
    id: z.string().min(1, "id is required"),
    sourceId: z.string().min(1, "sourceId is required"),
    institutionName: z.string().min(1, "institutionName is required"),
    department: NullableTextSchema,
    departmentNormalized: NullableTextSchema,
    roleType: PlacementRoleTypeSchema,
    country: z.literal("CH"),
    canton: z.string().length(2).nullable(),
    city: NullableTextSchema,
    language: PlacementLanguageSchema,

    availabilityStatus: PlacementAvailabilityStatusSchema,
    availableFrom: NullableIsoMonthOrDateSchema,
    fullyBookedUntil: NullableIsoMonthOrDateSchema,
    durationMinWeeks: z.number().int().positive().nullable(),
    durationMaxWeeks: z.number().int().positive().nullable(),
    applicationLeadTimeMonths: z.number().int().nonnegative().nullable(),

    applicationMethod: PlacementApplicationMethodSchema,
    applicationUrl: NullableUrlSchema,
    contactEmail: NullableEmailSchema,
    contactName: NullableTextSchema,

    eligibilityNotes: NullableTextSchema,
    languageRequirement: NullableTextSchema,
    compensation: NullableTextSchema,
    housing: PlacementHousingSchema,

    sourceUrl: z.url(),
    sourceTitle: NullableTextSchema,
    extractedSnippet: NullableTextSchema,
    sourceLastModified: NullableDateTimeSchema,
    lastChecked: z.string().datetime(),

    extractionMethod: PlacementExtractionMethodSchema,
    confidence: PlacementConfidenceSchema,
    reviewStatus: PlacementReviewStatusSchema,
    warnings: z.array(z.string().min(1)),
  })
  .superRefine((record, ctx) => {
    if (record.confidence === "low" && record.warnings.length === 0) {
      ctx.addIssue({
        code: "custom",
        message: "Low-confidence placement records must include at least one warning.",
        path: ["warnings"],
      });
    }

    if (
      record.durationMinWeeks !== null &&
      record.durationMaxWeeks !== null &&
      record.durationMinWeeks > record.durationMaxWeeks
    ) {
      ctx.addIssue({
        code: "custom",
        message: "durationMinWeeks cannot be greater than durationMaxWeeks.",
        path: ["durationMinWeeks"],
      });
    }
  });

export const PlacementRecordArraySchema = z.array(PlacementRecordSchema);

export type PlacementRecord = z.infer<typeof PlacementRecordSchema>;
export type PlacementRecordInput = z.input<typeof PlacementRecordSchema>;

export function makePlacementId(record: PlacementRecordInput): string {
  const institutionSlug = slugify(record.institutionName);
  const departmentSlug = slugify(record.departmentNormalized ?? record.department ?? "unknown");
  const roleSlug = slugify(record.roleType);
  const hash = createHash("sha256")
    .update(
      [
        record.sourceId,
        record.institutionName,
        record.departmentNormalized ?? record.department ?? "",
        record.roleType,
        record.sourceUrl,
      ].join("|"),
    )
    .digest("hex")
    .slice(0, 12);

  return `${institutionSlug}-${departmentSlug}-${roleSlug}-${hash}`;
}

function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
}

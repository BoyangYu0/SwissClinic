import { z } from "zod";

const swissCantonCodes = [
  "AG",
  "AI",
  "AR",
  "BE",
  "BL",
  "BS",
  "FR",
  "GE",
  "GL",
  "GR",
  "JU",
  "LU",
  "NE",
  "NW",
  "OW",
  "SG",
  "SH",
  "SO",
  "SZ",
  "TG",
  "TI",
  "UR",
  "VD",
  "VS",
  "ZG",
  "ZH",
] as const;

export const InstitutionTypeSchema = z.enum([
  "hospital",
  "university",
  "student-association",
  "clinic-group",
  "public-agency",
  "other",
]);

export const SourceStatusSchema = z.enum([
  "candidate",
  "verified",
  "inactive",
  "blocked",
  "needs-review",
]);

export const SourceFetchModeSchema = z.enum(["html", "playwright", "pdf", "manual"]);
export const SourceLanguageSchema = z.enum(["de", "fr", "it", "en", "mixed", "unknown"]);
export const SourceRegionSchema = z.enum(["de-CH", "fr-CH", "it-CH", "mixed", "unknown"]);

export const SourceUrlSchema = z.object({
  url: z.url(),
  pageType: z.string().min(1, "pageType is required"),
  expectedParser: z.string().min(1, "expectedParser is required"),
  fetchMode: SourceFetchModeSchema,
});

export const SourceRegistryEntrySchema = z.object({
  id: z
    .string()
    .min(1, "id is required")
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "id must use lowercase kebab-case"),
  institutionName: z.string().min(1, "institutionName is required"),
  institutionType: InstitutionTypeSchema,
  canton: z.enum(swissCantonCodes),
  city: z.string().min(1, "city is required"),
  language: z.enum(["de", "fr", "it", "en"]),
  sourceLanguage: SourceLanguageSchema.default("unknown"),
  region: SourceRegionSchema.default("unknown"),
  country: z.literal("CH"),
  sourceUrls: z.array(SourceUrlSchema).min(1, "sourceUrls must contain at least one URL"),
  notes: z.string().min(1, "notes are required"),
  priority: z.number().int().min(1).max(5),
  status: SourceStatusSchema,
});

export const SourceRegistrySchema = z
  .array(SourceRegistryEntrySchema)
  .superRefine((entries, ctx) => {
    const seenIds = new Map<string, number>();
    const seenUrls = new Map<string, { entryIndex: number; urlIndex: number }>();

    entries.forEach((entry, entryIndex) => {
      const previousIdIndex = seenIds.get(entry.id);
      if (previousIdIndex !== undefined) {
        ctx.addIssue({
          code: "custom",
          message: `Duplicate source id "${entry.id}" also appears at entry ${previousIdIndex + 1}.`,
          path: [entryIndex, "id"],
        });
      } else {
        seenIds.set(entry.id, entryIndex);
      }

      entry.sourceUrls.forEach((sourceUrl, urlIndex) => {
        const previousUrl = seenUrls.get(sourceUrl.url);
        if (previousUrl) {
          ctx.addIssue({
            code: "custom",
            message: `Duplicate source URL "${sourceUrl.url}" also appears at entry ${
              previousUrl.entryIndex + 1
            }, URL ${previousUrl.urlIndex + 1}.`,
            path: [entryIndex, "sourceUrls", urlIndex, "url"],
          });
        } else {
          seenUrls.set(sourceUrl.url, { entryIndex, urlIndex });
        }
      });
    });
  });

export type SourceUrl = z.infer<typeof SourceUrlSchema>;
export type SourceRegistryEntry = z.infer<typeof SourceRegistryEntrySchema>;
export type SourceRegistry = z.infer<typeof SourceRegistrySchema>;

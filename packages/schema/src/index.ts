import { z } from "zod";

export * from "./change.js";
export * from "./placement.js";
export * from "./snapshot.js";
export * from "./source.js";

export const ProjectMetadataSchema = z.object({
  name: z.literal("swiss-clinical-placement-index"),
  schemaVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  generatedAt: z.string().datetime(),
});

export type ProjectMetadata = z.infer<typeof ProjectMetadataSchema>;

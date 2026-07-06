import { z } from "zod";
import { SourceFetchModeSchema } from "./source.js";

const HashSchema = z.string().min(1, "hash is required");

export const ExtractedLinkSchema = z.object({
  text: z.string(),
  href: z.url(),
});

export const SnapshotRecordSchema = z.object({
  sourceId: z.string().min(1, "sourceId is required"),
  url: z.url(),
  fetchedAt: z.string().datetime(),
  statusCode: z.number().int().min(100).max(599).nullable(),
  contentType: z.string().min(1).nullable(),
  rawHash: HashSchema,
  textHash: HashSchema,
  title: z.string().min(1).nullable(),
  visibleText: z.string(),
  extractedLinks: z.array(ExtractedLinkSchema),
  extractedEmails: z.array(z.email()),
  fetchModeUsed: SourceFetchModeSchema,
  error: z.string().min(1).nullable(),
});

export const SnapshotRecordArraySchema = z.array(SnapshotRecordSchema);

export type ExtractedLink = z.infer<typeof ExtractedLinkSchema>;
export type SnapshotRecord = z.infer<typeof SnapshotRecordSchema>;
export type SnapshotRecordInput = z.input<typeof SnapshotRecordSchema>;

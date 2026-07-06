import { createHash } from "node:crypto";
import { z } from "zod";

export const ChangeTypeSchema = z.enum([
  "new-source",
  "content-changed",
  "parser-output-changed",
  "record-added",
  "record-removed",
  "availability-changed",
  "error",
]);

export const ChangeSeveritySchema = z.enum(["info", "review", "critical"]);

export const ChangeRecordSchema = z
  .object({
    id: z.string().min(1, "id is required"),
    sourceId: z.string().min(1, "sourceId is required"),
    url: z.url(),
    detectedAt: z.string().datetime(),
    changeType: ChangeTypeSchema,
    severity: ChangeSeveritySchema,
    before: z.unknown().nullable(),
    after: z.unknown().nullable(),
    message: z.string().min(1, "message is required"),
  })
  .superRefine((record, ctx) => {
    if (record.changeType !== "availability-changed") {
      return;
    }

    if (record.before === null) {
      ctx.addIssue({
        code: "custom",
        message: "availability-changed records require before.",
        path: ["before"],
      });
    }

    if (record.after === null) {
      ctx.addIssue({
        code: "custom",
        message: "availability-changed records require after.",
        path: ["after"],
      });
    }
  });

export const ChangeRecordArraySchema = z.array(ChangeRecordSchema);

export type ChangeRecord = z.infer<typeof ChangeRecordSchema>;
export type ChangeRecordInput = z.input<typeof ChangeRecordSchema>;

export function makeChangeId(record: Omit<ChangeRecordInput, "id">): string {
  const hash = createHash("sha256").update(stableStringify(record)).digest("hex").slice(0, 16);

  return `change-${hash}`;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
    return `{${entries
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

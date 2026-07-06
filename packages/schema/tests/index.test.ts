import { describe, expect, it } from "vitest";
import { ProjectMetadataSchema } from "../src/index.js";

describe("ProjectMetadataSchema", () => {
  it("accepts valid project metadata", () => {
    const parsed = ProjectMetadataSchema.parse({
      name: "swiss-clinical-placement-index",
      schemaVersion: "0.1.0",
      generatedAt: "2026-07-06T20:00:00.000Z",
    });

    expect(parsed.schemaVersion).toBe("0.1.0");
  });

  it("rejects invalid schema versions", () => {
    const result = ProjectMetadataSchema.safeParse({
      name: "swiss-clinical-placement-index",
      schemaVersion: "draft",
      generatedAt: "2026-07-06T20:00:00.000Z",
    });

    expect(result.success).toBe(false);
  });
});

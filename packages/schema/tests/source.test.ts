import { describe, expect, it } from "vitest";
import { SourceRegistryEntrySchema, SourceRegistrySchema } from "../src/source.js";

const validSource = {
  id: "luks-luzern-medizin",
  institutionName: "Luzerner Kantonsspital",
  institutionType: "hospital",
  canton: "LU",
  city: "Luzern",
  language: "de",
  country: "CH",
  sourceUrls: [
    {
      url: "https://example.org/unterassistenz",
      pageType: "hospital-placement-page",
      expectedParser: "generic",
      fetchMode: "html",
    },
  ],
  notes: "Initial placeholder; verify manually before promoting.",
  priority: 1,
  status: "candidate",
};

describe("SourceRegistryEntrySchema", () => {
  it("accepts a valid source registry entry", () => {
    const parsed = SourceRegistryEntrySchema.parse(validSource);

    expect(parsed.id).toBe("luks-luzern-medizin");
    expect(parsed.sourceLanguage).toBe("unknown");
    expect(parsed.region).toBe("unknown");
  });

  it("accepts explicit multilingual metadata", () => {
    const parsed = SourceRegistryEntrySchema.parse({
      ...validSource,
      language: "fr",
      sourceLanguage: "mixed",
      region: "mixed",
    });

    expect(parsed.sourceLanguage).toBe("mixed");
    expect(parsed.region).toBe("mixed");
  });

  it("rejects invalid URLs", () => {
    const result = SourceRegistryEntrySchema.safeParse({
      ...validSource,
      sourceUrls: [{ ...validSource.sourceUrls[0], url: "not-a-url" }],
    });

    expect(result.success).toBe(false);
  });

  it("rejects invalid canton codes", () => {
    const result = SourceRegistryEntrySchema.safeParse({ ...validSource, canton: "XX" });

    expect(result.success).toBe(false);
  });

  it("rejects empty sourceUrls", () => {
    const result = SourceRegistryEntrySchema.safeParse({ ...validSource, sourceUrls: [] });

    expect(result.success).toBe(false);
  });
});
describe("SourceRegistrySchema", () => {
  it("rejects duplicate source IDs", () => {
    const result = SourceRegistrySchema.safeParse([validSource, validSource]);

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain("Duplicate source id");
  });
});

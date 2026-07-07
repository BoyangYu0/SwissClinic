import { describe, expect, it } from "vitest";
import { genericParser, parsePage, selectParser } from "../src/index.js";
import type { ParsedPage, ParserResult, SourceParser } from "../src/types.js";

describe("parser registry", () => {
  it("selects a matching site parser before configured parser", async () => {
    const siteParser = parser("usz", true, result("usz", "medium"));
    const configuredParser = parser("configured", false, result("configured", "medium"));
    const selected = selectParser(page({ expectedParser: "configured" }), [
      configuredParser,
      siteParser,
      genericParser,
    ]);

    expect(selected.id).toBe("usz");
    await expect(
      parsePage(page({ expectedParser: "configured" }), [configuredParser, siteParser]),
    ).resolves.toMatchObject({
      parserName: "usz",
    });
  });

  it("uses source-configured parser when no site parser matches", async () => {
    const configuredParser = parser("configured", false, result("configured", "medium"));
    const selected = selectParser(page({ expectedParser: "configured" }), [
      configuredParser,
      genericParser,
    ]);

    expect(selected.id).toBe("configured");
    await expect(
      parsePage(page({ expectedParser: "configured" }), [configuredParser]),
    ).resolves.toMatchObject({
      parserName: "configured",
    });
  });

  it("falls back to generic parser", async () => {
    const selected = selectParser(page({ visibleText: "No placement content." }), []);
    const parsed = await parsePage(page({ visibleText: "No placement content." }), []);

    expect(selected.id).toBe("generic");
    expect(parsed).toMatchObject({
      parserName: "generic",
      confidence: "low",
      records: [],
    });
  });

  it("keeps empty pages out of high-confidence output", async () => {
    const emptyParser = parser("empty-site", true, {
      records: [],
      warnings: [],
      parserName: "empty-site",
      confidence: "high",
    });

    const parsed = await parsePage(page({ visibleText: "" }), [emptyParser, genericParser]);

    expect(parsed.records).toEqual([]);
    expect(parsed.confidence).toBe("low");
    expect(parsed.warnings[0]).toContain("human review");
  });
});

function page(overrides: Partial<ParsedPage> = {}): ParsedPage {
  return {
    sourceId: "usz-neuroradiologie",
    url: "https://www.usz.ch/example",
    title: "Unterassistenzen Neuroradiologie",
    html: "<html><body>Unterassistenz</body></html>",
    visibleText: "Unterassistenz Neuroradiologie",
    links: [],
    emails: [],
    tables: [],
    fetchedAt: "2026-07-07T08:00:00.000Z",
    ...overrides,
  };
}

function parser(id: string, matches: boolean, parserResult: ParserResult): SourceParser {
  return {
    id,
    match: () => matches,
    async parse() {
      return parserResult;
    },
  };
}

function result(parserName: string, confidence: ParserResult["confidence"]): ParserResult {
  return {
    records: [],
    warnings: [`${parserName} needs E2 implementation.`],
    parserName,
    confidence,
  };
}

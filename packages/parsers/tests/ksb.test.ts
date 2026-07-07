import { readFile } from "node:fs/promises";
import { PlacementRecordSchema } from "@scpi/schema";
import {
  extractEmails,
  extractLinks,
  extractTables,
  extractTitle,
  extractVisibleText,
} from "@scpi/utils";
import { describe, expect, it } from "vitest";
import { ksbParser, parsePage } from "../src/index.js";
import type { ParsedPage } from "../src/types.js";

const ksbUrl = "https://www.kantonsspitalbaden.ch/jobs/unterassistentin-innere-medizin-100";

describe("ksbParser", () => {
  it("extracts the current KSB fixture", async () => {
    const parsed = await ksbParser.parse(await fixturePage());

    expect(parsed).toMatchObject({
      parserName: "ksb",
      confidence: "medium",
    });
    expect(parsed.records).toHaveLength(1);
    expect(parsed.records[0]).toMatchObject({
      sourceId: "ksb-baden-unterassistentin-innere-medizin",
      institutionName: "Kantonsspital Baden",
      department: "Innere Medizin",
      roleType: "Unterassistenz",
      canton: "AG",
      city: "Baden",
      availabilityStatus: "application-only",
      availableFrom: null,
      fullyBookedUntil: null,
      durationMinWeeks: 8,
      durationMaxWeeks: 16,
      contactName: "Apinaya Anandarajah",
      languageRequirement: "Deutsch auf mindestens B2-Niveau",
      compensation: "CHF 1'500",
      housing: "yes",
      extractionMethod: "site-parser",
      confidence: "medium",
      reviewStatus: "needs-human-review",
    });
    expect(parsed.records[0]?.eligibilityNotes).toContain("Medizinstudium");
    expect(parsed.records[0]?.eligibilityNotes).toContain("EU-/EFTA-Staats");
    expect(parsed.records[0]?.extractedSnippet).toContain("Unterassistent_in Innere Medizin");
    expect(() => PlacementRecordSchema.parse(parsed.records[0])).not.toThrow();
  });

  it("parses unavailable wording without marking it available", async () => {
    const parsed = await ksbParser.parse(
      page({
        title: "Unterassistent_in Chirurgie 100% | Kantonsspital Baden",
        visibleText:
          "Unterassistent_in Chirurgie 100%. Keine freien Plätze bis Ende 2026. Dauer: 8 - 16 Wochen. Profil Du machst aktuell ein Medizinstudium. Fragen zum Bewerbungsablauf Lea Muster +41 56 486 00 00",
        links: [{ text: "Jetzt bewerben", href: "https://www.kantonsspitalbaden.ch/jobs/apply" }],
      }),
    );

    expect(parsed.confidence).toBe("high");
    expect(parsed.records[0]).toMatchObject({
      department: "Chirurgie",
      availabilityStatus: "fully-booked-until",
      fullyBookedUntil: "2026-12",
      availableFrom: null,
      confidence: "high",
      reviewStatus: "auto-published",
    });
  });

  it("does not fabricate availability when the fixture text omits it", async () => {
    const parsed = await ksbParser.parse(
      page({
        title: "Unterassistent_in Chirurgie 100% | Kantonsspital Baden",
        visibleText:
          "Unterassistent_in Chirurgie 100%. Dauer: 8 - 16 Wochen. Profil Du machst aktuell ein Medizinstudium.",
      }),
    );

    expect(parsed.records[0]).toMatchObject({
      department: "Chirurgie",
      availabilityStatus: "not-specified",
      availableFrom: null,
      fullyBookedUntil: null,
      durationMinWeeks: 8,
      durationMaxWeeks: 16,
      confidence: "medium",
    });
    expect(parsed.records[0]?.warnings).toContain(
      "KSB page does not state explicit availability; no date was inferred.",
    );
  });

  it("extracts multiple departments from a KSB overview-like fixture", async () => {
    const parsed = await ksbParser.parse(
      page({
        title: "Unterassistenzen | Kantonsspital Baden",
        visibleText:
          "Unterassistent_in Chirurgie 100%. Dauer: 8 - 16 Wochen. Unterassistent_in Anästhesie 100%. Ab Juli 2027 freie Plätze. Dauer: 8 - 12 Wochen.",
      }),
    );

    expect(parsed.records.map((record) => record.department)).toEqual([
      "Chirurgie",
      "Anästhesiologie",
    ]);
    expect(parsed.records).toHaveLength(2);
    for (const record of parsed.records) {
      expect(() => PlacementRecordSchema.parse(record)).not.toThrow();
    }
  });

  it("is selected before the generic parser for matching KSB pages", async () => {
    const parsed = await parsePage(page());

    expect(parsed.parserName).toBe("ksb");
  });
});

async function fixturePage(): Promise<ParsedPage> {
  const html = await readFile(new URL("../fixtures/ksb/current.html", import.meta.url), "utf8");
  const visibleText = extractVisibleText(html);

  return page({
    html,
    visibleText,
    title: extractTitle(html),
    links: extractLinks(html, ksbUrl),
    emails: extractEmails(visibleText),
    tables: extractTables(html),
  });
}

function page(overrides: Partial<ParsedPage> = {}): ParsedPage {
  return {
    sourceId: "ksb-baden-unterassistentin-innere-medizin",
    url: ksbUrl,
    title: "Unterassistent_in Innere Medizin 100% | Kantonsspital Baden",
    html: "<html><body>Unterassistent_in Innere Medizin 100%</body></html>",
    visibleText:
      "Unterassistent_in Innere Medizin 100%. Dauer: 8 - 16 Wochen. Profil Du machst aktuell ein Medizinstudium.",
    links: [],
    emails: [],
    tables: [],
    fetchedAt: "2026-07-07T08:00:00.000Z",
    ...overrides,
  };
}

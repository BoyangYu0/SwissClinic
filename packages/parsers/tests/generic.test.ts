import { PlacementRecordSchema } from "@scpi/schema";
import { describe, expect, it } from "vitest";
import { genericParser } from "../src/generic.js";
import type { ParsedPage } from "../src/types.js";

describe("genericParser", () => {
  it("extracts a medium-confidence record for explicit department and date", async () => {
    const result = await genericParser.parse(
      page({
        title: "Unterassistenz Innere Medizin | Spital Beispiel",
        visibleText:
          "Unterassistenz Innere Medizin. Ab Juli 2027 sind freie Plätze verfügbar. Bewerbungen über das Online-Formular.",
        links: [
          {
            text: "Bewerbungsformular",
            href: "https://example.ch/bewerbung",
          },
        ],
      }),
    );

    expect(result.confidence).toBe("medium");
    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toMatchObject({
      sourceId: "example-source",
      institutionName: "Spital Beispiel",
      department: "Innere Medizin",
      originalDepartmentName: "Innere Medizin",
      departmentNormalized: "internal-medicine",
      roleType: "Unterassistenz",
      roleTypeOriginal: "Unterassistenz",
      sourceLanguage: "de",
      region: "de-CH",
      extractionLanguage: "de",
      availabilityStatus: "available-from",
      availableFrom: "2027-07",
      applicationMethod: "online-form",
      applicationUrl: "https://example.ch/bewerbung",
      confidence: "medium",
      reviewStatus: "needs-human-review",
    });
    expect(result.records[0]?.sourceUrl).toBe("https://example.ch/unterassistenz");
    expect(result.records[0]?.extractedSnippet).toContain("Innere Medizin");
    expect(() => PlacementRecordSchema.parse(result.records[0])).not.toThrow();
  });

  it("creates records for multiple detected departments", async () => {
    const result = await genericParser.parse(
      page({
        visibleText:
          "Unterassistenz am Zentrumsspital. Innere Medizin ab Juli 2027. Chirurgie ab August 2027. Radiologie Bewerbungen online.",
      }),
    );

    expect(result.records.map((record) => record.department)).toEqual([
      "Innere Medizin",
      "Chirurgie",
      "Radiologie",
    ]);
    expect(result.records.map((record) => record.departmentNormalized)).toEqual([
      "internal-medicine",
      "surgery",
      "radiology",
    ]);
  });

  it("returns a low-confidence contact-only review record", async () => {
    const result = await genericParser.parse(
      page({
        visibleText:
          "Unterassistenz Wahlstudienjahr. Für Fragen und Bewerbung kontaktieren Sie ausbildung@example.ch.",
        emails: ["ausbildung@example.ch"],
      }),
    );

    expect(result.confidence).toBe("low");
    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toMatchObject({
      availabilityStatus: "application-only",
      applicationMethod: "email",
      contactEmail: "ausbildung@example.ch",
      confidence: "low",
    });
    expect(result.records[0]?.warnings).toContain("No department was detected.");
  });

  it("does not create records for irrelevant hospital career jobs", async () => {
    const result = await genericParser.parse(
      page({
        title: "Jobs und Karriere | Spital Beispiel",
        visibleText:
          "Jobs und Karriere. Bewerbung als Pflegefachperson oder MPA. Recruiting Kontakt HR.",
      }),
    );

    expect(result.records).toEqual([]);
    expect(result.confidence).toBe("low");
    expect(result.warnings[0]).toContain("skipped likely irrelevant job page");
  });

  it("does not create records from ordinary contact wording alone", async () => {
    const result = await genericParser.parse(
      page({
        title: "Kontakt | Spital Beispiel",
        visibleText: "Kontakt. Senden Sie Ihre Anfrage bitte an info@example.ch.",
        emails: ["info@example.ch"],
      }),
    );

    expect(result.records).toEqual([]);
    expect(result.confidence).toBe("low");
    expect(result.warnings[0]).toContain("no medical placement signal");
  });

  it("does not combine unrelated career contact and medical event text into a placement", async () => {
    const result = await genericParser.parse(
      page({
        title: "Karriere im Spital Beispiel",
        visibleText:
          "Kontakt Veranstaltungen. Entdecken Sie Jobs und Ausbildung im Spital. Medizinische Informationen folgen in einem öffentlichen Vortrag. News 13.07.2026.",
      }),
    );

    expect(result.records).toEqual([]);
    expect(result.warnings[0]).toContain("no medical placement signal");
  });

  it("does not treat an English grant event date as placement availability", async () => {
    const result = await genericParser.parse(
      page({
        title: "Medicine | Example University",
        visibleText:
          "Medical student elective information. ERC Starting and Consolidator Grants: Masterclass on Proposal Writing 28 August 2026.",
        sourceLanguage: "en",
        region: "unknown",
      }),
    );

    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toMatchObject({
      availabilityStatus: "not-specified",
      availableFrom: null,
    });
  });

  it("classifies fully booked wording correctly", async () => {
    const result = await genericParser.parse(
      page({
        visibleText:
          "Unterassistenz Chirurgie. Keine freien Plätze bis Ende 2026. Bewerbungen sind später wieder möglich.",
      }),
    );

    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toMatchObject({
      department: "Chirurgie",
      availabilityStatus: "fully-booked-until",
      fullyBookedUntil: "2026-12",
    });
  });

  it("extracts a French synthetic placement with normalized department", async () => {
    const result = await genericParser.parse(
      page({
        title: "Stage Médecine interne | Hôpital Exemple",
        visibleText:
          "Stage pour étudiant en médecine. Médecine interne dès juillet 2027. Candidature via formulaire.",
        links: [{ text: "Formulaire de candidature", href: "https://example.ch/candidature" }],
        sourceLanguage: "fr",
        region: "fr-CH",
      }),
    );

    expect(result.confidence).toBe("medium");
    expect(result.records[0]).toMatchObject({
      department: "Médecine interne",
      originalDepartmentName: "Médecine interne",
      departmentNormalized: "internal-medicine",
      roleType: "ClinicalPlacement",
      roleTypeOriginal: "Stage",
      sourceLanguage: "fr",
      region: "fr-CH",
      extractionLanguage: "fr",
      availabilityStatus: "available-from",
      availableFrom: "2027-07",
      applicationMethod: "online-form",
    });
  });

  it("extracts an Italian synthetic placement with fully-booked wording", async () => {
    const result = await genericParser.parse(
      page({
        title: "Tirocinio Chirurgia | Ospedale Esempio",
        visibleText:
          "Tirocinio per studenti di medicina. Chirurgia nessun posto disponibile fino a dicembre 2027. Candidatura con 12 mesi di anticipo.",
        sourceLanguage: "it",
        region: "it-CH",
      }),
    );

    expect(result.records[0]).toMatchObject({
      department: "Chirurgia",
      originalDepartmentName: "Chirurgia",
      departmentNormalized: "surgery",
      sourceLanguage: "it",
      region: "it-CH",
      extractionLanguage: "it",
      availabilityStatus: "fully-booked-until",
      fullyBookedUntil: "2027-12",
      applicationLeadTimeMonths: 12,
    });
    expect(result.records[0]?.availableFrom).toBeNull();
  });
});

function page(overrides: Partial<ParsedPage> = {}): ParsedPage {
  return {
    sourceId: "example-source",
    url: "https://example.ch/unterassistenz",
    title: "Unterassistenz | Spital Beispiel",
    html: "<html><body>Unterassistenz</body></html>",
    visibleText: "Unterassistenz",
    links: [],
    emails: [],
    tables: [],
    fetchedAt: "2026-07-07T08:00:00.000Z",
    ...overrides,
  };
}

import { createInstitutionParser } from "./institutionProfile.js";
import type { ParsedPage } from "./types.js";

export const uszParser = createInstitutionParser({
  id: "usz",
  hostPatterns: [/(^|\.)usz\.ch$/i],
  institutionName: "Universitätsspital Zürich",
  canton: "ZH",
  city: "Zürich",
  departmentPatterns: [
    ["Neuroradiologie", /\bneuroradiologie\b/i],
    ["Innere Medizin", /\b(?:unterassistenzen\s+medizin|innere\s+medizin)\b/i],
    ["Chirurgie", /\bunterassistenzen\s+chirurgie\b/i],
    ["Anästhesiologie", /\bunterassistenzen\s+an[aä]sthesiologie\b/i],
    ["Frauenheilkunde", /\bunterassistenzen\s+frauenheilkunde\b/i],
    ["Radiologie", /\bunterassistenzen\s+radiologie\b/i],
  ],
  applicationLinkPattern: /\b(bewerbung\s+für\s+das\s+jahr|job\.usz\.ch|e-recruiting)\b/i,
  extractSections(input, text) {
    const department = departmentForPage(input);
    return department ? [{ department, text }] : [];
  },
  availabilityOverride(input, text) {
    if (/Verfügbarkeiten\s+nur\s+noch|Bewerbung\s+für\s+das\s+Jahr/i.test(text)) {
      return {
        availabilityStatus: "available",
        availableFrom: null,
        fullyBookedUntil: null,
      };
    }

    if (input.links.some((link) => /Bewerbung\s+für\s+das\s+Jahr/i.test(link.text))) {
      return {
        availabilityStatus: "available",
        availableFrom: null,
        fullyBookedUntil: null,
      };
    }

    return null;
  },
  extractEligibilityNotes(text) {
    const match = text.match(
      /Studierende der Humanmedizin ab dem 4\. Studienjahr oder im Wahlstudienjahr \(bzw\. PJ\)/i,
    );
    return match ? match[0] : null;
  },
});

function departmentForPage(input: ParsedPage): string | null {
  const page = `${input.url} ${input.title ?? ""}`;
  const mappings: Array<[string, RegExp]> = [
    ["Neuroradiologie", /neuroradiologie/i],
    ["Anästhesiologie", /anaesthesiologie|anästhesiologie/i],
    ["Frauenheilkunde", /frauenheilkunde/i],
    ["Chirurgie", /\/chirurgie\/|unterassistenzen\s+chirurgie/i],
    ["Radiologie", /\/radiologie\/|unterassistenzen\s+radiologie/i],
    ["Innere Medizin", /\/medizin\/|unterassistenzen\s+medizin/i],
  ];

  return mappings.find(([, pattern]) => pattern.test(page))?.[0] ?? null;
}

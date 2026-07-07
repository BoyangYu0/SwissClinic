import { createInstitutionParser } from "./institutionProfile.js";

export const uszParser = createInstitutionParser({
  id: "usz",
  hostPatterns: [/(^|\.)usz\.ch$/i],
  institutionName: "Universitätsspital Zürich",
  canton: "ZH",
  city: "Zürich",
  departmentPatterns: [["Neuroradiologie", /\bneuroradiologie\b/i]],
  applicationLinkPattern: /\b(bewerbung\s+für\s+das\s+jahr|job\.usz\.ch|e-recruiting)\b/i,
  extractSections(_input, text) {
    return [{ department: "Neuroradiologie", text }];
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

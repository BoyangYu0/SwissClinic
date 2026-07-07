import { createInstitutionParser } from "./institutionProfile.js";

export const kssgParser = createInstitutionParser({
  id: "kssg",
  hostPatterns: [/(^|\.)h-och\.ch$/i],
  institutionName: "Kantonsspital St. Gallen",
  canton: "SG",
  city: "St. Gallen",
  roleType: "Unterassistenz",
  departmentPatterns: [["Orthopädie", /\bOrthopädie(?:\s+und\s+Traumatologie)?\b/i]],
  applicationLinkPattern: /\b(Freie Unterassistenzstellen|jobs\.h-och\.ch)\b/i,
  availabilityOverride(input, text) {
    if (
      /Freie Unterassistenzstellen/i.test(text) ||
      input.links.some((link) => /Freie Unterassistenzstellen/i.test(link.text))
    ) {
      return {
        availabilityStatus: "available",
        availableFrom: null,
        fullyBookedUntil: null,
      };
    }

    return null;
  },
  extractEligibilityNotes(text) {
    const notes = [
      text.match(/Deutschkenntnisse B2/i)?.[0],
      text.match(/Keine Famulaturen möglich/i)?.[0],
    ].filter((part): part is string => Boolean(part));

    return notes.length > 0 ? notes.join(". ") : null;
  },
});

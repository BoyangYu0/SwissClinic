import { createInstitutionParser } from "./institutionProfile.js";

export const ksaParser = createInstitutionParser({
  id: "ksa",
  hostPatterns: [/(^|\.)ksa\.ch$/i],
  institutionName: "Kantonsspital Aarau",
  canton: "AG",
  city: "Aarau",
  roleType: "Unterassistenz",
  departmentPatterns: [],
  fallbackDepartment: null,
  applicationLinkPattern: /\b(bewerb\w*|unterassistenz-stellen|angebot)\b/i,
  suppressDuration: true,
  extractEligibilityNotes(text) {
    const parts = [
      text.match(/Frühestens ab dem 4\. Jahr des Medizin-Studiums[^.]*[.]/i)?.[0],
      text.match(/Benötigte Bewerbungsunterlagen\s*[^.]+/i)?.[0],
    ].filter((part): part is string => Boolean(part));

    return parts.length > 0 ? parts.join(" ") : null;
  },
});

import { createInstitutionParser } from "./institutionProfile.js";

export const kswParser = createInstitutionParser({
  id: "ksw",
  hostPatterns: [/(^|\.)ksw\.ch$/i],
  institutionName: "Kantonsspital Winterthur",
  canton: "ZH",
  city: "Winterthur",
  roleType: "Wahlstudienjahr",
  departmentPatterns: [
    ["Anästhesiologie", /\bKlinik für Anästhesiologie\b/i],
    ["Augenheilkunde", /\bAugenklinik\b/i],
    ["Frauenheilkunde", /\bFrauenklinik\b/i],
    ["Chirurgie", /\b(Hand- und Plastische Chirurgie|Viszeral- und Thoraxchirurgie)\b/i],
    ["Innere Medizin", /\bKlinik für Innere Medizin\b/i],
    ["Radiologie", /\b(Radiologie|Nuklearmedizin|Interventionelle Radiologie)\b/i],
    ["Pädiatrie", /\bKinder- und Jugendmedizin\b/i],
    ["Orthopädie", /\bOrthopädie und Traumatologie\b/i],
  ],
  applicationLinkPattern: /\b(zu den offenen stellen|offene-stellen|bewerb\w*)\b/i,
});

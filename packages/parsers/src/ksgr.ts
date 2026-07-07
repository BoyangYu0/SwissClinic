import { createInstitutionParser } from "./institutionProfile.js";

export const ksgrParser = createInstitutionParser({
  id: "ksgr",
  hostPatterns: [/(^|\.)ksgr\.ch$/i],
  institutionName: "Kantonsspital Graubünden",
  canton: "GR",
  city: "Chur",
  roleType: "Unterassistenz",
  departmentPatterns: [
    ["Chirurgie", /\bChirurgie\b/i],
    ["Innere Medizin", /\bInnere Medizin\b/i],
    ["Pädiatrie", /\b(Kinder- und Jugendmedizin|Pädiatrie)\b/i],
    ["Frauenheilkunde", /\b(Frauenklinik|Gynäkologie)\b/i],
    ["Radiologie", /\bRadiologie\b/i],
    ["Anästhesiologie", /\b(Anästhesie|ANIR)\b/i],
  ],
  applicationLinkPattern:
    /\b(Bewerbung|Informationen für Unterassistenten|unterassistenten-.*\.pdf)\b/i,
  requireDepartmentApplicationLink: true,
});

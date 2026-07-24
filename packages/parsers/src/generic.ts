import {
  makePlacementId,
  type PlacementRecord,
  type PlacementRecordInput,
  PlacementRecordSchema,
} from "@scpi/schema";
import { normalizeWhitespace, parseAvailabilityStatus } from "@scpi/utils";
import {
  allDepartmentAliases,
  detectLanguageFromText,
  getLanguagePack,
  normalizeForMatching,
  type PackLanguage,
} from "./language-packs/index.js";
import type { ParsedPage, ParserResult, SourceParser } from "./types.js";

const medicalTrainingContextPattern =
  /\b(medizin|medizinisch|medizinstudium|arztliche|ärztliche|aerztliche|student|studentin|studierende|ausbildung|lehre|medecine|médecine|medicina|medicine)\b/i;

const irrelevantJobPattern =
  /\b(pflegefachperson|fachfrau\s+gesundheit|fachmann\s+gesundheit|assistenzarzt|oberarzt|leitender\s+arzt|mpa|hr|recruiting|jobs?\s+und\s+karriere)\b/i;

const departmentContextPattern =
  /\b(unterassist\w*|famulatur\w*|wahlstudienjahr|praktisches\s+jahr|\bpj\b|stellen|ausbildungsplatze|ausbildungsplätze|praktikum|curriculum|bewerb\w*|candidature|candidatura|stage|tirocinio|ab\s+\w+\s+20\d{2}|des\s+\w+\s+20\d{2}|dès\s+\w+\s+20\d{2}|da\s+\w+\s+20\d{2})\b/i;

interface DepartmentDetection {
  originalName: string;
  normalized: string;
}

const supportedPackLanguages = ["de", "fr", "it", "en"] as const;

export const genericParser: SourceParser = {
  id: "generic",
  match: () => true,
  async parse(input: ParsedPage): Promise<ParserResult> {
    const text = normalizeWhitespace(input.visibleText);
    const extractionLanguage = resolveExtractionLanguage(input, text);
    const sourceLanguage = input.sourceLanguage ?? extractionLanguage;
    const pack = getLanguagePack(extractionLanguage);

    if (isLikelyIrrelevantJobPage(text, pack.roleKeywords)) {
      return {
        records: [],
        warnings: [`Generic parser skipped likely irrelevant job page ${input.url}.`],
        parserName: "generic",
        confidence: "low",
      };
    }

    if (!hasPlacementSignal(text, pack.roleKeywords, pack.applicationKeywords)) {
      return {
        records: [],
        warnings: [`Generic parser found no medical placement signal on ${input.url}.`],
        parserName: "generic",
        confidence: "low",
      };
    }

    const departments = detectDepartments(text, input.title);
    const sections = departments.length > 0 ? departments : [null];
    const records = sections.map((department) =>
      buildRecord(input, text, department, extractionLanguage, sourceLanguage),
    );
    const parsedRecords = records.map((record) => PlacementRecordSchema.parse(record));
    const confidence = parsedRecords.some(isMediumConfidenceRecord) ? "medium" : "low";
    const warnings = buildWarnings(input, parsedRecords);

    return {
      records: parsedRecords,
      warnings,
      parserName: "generic",
      confidence,
    };
  },
};

function hasPlacementSignal(
  text: string,
  roleKeywords: string[],
  applicationKeywords: string[],
): boolean {
  const normalized = normalizeForMatching(text);
  return (
    hasAnyKeyword(normalized, roleKeywords) ||
    splitSentences(text).some(
      (sentence) =>
        hasAnyKeyword(normalizeForMatching(sentence), applicationKeywords) &&
        medicalTrainingContextPattern.test(sentence),
    )
  );
}

function isLikelyIrrelevantJobPage(text: string, roleKeywords: string[]): boolean {
  return (
    !hasAnyKeyword(normalizeForMatching(text), roleKeywords) && irrelevantJobPattern.test(text)
  );
}

function detectDepartments(text: string, title: string | null): DepartmentDetection[] {
  const departments = new Map<string, DepartmentDetection>();
  const sentences = splitSentences(text);

  for (const alias of allDepartmentAliases()) {
    const pattern = aliasPattern(alias.names);
    const inTitle = title ? pattern.test(normalizeForMatching(title)) : false;
    const inContext = sentences.some(
      (sentence) =>
        pattern.test(normalizeForMatching(sentence)) && departmentContextPattern.test(sentence),
    );

    if (inTitle || inContext) {
      const originalName = extractOriginalDepartmentName(`${title ?? ""} ${text}`, alias.names);
      departments.set(alias.normalized, {
        originalName: originalName ?? alias.names[0] ?? alias.normalized,
        normalized: alias.normalized,
      });
    }
  }

  return [...departments.values()];
}

function buildRecord(
  input: ParsedPage,
  text: string,
  department: DepartmentDetection | null,
  extractionLanguage: PackLanguage,
  sourceLanguage: PlacementRecordInput["sourceLanguage"],
): PlacementRecordInput {
  const snippet = extractSnippet(text, department, extractionLanguage);
  const availability = parseAvailabilityStatus(snippet, extractionLanguage);
  const contactEmail = input.emails[0] ?? null;
  const applicationUrl = findApplicationUrl(input);
  const applicationMethod = applicationUrl
    ? isSameHost(applicationUrl, input.url)
      ? "online-form"
      : "external-platform"
    : contactEmail
      ? "email"
      : "not-specified";
  const roleTypeOriginal = detectRoleTypeOriginal(text);
  const confidence =
    department && (hasExplicitAvailability(availability) || applicationUrl || contactEmail)
      ? "medium"
      : "low";
  const warnings = buildRecordWarnings(
    department,
    availability.availabilityStatus,
    applicationUrl,
    contactEmail,
  );
  const baseRecord: PlacementRecordInput = {
    id: "temporary",
    sourceId: input.sourceId,
    institutionName: inferInstitutionName(input),
    department: department?.originalName ?? null,
    departmentNormalized: department?.normalized ?? null,
    roleType: detectRoleType(text),
    roleTypeOriginal,
    country: "CH",
    canton: null,
    city: null,
    language: extractionLanguage,
    sourceLanguage,
    region: input.region ?? regionForLanguage(sourceLanguage),
    availabilityStatus: availability.availabilityStatus,
    availableFrom: availability.availableFrom,
    fullyBookedUntil: availability.fullyBookedUntil,
    durationMinWeeks: availability.durationMinWeeks,
    durationMaxWeeks: availability.durationMaxWeeks,
    applicationLeadTimeMonths: availability.applicationLeadTimeMonths,
    explicitApplicationLeadTimeMonths: availability.applicationLeadTimeMonths,
    observedMonthsAhead: null,
    leadTimeSummaryId: null,
    applicationMethod,
    applicationUrl,
    contactEmail,
    contactName: null,
    originalDepartmentName: department?.originalName ?? null,
    eligibilityNotes: null,
    languageRequirement: extractLanguageRequirement(snippet),
    compensation: extractCompensation(snippet),
    housing: null,
    sourceUrl: input.url,
    sourceTitle: input.title,
    extractedSnippet: snippet,
    sourceLastModified: null,
    lastChecked: input.fetchedAt,
    extractionMethod: "generic-parser",
    extractionLanguage,
    confidence,
    reviewStatus: "needs-human-review",
    warnings,
  };

  return { ...baseRecord, id: makePlacementId(baseRecord) };
}

function findApplicationUrl(input: ParsedPage): string | null {
  const pack = getLanguagePack(resolveExtractionLanguage(input, input.visibleText));
  const applicationLink = input.links.find((link) =>
    hasAnyKeyword(normalizeForMatching(`${link.text} ${link.href}`), [
      ...pack.applicationKeywords,
      "job",
    ]),
  );

  return applicationLink?.href ?? null;
}

function isSameHost(left: string, right: string): boolean {
  try {
    return new URL(left).host === new URL(right).host;
  } catch {
    return false;
  }
}

function detectRoleType(text: string): PlacementRecordInput["roleType"] {
  if (/\bunterassist/i.test(text)) {
    return "Unterassistenz";
  }

  if (/\bwahlstudienjahr/i.test(text)) {
    return "Wahlstudienjahr";
  }

  if (/\bpraktisches\s+jahr\b|\bpj\b/i.test(text)) {
    return "PJ";
  }

  if (/\bfamulatur/i.test(text)) {
    return "Famulatur";
  }

  if (/\b(stage|sous-assistant|etudiant\s+en\s+medecine|étudiant\s+en\s+médecine)\b/i.test(text)) {
    return "ClinicalPlacement";
  }

  return "Unknown";
}

function detectRoleTypeOriginal(text: string): string | null {
  const match = text.match(
    /\b(unterassistenz|unterassistent(?:in)?|wahlstudienjahr|praktisches\s+jahr|pj|famulatur|sous-assistant(?:e)?|stage|tirocinio|clinical placement|elective)\b/i,
  );
  return match?.[0] ?? null;
}

function inferInstitutionName(input: ParsedPage): string {
  if (!input.title) {
    return input.sourceId;
  }

  const parts = input.title
    .split(/\s+[|–-]\s+/)
    .map((part) => normalizeWhitespace(part))
    .filter(Boolean);

  return parts.at(-1) ?? input.title;
}

function extractSnippet(
  text: string,
  department: DepartmentDetection | null,
  extractionLanguage: PackLanguage,
): string {
  const sentences = splitSentences(text);
  const departmentIndex = department
    ? sentences.findIndex((sentence) =>
        normalizeForMatching(sentence).includes(normalizeForMatching(department.originalName)),
      )
    : -1;
  const candidate =
    (departmentIndex >= 0
      ? sentences.slice(departmentIndex, departmentIndex + 3).join(" ")
      : undefined) ??
    sentences.find((sentence) =>
      hasExplicitAvailability(parseAvailabilityStatus(sentence, extractionLanguage)),
    ) ??
    sentences.find((sentence) => sentenceHasApplicationKeyword(sentence)) ??
    sentences.find((sentence) => sentenceHasRoleKeyword(sentence)) ??
    text;

  return normalizeWhitespace(candidate).slice(0, 700);
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => normalizeWhitespace(sentence))
    .filter((sentence) => sentence.length > 0);
}

function hasExplicitAvailability(
  availability: ReturnType<typeof parseAvailabilityStatus>,
): boolean {
  return (
    availability.availabilityStatus === "available" ||
    availability.availabilityStatus === "available-from" ||
    availability.availabilityStatus === "fully-booked-until"
  );
}

function isMediumConfidenceRecord(record: PlacementRecord): boolean {
  return record.confidence === "medium";
}

function buildWarnings(input: ParsedPage, records: PlacementRecord[]): string[] {
  const warnings = [`Generic parser output for ${input.url} needs human review.`];

  if (records.every((record) => record.confidence === "low")) {
    warnings.push("No medium-confidence record was extracted.");
  }

  return warnings;
}

function buildRecordWarnings(
  department: DepartmentDetection | null,
  availabilityStatus: PlacementRecordInput["availabilityStatus"],
  applicationUrl: string | null,
  contactEmail: string | null,
): string[] {
  const warnings: string[] = ["Generic parser output requires human review."];

  if (!department) {
    warnings.push("No department was detected.");
  }

  if (availabilityStatus === "not-specified" || availabilityStatus === "application-only") {
    warnings.push("No explicit availability status was detected.");
  }

  if (!applicationUrl && !contactEmail) {
    warnings.push("No application URL or contact email was detected.");
  }

  return warnings;
}

function resolveExtractionLanguage(input: ParsedPage, text: string): PackLanguage {
  if (
    input.sourceLanguage &&
    input.sourceLanguage !== "mixed" &&
    input.sourceLanguage !== "unknown"
  ) {
    return input.sourceLanguage;
  }

  return detectLanguageFromText(text);
}

function regionForLanguage(
  sourceLanguage: PlacementRecordInput["sourceLanguage"],
): PlacementRecordInput["region"] {
  switch (sourceLanguage) {
    case "de":
      return "de-CH";
    case "fr":
      return "fr-CH";
    case "it":
      return "it-CH";
    case "mixed":
      return "mixed";
    case "en":
    case "unknown":
      return "unknown";
  }
}

function hasAnyKeyword(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(normalizeForMatching(keyword)));
}

function sentenceHasApplicationKeyword(sentence: string): boolean {
  const text = normalizeForMatching(sentence);
  return supportedPackLanguages.some((language) =>
    hasAnyKeyword(text, getLanguagePack(language).applicationKeywords),
  );
}

function sentenceHasRoleKeyword(sentence: string): boolean {
  const text = normalizeForMatching(sentence);
  return supportedPackLanguages.some((language) =>
    hasAnyKeyword(text, getLanguagePack(language).roleKeywords),
  );
}

function aliasPattern(names: string[]): RegExp {
  return new RegExp(
    `\\b(${names.map((name) => escapeRegExp(normalizeForMatching(name))).join("|")})\\b`,
    "i",
  );
}

function extractOriginalDepartmentName(text: string, names: string[]): string | null {
  const normalizedText = normalizeForMatching(text);
  const matched = names.find((name) => normalizedText.includes(normalizeForMatching(name)));
  return matched ?? null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractLanguageRequirement(text: string): string | null {
  const match = text.match(
    /\b(?:deutschkenntnisse|deutsch|franzosisch|français|italiano)\s*[A-C][12]\b/i,
  );
  return match ? normalizeWhitespace(match[0]) : null;
}

function extractCompensation(text: string): string | null {
  const match = text.match(/\bCHF\s*[\d'’.,-]+(?:\s*(?:pro|\/)\s*Monat)?\b/i);
  return match ? normalizeWhitespace(match[0]) : null;
}

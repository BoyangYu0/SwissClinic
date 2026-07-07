import {
  makePlacementId,
  type PlacementRecord,
  type PlacementRecordInput,
  PlacementRecordSchema,
} from "@scpi/schema";
import { normalizeWhitespace, parseAvailabilityStatus, parseDurationWeeks } from "@scpi/utils";
import type { ParsedPage, ParserResult, SourceParser } from "./types.js";

interface KsbSection {
  department: string | null;
  text: string;
}

const ksbHostPattern = /(^|\.)kantonsspitalbaden\.ch$/i;
const unterassistenzPattern = /\bunterassistent(?:_in|in|en)?\b/i;
const knownDepartments: Array<[string, RegExp]> = [
  ["Innere Medizin", /\binnere\s+medizin\b/i],
  ["Chirurgie", /\bchirurgie\b/i],
  ["Anästhesiologie", /\b(anasthesie|anästhesie|anaesthesie|anästhesiologie)\b/i],
  [
    "Notfallmedizin",
    /\b(interdisziplinares\s+notfallzentrum|interdisziplinäres\s+notfallzentrum|notfallzentrum|notfallmedizin)\b/i,
  ],
  ["Pädiatrie", /\b(padiatrie|pädiatrie|kinder)\b/i],
];

export const ksbParser: SourceParser = {
  id: "ksb",
  match(input: ParsedPage): boolean {
    return isKsbUrl(input.url) && hasKsbPlacementSignal(input);
  },
  async parse(input: ParsedPage): Promise<ParserResult> {
    const text = normalizeWhitespace(input.visibleText);
    const sections = extractSections(input, text);

    if (sections.length === 0) {
      return {
        records: [],
        warnings: [`KSB parser found no Unterassistenz section on ${input.url}.`],
        parserName: "ksb",
        confidence: "low",
      };
    }

    const records = sections.map((section) => buildRecord(input, section));
    const parsedRecords = records.map((record) => PlacementRecordSchema.parse(record));

    return {
      records: parsedRecords,
      warnings: buildParserWarnings(input, parsedRecords),
      parserName: "ksb",
      confidence: summarizeConfidence(parsedRecords),
    };
  },
};

function isKsbUrl(url: string): boolean {
  try {
    return ksbHostPattern.test(new URL(url).host);
  } catch {
    return false;
  }
}

function hasKsbPlacementSignal(input: ParsedPage): boolean {
  return unterassistenzPattern.test(`${input.title ?? ""} ${input.visibleText}`);
}

function extractSections(input: ParsedPage, text: string): KsbSection[] {
  const titleDepartment = extractDepartment(input.title ?? "");

  if (titleDepartment) {
    return [{ department: titleDepartment, text }];
  }

  const headingPattern =
    /Unterassistent(?:_in|in)?\s+([A-ZÄÖÜ][A-Za-zÄÖÜäöüéèàÉÈÀ\s-]+?)(?:\s+100\s*%|\.|Dauer:|Profil|$)/g;
  const matches = [...text.matchAll(headingPattern)];

  if (matches.length === 0) {
    return [{ department: null, text }];
  }

  return matches.map((match, index) => {
    const start = match.index ?? 0;
    const nextStart = matches[index + 1]?.index ?? text.length;
    const headingDepartment = match[1] ? normalizeDepartment(match[1]) : null;

    return {
      department: headingDepartment,
      text: normalizeWhitespace(text.slice(start, nextStart)),
    };
  });
}

function buildRecord(input: ParsedPage, section: KsbSection): PlacementRecordInput {
  const availability = parseAvailabilityStatus(section.text);
  const duration = parseDurationWeeks(section.text);
  const applicationUrl = findApplicationUrl(input);
  const contactName = extractContactName(section.text);
  const explicitAvailability = hasExplicitAvailability(availability.availabilityStatus);
  const confidence = section.department ? (explicitAvailability ? "high" : "medium") : "low";
  const baseRecord: PlacementRecordInput = {
    id: "temporary",
    sourceId: input.sourceId,
    institutionName: "Kantonsspital Baden",
    department: section.department,
    departmentNormalized: section.department,
    roleType: "Unterassistenz",
    country: "CH",
    canton: "AG",
    city: "Baden",
    language: "de",
    availabilityStatus: availability.availabilityStatus,
    availableFrom: availability.availableFrom,
    fullyBookedUntil: availability.fullyBookedUntil,
    durationMinWeeks: availability.durationMinWeeks ?? duration.minWeeks,
    durationMaxWeeks: availability.durationMaxWeeks ?? duration.maxWeeks,
    applicationLeadTimeMonths: availability.applicationLeadTimeMonths,
    applicationMethod: applicationUrl
      ? applicationMethodFor(applicationUrl, input.url)
      : "not-specified",
    applicationUrl,
    contactEmail: input.emails[0] ?? null,
    contactName,
    eligibilityNotes: extractEligibilityNotes(section.text),
    languageRequirement: extractLanguageRequirement(section.text),
    compensation: extractCompensation(section.text),
    housing: extractHousing(section.text),
    sourceUrl: input.url,
    sourceTitle: input.title,
    extractedSnippet: extractSnippet(input, section),
    sourceLastModified: null,
    lastChecked: input.fetchedAt,
    extractionMethod: "site-parser",
    confidence,
    reviewStatus: confidence === "high" ? "auto-published" : "needs-human-review",
    warnings: buildRecordWarnings(
      section.department,
      availability.availabilityStatus,
      applicationUrl,
      contactName,
    ),
  };

  return { ...baseRecord, id: makePlacementId(baseRecord) };
}

function extractDepartment(value: string): string | null {
  const normalized = normalizeWhitespace(value.replace(/[_|]/g, " "));

  for (const [department, pattern] of knownDepartments) {
    if (pattern.test(normalized)) {
      return department;
    }
  }

  const titleMatch = normalized.match(/Unterassistent(?:in)?\s+(.+?)\s+100\s*%/i);
  return titleMatch?.[1] ? normalizeDepartment(titleMatch[1]) : null;
}

function normalizeDepartment(value: string): string {
  const normalized = normalizeWhitespace(value.replace(/[_|]/g, " "));

  for (const [department, pattern] of knownDepartments) {
    if (pattern.test(normalized)) {
      return department;
    }
  }

  return normalized.replace(/\s+100\s*%$/i, "");
}

function findApplicationUrl(input: ParsedPage): string | null {
  const link = input.links.find((candidate) =>
    /\b(bewerb\w*|jetzt\s+bewerben|apply|application|jobs?)\b/i.test(
      `${candidate.text} ${candidate.href}`,
    ),
  );

  return link?.href ?? null;
}

function applicationMethodFor(
  applicationUrl: string,
  sourceUrl: string,
): PlacementRecordInput["applicationMethod"] {
  try {
    return new URL(applicationUrl).host === new URL(sourceUrl).host
      ? "online-form"
      : "external-platform";
  } catch {
    return "unknown";
  }
}

function extractContactName(text: string): string | null {
  const match = text.match(
    /Fragen zum Bewerbungsablauf\s*([\p{Lu}][\p{L}' -]+?)(?=\+41|Hinweis|$)/u,
  );
  return match?.[1] ? normalizeWhitespace(match[1]) : null;
}

function extractEligibilityNotes(text: string): string | null {
  const profile = text.match(
    /Profil\s*(.+?)(?:Die Ausbildung|Dauer:|Monatslohn:|Noch Fragen\?|$)/i,
  )?.[1];
  const source = profile ?? text;
  const notes = [
    ...source.matchAll(
      /Du\s+(?:machst aktuell ein Medizinstudium|sprichst Deutsch auf mindestens B2-Niveau|hast einen Pass eines EU-\/EFTA-Staats)[.]/gi,
    ),
  ].map((match) => normalizeWhitespace(match[0]));

  return notes.length > 0 ? notes.join(" ") : null;
}

function extractLanguageRequirement(text: string): string | null {
  const match = text.match(/\bDeutsch\s+auf\s+mindestens\s+B2-Niveau\b/i);
  return match ? normalizeWhitespace(match[0]) : null;
}

function extractCompensation(text: string): string | null {
  const match = text.match(/\bCHF\s*[\d'’.,-]+(?:\s*(?:pro|\/)\s*Monat)?(?=[^\d'’.,-]|$)/i);
  return match ? normalizeWhitespace(match[0]) : null;
}

function extractHousing(text: string): PlacementRecordInput["housing"] {
  return /Wohnen auf dem Gesundheitscampus|Wohnung auf dem KSB-Areal/i.test(text) ? "yes" : null;
}

function extractSnippet(input: ParsedPage, section: KsbSection): string {
  const title = input.title ? `${input.title}. ` : "";
  return normalizeWhitespace(`${title}${section.text}`).slice(0, 700);
}

function hasExplicitAvailability(status: PlacementRecordInput["availabilityStatus"]): boolean {
  return status === "available" || status === "available-from" || status === "fully-booked-until";
}

function buildRecordWarnings(
  department: string | null,
  availabilityStatus: PlacementRecordInput["availabilityStatus"],
  applicationUrl: string | null,
  contactName: string | null,
): string[] {
  const warnings: string[] = [];

  if (!department) {
    warnings.push("KSB parser could not determine a department.");
  }

  if (!hasExplicitAvailability(availabilityStatus)) {
    warnings.push("KSB page does not state explicit availability; no date was inferred.");
  }

  if (!applicationUrl && !contactName) {
    warnings.push("KSB parser found no application URL or application contact.");
  }

  return warnings;
}

function buildParserWarnings(input: ParsedPage, records: PlacementRecord[]): string[] {
  const warnings: string[] = [];

  if (records.some((record) => record.confidence !== "high")) {
    warnings.push(`KSB parser output for ${input.url} needs human review.`);
  }

  return warnings;
}

function summarizeConfidence(records: PlacementRecord[]): ParserResult["confidence"] {
  if (records.length === 0 || records.some((record) => record.confidence === "low")) {
    return "low";
  }

  return records.every((record) => record.confidence === "high") ? "high" : "medium";
}

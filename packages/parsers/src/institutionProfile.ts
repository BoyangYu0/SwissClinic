import {
  makePlacementId,
  type PlacementRecord,
  type PlacementRecordInput,
  PlacementRecordSchema,
} from "@scpi/schema";
import { normalizeWhitespace, parseAvailabilityStatus, parseDurationWeeks } from "@scpi/utils";
import type { ParsedPage, ParserResult, SourceParser } from "./types.js";

export interface InstitutionParserConfig {
  id: string;
  hostPatterns: RegExp[];
  institutionName: string;
  canton: string;
  city: string;
  language?: PlacementRecordInput["language"];
  roleType?: PlacementRecordInput["roleType"];
  departmentPatterns: Array<[string, RegExp]>;
  fallbackDepartment?: string | null;
  applicationLinkPattern?: RegExp;
  requireDepartmentApplicationLink?: boolean;
  suppressDuration?: boolean;
  availabilityOverride?: (input: ParsedPage, text: string) => Partial<AvailabilityFields> | null;
  extractSections?: (input: ParsedPage, text: string) => InstitutionSection[];
  extractEligibilityNotes?: (text: string) => string | null;
}

export interface InstitutionSection {
  department: string | null;
  text: string;
}

interface AvailabilityFields {
  availabilityStatus: PlacementRecordInput["availabilityStatus"];
  availableFrom: string | null;
  fullyBookedUntil: string | null;
}

export function createInstitutionParser(config: InstitutionParserConfig): SourceParser {
  return {
    id: config.id,
    match(input: ParsedPage): boolean {
      return matchesHost(input.url, config.hostPatterns) && hasPlacementSignal(input);
    },
    async parse(input: ParsedPage): Promise<ParserResult> {
      const text = normalizeWhitespace(input.visibleText);
      const sections = config.extractSections?.(input, text) ?? detectSections(config, input, text);

      if (sections.length === 0) {
        return {
          records: [],
          warnings: [`${config.id} parser found no placement section on ${input.url}.`],
          parserName: config.id,
          confidence: "low",
        };
      }

      const records = sections.map((section) => buildRecord(config, input, section, text));
      const parsedRecords = records.map((record) => PlacementRecordSchema.parse(record));

      return {
        records: parsedRecords,
        warnings: buildParserWarnings(config, input, parsedRecords),
        parserName: config.id,
        confidence: summarizeConfidence(parsedRecords),
      };
    },
  };
}

export function defaultExtractSections(
  config: InstitutionParserConfig,
  input: ParsedPage,
  text: string,
): InstitutionSection[] {
  return detectSections(config, input, text);
}

function matchesHost(url: string, patterns: RegExp[]): boolean {
  try {
    const host = new URL(url).host;
    return patterns.some((pattern) => pattern.test(host));
  } catch {
    return false;
  }
}

function hasPlacementSignal(input: ParsedPage): boolean {
  return /\b(unterassist|famulatur|wahlstudienjahr|praktisches\s+jahr|\bpj\b|medizinstudium|blockstudent)/i.test(
    `${input.title ?? ""} ${input.visibleText}`,
  );
}

function detectSections(
  config: InstitutionParserConfig,
  input: ParsedPage,
  text: string,
): InstitutionSection[] {
  const departments = new Set<string>();
  const title = input.title ?? "";

  for (const [department, pattern] of config.departmentPatterns) {
    if (pattern.test(title) || pattern.test(text)) {
      departments.add(department);
    }
  }

  if (departments.size === 0 && config.fallbackDepartment !== undefined) {
    return [{ department: config.fallbackDepartment, text }];
  }

  return [...departments].map((department) => ({
    department,
    text: extractDepartmentContext(text, department),
  }));
}

function buildRecord(
  config: InstitutionParserConfig,
  input: ParsedPage,
  section: InstitutionSection,
  fullText: string,
): PlacementRecordInput {
  const parsedAvailability = parseAvailabilityStatus(section.text);
  const override = config.availabilityOverride?.(input, section.text) ?? null;
  const availabilityStatus = override?.availabilityStatus ?? parsedAvailability.availabilityStatus;
  const duration = config.suppressDuration
    ? { minWeeks: null, maxWeeks: null }
    : parseDurationWeeks(section.text);
  const applicationUrl = findApplicationUrl(config, input, section.department);
  const explicitAvailability = hasExplicitAvailability(availabilityStatus);
  const confidence = section.department ? (explicitAvailability ? "high" : "medium") : "low";
  const baseRecord: PlacementRecordInput = {
    id: "temporary",
    sourceId: input.sourceId,
    institutionName: config.institutionName,
    department: section.department,
    departmentNormalized: section.department,
    roleType: config.roleType ?? detectRoleType(fullText),
    country: "CH",
    canton: config.canton,
    city: config.city,
    language: config.language ?? "de",
    availabilityStatus,
    availableFrom: override?.availableFrom ?? parsedAvailability.availableFrom,
    fullyBookedUntil: override?.fullyBookedUntil ?? parsedAvailability.fullyBookedUntil,
    durationMinWeeks: config.suppressDuration
      ? null
      : (parsedAvailability.durationMinWeeks ?? duration.minWeeks),
    durationMaxWeeks: config.suppressDuration
      ? null
      : (parsedAvailability.durationMaxWeeks ?? duration.maxWeeks),
    applicationLeadTimeMonths: parsedAvailability.applicationLeadTimeMonths,
    applicationMethod: applicationUrl
      ? applicationMethodFor(applicationUrl, input.url)
      : "not-specified",
    applicationUrl,
    contactEmail: input.emails[0] ?? null,
    contactName: extractContactName(section.text),
    eligibilityNotes:
      config.extractEligibilityNotes?.(section.text) ?? extractEligibilityNotes(section.text),
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
      config.id,
      section.department,
      availabilityStatus,
      applicationUrl,
    ),
  };

  return { ...baseRecord, id: makePlacementId(baseRecord) };
}

function findApplicationUrl(
  config: InstitutionParserConfig,
  input: ParsedPage,
  department: string | null,
): string | null {
  const pattern =
    config.applicationLinkPattern ??
    /\b(bewerb\w*|freie\s+unterassistenzstellen|apply|application|job|anmeldung|formular)\b/i;
  const departmentLink = department
    ? input.links.find(
        (candidate) =>
          pattern.test(`${candidate.text} ${candidate.href}`) &&
          linkMatchesDepartment(candidate.text, candidate.href, department),
      )
    : undefined;
  const link =
    departmentLink ??
    (department && config.requireDepartmentApplicationLink
      ? undefined
      : input.links.find((candidate) => pattern.test(`${candidate.text} ${candidate.href}`)));
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

  return "ClinicalPlacement";
}

function extractDepartmentContext(text: string, department: string): string {
  const sentences = text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => normalizeWhitespace(sentence))
    .filter(Boolean);
  const index = sentences.findIndex((sentence) =>
    sentence.toLowerCase().includes(department.toLowerCase()),
  );

  if (index < 0) {
    return text;
  }

  return normalizeWhitespace(sentences.slice(index, index + 5).join(" "));
}

function extractContactName(text: string): string | null {
  const match =
    text.match(/Für Fragen steht Ihnen\s+([\p{Lu}][\p{L}' -]+?)\s+zur Verfügung/u) ??
    text.match(/Programmleitung\s*([\p{Lu}][\p{L}.' -]+?)(?=Voraussetzungen|Deutsch|$)/u);
  const candidate = match?.[1] ? normalizeWhitespace(match[1]) : null;

  if (!candidate || candidate.includes("Programmdauer") || candidate.length > 80) {
    return null;
  }

  return candidate;
}

function extractEligibilityNotes(text: string): string | null {
  const notes = [
    ...text.matchAll(
      /\b(?:ab dem 4\. Studienjahr|im Wahlstudienjahr|Deutschkenntnisse B2|Keine Famulaturen möglich|Studierende der Humanmedizin)[^.]*[.]?/gi,
    ),
  ].map((match) => normalizeWhitespace(match[0]));

  return notes.length > 0 ? notes.join(" ") : null;
}

function extractLanguageRequirement(text: string): string | null {
  const match =
    text.match(/\bDeutschkenntnisse\s+B2\b/i) ??
    text.match(/\bDeutsch\s+auf\s+mindestens\s+B2-Niveau\b/i);
  return match ? normalizeWhitespace(match[0]) : null;
}

function extractCompensation(text: string): string | null {
  const salaryMatch = text.match(
    /\b(?:Gehalt|Monatslohn|Lohn)[^C]{0,120}(CHF\s*[\d'’.,-]+(?:\s*(?:pro|\/)\s*Monat)?)(?=[^\d'’.,-]|$)/i,
  );

  if (salaryMatch?.[1]) {
    return normalizeWhitespace(salaryMatch[1]);
  }

  return null;
}

function extractHousing(text: string): PlacementRecordInput["housing"] {
  if (/personalzimmer|personalunterk|unterkunft|möblierten Zimmer|Wohnung/i.test(text)) {
    return "yes";
  }

  return null;
}

function extractSnippet(input: ParsedPage, section: InstitutionSection): string {
  const title = input.title ? `${input.title}. ` : "";
  return normalizeWhitespace(`${title}${section.text}`).slice(0, 700);
}

function hasExplicitAvailability(status: PlacementRecordInput["availabilityStatus"]): boolean {
  return status === "available" || status === "available-from" || status === "fully-booked-until";
}

function linkMatchesDepartment(text: string, href: string, department: string): boolean {
  const normalized = `${text} ${href}`
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
  const aliases = departmentAliases(department);
  return aliases.some((alias) => normalized.includes(alias));
}

function departmentAliases(department: string): string[] {
  switch (department) {
    case "Anästhesiologie":
      return ["anasthesie", "anaesthesie", "anir"];
    case "Frauenheilkunde":
      return ["frauenklinik", "gyn"];
    case "Innere Medizin":
      return ["innere medizin", "medizin"];
    case "Pädiatrie":
      return ["paediatrie", "padiatrie", "kinder"];
    case "Orthopädie":
      return ["orthopadie", "orthopaedie", "orthopadie-traumatologie", "ortho"];
    default:
      return [
        department
          .normalize("NFD")
          .replace(/\p{Diacritic}/gu, "")
          .toLowerCase(),
      ];
  }
}

function buildRecordWarnings(
  parserId: string,
  department: string | null,
  availabilityStatus: PlacementRecordInput["availabilityStatus"],
  applicationUrl: string | null,
): string[] {
  const warnings: string[] = [];

  if (!department) {
    warnings.push(`${parserId} parser could not determine a department.`);
  }

  if (!hasExplicitAvailability(availabilityStatus)) {
    warnings.push(`${parserId} page does not state explicit availability; no date was inferred.`);
  }

  if (!applicationUrl) {
    warnings.push(`${parserId} parser found no application URL.`);
  }

  return warnings;
}

function buildParserWarnings(
  config: InstitutionParserConfig,
  input: ParsedPage,
  records: PlacementRecord[],
): string[] {
  return records.some((record) => record.confidence !== "high")
    ? [`${config.id} parser output for ${input.url} needs human review.`]
    : [];
}

function summarizeConfidence(records: PlacementRecord[]): ParserResult["confidence"] {
  if (records.length === 0 || records.some((record) => record.confidence === "low")) {
    return "low";
  }

  return records.every((record) => record.confidence === "high") ? "high" : "medium";
}

import {
  normalizeDateText,
  parseDurationWeeks,
  parseLeadTimeMonths,
  parseMonthExpression,
} from "./date.js";

export type ParsedAvailabilityStatus =
  | "available"
  | "available-from"
  | "fully-booked-until"
  | "not-specified"
  | "application-only"
  | "unclear";

export interface AvailabilityParseResult {
  availabilityStatus: ParsedAvailabilityStatus;
  availableFrom: string | null;
  fullyBookedUntil: string | null;
  applicationLeadTimeMonths: number | null;
  durationMinWeeks: number | null;
  durationMaxWeeks: number | null;
  warnings: string[];
}

export function parseAvailabilityStatus(text: string, language?: string): AvailabilityParseResult {
  const normalized = normalizeDateText(text);
  const applicationLeadTimeMonths = parseLeadTimeMonths(text);
  const duration = parseDurationWeeks(text);
  const base = {
    availableFrom: null,
    fullyBookedUntil: null,
    applicationLeadTimeMonths,
    durationMinWeeks: duration.minWeeks,
    durationMaxWeeks: duration.maxWeeks,
  };

  if (!normalized) {
    return {
      ...base,
      availabilityStatus: "not-specified",
      warnings: ["No availability text was provided."],
    };
  }

  if (hasUnavailablePhrase(normalized)) {
    const fullyBookedUntil = parseMonthExpression(text);
    return {
      ...base,
      availabilityStatus: fullyBookedUntil ? "fully-booked-until" : "not-specified",
      fullyBookedUntil,
      warnings: fullyBookedUntil
        ? []
        : ["Fully booked wording was detected, but no end date could be parsed."],
    };
  }

  if (hasImmediateAvailability(normalized)) {
    return { ...base, availabilityStatus: "available", warnings: [] };
  }

  if (hasArrangementPhrase(normalized)) {
    return {
      ...base,
      availabilityStatus: "not-specified",
      warnings: ["Availability is described as by arrangement rather than as a date."],
    };
  }

  const availableFrom = parseAvailableFrom(text, language);

  if (availableFrom) {
    return { ...base, availabilityStatus: "available-from", availableFrom, warnings: [] };
  }

  if (hasApplicationPhrase(normalized)) {
    return {
      ...base,
      availabilityStatus: "application-only",
      warnings: ["Application information was detected without explicit availability."],
    };
  }

  if (hasAvailablePhrase(normalized)) {
    return { ...base, availabilityStatus: "available", warnings: [] };
  }

  return {
    ...base,
    availabilityStatus: "not-specified",
    warnings: ["No explicit availability status could be parsed."],
  };
}

function hasUnavailablePhrase(text: string): boolean {
  return /\b(?:ausgebucht|keine\s+freien\s+platze|keine\s+freien\s+stellen|keine\s+famulaturen|keine\s+angeboten|bietet\s+keine|voll\s+belegt|complet|aucune\s+place\s+disponible|occupe|occupato|nessun\s+posto\s+disponibile|posti\s+esauriti|fully\s+booked)\b/.test(
    text,
  );
}

function hasImmediateAvailability(text: string): boolean {
  return /\b(?:ab\s+sofort|per\s+sofort|sofort\s+moglich|des\s+maintenant|da\s+subito|immediately)\b/.test(
    text,
  );
}

function hasArrangementPhrase(text: string): boolean {
  return /\b(?:nach\s+vereinbarung|sur\s+accord|sur\s+demande|da\s+concordare|previo\s+accordo)\b/.test(
    text,
  );
}

function parseAvailableFrom(text: string, language?: string): string | null {
  const normalized = normalizeDateText(text);
  const cuePattern = startCuePattern(language);

  for (const match of normalized.matchAll(cuePattern)) {
    if (match.index === undefined) {
      continue;
    }

    const cueAndDate = normalized.slice(match.index, match.index + 40);
    const dateExpression = cueAndDate.match(
      /\b(?:\d{1,2}\.\d{1,2}\.\d{4}|(?:ende|fin|fine)\s+\d{4}|[a-z]+\s+\d{4})\b/,
    );

    if (!dateExpression || dateExpression.index === undefined) {
      continue;
    }

    const connector = cueAndDate.slice(match[0].length, dateExpression.index);
    const connectorWordCount = connector.match(/[a-z]+/g)?.length ?? 0;

    if (connectorWordCount > 4) {
      continue;
    }

    const parsed = parseMonthExpression(cueAndDate, language);

    if (parsed) {
      return parsed;
    }
  }

  return null;
}

function startCuePattern(language?: string): RegExp {
  switch (language) {
    case "de":
      return /\bab(?:\s+(?:dem|den|semester|monat))?\b/g;
    case "fr":
      return /\b(?:des|a\s+partir\s+(?:du|de))\b/g;
    case "it":
      return /\b(?:da|a\s+partire\s+(?:dal|da))\b/g;
    case "en":
      return /\b(?:from|starting(?:\s+from)?)\b/g;
    default:
      return /\b(?:ab(?:\s+(?:dem|den|semester|monat))?|des|a\s+partir\s+(?:du|de)|da|a\s+partire\s+(?:dal|da)|from|starting(?:\s+from)?)\b/g;
  }
}

function hasApplicationPhrase(text: string): boolean {
  return /\b(?:bewerbung|bewerbungen|bewerben|bewerbungsfrist|candidature|postulation|candidatura|apply|application)\b/.test(
    text,
  );
}

function hasAvailablePhrase(text: string): boolean {
  return /\b(?:freie\s+platze|freie\s+stellen|verfugbar|disponible|posto\s+disponibile|posti\s+disponibili|available)\b/.test(
    text,
  );
}

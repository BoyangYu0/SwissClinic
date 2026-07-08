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

export function parseAvailabilityStatus(text: string): AvailabilityParseResult {
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

  const availableFrom = hasStartCue(normalized) ? parseMonthExpression(text) : null;

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

function hasStartCue(text: string): boolean {
  return /\b(?:ab|ab\s+dem|ab\s+den|ab\s+semester|ab\s+monat|dès|des|a\s+partir\s+du|a\s+partir\s+de|da|a\s+partire\s+dal|a\s+partire\s+da|from|starting)\b/.test(
    text,
  );
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

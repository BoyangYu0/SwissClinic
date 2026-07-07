export interface DurationWeeks {
  minWeeks: number | null;
  maxWeeks: number | null;
}

const monthNumbers = new Map<string, string>([
  ["januar", "01"],
  ["january", "01"],
  ["janvier", "01"],
  ["gennaio", "01"],
  ["februar", "02"],
  ["february", "02"],
  ["fevrier", "02"],
  ["febbraio", "02"],
  ["marz", "03"],
  ["maerz", "03"],
  ["march", "03"],
  ["mars", "03"],
  ["marzo", "03"],
  ["april", "04"],
  ["avril", "04"],
  ["aprile", "04"],
  ["mai", "05"],
  ["may", "05"],
  ["maggio", "05"],
  ["juni", "06"],
  ["june", "06"],
  ["juin", "06"],
  ["giugno", "06"],
  ["juli", "07"],
  ["july", "07"],
  ["juillet", "07"],
  ["luglio", "07"],
  ["august", "08"],
  ["aout", "08"],
  ["agosto", "08"],
  ["september", "09"],
  ["septembre", "09"],
  ["settembre", "09"],
  ["oktober", "10"],
  ["october", "10"],
  ["octobre", "10"],
  ["ottobre", "10"],
  ["november", "11"],
  ["novembre", "11"],
  ["dezember", "12"],
  ["december", "12"],
  ["decembre", "12"],
  ["dicembre", "12"],
]);

const monthAlternation = [...monthNumbers.keys()].join("|");
const numberWords = new Map<string, number>([
  ["ein", 1],
  ["eine", 1],
  ["einem", 1],
  ["einen", 1],
  ["zwei", 2],
  ["drei", 3],
  ["vier", 4],
  ["funf", 5],
  ["fuenf", 5],
  ["sechs", 6],
  ["sieben", 7],
  ["acht", 8],
  ["neun", 9],
  ["zehn", 10],
  ["un", 1],
  ["una", 1],
  ["due", 2],
  ["tre", 3],
  ["quattro", 4],
  ["one", 1],
  ["two", 2],
  ["three", 3],
  ["four", 4],
]);
const quantityPattern = `\\d{1,2}|${[...numberWords.keys()].join("|")}`;

export function parseMonthExpression(text: string, language?: string): string | null {
  const normalized = normalizeDateText(text);

  if (!normalized || isArrangementOnly(normalized) || hasDeadlineContext(normalized)) {
    return null;
  }

  const exactDate = parseNumericDate(normalized);

  if (exactDate) {
    return exactDate;
  }

  const endOfYear = normalized.match(/\b(?:ende|fin|fine)\s+(\d{4})\b/);

  if (endOfYear?.[1]) {
    return `${endOfYear[1]}-12`;
  }

  const preferredMonth = parseMonthNameWithYear(normalized, language);

  if (preferredMonth) {
    return preferredMonth;
  }

  return null;
}

export function parseLeadTimeMonths(text: string): number | null {
  const normalized = normalizeDateText(text);
  const numericPatterns = [
    /\b(\d{1,2})\s+monate?\s+(?:im\s+voraus|vorher|vorlauf)\b/,
    /\b(?:fruhestens|fruehestens|spatestens|spaetestens)\s+(\d{1,2})\s+monate?\s+vor\s+(?:beginn|start|antritt)\b/,
    /\b(?:bewerbungen?|bewerben)\s+(?:fruhestens|fruehestens|spatestens|spaetestens)\s+(\d{1,2})\s+monate?\s+vor\s+(?:beginn|start|antritt)\b/,
    /\b(\d{1,2})\s+mois\s+(?:a\s+l'avance|d'avance|avant)\b/,
    /\b(\d{1,2})\s+mesi\s+(?:di\s+anticipo|prima)\b/,
    /\b(\d{1,2})\s+months?\s+in\s+advance\b/,
  ];

  for (const pattern of numericPatterns) {
    const match = normalized.match(pattern);
    const value = match?.[1] ? Number.parseInt(match[1], 10) : null;

    if (value) {
      return value;
    }
  }

  const yearPatterns = [
    /\b(?:ein|einem|1)\s+jahr\s+(?:im\s+voraus|vorher)\b/,
    /\b(?:un|1)\s+an\s+(?:a\s+l'avance|d'avance|avant)\b/,
    /\b(?:un|1)\s+anno\s+(?:di\s+anticipo|prima)\b/,
    /\b(?:one|1)\s+year\s+in\s+advance\b/,
  ];

  return yearPatterns.some((pattern) => pattern.test(normalized)) ? 12 : null;
}

export function monthsBetweenObservedAndTarget(
  observedAt: string,
  targetMonthOrDate: string,
): number | null {
  const observed = monthIndexFromDateTime(observedAt);
  const target = monthIndexFromMonthOrDate(targetMonthOrDate);

  if (observed === null || target === null) {
    return null;
  }

  return target - observed;
}

export function parseDurationWeeks(text: string): DurationWeeks {
  const normalized = normalizeDateText(text);

  if (hasLeadTimeContext(normalized) && !normalized.includes("dauer")) {
    return { minWeeks: null, maxWeeks: null };
  }

  const listRange = parseDurationList(normalized);

  if (listRange) {
    return listRange;
  }

  const monthRange = normalized.match(
    new RegExp(
      `\\b(${quantityPattern})\\s*(?:bis|und|-|–|a|to)\\s*(${quantityPattern})\\s*(?:monate?|monaten|monatiges|mois|mesi|months?)\\b`,
    ),
  );

  if (monthRange?.[1] && monthRange[2]) {
    return {
      minWeeks: parseQuantity(monthRange[1]) * 4,
      maxWeeks: parseQuantity(monthRange[2]) * 4,
    };
  }

  const weekRange = normalized.match(
    new RegExp(
      `\\b(${quantityPattern})\\s*(?:bis|und|-|–|a|to)\\s*(${quantityPattern})\\s*(?:wochen|semaines?|settimane|weeks?)\\b`,
    ),
  );

  if (weekRange?.[1] && weekRange[2]) {
    return {
      minWeeks: parseQuantity(weekRange[1]),
      maxWeeks: parseQuantity(weekRange[2]),
    };
  }

  const minimum = normalized.match(
    new RegExp(
      `\\b(?:mindestens|minimum|au\\s+moins|almeno|at\\s+least|ab)\\s+(${quantityPattern})\\s+(wochen|semaines?|settimane|weeks?|monate?|monaten|mois|mesi|months?)\\b`,
    ),
  );

  if (minimum?.[1] && minimum[2]) {
    const weeks = toWeeks(parseQuantity(minimum[1]), minimum[2]);
    return { minWeeks: weeks, maxWeeks: null };
  }

  const single = normalized.match(
    new RegExp(
      `\\b(${quantityPattern})\\s*(wochen|semaines?|settimane|weeks?|monate?|monaten|monatiges|mois|mesi|months?)\\b`,
    ),
  );

  if (single?.[1] && single[2]) {
    const weeks = toWeeks(parseQuantity(single[1]), single[2]);
    return { minWeeks: weeks, maxWeeks: weeks };
  }

  return { minWeeks: null, maxWeeks: null };
}

export function normalizeDateText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[’']/g, "'")
    .toLowerCase()
    .replace(/(\d)[-–](?=[a-z])/g, "$1 ")
    .replace(/([a-z])(\d)/g, "$1 $2")
    .replace(/(\d)([a-z])/g, "$1 $2")
    .replace(/(dauer)(ab)/g, "$1 $2")
    .replace(/(monat|monate|monaten)(programmleitung|voraussetzungen|kontakt|stellen)/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

function parseNumericDate(text: string): string | null {
  const match = text.match(/\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b/);

  if (!match?.[1] || !match[2] || !match[3]) {
    return null;
  }

  const day = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const year = Number.parseInt(match[3], 10);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function monthIndexFromDateTime(value: string): number | null {
  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return null;
  }

  return date.getUTCFullYear() * 12 + date.getUTCMonth();
}

function monthIndexFromMonthOrDate(value: string): number | null {
  const match = value.match(/^(\d{4})-(0[1-9]|1[0-2])(?:-\d{2})?$/);

  if (!match?.[1] || !match[2]) {
    return null;
  }

  return Number.parseInt(match[1], 10) * 12 + Number.parseInt(match[2], 10) - 1;
}

function parseMonthNameWithYear(text: string, language?: string): string | null {
  const languageHint = language ? normalizeDateText(language) : null;
  const pattern = new RegExp(`\\b(${monthAlternation})\\s+(\\d{4})\\b`);
  const match = text.match(pattern);

  if (!match?.[1] || !match[2]) {
    return null;
  }

  const month = monthNumbers.get(match[1]);

  if (!month) {
    return null;
  }

  if (languageHint === "de" && ["mars", "mai"].includes(match[1])) {
    return null;
  }

  return `${match[2]}-${month}`;
}

function hasDeadlineContext(text: string): boolean {
  const deadlinePattern =
    /\b(?:bewerbungsfrist|frist|deadline|application deadline|delai de candidature|date limite|scadenza)\b/;
  return deadlinePattern.test(text);
}

function isArrangementOnly(text: string): boolean {
  return /\b(?:nach vereinbarung|sur accord|sur demande|da concordare|previo accordo)\b/.test(text);
}

function hasLeadTimeContext(text: string): boolean {
  return /\b(?:im\s+voraus|vorher|vorlauf|a\s+l'avance|d'avance|avant|di\s+anticipo|prima|in\s+advance)\b/.test(
    text,
  );
}

function parseDurationList(text: string): DurationWeeks | null {
  const listMatch = text.match(
    new RegExp(
      `\\b(${quantityPattern})(?:\\s*,\\s*(${quantityPattern}))?(?:\\s*,\\s*(${quantityPattern}))?\\s+oder\\s+(${quantityPattern})\\s+(monate?|monaten|mois|mesi|months?|wochen|semaines?|settimane|weeks?)\\b`,
    ),
  );

  if (!listMatch?.[1] || !listMatch[4] || !listMatch[5]) {
    return null;
  }

  const quantities = [listMatch[1], listMatch[2], listMatch[3], listMatch[4]]
    .filter((value): value is string => Boolean(value))
    .map(parseQuantity);

  return {
    minWeeks: toWeeks(Math.min(...quantities), listMatch[5]),
    maxWeeks: toWeeks(Math.max(...quantities), listMatch[5]),
  };
}

function parseQuantity(value: string): number {
  const numeric = Number.parseInt(value, 10);

  if (Number.isFinite(numeric)) {
    return numeric;
  }

  return numberWords.get(value) ?? 0;
}

function toWeeks(value: number, unit: string): number {
  return /^(mon|mois|mesi|months?)/.test(unit) ? value * 4 : value;
}

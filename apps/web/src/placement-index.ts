import type { PlacementRecord, SourceRegistryEntry } from "@scpi/schema";

export interface PlacementFilters {
  query?: string;
  canton?: string;
  city?: string;
  institutionName?: string;
  department?: string;
  roleType?: string;
  availabilityStatus?: string;
  availableFrom?: string;
  confidence?: string;
  language?: string;
  region?: string;
}

export interface ReviewQueueItem {
  record: PlacementRecord;
  parserType: string;
  priorityScore: number;
  priorityReasons: string[];
}

export interface FilterOption {
  value: string;
  label: string;
}

export interface CanonicalField {
  value: string;
  label: string;
}

export interface PlacementIndexViewModel {
  placements: PlacementRecord[];
  sources: SourceRegistryEntry[];
  filters: {
    cantons: FilterOption[];
    cities: FilterOption[];
    institutions: FilterOption[];
    departments: FilterOption[];
    roleTypes: FilterOption[];
    availabilityStatuses: FilterOption[];
    availableFromMonths: FilterOption[];
    confidences: FilterOption[];
    languages: FilterOption[];
    regions: FilterOption[];
  };
  summary: {
    totalPlacements: number;
    sourceCount: number;
    needingReview: number;
    lastChecked: string | null;
  };
}

export function createPlacementIndexViewModel(
  placements: PlacementRecord[],
  sources: SourceRegistryEntry[],
): PlacementIndexViewModel {
  return {
    placements,
    sources,
    filters: {
      cantons: toOptions(placements.map((record) => record.canton)),
      cities: toOptions(placements.map((record) => record.city)),
      institutions: toOptions(placements.map((record) => record.institutionName)),
      departments: toCanonicalOptions(placements.map(canonicalDepartment)),
      roleTypes: toCanonicalOptions(placements.map(canonicalRoleType)),
      availabilityStatuses: toCanonicalOptions(placements.map(canonicalAvailabilityStatus)),
      availableFromMonths: toOptions(placements.map((record) => record.availableFrom)),
      confidences: toOptions(placements.map((record) => record.confidence)),
      languages: toOptions(placements.map((record) => record.language)),
      regions: toOptions(placements.map((record) => record.region)),
    },
    summary: {
      totalPlacements: placements.length,
      sourceCount: sources.length,
      needingReview: placements.filter((record) => record.reviewStatus === "needs-human-review")
        .length,
      lastChecked: newestDate(placements.map((record) => record.lastChecked)),
    },
  };
}

export function filterPlacements(
  placements: PlacementRecord[],
  filters: PlacementFilters,
): PlacementRecord[] {
  const query = normalize(filters.query);

  return placements.filter((record) => {
    if (query && !placementSearchText(record).includes(query)) {
      return false;
    }

    return (
      matches(record.canton, filters.canton) &&
      matches(record.city, filters.city) &&
      matches(record.institutionName, filters.institutionName) &&
      matches(canonicalDepartment(record).value, filters.department) &&
      matches(canonicalRoleType(record).value, filters.roleType) &&
      matches(canonicalAvailabilityStatus(record).value, filters.availabilityStatus) &&
      matches(record.availableFrom, filters.availableFrom) &&
      matches(record.confidence, filters.confidence) &&
      matches(record.language, filters.language) &&
      matches(record.region, filters.region)
    );
  });
}

export function createReviewQueue(
  placements: PlacementRecord[],
  sources: SourceRegistryEntry[],
): ReviewQueueItem[] {
  const sourcesById = new Map(sources.map((source) => [source.id, source]));

  return placements
    .map((record) => {
      const source = sourcesById.get(record.sourceId);
      const parserType = sourceParserType(source, record);
      const priorityReasons: string[] = [];

      if (record.confidence === "low") {
        priorityReasons.push("low confidence");
      }

      if (parserType !== "site-specific") {
        priorityReasons.push("no site-specific parser");
      }

      if ((record.sourceLanguage ?? record.language) !== "de") {
        priorityReasons.push("non-German source");
      }

      if (record.availableFrom || record.fullyBookedUntil) {
        priorityReasons.push("availability date");
      }

      if (
        record.explicitApplicationLeadTimeMonths !== null ||
        record.observedMonthsAhead !== null ||
        record.leadTimeSummaryId !== null
      ) {
        priorityReasons.push("lead-time evidence");
      }

      return {
        record,
        parserType,
        priorityScore: priorityReasons.length,
        priorityReasons,
      };
    })
    .sort((left, right) => {
      if (left.priorityScore !== right.priorityScore) {
        return right.priorityScore - left.priorityScore;
      }

      if (left.record.confidence !== right.record.confidence) {
        return confidenceRank(left.record.confidence) - confidenceRank(right.record.confidence);
      }

      return left.record.institutionName.localeCompare(right.record.institutionName);
    });
}

function placementSearchText(record: PlacementRecord): string {
  return normalize(
    [
      record.institutionName,
      record.department,
      record.departmentNormalized,
      canonicalDepartment(record).label,
      record.roleType,
      canonicalRoleType(record).label,
      record.canton,
      record.city,
      record.availabilityStatus,
      canonicalAvailabilityStatus(record).label,
      record.availableFrom,
      record.originalDepartmentName,
      record.extractionLanguage,
      record.region,
      record.contactEmail,
      record.contactName,
      record.eligibilityNotes,
      record.extractedSnippet,
    ]
      .filter(Boolean)
      .join(" "),
  );
}

function matches(value: string | null, filterValue: string | undefined): boolean {
  return !filterValue || value === filterValue;
}

function toOptions(values: Array<string | null>): FilterOption[] {
  return [...new Set(values.filter((value): value is string => value !== null && value !== ""))]
    .sort((left, right) => left.localeCompare(right))
    .map((value) => ({ value, label: displayLabel(value) }));
}

function toCanonicalOptions(values: CanonicalField[]): FilterOption[] {
  const options = new Map<string, string>();

  for (const value of values) {
    options.set(value.value, value.label);
  }

  return [...options.entries()]
    .sort((left, right) => left[1].localeCompare(right[1]))
    .map(([value, label]) => ({ value, label }));
}

function newestDate(values: string[]): string | null {
  const newest = values
    .map((value) => Date.parse(value))
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => right - left)[0];

  return newest === undefined ? null : new Date(newest).toISOString();
}

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function canonicalRoleType(
  record: Pick<PlacementRecord, "roleType" | "roleTypeOriginal">,
): CanonicalField {
  if (
    record.roleType === "Unterassistenz" ||
    record.roleType === "Wahlstudienjahr" ||
    record.roleType === "ClinicalPlacement" ||
    /\b(stage|sous-assistant|tirocinio)\b/i.test(record.roleTypeOriginal ?? "")
  ) {
    return { value: "clinical-elective", label: "Clinical elective" };
  }

  if (record.roleType === "Unknown") {
    return { value: "not-specified", label: "Not specified" };
  }

  return { value: record.roleType, label: displayLabel(record.roleType) };
}

export function canonicalAvailabilityStatus(
  record: Pick<PlacementRecord, "availabilityStatus">,
): CanonicalField {
  if (record.availabilityStatus === "unclear" || record.availabilityStatus === "not-specified") {
    return { value: "not-specified", label: "Not specified" };
  }

  return { value: record.availabilityStatus, label: displayLabel(record.availabilityStatus) };
}

export function canonicalDepartment(
  record: Pick<PlacementRecord, "department" | "departmentNormalized" | "originalDepartmentName">,
): CanonicalField {
  const raw =
    record.departmentNormalized ??
    record.department ??
    record.originalDepartmentName ??
    "not-specified";
  const key = normalizeDepartmentKey(raw);
  const mapped = departmentLabels[key];

  if (mapped) {
    return mapped;
  }

  if (raw === "not-specified") {
    return { value: "not-specified", label: "Not specified" };
  }

  const fallbackLabel = raw.includes("-") ? titleCase(raw.replaceAll("-", " ")) : raw;
  return { value: slugify(raw), label: fallbackLabel };
}

export function displayLabel(value: string): string {
  const labels: Record<string, string> = {
    "application-only": "Application only",
    "auto-published": "Auto published",
    "available-from": "Available from",
    "clinical-elective": "Clinical elective",
    "fully-booked-until": "Fully booked until",
    "generic-parser": "Generic parser",
    "hospital-confirmed": "Hospital confirmed",
    "needs-human-review": "Needs human review",
    "not-specified": "Not specified",
    "site-parser": "Site parser",
  };

  return labels[value] ?? value;
}

const departmentLabels: Record<string, CanonicalField> = {
  anesthesie: { value: "anesthesiology", label: "Anesthesiology" },
  anaesthesie: { value: "anesthesiology", label: "Anesthesiology" },
  anesthesiologie: { value: "anesthesiology", label: "Anesthesiology" },
  anaesthesiologie: { value: "anesthesiology", label: "Anesthesiology" },
  anesthesiology: { value: "anesthesiology", label: "Anesthesiology" },
  anesthesia: { value: "anesthesiology", label: "Anesthesiology" },
  anästhesie: { value: "anesthesiology", label: "Anesthesiology" },
  anästhesiologie: { value: "anesthesiology", label: "Anesthesiology" },
  augenheilkunde: { value: "ophthalmology", label: "Ophthalmology" },
  augenklinik: { value: "ophthalmology", label: "Ophthalmology" },
  chirurgie: { value: "surgery", label: "Surgery" },
  chirurgia: { value: "surgery", label: "Surgery" },
  "emergency-medicine": { value: "emergency-medicine", label: "Emergency medicine" },
  frauenheilkunde: { value: "gynecology", label: "Gynecology" },
  gynecology: { value: "gynecology", label: "Gynecology" },
  gynakologie: { value: "gynecology", label: "Gynecology" },
  gynaekologie: { value: "gynecology", label: "Gynecology" },
  gynäkologie: { value: "gynecology", label: "Gynecology" },
  gynecologie: { value: "gynecology", label: "Gynecology" },
  gynécologie: { value: "gynecology", label: "Gynecology" },
  ginecologia: { value: "gynecology", label: "Gynecology" },
  "innere-medizin": { value: "internal-medicine", label: "Internal medicine" },
  "internal-medicine": { value: "internal-medicine", label: "Internal medicine" },
  "medecine-interne": { value: "internal-medicine", label: "Internal medicine" },
  "médecine-interne": { value: "internal-medicine", label: "Internal medicine" },
  "medicina-interna": { value: "internal-medicine", label: "Internal medicine" },
  neuroradiologie: { value: "neuroradiology", label: "Neuroradiology" },
  neuroradiology: { value: "neuroradiology", label: "Neuroradiology" },
  notfallmedizin: { value: "emergency-medicine", label: "Emergency medicine" },
  notfallstation: { value: "emergency-medicine", label: "Emergency medicine" },
  "pronto-soccorso": { value: "emergency-medicine", label: "Emergency medicine" },
  urgences: { value: "emergency-medicine", label: "Emergency medicine" },
  ophthalmology: { value: "ophthalmology", label: "Ophthalmology" },
  orthopadie: { value: "orthopedics", label: "Orthopedics" },
  orthopaedie: { value: "orthopedics", label: "Orthopedics" },
  orthopädie: { value: "orthopedics", label: "Orthopedics" },
  orthopedics: { value: "orthopedics", label: "Orthopedics" },
  padiatrie: { value: "pediatrics", label: "Pediatrics" },
  paediatrie: { value: "pediatrics", label: "Pediatrics" },
  pediatrics: { value: "pediatrics", label: "Pediatrics" },
  pediatria: { value: "pediatrics", label: "Pediatrics" },
  pediatrie: { value: "pediatrics", label: "Pediatrics" },
  pédiatrie: { value: "pediatrics", label: "Pediatrics" },
  pädiatrie: { value: "pediatrics", label: "Pediatrics" },
  psychiatrie: { value: "psychiatry", label: "Psychiatry" },
  psychiatry: { value: "psychiatry", label: "Psychiatry" },
  psichiatria: { value: "psychiatry", label: "Psychiatry" },
  radiologie: { value: "radiology", label: "Radiology" },
  radiologia: { value: "radiology", label: "Radiology" },
  radiology: { value: "radiology", label: "Radiology" },
  surgery: { value: "surgery", label: "Surgery" },
  traumatologie: { value: "orthopedics", label: "Orthopedics" },
};

function normalizeDepartmentKey(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9äöüéèàùç]+/gi, "-")
    .replace(/^-+|-+$/g, "");
}

function slugify(value: string): string {
  return normalizeDepartmentKey(value) || "not-specified";
}

function titleCase(value: string): string {
  return value.replace(
    /\w\S*/g,
    (word) => `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`,
  );
}

function sourceParserType(
  source: SourceRegistryEntry | undefined,
  record: PlacementRecord,
): string {
  if (
    record.extractionMethod === "site-parser" ||
    source?.sourceUrls.some((sourceUrl) => sourceUrl.expectedParser !== "generic")
  ) {
    return "site-specific";
  }

  return "generic";
}

function confidenceRank(confidence: PlacementRecord["confidence"]): number {
  const ranks: Record<PlacementRecord["confidence"], number> = {
    low: 0,
    medium: 1,
    high: 2,
  };

  return ranks[confidence];
}

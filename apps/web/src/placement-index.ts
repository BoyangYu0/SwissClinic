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

export interface FilterOption {
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
      departments: toOptions(
        placements.map((record) => record.departmentNormalized ?? record.department),
      ),
      roleTypes: toOptions(placements.map((record) => record.roleType)),
      availabilityStatuses: toOptions(placements.map((record) => record.availabilityStatus)),
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
      matches(record.departmentNormalized ?? record.department, filters.department) &&
      matches(record.roleType, filters.roleType) &&
      matches(record.availabilityStatus, filters.availabilityStatus) &&
      matches(record.availableFrom, filters.availableFrom) &&
      matches(record.confidence, filters.confidence) &&
      matches(record.language, filters.language) &&
      matches(record.region, filters.region)
    );
  });
}

function placementSearchText(record: PlacementRecord): string {
  return normalize(
    [
      record.institutionName,
      record.department,
      record.departmentNormalized,
      record.roleType,
      record.canton,
      record.city,
      record.availabilityStatus,
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

function displayLabel(value: string): string {
  const labels: Record<string, string> = {
    "application-only": "Application only",
    "auto-published": "Auto published",
    "available-from": "Available from",
    "fully-booked-until": "Fully booked until",
    "generic-parser": "Generic parser",
    "hospital-confirmed": "Hospital confirmed",
    "needs-human-review": "Needs human review",
    "not-specified": "Not specified",
    "site-parser": "Site parser",
  };

  return labels[value] ?? value;
}

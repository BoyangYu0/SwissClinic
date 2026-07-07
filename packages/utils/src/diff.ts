import {
  type ChangeRecord,
  type ChangeRecordInput,
  ChangeRecordSchema,
  type PlacementRecord,
} from "@scpi/schema";
import { hashObject } from "./hash.js";

interface AvailabilityFields {
  availabilityStatus: PlacementRecord["availabilityStatus"];
  availableFrom: string | null;
  fullyBookedUntil: string | null;
}

export function diffPlacementRecords(
  before: PlacementRecord[],
  after: PlacementRecord[],
): ChangeRecord[] {
  const beforeById = new Map(before.map((record) => [record.id, record]));
  const afterById = new Map(after.map((record) => [record.id, record]));
  const changes: ChangeRecord[] = [];

  for (const record of after) {
    const previous = beforeById.get(record.id);

    if (!previous) {
      changes.push(
        makeChange({
          sourceId: record.sourceId,
          url: record.sourceUrl,
          detectedAt: record.lastChecked,
          changeType: "record-added",
          severity: "info",
          before: null,
          after: record,
          message: `Placement added: ${formatPlacementLabel(record)}.`,
        }),
      );
      continue;
    }

    const availabilityBefore = pickAvailability(previous);
    const availabilityAfter = pickAvailability(record);

    if (hashObject(availabilityBefore) !== hashObject(availabilityAfter)) {
      changes.push(
        makeChange({
          sourceId: record.sourceId,
          url: record.sourceUrl,
          detectedAt: record.lastChecked,
          changeType: "availability-changed",
          severity: "review",
          before: availabilityBefore,
          after: availabilityAfter,
          message: `Availability changed for ${formatPlacementLabel(record)}: ${formatAvailability(
            availabilityBefore,
          )} -> ${formatAvailability(availabilityAfter)}.`,
        }),
      );
      continue;
    }

    if (hashObject(toComparableRecord(previous)) !== hashObject(toComparableRecord(record))) {
      changes.push(
        makeChange({
          sourceId: record.sourceId,
          url: record.sourceUrl,
          detectedAt: record.lastChecked,
          changeType: "parser-output-changed",
          severity: "review",
          before: previous,
          after: record,
          message: `Parser output changed for ${formatPlacementLabel(record)}.`,
        }),
      );
    }
  }

  for (const record of before) {
    if (afterById.has(record.id)) {
      continue;
    }

    changes.push(
      makeChange({
        sourceId: record.sourceId,
        url: record.sourceUrl,
        detectedAt: record.lastChecked,
        changeType: "record-removed",
        severity: "review",
        before: record,
        after: null,
        message: `Placement removed: ${formatPlacementLabel(record)}.`,
      }),
    );
  }

  return changes.sort((left, right) => left.id.localeCompare(right.id));
}

function makeChange(input: Omit<ChangeRecordInput, "id">): ChangeRecord {
  const id = `change-${hashObject(input).slice(0, 16)}`;
  return ChangeRecordSchema.parse({ id, ...input });
}

function pickAvailability(record: PlacementRecord): AvailabilityFields {
  return {
    availabilityStatus: record.availabilityStatus,
    availableFrom: record.availableFrom,
    fullyBookedUntil: record.fullyBookedUntil,
  };
}

function toComparableRecord(
  record: PlacementRecord,
): Omit<PlacementRecord, "lastChecked" | "sourceLastModified"> {
  const {
    lastChecked: _lastChecked,
    sourceLastModified: _sourceLastModified,
    ...comparable
  } = record;
  return comparable;
}

function formatPlacementLabel(record: PlacementRecord): string {
  return [record.institutionName, record.department ?? record.departmentNormalized, record.roleType]
    .filter(Boolean)
    .join(" / ");
}

function formatAvailability(availability: AvailabilityFields): string {
  const date =
    availability.availableFrom ??
    availability.fullyBookedUntil ??
    (availability.availabilityStatus === "not-specified" ? "no date" : null);

  return date ? `${availability.availabilityStatus} (${date})` : availability.availabilityStatus;
}

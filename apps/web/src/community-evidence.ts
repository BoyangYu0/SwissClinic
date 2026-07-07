import {
  type LeadTimeReport,
  type PlacementRecord,
  type ReliabilitySummary,
  ReliabilitySummaryArraySchema,
  type VerificationEvidence,
} from "@scpi/schema";

export function computeMonthsAhead(applicationMonth: string, desiredStartMonth: string): number {
  const [applicationYear = 0, applicationMonthNumber = 0] = applicationMonth.split("-").map(Number);
  const [startYear = 0, startMonthNumber = 0] = desiredStartMonth.split("-").map(Number);

  return (startYear - applicationYear) * 12 + (startMonthNumber - applicationMonthNumber);
}

export function buildReliabilitySummaries(
  placements: PlacementRecord[],
  verificationEvidence: VerificationEvidence[],
  leadTimeReports: LeadTimeReport[],
): ReliabilitySummary[] {
  const verificationByRecord = groupBy(verificationEvidence, (item) => item.recordId);
  const leadTimeByRecord = groupBy(leadTimeReports, (item) => item.recordId);

  return ReliabilitySummaryArraySchema.parse(
    placements.map((record) =>
      buildReliabilitySummary(
        record,
        verificationByRecord.get(record.id) ?? [],
        leadTimeByRecord.get(record.id) ?? [],
      ),
    ),
  );
}

function buildReliabilitySummary(
  record: PlacementRecord,
  verificationEvidence: VerificationEvidence[],
  leadTimeReports: LeadTimeReport[],
): ReliabilitySummary {
  const positiveReports = verificationEvidence.filter(isPositiveVerification).length;
  const negativeReports = verificationEvidence.filter(isNegativeVerification).length;
  const conflictingReports =
    positiveReports > 0 && negativeReports > 0 ? positiveReports + negativeReports : 0;
  const latestVerificationDate = latestDate(verificationEvidence.map((item) => item.createdAt));
  const usableLeadTimeReports = leadTimeReports
    .filter((report) => report.canDisplayAnonymously)
    .filter((report) => report.computedMonthsAhead >= 0)
    .filter((report) => report.evidenceType !== "estimate")
    .sort((left, right) => left.computedMonthsAhead - right.computedMonthsAhead);
  const leadTimeMonths = usableLeadTimeReports.map((report) => report.computedMonthsAhead);
  const hasEnoughLeadTimeReports = leadTimeMonths.length >= 3;
  const warnings: string[] = [];

  if (leadTimeReports.length > 0 && !hasEnoughLeadTimeReports) {
    warnings.push("Community lead-time reports are present but fewer than 3 usable reports.");
  }

  return {
    recordId: record.id,
    verificationCount: verificationEvidence.length,
    latestVerificationDate,
    positiveReports,
    negativeReports,
    conflictingReports,
    leadTimeReportCount: leadTimeReports.length,
    communityLeadTimeMedianMonthsAhead: hasEnoughLeadTimeReports ? median(leadTimeMonths) : null,
    communityLeadTimeRangeMinMonthsAhead: hasEnoughLeadTimeReports
      ? Math.min(...leadTimeMonths)
      : null,
    communityLeadTimeRangeMaxMonthsAhead: hasEnoughLeadTimeReports
      ? Math.max(...leadTimeMonths)
      : null,
    reliabilityLabel: reliabilityLabel({
      verificationEvidence,
      positiveReports,
      negativeReports,
      conflictingReports,
    }),
    warnings,
  };
}

function reliabilityLabel(input: {
  verificationEvidence: VerificationEvidence[];
  positiveReports: number;
  negativeReports: number;
  conflictingReports: number;
}): ReliabilitySummary["reliabilityLabel"] {
  if (
    input.verificationEvidence.some(
      (item) => item.reviewerRole === "administrator" && item.verdict === "correct",
    )
  ) {
    return "hospital-confirmed";
  }

  if (input.conflictingReports > 0) {
    return "conflicting-reports";
  }

  if (input.positiveReports >= 2) {
    return "multiple-student-checked";
  }

  if (input.positiveReports === 1) {
    return "student-checked";
  }

  return "unverified";
}

function isPositiveVerification(item: VerificationEvidence): boolean {
  return (
    item.verdict === "correct" &&
    item.officialSourceCorrect === "yes" &&
    item.departmentCorrect !== "no" &&
    item.availabilityCorrect !== "no" &&
    item.applicationLinkCorrect !== "no"
  );
}

function isNegativeVerification(item: VerificationEvidence): boolean {
  return (
    item.verdict === "wrong" ||
    item.verdict === "partly-wrong" ||
    item.verdict === "not-relevant" ||
    item.officialSourceCorrect === "no" ||
    item.departmentCorrect === "no" ||
    item.availabilityCorrect === "no" ||
    item.applicationLinkCorrect === "no"
  );
}

function latestDate(values: string[]): string | null {
  const latest = values
    .map((value) => Date.parse(value))
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => right - left)[0];

  return latest === undefined ? null : new Date(latest).toISOString();
}

function median(values: number[]): number {
  const midpoint = Math.floor(values.length / 2);

  if (values.length % 2 === 1) {
    return values[midpoint] ?? 0;
  }

  return ((values[midpoint - 1] ?? 0) + (values[midpoint] ?? 0)) / 2;
}

function groupBy<T>(values: T[], keyFor: (value: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();

  for (const value of values) {
    const key = keyFor(value);
    groups.set(key, [...(groups.get(key) ?? []), value]);
  }

  return groups;
}

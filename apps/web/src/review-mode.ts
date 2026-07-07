import type {
  LeadTimeReport,
  PlacementRecord,
  ReviewSubmission,
  SourceRegistryEntry,
  VerificationEvidence,
} from "@scpi/schema";
import { computeMonthsAhead } from "./community-evidence.js";

export const REVIEW_ISSUE_URL = "https://github.com/BoyangYu0/SwissClinic/issues/new";

export const feedbackTypes = [
  "wrong-availability",
  "wrong-department",
  "wrong-application-link",
  "missing-hospital-source",
  "irrelevant-source",
  "broken-source-url",
  "wrong-language-region",
  "parser-bug",
  "other",
] as const;

export type FeedbackType = (typeof feedbackTypes)[number];

export interface FeedbackMetadata {
  record?: Pick<
    PlacementRecord,
    | "id"
    | "sourceId"
    | "institutionName"
    | "departmentNormalized"
    | "availabilityStatus"
    | "availableFrom"
    | "fullyBookedUntil"
    | "applicationUrl"
    | "sourceLanguage"
    | "region"
    | "confidence"
    | "extractionMethod"
    | "sourceUrl"
    | "lastChecked"
  >;
  source?: Pick<
    SourceRegistryEntry,
    "id" | "institutionName" | "canton" | "city" | "sourceLanguage" | "region" | "status"
  > & {
    urls?: string[];
  };
  coverageReport?: {
    reportName: string;
    reportPath: string;
    generatedAt?: string;
  };
}

export interface ReviewAnswers {
  reviewerRole: ReviewSubmission["reviewerRole"];
  reviewerRegion: ReviewSubmission["reviewerRegion"];
  verdict: ReviewSubmission["verdict"];
  officialSourceCorrect: ReviewSubmission["officialSourceCorrect"];
  departmentCorrect: ReviewSubmission["departmentCorrect"];
  availabilityCorrect: ReviewSubmission["availabilityCorrect"];
  applicationLinkCorrect: ReviewSubmission["applicationLinkCorrect"];
  confidenceSuggested: ReviewSubmission["confidenceSuggested"];
  comment: string;
}

export interface StaticReviewPayload extends ReviewSubmission {
  currentExtractedValues: {
    availabilityStatus: PlacementRecord["availabilityStatus"];
    availableFrom: PlacementRecord["availableFrom"];
    fullyBookedUntil: PlacementRecord["fullyBookedUntil"];
    applicationUrl: PlacementRecord["applicationUrl"];
    confidence: PlacementRecord["confidence"];
    extractionMethod: PlacementRecord["extractionMethod"];
    sourceUrl: PlacementRecord["sourceUrl"];
    lastChecked: PlacementRecord["lastChecked"];
  };
}

export interface StaticVerificationPayload extends VerificationEvidence {
  sourceId: PlacementRecord["sourceId"];
  institutionName: PlacementRecord["institutionName"];
  departmentNormalized: PlacementRecord["departmentNormalized"];
  comment: string;
  currentExtractedValues: StaticReviewPayload["currentExtractedValues"];
}

export interface LeadTimeReportAnswers {
  desiredStartMonth: LeadTimeReport["desiredStartMonth"];
  applicationMonth: LeadTimeReport["applicationMonth"];
  outcome: LeadTimeReport["outcome"];
  evidenceType: LeadTimeReport["evidenceType"];
  reviewerRegion: LeadTimeReport["reviewerRegion"];
  comment: string;
  canDisplayAnonymously: boolean;
}

export interface StaticLeadTimeReportPayload extends LeadTimeReport {
  currentExtractedValues: {
    availabilityStatus: PlacementRecord["availabilityStatus"];
    availableFrom: PlacementRecord["availableFrom"];
    fullyBookedUntil: PlacementRecord["fullyBookedUntil"];
    explicitApplicationLeadTimeMonths: PlacementRecord["explicitApplicationLeadTimeMonths"];
    observedMonthsAhead: PlacementRecord["observedMonthsAhead"];
    sourceUrl: PlacementRecord["sourceUrl"];
    lastChecked: PlacementRecord["lastChecked"];
  };
}

export const defaultReviewAnswers: ReviewAnswers = {
  reviewerRole: "unknown",
  reviewerRegion: "unknown",
  verdict: "unknown",
  officialSourceCorrect: "unsure",
  departmentCorrect: "unsure",
  availabilityCorrect: "unsure",
  applicationLinkCorrect: "unsure",
  confidenceSuggested: "unknown",
  comment: "",
};

export function buildStaticReviewPayload(
  record: PlacementRecord,
  answers: Partial<ReviewAnswers> = {},
  createdAt = new Date().toISOString(),
): StaticReviewPayload {
  const merged = { ...defaultReviewAnswers, ...answers };

  return {
    recordId: record.id,
    sourceId: record.sourceId,
    institutionName: record.institutionName,
    departmentNormalized: record.departmentNormalized,
    reviewerRole: merged.reviewerRole,
    reviewerRegion: merged.reviewerRegion,
    verdict: merged.verdict,
    officialSourceCorrect: merged.officialSourceCorrect,
    departmentCorrect: merged.departmentCorrect,
    availabilityCorrect: merged.availabilityCorrect,
    applicationLinkCorrect: merged.applicationLinkCorrect,
    confidenceSuggested: merged.confidenceSuggested,
    comment: merged.comment,
    createdAt,
    currentExtractedValues: {
      availabilityStatus: record.availabilityStatus,
      availableFrom: record.availableFrom,
      fullyBookedUntil: record.fullyBookedUntil,
      applicationUrl: record.applicationUrl,
      confidence: record.confidence,
      extractionMethod: record.extractionMethod,
      sourceUrl: record.sourceUrl,
      lastChecked: record.lastChecked,
    },
  };
}

export function buildVerificationEvidencePayload(
  record: PlacementRecord,
  answers: Partial<ReviewAnswers> = {},
  createdAt = new Date().toISOString(),
): StaticVerificationPayload {
  const reviewPayload = buildStaticReviewPayload(record, answers, createdAt);

  return {
    recordId: reviewPayload.recordId,
    sourceId: reviewPayload.sourceId,
    institutionName: reviewPayload.institutionName,
    departmentNormalized: reviewPayload.departmentNormalized,
    reviewerRole: reviewPayload.reviewerRole,
    reviewerRegion: reviewPayload.reviewerRegion,
    officialSourceCorrect: reviewPayload.officialSourceCorrect,
    departmentCorrect: reviewPayload.departmentCorrect,
    availabilityCorrect: reviewPayload.availabilityCorrect,
    applicationLinkCorrect: reviewPayload.applicationLinkCorrect,
    confidenceSuggested: reviewPayload.confidenceSuggested,
    verdict: reviewPayload.verdict,
    comment: reviewPayload.comment,
    createdAt: reviewPayload.createdAt,
    currentExtractedValues: reviewPayload.currentExtractedValues,
  };
}

export function buildLeadTimeReportPayload(
  record: PlacementRecord,
  answers: LeadTimeReportAnswers,
  createdAt = new Date().toISOString(),
): StaticLeadTimeReportPayload {
  return {
    recordId: record.id,
    sourceId: record.sourceId,
    institutionName: record.institutionName,
    departmentNormalized: record.departmentNormalized,
    desiredStartMonth: answers.desiredStartMonth,
    applicationMonth: answers.applicationMonth,
    computedMonthsAhead: computeMonthsAhead(answers.applicationMonth, answers.desiredStartMonth),
    outcome: answers.outcome,
    evidenceType: answers.evidenceType,
    reviewerRegion: answers.reviewerRegion,
    comment: answers.comment,
    createdAt,
    canDisplayAnonymously: answers.canDisplayAnonymously,
    currentExtractedValues: {
      availabilityStatus: record.availabilityStatus,
      availableFrom: record.availableFrom,
      fullyBookedUntil: record.fullyBookedUntil,
      explicitApplicationLeadTimeMonths: record.explicitApplicationLeadTimeMonths,
      observedMonthsAhead: record.observedMonthsAhead,
      sourceUrl: record.sourceUrl,
      lastChecked: record.lastChecked,
    },
  };
}

export function reviewPayloadToJson(payload: StaticReviewPayload): string {
  return JSON.stringify(payload, null, 2);
}

export function buildReviewIssueUrl(
  payload: StaticReviewPayload,
  issueUrl = REVIEW_ISSUE_URL,
): string {
  const url = new URL(issueUrl);
  url.searchParams.set("title", `Placement review: ${payload.recordId}`);
  url.searchParams.set(
    "body",
    [
      "Static medical-student review submission.",
      "",
      "Please do not paste private emails or unredacted screenshots.",
      "",
      "```json",
      reviewPayloadToJson(payload),
      "```",
    ].join("\n"),
  );

  return url.toString();
}

export function buildCommunityEvidenceIssueUrl(
  evidenceKind: "verification" | "lead-time-report",
  payload: StaticVerificationPayload | StaticLeadTimeReportPayload,
  issueUrl = REVIEW_ISSUE_URL,
): string {
  const url = new URL(issueUrl);
  const title =
    evidenceKind === "verification"
      ? `Record verification: ${payload.recordId}`
      : `Lead-time report: ${payload.recordId}`;

  url.searchParams.set("title", title);
  url.searchParams.set(
    "body",
    [
      "Structured community evidence submission for the static beta.",
      "",
      "This is not stored by the website. Maintainers review accepted evidence before it affects public data.",
      "",
      "Please do not paste private emails, patient information, or unredacted screenshots.",
      "",
      "```json",
      JSON.stringify({ evidenceKind, ...payload }, null, 2),
      "```",
    ].join("\n"),
  );

  return url.toString();
}

export function buildFeedbackIssueUrl(
  feedbackType: FeedbackType,
  metadata: FeedbackMetadata,
  issueUrl = REVIEW_ISSUE_URL,
): string {
  const url = new URL(issueUrl);
  const titleSubject =
    metadata.record?.id ??
    metadata.source?.id ??
    metadata.coverageReport?.reportPath ??
    "static-feedback";

  url.searchParams.set("title", `[Feedback] ${feedbackLabel(feedbackType)}: ${titleSubject}`);
  url.searchParams.set(
    "body",
    [
      "Structured static feedback submission.",
      "",
      `Feedback type: ${feedbackLabel(feedbackType)} (${feedbackType})`,
      "",
      "Please describe what should change:",
      "",
      "```json",
      JSON.stringify({ feedbackType, ...metadata }, null, 2),
      "```",
      "",
      "Please do not paste private emails, patient information, or unredacted screenshots.",
    ].join("\n"),
  );

  return url.toString();
}

export function feedbackLabel(feedbackType: FeedbackType): string {
  const labels: Record<FeedbackType, string> = {
    "wrong-availability": "Wrong availability",
    "wrong-department": "Wrong department",
    "wrong-application-link": "Wrong application link",
    "missing-hospital-source": "Missing hospital/source",
    "irrelevant-source": "Irrelevant source",
    "broken-source-url": "Broken source URL",
    "wrong-language-region": "Wrong language/region",
    "parser-bug": "Parser bug",
    other: "Other",
  };

  return labels[feedbackType];
}
